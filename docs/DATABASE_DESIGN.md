# SQLite 實體設計

> 狀態：Stage 2 核准設計；Stage 5.2 已加入 schema migration v2。
> 資料庫：單一 SQLite 檔案；history 與 live 分表。  
> 詳細語意以 [DATA_CONTRACT.md](./DATA_CONTRACT.md) 為準。

## 1. 設計原則

- **[已確認需求]** 同一來源日只允許一個 active 歷史批次。修正版以整份每日標準化檔替換，不跨版本靜默合併。
- **[建議設計]** 所有表用 STRICT；開啟 foreign_keys、WAL、busy_timeout。時間排序欄存 UTC epoch milliseconds，來源時間原文另存。
- 來源 Excel 的有效數字存 REAL；無法解析的 Await/非數字讓 typed 欄為 NULL，原 token 只存該列的 source_exception_json，不建立整列 raw JSON 副本。
- 上游衍生值（加工小時、比例等）原樣保存為 source_* 欄；查詢統計從秒數依契約重算。這是驗證與計算，不改寫來源。
- Demo fixture/replay 不進 SQLite。使用者明確執行的 MANUAL_TEST 可寫連線測試 audit，但不寫 readings/history。app_settings 只存 provider mode 與非秘密設定。

## 2. 完整表清單

| 表 | 生命週期 | 用途 | 相對 Stage 1 |
|---|---|---|---|
| schema_migrations | 永久 | migration 版本與 checksum | 新增；安全升級必要 |
| machines | 永久種子 | A1–B4 顯示順序與區域 | 保留 |
| sensor_catalog | Live metadata | 目前有效 sensor mapping | 保留 |
| sensor_metadata_snapshots | 稀疏長期 | 只在 configs/groups hash 改變時留證 | 新增；避免每輪重複 JSON |
| api_poll_runs | Live audit，預設 3 天 | 每個 Collector 邏輯輪次 | 保留 |
| api_endpoint_runs | Live audit，預設 3 天 | 各端點最終結果與時間 | 保留 |
| live_sensor_readings | Live，預設 3 天 | values sensor 快照 | 保留 |
| app_settings | 永久單列 | LIVE/DEMO、stale、retention | 保留；不放秘密 |
| import_batches | 永久 | 檔案指紋、來源日、版本狀態、摘要 | 保留 |
| import_batch_events | 永久 | activate/replace/rollback 稽核 | 新增；單靠 status 無法追溯回復 |
| import_metadata_entries | 隨 batch 永久 | data_dictionary/README 逐列保存 | 新增；取代 raw rows 的 metadata 部分 |
| validation_issues | 隨 batch 永久 | confirm 結果與品質規則碼 | 保留 |
| history_machine_intervals | 隨 batch 永久 | machine_3min 逐欄映射 | 保留 |
| history_environment_intervals | 隨 batch 永久 | environment_3min 逐欄映射 | 保留 |
| history_alarm_events | 隨 batch 永久 | alarm_events 逐欄映射 | 保留 |
| history_quality_issues | 隨 batch 永久 | quality_issues 逐欄映射 | 保留 |

不採 raw_excel_rows。每日約 3,840 + 3,840 筆主資料，一年約 280 萬筆；每列再複製 JSON 會明顯放大 DB，且標準化欄位已完整映射。追溯由檔案/內容指紋、來源列號、metadata、原始文字欄與例外 token 提供。若未來法遵要求保存原檔，應改成受控檔案封存，不在每列重複 JSON。

## 3. DDL 草案

以下 SQL 是設計規格，不在 Stage 2 執行。

### 3.1 基礎與設定

~~~sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE machines (
  machine_id TEXT PRIMARY KEY
    CHECK (machine_id IN ('A1','A2','A3','A4','B1','B2','B3','B4')),
  area TEXT NOT NULL CHECK (area IN ('A','B')),
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 4),
  display_name TEXT NOT NULL,
  UNIQUE (area, display_order)
) STRICT;

CREATE TABLE app_settings (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  provider_mode TEXT NOT NULL CHECK (provider_mode IN ('LIVE','DEMO')),
  mode_revision INTEGER NOT NULL DEFAULT 0 CHECK (mode_revision >= 0),
  stale_after_seconds INTEGER NOT NULL DEFAULT 420 CHECK (stale_after_seconds > 0),
  live_retention_days INTEGER NOT NULL DEFAULT 3 CHECK (live_retention_days >= 1),
  metadata_refresh_seconds INTEGER NOT NULL DEFAULT 3600 CHECK (metadata_refresh_seconds >= 180),
  updated_at_ms INTEGER NOT NULL
) STRICT;
~~~

app_settings 不存 API origin、Token、TLS mode 或 CA path；這些只從 server-only 環境設定讀取。

### 3.2 Sensor catalog 與 metadata

~~~sql
CREATE TABLE sensor_catalog (
  sensor_id TEXT PRIMARY KEY,
  display_name TEXT,
  sensor_type TEXT,
  unit TEXT,
  group_id TEXT,
  group_alias TEXT,
  group_sorting_id INTEGER,
  logical_role TEXT,
  machine_id TEXT REFERENCES machines(machine_id),
  area TEXT CHECK (area IS NULL OR area IN ('A','B')),
  point_number INTEGER CHECK (point_number IS NULL OR point_number > 0),
  mapping_status TEXT NOT NULL
    CHECK (mapping_status IN ('MAPPED','UNMAPPED','OUT_OF_SCOPE','CONFLICT')),
  config_hash TEXT,
  group_hash TEXT,
  first_seen_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  last_verified_at_ms INTEGER,
  CHECK (
    (logical_role IS NULL AND mapping_status <> 'MAPPED')
    OR logical_role IS NOT NULL
  )
) STRICT;

CREATE INDEX idx_sensor_catalog_role
  ON sensor_catalog(logical_role, area, point_number);
CREATE INDEX idx_sensor_catalog_machine
  ON sensor_catalog(machine_id);

CREATE TABLE sensor_metadata_snapshots (
  snapshot_id INTEGER PRIMARY KEY,
  endpoint TEXT NOT NULL CHECK (endpoint IN ('configs','groups')),
  payload_hash TEXT NOT NULL,
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  response_time_text TEXT,
  response_time_ms INTEGER,
  fetched_at_ms INTEGER NOT NULL,
  first_seen_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  UNIQUE (endpoint, payload_hash)
) STRICT;
~~~

metadata snapshot 只保存 configs/groups 的 distinct canonical payload，不保存 97 份相同內容。sensor_catalog 是目前查詢用投影；snapshot 是 mapping 變更稽核。

### 3.3 Poll 與 live readings

~~~sql
CREATE TABLE api_poll_runs (
  poll_run_id INTEGER PRIMARY KEY,
  batch_time_text TEXT NOT NULL,
  batch_time_ms INTEGER NOT NULL,
  sample_slot_ms INTEGER,
  scheduled_for_ms INTEGER,
  started_at_ms INTEGER NOT NULL,
  finished_at_ms INTEGER,
  provider_mode_at_start TEXT NOT NULL
    CHECK (provider_mode_at_start IN ('LIVE','DEMO')),
  mode_revision_at_start INTEGER NOT NULL CHECK (mode_revision_at_start >= 0),
  within_service_window INTEGER NOT NULL CHECK (within_service_window IN (0,1)),
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('STARTUP','SCHEDULED','MODE_RESUME','MANUAL_TEST')),
  status TEXT NOT NULL
    CHECK (status IN (
      'RUNNING','SUCCESS','PARTIAL','FAILED',
      'SKIPPED_OUTSIDE_WINDOW','SKIPPED_OVERLAP',
      'DISCARDED_MODE_CHANGED','ABORTED'
    )),
  persisted_reading_count INTEGER NOT NULL DEFAULT 0
    CHECK (persisted_reading_count >= 0),
  error_summary TEXT
) STRICT;

CREATE INDEX idx_poll_batch_time ON api_poll_runs(batch_time_ms DESC);
CREATE INDEX idx_poll_sample_slot ON api_poll_runs(sample_slot_ms DESC);
CREATE INDEX idx_poll_status_time ON api_poll_runs(status, started_at_ms DESC);

CREATE TABLE api_endpoint_runs (
  endpoint_run_id INTEGER PRIMARY KEY,
  poll_run_id INTEGER NOT NULL
    REFERENCES api_poll_runs(poll_run_id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL CHECK (endpoint IN ('values','configs','groups')),
  attempted INTEGER NOT NULL CHECK (attempted IN (0,1)),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  http_status INTEGER,
  api_response_code TEXT,
  api_response_message TEXT,
  response_time_text TEXT,
  response_time_ms INTEGER,
  fetched_at_ms INTEGER,
  completed_at_ms INTEGER,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  payload_hash TEXT,
  result TEXT NOT NULL
    CHECK (result IN ('NOT_DUE','SUCCESS','FAILED','SCHEMA_ERROR')),
  error_code TEXT,
  error_message_safe TEXT,
  UNIQUE (poll_run_id, endpoint)
) STRICT;

CREATE INDEX idx_endpoint_health
  ON api_endpoint_runs(endpoint, completed_at_ms DESC);

CREATE TABLE live_sensor_readings (
  reading_id INTEGER PRIMARY KEY,
  poll_run_id INTEGER NOT NULL
    REFERENCES api_poll_runs(poll_run_id) ON DELETE CASCADE,
  sensor_id TEXT NOT NULL,
  sensor_update_time_text TEXT,
  sensor_update_at_ms INTEGER,
  fetched_at_ms INTEGER NOT NULL,
  raw_status INTEGER,
  raw_values_json TEXT NOT NULL CHECK (json_valid(raw_values_json)),
  value_text TEXT,
  numeric_value REAL,
  lamp_blue INTEGER,
  lamp_green INTEGER,
  lamp_red INTEGER,
  lamp_white INTEGER,
  lamp_yellow INTEGER,
  parse_status TEXT NOT NULL
    CHECK (parse_status IN ('VALID','PARTIAL','INVALID','UNKNOWN_TYPE')),
  mapping_status TEXT NOT NULL
    CHECK (mapping_status IN ('MAPPED','STALE_MAPPING','UNMAPPED')),
  UNIQUE (poll_run_id, sensor_id)
) STRICT;

CREATE INDEX idx_live_sensor_time
  ON live_sensor_readings(sensor_id, sensor_update_at_ms DESC);
CREATE INDEX idx_live_fetched
  ON live_sensor_readings(fetched_at_ms DESC);
~~~

raw_values_json 只保存單一 sensor 的 values 物件，因為未知 string 格式與未來欄位需可追溯；不保存整個 API payload。若五色不是 0/1，原 JSON 仍在，parse_status=INVALID。

sample_slot_ms 是即時趨勢唯一 x 軸落點。SCHEDULED 使用預定三分鐘格點；STARTUP/MODE_RESUME 向下取整到前一格；MANUAL_TEST 為 NULL 且不得建立 live_sensor_readings。相同 sensor/slot 可因重啟存在多個 poll，查詢依 sensor_update_at_ms 最大、再依 fetched_at_ms 最大選候選；跨 slot updateTime 未增加時，後一格不輸出觀測值。

模式切換採 compare-before-write：Collector 記住 provider_mode_at_start/mode_revision_at_start，寫入 transaction 內重讀 app_settings。若 mode 不再是 LIVE 或 revision 不同，只允許把既有 run 收尾為 DISCARDED_MODE_CHANGED，不插入 endpoint success 或 readings。這個 audit closure 不得被計為 Collector success。

健康查詢必須分流：

- Collector collection：trigger_type IN ('STARTUP','SCHEDULED','MODE_RESUME')；last success 還要求 values 成功且 persisted_reading_count>0。
- Manual test：trigger_type='MANUAL_TEST'；只更新 manualTestLastAttempt/result。
- latestSensorDataAt：只由 live_sensor_readings 計算。

### 3.4 Import batch、版本事件與 metadata

~~~sql
CREATE TABLE import_batches (
  batch_id INTEGER PRIMARY KEY,
  source_date TEXT,
  original_file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes >= 0),
  file_sha256 TEXT NOT NULL,
  canonical_fingerprint TEXT,
  contract_version TEXT NOT NULL,
  dictionary_version TEXT,
  alarm_source_status TEXT NOT NULL
    CHECK (alarm_source_status IN (
      'PROVIDED_NONEMPTY','PROVIDED_EMPTY','MISSING','UNKNOWN'
    )),
  status TEXT NOT NULL
    CHECK (status IN ('ACTIVE','REPLACED','FAILED')),
  replaces_batch_id INTEGER REFERENCES import_batches(batch_id),
  machine_row_count INTEGER NOT NULL DEFAULT 0 CHECK (machine_row_count >= 0),
  environment_row_count INTEGER NOT NULL DEFAULT 0 CHECK (environment_row_count >= 0),
  alarm_row_count INTEGER NOT NULL DEFAULT 0 CHECK (alarm_row_count >= 0),
  quality_issue_row_count INTEGER NOT NULL DEFAULT 0 CHECK (quality_issue_row_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  confirmed_at_ms INTEGER,
  activated_at_ms INTEGER,
  replaced_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  CHECK (status = 'FAILED' OR source_date IS NOT NULL),
  CHECK (status = 'FAILED' OR canonical_fingerprint IS NOT NULL)
) STRICT;

CREATE UNIQUE INDEX uq_active_source_date
  ON import_batches(source_date)
  WHERE status = 'ACTIVE';
CREATE INDEX idx_batch_fingerprint
  ON import_batches(canonical_fingerprint);
CREATE INDEX idx_batch_file_sha
  ON import_batches(file_sha256);
CREATE INDEX idx_batch_source_history
  ON import_batches(source_date, created_at_ms DESC);

CREATE TABLE import_batch_events (
  event_id INTEGER PRIMARY KEY,
  source_date TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('ACTIVATE','REPLACE','ROLLBACK','IMPORT_FAILED')),
  from_batch_id INTEGER REFERENCES import_batches(batch_id),
  to_batch_id INTEGER REFERENCES import_batches(batch_id),
  reason TEXT,
  created_at_ms INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_batch_events_date
  ON import_batch_events(source_date, created_at_ms DESC);

CREATE TABLE import_metadata_entries (
  metadata_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL
    REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL CHECK (sheet_name IN ('data_dictionary','README')),
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),
  item_key TEXT NOT NULL,
  value_text TEXT,
  note_text TEXT,
  UNIQUE (batch_id, sheet_name, source_row_number)
) STRICT;

CREATE INDEX idx_metadata_key
  ON import_metadata_entries(batch_id, sheet_name, item_key);

CREATE TABLE validation_issues (
  issue_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL
    REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  quality_rule_version TEXT NOT NULL,
  severity TEXT NOT NULL
    CHECK (severity IN ('ERROR','SEVERE','WARNING','INFO')),
  sheet_name TEXT,
  source_row_number INTEGER,
  column_name TEXT,
  metric_scope TEXT,
  message_safe TEXT NOT NULL,
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  created_at_ms INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_validation_batch_severity
  ON validation_issues(batch_id, severity, sheet_name, source_row_number);
~~~

Preview 完全在記憶體中，不建立 batch。Confirm 重新讀取檔案與 SHA；若失敗，可在 rollback 後另開小交易建立 FAILED batch + validation_issues，且不建立任何 history row。

### 3.5 machine_3min 逐欄映射

~~~sql
CREATE TABLE history_machine_intervals (
  machine_interval_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL
    REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),

  source_date TEXT NOT NULL,                         -- 日期
  time_label TEXT NOT NULL,                          -- 時間
  interval_start_text TEXT NOT NULL,                 -- 區間開始
  interval_end_text TEXT NOT NULL,                   -- 區間結束
  interval_start_ms INTEGER NOT NULL,
  interval_end_ms INTEGER NOT NULL,
  machine_id TEXT NOT NULL REFERENCES machines(machine_id), -- 機台
  area TEXT NOT NULL CHECK (area IN ('A','B')),      -- 區域

  none_seconds REAL,                                 -- None秒
  red_seconds REAL,                                  -- Red秒
  yellow_seconds REAL,                               -- Yellow秒
  green_seconds REAL,                                -- Green秒
  blue_seconds REAL,                                 -- Blue秒
  white_seconds REAL,                                -- White秒
  source_four_state_total_seconds REAL,              -- 四態合計秒
  source_processing_hours REAL,                      -- 加工小時
  source_yellow_hours REAL,                          -- 待機小時(黃燈)
  source_red_hours REAL,                             -- 異常小時
  source_none_hours REAL,                            -- 未開機小時
  source_interval_processing_ratio REAL,             -- 區間加工比例
  source_powered_processing_ratio REAL,              -- 開機加工比例
  source_quality_status TEXT,                        -- 品質狀態；來源缺失保留 NULL
  source_quality_note TEXT,                          -- 品質備註

  source_exception_json TEXT
    CHECK (source_exception_json IS NULL OR json_valid(source_exception_json)),
  green_hours_eligible INTEGER NOT NULL CHECK (green_hours_eligible IN (0,1)),
  four_state_ratio_eligible INTEGER NOT NULL CHECK (four_state_ratio_eligible IN (0,1)),
  six_state_share_eligible INTEGER NOT NULL CHECK (six_state_share_eligible IN (0,1)),
  transition_eligible INTEGER NOT NULL CHECK (transition_eligible IN (0,1)),
  quality_rule_version TEXT NOT NULL,
  issue_codes_json TEXT NOT NULL CHECK (json_valid(issue_codes_json)),

  CHECK (interval_end_ms - interval_start_ms = 180000),
  CHECK (area = substr(machine_id, 1, 1)),
  UNIQUE (batch_id, machine_id, source_date, time_label)
) STRICT;

CREATE INDEX idx_machine_query
  ON history_machine_intervals(machine_id, interval_start_ms);
CREATE INDEX idx_machine_batch_time
  ON history_machine_intervals(batch_id, interval_start_ms);
CREATE INDEX idx_machine_source_date
  ON history_machine_intervals(source_date, machine_id, time_label);
~~~

Excel 21 欄全部有一對一來源欄。interval_*_ms、eligibility、rule version、issue codes 是系統 metadata。跨 active/replaced 查詢一律先 join import_batches；正式分析只取 status='ACTIVE'。

### 3.6 environment_3min 逐欄映射

~~~sql
CREATE TABLE history_environment_intervals (
  environment_interval_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL
    REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),

  source_date TEXT NOT NULL,                         -- 日期
  time_label TEXT NOT NULL,                          -- 時間
  interval_start_text TEXT NOT NULL,                 -- 區間開始
  interval_end_text TEXT NOT NULL,                   -- 區間結束
  interval_start_ms INTEGER NOT NULL,
  interval_end_ms INTEGER NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('A','B')),      -- 區域
  sensor_number INTEGER NOT NULL CHECK (sensor_number > 0), -- 感測器編號
  category TEXT NOT NULL,                            -- 類別
  average_value REAL,                                -- 平均
  maximum_value REAL,                                -- 最大
  median_value REAL,                                 -- 中位數
  minimum_value REAL,                                -- 最小
  reference_threshold REAL,                          -- 參考門檻
  source_max_judgement TEXT,                         -- 最大值判斷
  source_quality_status TEXT,                        -- 品質狀態；來源缺失保留 NULL
  source_note TEXT,                                  -- 備註

  source_exception_json TEXT
    CHECK (source_exception_json IS NULL OR json_valid(source_exception_json)),
  average_eligible INTEGER NOT NULL CHECK (average_eligible IN (0,1)),
  maximum_eligible INTEGER NOT NULL CHECK (maximum_eligible IN (0,1)),
  median_eligible INTEGER NOT NULL CHECK (median_eligible IN (0,1)),
  minimum_eligible INTEGER NOT NULL CHECK (minimum_eligible IN (0,1)),
  quality_rule_version TEXT NOT NULL,
  issue_codes_json TEXT NOT NULL CHECK (json_valid(issue_codes_json)),

  CHECK (interval_end_ms - interval_start_ms = 180000),
  UNIQUE (batch_id, area, sensor_number, category, source_date, time_label)
) STRICT;

CREATE INDEX idx_environment_query
  ON history_environment_intervals(
    area, sensor_number, category, interval_start_ms
  );
CREATE INDEX idx_environment_batch_time
  ON history_environment_intervals(batch_id, interval_start_ms);
~~~

### 3.7 alarm_events 逐欄映射

~~~sql
CREATE TABLE history_alarm_events (
  alarm_event_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL
    REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),
  source_date TEXT NOT NULL,

  event_time_text TEXT NOT NULL,                     -- 事件時間
  event_at_ms INTEGER NOT NULL,
  sensor_name TEXT,                                  -- 感測器；可 NULL
  sensor_id TEXT NOT NULL,                           -- 感測器ID
  sensor_type TEXT,                                  -- 類型；可 NULL
  group_text TEXT,                                   -- 群組
  rule_name TEXT,                                    -- 規則名稱；可 NULL
  rule_condition_text TEXT,                          -- 規則條件；可 NULL
  current_value_text TEXT,                           -- 當前值（原文）
  current_value_numeric REAL,                        -- 當前值（可解析時）
  duration_original TEXT,                            -- 持續時間原文
  initial_classification TEXT,                       -- 初步事件分類
  classification_status TEXT,                       -- 分類狀態

  event_fingerprint TEXT NOT NULL,
  duplicate_within_batch INTEGER NOT NULL DEFAULT 0
    CHECK (duplicate_within_batch IN (0,1)),
  issue_codes_json TEXT NOT NULL CHECK (json_valid(issue_codes_json)),
  UNIQUE (batch_id, source_row_number)
) STRICT;

CREATE INDEX idx_alarm_time
  ON history_alarm_events(event_at_ms, sensor_id);
CREATE INDEX idx_alarm_type_rule
  ON history_alarm_events(sensor_type, rule_name, event_at_ms);
CREATE INDEX idx_alarm_fingerprint
  ON history_alarm_events(batch_id, event_fingerprint);
~~~

event_fingerprint 不設 UNIQUE。沒有企業 event ID 時，完全相同的兩列只能標記疑似重複，不能靜默刪除，也不能跨版本 merge。

### 3.8 quality_issues 逐欄映射

~~~sql
CREATE TABLE history_quality_issues (
  quality_issue_id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL
    REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL CHECK (source_row_number >= 2),
  source_date TEXT NOT NULL,                         -- 日期
  time_label TEXT,                                   -- 時間
  subject_text TEXT NOT NULL,                        -- 對象
  problem_text TEXT NOT NULL,                        -- 問題
  interval_total_seconds REAL,                       -- 區間合計秒
  source_exception_json TEXT
    CHECK (source_exception_json IS NULL OR json_valid(source_exception_json)),
  UNIQUE (batch_id, source_row_number)
) STRICT;

CREATE INDEX idx_quality_issue_date
  ON history_quality_issues(source_date, subject_text);
~~~

## 4. 唯一鍵與 active view

| 資料 | 批次內業務鍵 | 跨版本規則 |
|---|---|---|
| machine | machine_id + source_date + time_label | join active batch；不同版本可有同鍵 |
| environment | area + sensor_number + category + source_date + time_label | join active batch |
| alarm | source_row_number；fingerprint 只索引 | 無 event ID，不跨版本去重 |
| quality issue | source_row_number | 來源問題列原樣隨版本 |
| live reading | poll_run_id + sensor_id | 每輪一筆；重試覆蓋 endpoint 結果而非另建 poll |

建議建立只讀 repository query，而不建立容易被誤用的實體 active copy。共同條件：

~~~sql
... FROM history_machine_intervals h
JOIN import_batches b ON b.batch_id = h.batch_id
WHERE b.status = 'ACTIVE'
~~~

## 5. 指紋與重複

### 5.1 指紋

- file_sha256：原始上傳 bytes；偵測完全相同檔案。
- canonical_fingerprint：依六張工作表固定順序、sheet 名、row/column、typed cell tag 與值計算。忽略 XLSX 壓縮、樣式、作者 metadata；不 trim 業務文字、不把空白改 0。
- metadata payload_hash：configs/groups canonical JSON，object key 排序後 hash。

### 5.2 判定

1. file SHA 或 canonical fingerprint 已存在且來源日相同：DUPLICATE，略過。
2. 來源日已有 ACTIVE 且 fingerprint 不同：CONFLICT，preview 要求 replacement 明確確認。
3. 同 fingerprint 卻解析出不同 source_date：視為契約/實作錯誤，阻止。

## 6. Confirm、替換與回復交易

### 6.1 選檔移除

前端尚未提交清單的「移除」完全不碰 SQL，也不建立 import_batches。

### 6.2 每個檔案獨立提交

多檔 confirm 以每份檔案一個結果、一個交易處理。某日失敗不 rollback 已成功的其它日期，也不得在同一檔內部分寫入。

### 6.3 新增/替換

Confirm 先在 transaction 外重讀 bytes、重算 SHA/canonical、跑完整 validation。通過後：

~~~text
BEGIN IMMEDIATE
  1. 再查 duplicate / active conflict
  2. 插入新 batch（先為 REPLACED，尚未 active）
  3. 插入 metadata、issues、四張 history 表
  4. 驗證 row counts、來源日、外鍵與批次內唯一鍵
  5. 若 replacement：舊 ACTIVE -> REPLACED，記 replaced_at
  6. 新 batch -> ACTIVE，記 activated_at/replaces_batch_id
  7. 寫 import_batch_events
COMMIT
~~~

任何步驟失敗皆 rollback，新舊 active 狀態不變。新批次不得先標 ACTIVE，避免 partial unique index 衝突。

### 6.4 Alarm 完整性

- 六張工作表缺任一張：結構錯誤，阻止。
- alarm_events 為空且 README=已提供：PROVIDED_EMPTY，可代表取得來源後 0 列。
- alarm_events 為空且 README=未提供：MISSING。初次匯入可高警告完成，但不得說 0 Alarm。
- replacement 從 PROVIDED_* 退化成 MISSING/UNKNOWN：阻止，不提供靜默 override。推薦補齊整份修正版。

### 6.5 回復

使用者選定同來源日的 REPLACED batch 後：

1. BEGIN IMMEDIATE。
2. 驗證目標 batch 完整且契約仍可讀。
3. 現 ACTIVE -> REPLACED；目標 -> ACTIVE。
4. 寫 ROLLBACK event，from/to batch 均保留。
5. COMMIT。

不複製 rows、不刪除目前版本。若 DB schema 已升級到無法讀舊契約，回復必須阻止並提示先做相容 migration。

## 7. Validation issue code

規則碼是穩定 API，顯示文字可翻譯。最低集合：

- STRUCT_MISSING_SHEET、STRUCT_MISSING_COLUMN、STRUCT_UNEXPECTED_COLUMN
- DATE_MULTIPLE_SOURCE_DATES、DATE_README_MISMATCH
- TIME_INVALID_LABEL、TIME_INTERVAL_MISMATCH、TIME_DUPLICATE_BUSINESS_KEY
- VALUE_NON_NUMERIC、VALUE_NEGATIVE、STATE_ALL_MISSING
- STATE_TOTAL_OUT_OF_TOLERANCE、STATE_BLUE_WHITE_NONZERO
- DERIVED_VALUE_MISMATCH、QUALITY_STATUS_UNKNOWN
- DICTIONARY_VERSION_DIFFERENT、DICTIONARY_SEMANTIC_CHANGE
- ALARM_SOURCE_MISSING、ALARM_REPLACEMENT_REGRESSION、ALARM_DUPLICATE_FINGERPRINT

metric_scope 可為 GREEN_HOURS、FOUR_STATE_RATIO、SIX_STATE_SHARE、TRANSITION、ENV_AVG、ENV_MAX、ENV_MEDIAN、ENV_MIN、ALARM。

### 7.1 品質規則版本升級

eligibility flags 是可重建的衍生快取，不是來源真值。應用程式常數 CURRENT_QUALITY_RULE_VERSION 與 row/issue 的 quality_rule_version 必須一致：

1. 查詢遇到舊版本 row 時，不使用舊 eligibility；排除該 row 並回傳 QUALITY_RULE_VERSION_MISMATCH coverage warning。
2. 規則升級需提供 idempotent、可中斷續跑的批次重算命令；它只讀既有來源欄、source_exception_json 與 metadata，不改來源值。
3. 以單一 import batch 為 transaction 邊界，重算 flags、issue_codes 與 validation_issues；成功後才把該批次所有 row 切到新 rule version。
4. active batch 尚未重算完成時，相關指標顯示「品質規則待更新」，不回退使用舊旗標。
5. 本輪不增加重算 UI；此規則只定義未來 migration/release 的安全行為。

## 8. 查詢與索引驗證

Stage 3 要用 EXPLAIN QUERY PLAN 驗證：

1. 日期區間 + 機台 Green SUM 使用 idx_machine_query/batch_time，不掃 replaced rows。
2. area + sensor point + category + time 使用 idx_environment_query。
3. Alarm 日期/類型篩選使用 idx_alarm_time 或 idx_alarm_type_rule。
4. 最新 sensor reading 先定位 sensor_id + time，不對每個 sensor 做全表掃描。
5. replacement/rollback 的 active date lookup 使用 partial unique index。

不先增加彙總表。預估一年約 280 萬歷史 interval rows，SQLite 在正確索引與單機讀多寫少情境可先承擔；只有量測後確定查詢不符目標，才評估 materialized aggregates。

## 9. Retention、備份與刪除

- 歷史與 import audit 不自動刪除。未來若做管理功能，必須先定備份與刪除權限。
- live retention 依 fetched_at_ms 刪除 3 天前 readings，再刪無 readings 且過期的 poll/endpoint audit。
- 清理以小批 transaction 執行，避免長時間寫鎖。
- 備份包含單一 DB 檔，但 WAL 模式需使用 backup API 或一致性停機備份。
- docker compose down -v 是不可回復的 volume 刪除，README 要用醒目警告。

## 10. Schema 驗收

- 外鍵與 STRICT 真正開啟；每個 connection 都設定 PRAGMA。
- 標準化範例可逐欄落入四張 history 表，數量 3840/3840/11/0。
- NULL 與 0 不混淆；Await token 可由 exception JSON 追溯。
- 24:00 保留 time_label，絕對 end 是次日。
- 完全重複 0 新 rows；replacement 只改 active 指標；故意中途失敗時舊 active 不變。
- rollback 不複製或刪除 rows，event audit 可重建版本切換順序。
- Demo 操作不增加 poll、reading 或 history rows。

### 10.1 Stage 5.2 migration v2

- 在同一 SQLite transaction 內重建 `history_machine_intervals`、`history_environment_intervals`、`history_alarm_events` 與 `validation_issues`，放寬的只有已核准可空來源欄位與 `SEVERE` 品質層級。
- 既有空字串來源品質／Alarm 描述轉為 SQL NULL；事件時間、Sensor ID、來源鍵、外鍵及唯一鍵不放寬。
- 依來源品質備註或同批 `history_quality_issues` 的明確嚴重不完整訊號，把受影響列切到 `jiyin-quality-v2` 並限縮 Green／六態／transition eligibility；其餘列只升級規則版本，不改來源數值。
- migration 保留 batch ID、ACTIVE/REPLACED、版本事件、row ID、索引與檔案指紋。非空 v1 fixture 必須通過 `foreign_key_check`、`integrity_check`，失敗時由 migration transaction 完整 rollback。

## 11. 相關文件

- [資料契約](./DATA_CONTRACT.md)
- [架構](./ARCHITECTURE.md)
- [功能規格](./FEATURE_SPEC.md)
- [實作計畫](./IMPLEMENTATION_PLAN.md)
