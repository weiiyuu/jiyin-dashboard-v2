# 資料契約與計算語意

> 狀態：Stage 2 設計草案  
> 契約代號：jiyin-v1-draft  
> 時區：Asia/Taipei  
> 本文件是 schema、匯入、統計、API response 與測試的共同依據。

## 1. 來源優先序與通則

1. **[已確認需求]** STAGE2_DESIGN_TASK.md 的近期決策優先。
2. **[檔案證據]** 標準化 Excel 的實際欄名與 data_dictionary 優先於舊程式 schema。
3. **[檔案證據]** values/configs/groups 範例只證明樣本結構，不把未知 status、responseCode 或燈號語意擴寫成企業正式契約。
4. **[建議設計]** 系統驗證並保存標準化資料，不重新執行上游清洗、不為湊 180 秒改值、不補造缺日或區間。
5. v1 不接受原始公司 Excel。原始 2026-09-21 檔只供理解來源；可匯入契約是六張工作表的每日標準化檔。

### 1.1 共用 API Response 型別

所有 Route Handler 共用一個成功 envelope，不允許各頁自行發明 meta 欄位：

~~~ts
type ApiResponse<T> = { data: T; meta: ApiMeta };

type ApiMeta = {
  generatedAt: string;                 // 必要，ISO 8601
  timezone: "Asia/Taipei";            // 必要
  requestId: string;                   // 必要，安全追蹤 ID
  warnings: ApiWarning[];              // 必要；沒有警告時為 []
  providerMode?: "LIVE" | "DEMO";      // 即時/provider 路由才有
  timeContext?: TimeContext;           // providerMode 存在時必須有
  coverage?: CoverageMeta;             // 有資料覆蓋語意時
  pagination?: PaginationMeta;         // 分頁列表時
  staleAfterSeconds?: number;          // 即時頁需要揭露門檻時
};
~~~

錯誤 response 使用共同 ApiErrorResponse；至少包含 error.code、error.message、error.requestId，可選 fields。HTTP status 與 error code 要一致。generatedAt 是 server 產生 response 的真實時間；Demo 的模擬現在時間放在 timeContext.now，不可覆寫 generatedAt。

## 2. 即時企業 API

### 2.1 共通 envelope

**[檔案證據]** 三份樣本外層均有 batch_time、fetched_at、endpoint、response。response 觀察到 apiType、apiVersion、data、localTime、responseCode、responseMsg、responseTime、thingAlias、thingName；configs/groups 另觀察到 updateTime。

| 欄位 | 儲存 | 語意 |
|---|---|---|
| batch_time | api_poll_runs.batch_time_text + batch_time_ms | Collector 邏輯輪次時間 |
| fetched_at | api_endpoint_runs.fetched_at_ms | 本機收到該端點回應時間 |
| response.responseTime | api_endpoint_runs.response_time_text/ms | 企業 API 回應時間 |
| sensor.updateTime | live_sensor_readings.sensor_update_time_text/ms | 感測器資料更新時間 |
| responseCode/responseMsg | api_endpoint_runs | API 層結果；未確認 code 字典 |

四種時間必須分開保存。responseCode 樣本為字串 "00"，但只可由驗證過的成功值設定判斷 API 成功；不可只因 HTTP 2xx 就稱資料成功。

### 2.2 values

**[檔案證據]** response.data 是以 Sensor ID 為 key 的物件。每筆：

~~~json
{
  "id": "1jn1",
  "status": 1,
  "updateTime": "2026-11-12T04:09:15.930358383Z",
  "values": {"blue":0,"green":1,"red":0,"white":0,"yellow":0}
}
~~~

- lamp 只有 blue/green/red/white/yellow 五色，沒有歷史 Excel 的 None。
- 非 lamp 的 values.value 在樣本是字串，可能是數字字串、帶單位或特殊格式；先保存原文，再依 config type 做可失敗的 typed parse。
- status 樣本有 1/2，但語意未知。只保存 raw_status，不映射正常、故障或離線。
- values key、內部 id 與 config id 應一致；不一致是 schema warning，該筆不做業務 mapping。

### 2.3 configs

**[檔案證據]** response.data[sensor_id].config 有 id、displayname、type、unit。樣本 48 個：25 analog、8 detector、8 lamp、7 string。

configs 是顯示名與型別來源，不從 Sensor ID 猜中文名。unit 空字串仍是有效來源值。未知 type 保留但不解析成既有業務角色。

### 2.4 groups

**[檔案證據]** response.data 是群組陣列；每群有 groupId、groupAlias、sensors 物件，sensor entry 有 id、sortingId。樣本 5 群、47 個指派；SRIP 在 values/configs 存在但未分群。

缺 group 是合法降級狀態。系統顯示「未分群」，不把它放入最相似區域。

### 2.5 v1 已證實 mapping

| 邏輯角色 | Sensor ID | configs displayname | 使用方式 |
|---|---|---|---|
| A1 lamp | nav5 | 列印A區A1燈號 | 機台即時狀態 |
| A2 lamp | zzaz | 列印A區A2燈號 | 機台即時狀態 |
| A3 lamp | w18j | 列印A區A3燈號 | 機台即時狀態 |
| A4 lamp | ookd | 列印A區A4燈號 | 機台即時狀態 |
| B1 lamp | 1jn1 | 列印B區B1燈號 | 機台即時狀態 |
| B2 lamp | rnnj | 列印B區B2燈號 | 機台即時狀態 |
| B3 lamp | ahr9 | 列印B區B3燈號 | 機台即時狀態 |
| B4 lamp | gg70 | 列印B區B4燈號 | 機台即時狀態 |
| A 溫度 1/2 | curf / c24c | 列印A區溫度1/2 | 獨立序列，不平均 |
| A 濕度 1/2 | a9vj / 5cu1 | 列印A區濕度1/2 | 獨立序列，不平均 |
| B 溫度 1/2 | coc7 / 4vat | 列印B區溫度1/2 | 獨立序列，不平均 |
| B 濕度 1/2 | ykpw / e5e0 | 列印B區濕度1/2 | 獨立序列，不平均 |

加工完成 detector（A1–A4：mvex、zs3e、fd0b、z1dx；B1–B4：4pi1、mymo、e5hb、ehwz）可存入 catalog/readings，但 v1 不拿它推算產量。智慧電錶、B4 列印狀況與參數不進 v1 頁面。

### 2.6 Live lamp 決策

| 輸入 | 業務狀態 |
|---|---|
| 五色中恰一個為 1，其餘為 0 | 對應 GREEN/YELLOW/RED/BLUE/WHITE |
| 多個為 1 | OTHER，附 activeColors，不選主色 |
| 五色全 0 | UNKNOWN，不轉 None、不稱正常或離線 |
| 缺欄、非 0/1、無 reading | UNKNOWN，附 validation warning |
| reading 超過 stale 門檻 | 保留解析狀態但 freshness=STALE，UI 不當目前狀態統計 |

連線狀態、資料新鮮度與 lamp 狀態是三個不同欄位。

### 2.7 Live 三分鐘落格與 Demo 時間

Live 趨勢的 x 軸不用 sensor.updateTime、responseTime 或 fetched_at。每個 Collector collection run 產生獨立 sample_slot：

- SCHEDULED：使用預定三分鐘格點；10:03:15 實際執行仍落 10:03。
- STARTUP/MODE_RESUME：向下取整至 09:00 起算的前一個三分鐘格；10:01 啟動落 10:00。
- MANUAL_TEST：沒有 sample_slot，不產生 reading。
- 同 sensor/slot 多筆：先選 sensor.updateTime 最大，再選 fetched_at 較晚者。
- 跨 slot 的 sensor.updateTime 未增加：後一格不是新觀測，輸出 NULL；不得複製上一值。
- request 失敗或該 sensor 缺值：該格 NULL。
- sensor.updateTime 仍用於 freshness。fetched_at 只作 audit、同格 tie-break 與時間偏差警告。

Demo fixture 必須提供 dataDate、demoClockAt、timezone=Asia/Taipei、source=SYNTHETIC|PRIVATE_REPLAY。Demo 日期軸使用 dataDate，新鮮度使用 demoClockAt，不讀 host 真實今日/現在。公開版預設 synthetic；私人 replay 是 read-only 本機選配，不進 Git、DB 或正式歷史表。

### 2.8 Collection、模式切換與手動測試

- Collection trigger 只有 STARTUP、SCHEDULED、MODE_RESUME；成功必須 values 可用且至少保存一筆 reading。
- MANUAL_TEST 是獨立連線稽核：可保存 transport/API/schema 結果，但沒有 sample_slot、不得寫 reading，也不得更新 collectorLastSuccess/latestSensorDataAt。
- provider mode 每次切換都遞增 modeRevision。Collector 在持久化前比對啟動 revision；不一致時結果為 DISCARDED_MODE_CHANGED，reading count 必須為 0。
- 首頁與即時頁的「最後成功」只使用 collection trigger；API 設定頁另顯示 manual test 結果。

## 3. Excel 工作表契約

欄名必須完全相同；欄位順序可提示但不作唯一判定。所有必要工作表都必須存在。空 quality_issues 合法；空 alarm_events 是否代表零事件要看 README 的 Alarm來源狀態。

型別符號：DATE=YYYY-MM-DD 文字；LABEL=原始時間標籤；DT=可解析本地日期時間文字；NUM=有限數值；TEXT=文字；NULL=允許空值。

### 3.1 machine_3min（21 欄）

| # | 真實欄名 | 契約型別 | 可空 | 來源與業務意義 |
|---:|---|---|---|---|
| 1 | 日期 | DATE | 否 | 來源日；每檔只允許一日 |
| 2 | 時間 | LABEL | 否 | 區間結束標籤，含 24:00 |
| 3 | 區間開始 | DT | 否 | 上游完整開始時間；須與標籤一致 |
| 4 | 區間結束 | DT | 否 | 上游完整結束時間；24:00 為次日 00:00 |
| 5 | 機台 | TEXT enum A1–B4 | 否 | 八台機器業務 ID |
| 6 | 區域 | TEXT enum A/B | 否 | 必須與機台前綴一致 |
| 7 | None秒 | NUM | 是 | 歷史定義未開機；不是缺漏 |
| 8 | Red秒 | NUM | 是 | 紅燈秒數；不是已證實故障 |
| 9 | Yellow秒 | NUM | 是 | 黃燈秒數；不是已證實待機 |
| 10 | Green秒 | NUM | 是 | 加工中秒數 |
| 11 | Blue秒 | NUM | 是 | 藍燈秒數；非零保留與提示 |
| 12 | White秒 | NUM | 是 | 白燈秒數；非零保留與提示 |
| 13 | 四態合計秒 | NUM | 是 | 上游 None+Red+Yellow+Green |
| 14 | 加工小時 | NUM | 是 | 上游 Green/3600 |
| 15 | 待機小時(黃燈) | NUM | 是 | 上游 Yellow/3600；欄名保留但文案稱黃燈時數 |
| 16 | 異常小時 | NUM | 是 | 上游 Red/3600；不等於故障時數 |
| 17 | 未開機小時 | NUM | 是 | 上游 None/3600 |
| 18 | 區間加工比例 | NUM | 是 | Green/四態合計；資格不足或分母 0 為空 |
| 19 | 開機加工比例 | NUM | 是 | Green/(Red+Yellow+Green)；分母 0 為空 |
| 20 | 品質狀態 | TEXT | 否 | 上游品質結論；不可丟棄 |
| 21 | 品質備註 | TEXT | 是 | NaN 轉 0 欄位、完成原值與警告 |

NUM 欄若出現 Await、空白或非數字：typed value 為 NULL，原 token 存 source_exception_json，不能套「部分 NaN 轉 0」。負值同樣原值保留但該指標不合格。

### 3.2 environment_3min（15 欄）

| # | 真實欄名 | 契約型別 | 可空 | 來源與業務意義 |
|---:|---|---|---|---|
| 1 | 日期 | DATE | 否 | 來源日 |
| 2 | 時間 | LABEL | 否 | 三分鐘區間結束標籤 |
| 3 | 區間開始 | DT | 否 | 本地完整開始時間 |
| 4 | 區間結束 | DT | 否 | 本地完整結束時間 |
| 5 | 區域 | TEXT enum A/B | 否 | 區域 |
| 6 | 感測器編號 | INTEGER >0 | 否 | 區域內感測點 1/2 |
| 7 | 類別 | TEXT | 否 | 樣本為溫度/濕度 |
| 8 | 平均 | NUM | 是 | 上游三分鐘 AVG，缺漏不補 0 |
| 9 | 最大 | NUM | 是 | 上游 MAX |
| 10 | 中位數 | NUM | 是 | 上游 MED |
| 11 | 最小 | NUM | 是 | 上游 MIN |
| 12 | 參考門檻 | NUM | 是 | 26°C/40%RH 僅待確認參考 |
| 13 | 最大值判斷 | TEXT | 是 | 上游依參考門檻產生的判斷 |
| 14 | 品質狀態 | TEXT | 否 | 上游品質結論 |
| 15 | 備註 | TEXT | 是 | 門檻未正式確認等註記 |

### 3.3 alarm_events（11 欄）

| # | 真實欄名 | 契約型別 | 可空 | 來源與業務意義 |
|---:|---|---|---|---|
| 1 | 事件時間 | DT | 否 | 原始事件時間，不強制對齊三分鐘 |
| 2 | 感測器 | TEXT | 否 | 原始顯示名 |
| 3 | 感測器ID | TEXT | 否 | 原始 Sensor ID |
| 4 | 類型 | TEXT | 否 | 樣本為 analog |
| 5 | 群組 | TEXT | 是 | 原文保留，可能含分號 |
| 6 | 規則名稱 | TEXT | 否 | 原始規則名 |
| 7 | 規則條件 | TEXT | 否 | 原始規則條件 |
| 8 | 當前值 | NUM/TEXT | 是 | 保存原文及可選 numeric parse |
| 9 | 持續時間原文 | TEXT | 是 | 不自行換算精確秒；樣本有 1 筆缺漏 |
| 10 | 初步事件分類 | TEXT | 是 | 初步註記，不是真實故障根因 |
| 11 | 分類狀態 | TEXT | 是 | 分類成熟度/狀態 |

沒有企業 event ID。event fingerprint 只能偵測完全相同內容，不能證明不同修正版中的兩列是同一事件，也不能無提示去重。

### 3.4 quality_issues（5 欄）

| # | 真實欄名 | 契約型別 | 可空 | 意義 |
|---:|---|---|---|---|
| 1 | 日期 | DATE | 否（有資料列時） | 問題來源日 |
| 2 | 時間 | LABEL/TEXT | 是 | 相關時間 |
| 3 | 對象 | TEXT | 否 | 機台、感測點或其它對象 |
| 4 | 問題 | TEXT | 否 | 上游問題原文 |
| 5 | 區間合計秒 | NUM | 是 | 問題涉及的合計秒 |

只有標題列是合法案例，只代表「表內沒有列出的問題」，不等於整檔零風險。

### 3.5 data_dictionary 與 README

| 工作表 | 欄名 | 策略 |
|---|---|---|
| data_dictionary | 項目、定義/規則、說明 | 每列保存於 import_metadata_entries，供契約版本與追溯 |
| README | 統計項目、數量 | 保存每列；解析資料日期、規則版本、Alarm來源狀態、來源 SHA、列數等已知鍵 |

版本字串不同不直接拒絕。先驗證六表、欄位、型別與必要規則項目；若只是版本名稱改變而語意相容，允許但警告。若時間、NaN、六態或公式規則改變，狀態為 REVIEW_REQUIRED，停用 confirm，待更新契約。

## 4. 時間與期間

- 每台機台理論每日 480 個三分鐘區間；缺區間不補造。
- time_label 10:39 代表 10:36–10:39。interval_start/end 必須相差 180 秒。
- source_date=2025-06-01、time_label=24:00 時，絕對 end 是 2025-06-02T00:00:00+08:00，但仍屬 2025-06-01 來源日。
- 日對日以當日 bucket 位置對齊；週對週以第 1–7 日對齊；月對月以日序 1–31 對齊。不存在的日期或缺日是 NULL，不是 0。
- requested coverage 同時回傳 requested_days、days_with_active_batch、expected_intervals、imported_intervals、metric_eligible_intervals。

### 4.1 同期比較的共同統計語意

- ranking：每台 machine 各自有 period A 與 B 的 Green 小時/coverage。
- trend：所選機台先在每個相對時間位置加總 Green 秒，再各自換算 period A/B 小時；不是每台各畫一條線。
- stateShare：所選機台合併後，period A 與 B 各算一個獨立 100% 六態結果；兩期間不共用分母。
- availability：
  - AVAILABLE：有 eligible 數值。
  - MISSING_DATA：該日/位置在期間內但沒有可用資料。
  - NOT_APPLICABLE：該期間不存在此位置，例如 2 月的第 30 日。
- 日比較按當日 30/60 分鐘位置，週比較按第 1–7 日，月比較按第 1–31 日。MISSING_DATA 與 NOT_APPLICABLE 都回傳 value=null，但原因不同。
- period A/B 各自回傳 requested、imported、eligible coverage；不得以兩者合併分母掩蓋差異。

## 5. 六態與計算

### 5.1 語意

| 狀態 | 歷史語意 |
|---|---|
| None | 上游範本定義未開機；不等於六態全缺 |
| Red | 紅燈狀態；不稱已證實故障 |
| Yellow | 黃燈狀態；不稱已證實待機 |
| Green | 加工中 |
| Blue / White | 保留原值；非零提示，不自行命名原因 |

部分 NaN 轉 0 是上游標準化規則。新系統只驗證備註與數值，不再次補零。六態全 NaN、Await、空白、其它非數字保持缺漏。

### 5.2 公式

~~~text
加工小時 = Green秒 / 3600
黃燈小時 = Yellow秒 / 3600
紅燈小時 = Red秒 / 3600
未開機小時 = None秒 / 3600
四態合計秒 = None + Red + Yellow + Green
區間加工比例 = Green / 四態合計秒
開機加工比例 = Green / (Red + Yellow + Green)
~~~

比例只在對應輸入有效且分母 >0 時計算；否則 NULL。所有比例不稱 OEE、稼動率或設備績效。

### 5.3 指標資格

- green_hours_eligible：Green 是有限非負數，且沒有明確指出 Green 不可信的品質錯誤。180 超差、Blue/White 非零本身不排除 Green。
- four_state_ratio_eligible：None/Red/Yellow/Green 全為有限非負數、來源品質可判讀、分母 >0。
- six_state_share_eligible：六態全為有限非負數，合計落在 179–181 秒，且沒有「未知品質原因」。Blue/White 非零可納入並提示。
- transition_eligible：六態有效、區間時間有效、與相鄰列恰好連續三分鐘。
- environment_stat_eligible：該統計值本身為有限數，且沒有針對該值的不可信品質錯誤。

六態占比的期間演算法：

1. 只取 six_state_share_eligible rows。
2. 各狀態跨列先 SUM(seconds)。
3. denominator = 六個 SUM 的總和；>0 才各自除。
4. 不平均每列百分比。
5. 同時回傳 eligible/imported/expected 覆蓋率與排除原因計數。

## 6. 品質決策矩陣

| 情境 | 整檔 | Green 工時 | 六態占比 | 轉換判讀 | 環境統計/Alarm | 呈現 |
|---|---|---|---|---|---|---|
| 缺必要工作表或欄位 | 阻止 | — | — | — | — | 結構錯誤 |
| 檔案含多個來源日、日期不符 README | 阻止 | — | — | — | — | 日期契約錯誤 |
| 身分欄缺失、非法時間、同批業務鍵重複 | 阻止 | — | — | — | — | 無法安全去重 |
| 未知字典版本但必要規則語意相容 | 允許＋警告 | 依列 | 依列 | 依列 | 依列 | 版本差異 |
| 必要規則語意改變 | 阻止 confirm，待審核 | — | — | — | — | REVIEW_REQUIRED |
| 單列 Green 有效但 180±1 超差 | 允許＋警告 | 納入 | 排除 | 排除 | 不影響 | 顯示超差數 |
| Blue/White 非零且六態完整 179–181 | 允許＋警告 | 納入 | 納入六態 | 可依純態規則判斷 | 不影響 | 顯示非標準狀態 |
| 某狀態缺值/Await/非數字 | 允許＋警告 | Green 有效則納入 | 排除 | 排除 | 不影響 | 保留 token |
| 六態全缺 | 允許＋警告 | 排除 | 排除 | 排除 | 不影響 | 不補 0 |
| 負值 | 允許＋警告 | Green 負值才排除 Green | 排除 | 排除 | 該環境值排除 | 不改原值 |
| quality_issues 空表 | 允許 | 不因此排除 | 不因此排除 | 不因此排除 | 不代表完整性已證明 | 顯示 0 列 |
| 環境 AVG 缺、MAX 有效 | 允許＋警告 | 不影響 | 不影響 | 不影響 | AVG 排除、MAX 可納入 | 缺值不補 0 |
| alarm_events 存在且 README=已提供，0 列 | 允許 | 不影響 | 不影響 | 不影響 | 可顯示「已提供、0 事件」 | 與 missing 分開 |
| alarm_events 空且 README=未提供 | 初次匯入允許＋高警告 | 可納入 | 可納入 | 可納入 | 不可顯示 0 事件 | 顯示來源缺少 |
| 修正版 Alarm 來源缺少，舊 active 已提供 | 阻止替換 | — | — | — | 防止抹除既有事件 | 要求完整修正版 |

「允許＋警告」不代表所有指標都可用；以欄位與指標資格決定。系統不得偷偷修值。

### 6.1 品質規則版本

每個歷史 interval 的 eligibility 與 issue codes 都帶 quality_rule_version。查詢只接受等於 CURRENT_QUALITY_RULE_VERSION 的旗標；版本不符時排除該列並顯示 QUALITY_RULE_VERSION_MISMATCH，不沿用舊判定。未來升級規則時以來源欄位與 exception token 重新計算，按 import batch 交易式切換版本；來源值、來源品質文字與檔案指紋不改變。本版不需要重算 UI。

## 7. 完成與狀態區間

### 7.1 純綠轉純黃

- 純綠：Green>0 且其餘五態皆為 0。
- 純黃：Yellow>0 且其餘五態皆為 0。
- 同機台兩列都 transition_eligible，前列 interval_end 等於後列 interval_start，才標「列印完成區間邊界」。
- 顯示後列開始/前列結束的邊界，不宣稱秒級切換，不換算完工件數。
- 同一列 Green>0 且 Yellow>0 只標「疑似完成」；不推斷區間內順序。

### 7.2 Red/Yellow 連續區間

「連續紅燈區間」只是分析分組，不是故障事件。相同機台、相鄰絕對時間恰好三分鐘、每列 Red>0 且 red 值合格才合併；Red=0、缺列、品質不合格都中斷。可跨來源日，但兩日都要有 active batch 且絕對時間連續。Yellow 同理。

## 8. Alarm 與環境門檻

- Alarm 事件保留規則名、條件、當前值、時間、持續時間原文、分類與狀態。
- 「列印完成」警報不等於故障；初步分類不是真實根因。
- 26°C / 40%RH 是待企業確認參考門檻。UI 可說「超過參考值」，不可說「不合格」。
- Alarm source status 為 PROVIDED_NONEMPTY、PROVIDED_EMPTY、MISSING 或 UNKNOWN；只有前兩者可判讀事件數。

## 9. 可手工驗算的測試向量

| ID | 輸入 | 預期 |
|---|---|---|
| V1 | 兩列 Green=180、Green=90；其餘 0 | 累積 Green=270 秒=0.075 小時，不平均 1 與 0.5 |
| V2 | 一列 [None,Red,Yellow,Green,Blue,White]=[0,0,0,90,45,45] | 六態合計 180；占比 Green 50%、Blue 25%、White 25%；Green 可納入 |
| V3 | Green=90，其一狀態 NULL | Green 工時可納入；六態占比與轉換排除 |
| V4 | 六態全 0 | 是有效 0，但六態分母 0，share=NULL；不可解讀 None |
| V5 | time_label=24:00、source_date=2025-06-01 | end=2025-06-02 00:00+08，業務來源日仍 06-01 |
| V6 | 10:36–10:39 純綠；10:39–10:42 純黃 | 一個完成邊界 10:39；不是一件產品 |
| V7 | 純綠後缺一列，再純黃 | 不判完成、不合併連續狀態 |
| V8 | 來源日 06-01 缺 8 個區間 | 不補 0；coverage imported/expected 反映缺 8 |
| V9 | 同檔相同 machine+date+time_label 兩列 | 整檔阻止 |
| V10 | 相同 canonical fingerprint 再上傳 | DUPLICATE，0 新資料 |
| V11 | 同日不同 fingerprint，Alarm 完整 | CONFLICT；明確確認後整份替換、舊版保留 |
| V12 | 同日修正版 Alarm=MISSING、舊版=PROVIDED | 阻止替換 |
| V13 | 2025-02 對 2025-03 | 月比較位置 29–31 在 2 月為 NULL；不補 0 |
| V14 | status=2、五燈全 0 | raw status 保存；機台狀態 UNKNOWN |
| V15 | HTTP 200、responseCode 非成功 | connection transport 成功；API/data 狀態失敗 |
| V16 | Demo dataDate=2026-01-15、demoClockAt=16:57:30、host 今日不同 | 軸仍為 2026-01-15 09–17；16:57 reading 依模擬時鐘為 fresh；固定顯示模擬標示 |
| V17 | 10:01 STARTUP 成功、10:03 SCHEDULED 成功、10:06 請求失敗 | 10:00 與 10:03 有值，10:06 為 NULL；updateTime 不作 x 軸 |
| V18 | 10:03 同 sensor 兩筆，updateTime 分別 10:02:58/10:03:01 | 取 updateTime=10:03:01；若下一格仍為同一 updateTime，下一格 NULL |
| V19 | 日比較 A=Green 180秒、B=Green 90秒 | ranking/trend A=0.05h、B=0.025h；各自 coverage |
| V20 | 週比較 A 第4日缺資料，B 七日完整 | position 4：A=MISSING_DATA/null、B=AVAILABLE；其它位置不受影響 |
| V21 | 2025-02 對 2025-03 月比較 | position 29–31：2月 NOT_APPLICABLE/null；3月按實際資料標 AVAILABLE 或 MISSING_DATA |
| V22 | 已存 eligibility rule v1，應用 current=v2 | 不使用 v1 flags；coverage 顯示規則待更新，重算後才恢復 |

## 10. 衝突裁決

| 分歧 | 裁決與依據 |
|---|---|
| PROJECT_BRIEF 說 TLS 原則上驗證；Stage 2 確認企業自簽 | 依 Stage 2，允許 allowlisted enterprise client 的局部例外；不做全域關閉 |
| Stage 1 建議只接受字典 v3 | 不採字串白名單；依 Stage 2 改為結構與必要語意相容性檢查 |
| Stage 1 建議警告列可能全排除 | 改為指標別 eligibility；Blue/White 或總秒超差不自動排除有效 Green |
| Excel 欄名「待機小時(黃燈)」 | DB 保留來源欄與值；UI 稱黃燈時數，避免證實待機 |
| 歷史有 None、Live 無 None | 兩套來源不互相推導；Live 五燈全 0=UNKNOWN |
| data_dictionary「缺少 Alarm 表保留空表」與六表契約 | 六張 sheet 必須存在；以 README status 區分已提供空表與來源未提供 |

## 11. 非阻擋企業語意待確認

1. **[待確認]** values.status 1/2 與 responseCode 的完整官方字典。預設只保存 raw，不影響 lamp 判讀。
2. **[待確認]** 26°C / 40%RH 是否會成為正式門檻。定案前只顯示參考值。

7 分鐘 stale 已定為「暫定、可設定」的開發預設，不再視為 Stage 3 阻塞或需要使用者再次決策。

## 12. 相關文件

- [架構](./ARCHITECTURE.md)
- [SQLite 實體設計](./DATABASE_DESIGN.md)
- [功能規格](./FEATURE_SPEC.md)
