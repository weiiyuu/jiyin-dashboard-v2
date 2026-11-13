# 系統架構與部署設計

> 狀態：Stage 2 設計草案  
> 最後更新：2026-11-14  
> 依據：STAGE2_DESIGN_TASK.md > PROJECT_BRIEF.md > STAGE1_ANALYSIS_REFERENCE.md

## 1. 結論與邊界

**[建議設計]** 採用單一 TypeScript 技術棧：Next.js Web 與獨立 Collector 是兩個長駐程序，共用一個 SQLite 檔案。Docker Compose 只管理 web、collector 與 named volume，不增加 Python API、ORM、Redis 或 PostgreSQL。

**[已確認需求]** 本版是每台筆電單機執行，不做跨電腦同步。沒有登入時，Web 主機埠只綁定 127.0.0.1:3000。Live 只在企業白名單網路使用；Docker 不會繞過 IP 白名單。

### 1.1 系統圖

~~~mermaid
flowchart LR
  B[Browser / React UI] -->|same-origin JSON| R[Next.js Route Handlers]
  R --> Q[Query / statistics services]
  R --> I[Excel preview + import service]
  R --> S[Connection test + runtime mode]
  Q --> DB[(SQLite: history + live)]
  I -->|confirm only; transaction| DB
  S --> EC[Enterprise API client]
  C[Independent TypeScript Collector] --> EC
  EC -->|GET fixed endpoints| E[Enterprise API]
  C -->|metadata + readings| DB
  D[Synthetic Demo provider] --> Q
  D -. never writes .-> DB
  V[(Named volume)] --- DB
~~~

### 1.2 責任分工

| 元件 | 負責 | 不負責 |
|---|---|---|
| React UI | 呈現、篩選、表單回饋、圖表互動 | 解析 Excel、企業 API 請求、統計真值、排程 |
| Route Handlers | 同源 API、輸入驗證、查詢、preview/confirm、手動連線測試 | 長駐輪詢、把秘密送到瀏覽器 |
| Query/statistics services | 一致的品質資格、分桶、覆蓋率、provider 交換 | 自行修復來源值 |
| Excel import service | 讀取、契約驗證、指紋、confirm 重驗、交易式版本切換 | 原始公司 Excel 清洗、preview 寫正式資料 |
| Collector | 不依賴開頁的輪詢、重試、快取、去重、保留期清理 | 自動切 Demo、長期歷史分析 |
| Enterprise client | 固定 GET、allowlist、逾時、拒絕轉址、局部 TLS 策略 | 任意 URL、瀏覽器直連、全域關閉 TLS |
| SQLite | 單機持久化、history/live 分表與生命週期 | 多主機分散式共用 |
| Demo provider | 讀取人工合成、可公開 fixture | 冒充 Live、寫 DB、收錄未授權企業 JSON |

## 2. 技術選型

| 層次 | 定案 | 理由 | 替代方案與代價 |
|---|---|---|---|
| Runtime | Node.js 24.22.3 LTS + npm 11.19.1；鎖 image digest | 目前 Node 24 安全 patch，支援 Next 16 與內建 SQLite | Node 22 + native addon 增加跨平台負擔 |
| Web | Next.js 16.4.6、React 19.3.0、TypeScript 5.9.3 strict | 舊專案已有同版證據；Route Handler 足夠 | 另開 Express/Fastify 多一個服務邊界 |
| CSS | Tailwind 4.3.3 + 少量 tokens/components CSS | 選擇性移植舊版視覺，不搬整包耦合 CSS | UI kit 會改變現有設計語言 |
| SQLite access | node:sqlite DatabaseSync、明確 SQL + repository | 零外部 native dependency | better-sqlite3 成熟但需 native binary |
| Charts | Recharts 3.x；Stage 3 鎖 patch | 排行、折線、100% 堆疊均足夠 | ECharts 功能較多但 API/bundle 較重 |
| XLSX | 優先驗證 read-excel-file + 受限 ZIP 讀取模式 | 舊專案已有檔案與解壓上限模式 | SheetJS 的授權、體積與 API 需另評估 |
| HTTP | server-only undici 專用 client/dispatcher | 可把自簽例外限縮至單一 origin | 全域 Node TLS 設定禁止 |
| Package manager | npm + lockfile v3 | 團隊習慣與舊專案一致 | 改 pnpm 沒有明確收益 |

**[檔案證據]** 舊專案使用 Next 16.4.6、React 19.3.0、TypeScript 5.9.3、Tailwind 4.3.3、Node 24 node:sqlite 與 npm lockfile v3。

**[建議設計]** node:sqlite 在 Node 24.15+ 為 release candidate，尚非 stable。本案仍採用，但 Stage 3 必須：

1. 鎖定 Docker Node 24 patch 與 digest，Mac/Windows 使用同一 image。
2. 對 transaction、WAL、busy timeout、backup/restore 做整合測試。
3. repository 不暴露 node:sqlite 型別；若發現 blocking 問題，可換 better-sqlite3 而不改業務層。

## 3. 執行與部署模型

### 3.1 Compose

| Service | 程序 | 掛載 | 啟動規則 |
|---|---|---|---|
| web | Next production server | DB volume（RW） | 取得 migration lock、升級 DB、通過 healthcheck |
| collector | TypeScript collector entrypoint | 同 DB volume（RW） | 等 web healthy；驗證 schema version；不執行 migration |

Named volume 只適用同一 Docker host，不在兩台電腦的網路檔案系統共用 SQLite。web 容器內監聽 0.0.0.0:3000，Compose 只發佈 127.0.0.1:3000:3000。

### 3.2 SQLite 並行原則

- 每個程序建立自己的 DB connection，不跨程序共用 handle。
- 啟用 foreign_keys=ON、journal_mode=WAL、busy_timeout=5000、synchronous=NORMAL。
- Collector 每輪只開短交易；Excel confirm 使用 BEGIN IMMEDIATE，完整寫入後一次 commit。
- Web 先取完 rows 再序列化，不在讀取 transaction 內做昂貴圖表轉換。
- SQLITE_BUSY 只在有限次數與總時間內重試；逾時顯示「資料庫忙碌，本次未寫入」。
- Migration 只由 web 啟動階段執行；失敗即不健康，Collector 不啟動。

### 3.3 備份與資料風險

- 使用 SQLite backup API，或停止兩個容器後備份 DB；不在 WAL 寫入中只複製主檔。
- README 必須警告 docker compose down -v 會刪除 named volume。
- 歷史匯入長期保留；Live tables 預設 3 天，每日第一輪成功 poll 後分批清理。

## 4. 企業 API 安全邊界

### 4.1 固定請求

**[已確認需求]** 三端點使用 GET。程式只接受 values、configs、groups enum，從 server-only origin 與編譯時固定 path 組合 URL，不接受前端傳入 URL。

~~~text
ENTERPRISE_API_ORIGIN=https://192.0.2.10
ENTERPRISE_API_ALLOWED_ORIGINS=https://192.0.2.10
ENTERPRISE_TLS_MODE=strict
ENTERPRISE_CA_FILE=/run/secrets/enterprise-ca.pem
ENTERPRISE_API_AUTH_MODE=none
# 只有企業確認需要認證時才設定：
# ENTERPRISE_API_AUTH_MODE=bearer|header
# ENTERPRISE_API_AUTH_VALUE=<server-only secret>
# ENTERPRISE_API_AUTH_HEADER_NAME=X-API-Key   # mode=header 時
API_TIMEOUT_MS=10000
API_MAX_RESPONSE_BYTES=2097152
~~~

192.0.2.10 是文件範例，不是真實值。TLS mode 為 strict、custom_ca 或 allowlisted_self_signed。**[檔案證據]** 使用者已成功的 test_api/test.py 是不帶 Authorization header 的 GET；舊 Next.js Bearer 可能只是內部 Route Handler 保護，不能當作企業 API 契約。

認證預設為 none，缺少 token 不得阻止啟動。只有企業確認需要時才切 bearer 或 header；header name 必須是合法 HTTP token，且拒絕 Host、Connection、Content-Length、Cookie 等 hop-by-hop/敏感系統 header。啟動時確認 HTTPS、無 username/password/query/hash、origin 與 allowlist 完全相同。設定 redirect:error、逾時中斷、Content-Length 與實際 bytes 雙重上限。Log 不寫認證值、敏感 header、完整 payload。

### 4.2 局部自簽 TLS 例外

**[已確認需求]** 企業短期只提供直連 IP 的自簽憑證。這不是 Stage 3 阻塞，但只在企業 client 局部啟用。

~~~ts
// 設計示意，不是 Stage 2 實作
const dispatcher = new Agent({
  connect: { rejectUnauthorized: tlsMode !== \"allowlisted_self_signed\" },
});
await request(fixedUrl, {
  method: \"GET\",
  dispatcher,
  maxRedirections: 0,
});
~~~

allowlisted_self_signed 只有 origin 通過 allowlist 時可啟用。不使用 NODE_TLS_REJECT_UNAUTHORIZED=0，不修改全域 dispatcher。日後有企業 CA 時改 custom_ca 且 rejectUnauthorized=true；可信公開憑證則用 strict。

**[風險]** 局部關閉憑證驗證仍有中間人攻擊風險。HTTPS 加密不等於已驗證伺服器身分。UI 與 README 要標示「授權專題測試例外」。

### 4.3 錯誤分類

| code | 意義 | UI 呈現 |
|---|---|---|
| OUTSIDE_WINDOW | Collector 在 09:00–17:00 外略過 | 非可取得時段，不稱連線失敗 |
| IP_NOT_ALLOWED | 401/403 或已知白名單訊息 | 可能非授權網路，不假定唯一原因 |
| TLS_CERTIFICATE | TLS/SAN/自簽設定問題 | 檢查 mode/CA，不建議全域關閉 |
| TIMEOUT | 逾時 | 保留上次值但標過期 |
| NETWORK | DNS/socket/proxy | 區分主機與容器網路 |
| HTTP_STATUS | 非 2xx | 顯示狀態碼，不回傳敏感 body |
| API_RESPONSE | responseCode 非成功 | 技術連線成功，API 未成功 |
| SCHEMA | JSON 結構或型別不合 | 資料不可用，保存 hash 供排查 |
| UNMAPPED_SENSOR | Sensor ID 無 mapping | 顯示未對應，不猜測 |

## 5. Collector 設計

### 5.1 排程

- 時區固定 Asia/Taipei，不以主機預設時區推算。
- Live 且在時段內時，啟動後先跑一輪；之後每 3 分鐘格點後 15 秒輪詢，最後定時輪為 16:57:15。
- 每個 collection run 另存 sample_slot_ms，作為環境趨勢唯一 x 軸落點：定時輪使用其預定三分鐘格點（例如 10:03:15 執行落在 10:03）；啟動/恢復 Live 的立即輪向下取整至 09:00 起算的前一個三分鐘格（10:01 啟動落在 10:00），不建立未來格。
- 單一程序 mutex 防重疊。上一輪未完成時記 SKIPPED_OVERLAP，不堆積工作。
- values 每輪請求。configs/groups 在啟動、無快取、發現未知 sensor 或距上次驗證 60 分鐘時請求。60 分鐘是可設定初值，不是企業契約。
- **[檔案證據]** Stage 1 的 97 輪樣本中 configs/groups 內容不變，但這不是官方不變承諾。Metadata hash 未變只更新 last-seen；hash 變化才存一份 snapshot 並交易式更新 catalog。

### 5.2 部分失敗與重試

- 端點狀態獨立保存；整體為 SUCCESS、PARTIAL、FAILED 或 SKIPPED_*。
- network、timeout、5xx 最多重試 1 次，約 2 秒後執行；4xx、TLS、schema 錯誤不自動重試。
- values 成功但 metadata 失敗：可用上一份已驗證 catalog，標 mappingStale=true。新 Sensor ID 只存原始讀值，不猜名稱。
- 去重以 poll_run_id + sensor_id 唯一鍵實現。重試不建立新邏輯 poll，只增加 endpoint attempt_count。
- 同 sensor/slot 有多個成功 collection run 時，查詢選 sensor_update_at_ms 最大者；相同 updateTime 再以 fetched_at_ms 較晚者決定。跨 slot 若 sensor.updateTime 未增加，後一格視為「未觀察到新樣本」並留 NULL；原始 reading 可留作 audit。
- sample_slot 與 fetched_at 偏差超過 90 秒要回傳 SLOT_TIME_SKEW warning，但 scheduled run 仍使用原預定 slot，避免延遲請求漂到下一格。請求失敗的 slot 沒有 reading，直接留空。

### 5.3 新鮮度與保留

- 初始 stale 門檻 420 秒（7 分鐘），server-only 可設定。這是 **[建議設計]**，不是企業規範。
- 優先以 sensor updateTime 計算；缺少或無效時以 fetched_at 暫代並回傳 warning。
- sensor.updateTime 只用於新鮮度、相同觀測去重與同格候選排序，不直接當圖表 x 軸；x 軸一律用 sample_slot。
- 「HTTP 成功」「API responseCode 成功」「sensor 有更新」「reading 可用」「reading 新鮮」是五個狀態。
- Live 預設保留 3 天。清理只影響 live_sensor_readings 與舊 poll audit，不碰 history/import。

### 5.4 Graceful shutdown

SIGTERM/SIGINT 後停止排新工作，等待當前輪最多 15 秒，commit 或 rollback，關閉 dispatcher 與 DB。下次啟動把遺留 RUNNING poll 改 ABORTED。

## 6. Live / Demo provider

### 6.1 兩種時間模型

| 項目 | Live | Demo |
|---|---|---|
| 即時資料 | SQLite live tables | read-only fixture provider |
| 日期/現在時間 | 真實 Asia/Taipei 現在 | manifest 的 dataDate/demoClockAt |
| freshness | sensor updateTime 對真實現在 | fixture updateTime 對 demoClockAt |
| 09–17 軸 | 真實今日 | dataDate 的 09–17 |
| Collector | 時段內執行 | 略過 |
| UI | Live + health/stale | 固定「模擬資料」+ dataDate + demoClockAt |

公開 synthetic fixture 必須帶 manifest：

~~~json
{
  "fixtureId": "synthetic-day-1",
  "dataDate": "2026-01-15",
  "demoClockAt": "2026-01-15T16:57:30+08:00",
  "timezone": "Asia/Taipei",
  "source": "SYNTHETIC"
}
~~~

Demo 沒有日期或時鐘控制；切換後由 server 選定 fixture manifest，避免增加 replay UI。host 真實日期不得覆寫 fixture 時間，Demo 也不得標成「今日資料」。test_api 的 291 份私人 JSON 只可透過明確選配的本機 replay directory 讀取，使用相同 manifest/provider 介面、read-only、不進 Git、不另建服務；REPLAY_FIXTURE_DIR 必須解析到已被 git ignore 的本機路徑，公開預設仍是 synthetic。

### 6.2 模式切換與 in-flight poll

app_settings 保存 provider_mode 與遞增 mode_revision。Collector 開始輪次時記錄 revision；在任何 live readings/endpoint success 寫入前，必須於同一 DB transaction 重新讀取設定：

1. mode 仍為 LIVE 且 revision 未變：允許持久化。
2. 已切 DEMO 或 revision 改變：不寫 endpoint 成功資料與 readings，只把已存在的 poll audit 收尾為 DISCARDED_MODE_CHANGED。
3. 切回 LIVE：Collector 最多 1 秒內觀察 revision；若在服務時段，先跑 MODE_RESUME 立即輪，再接下一個三分鐘格點；時段外只等待下一可用時段。

Collector 可在網路請求前建立 RUNNING poll audit，但各 endpoint 結果與 readings 先留在記憶體，通過寫入前 revision 檢查後才於同一 transaction 落庫。因此切換 Demo 最多浪費一個已發出的網路請求，不會留下新的 Live 成功資料。

Demo fixture 本身永不寫 DB。明確按下「手動 API 測試」是例外：可寫 MANUAL_TEST audit，但不寫 readings，不改 Collector 成功時間，不改 latest sensor data time。

### 6.3 手動測試與 Collector 健康分離

- collectorLastAttempt/collectorLastSuccess 只看 STARTUP、SCHEDULED、MODE_RESUME，且 last success 必須 values 成功並實際保存至少一筆 reading。
- manualTestLastAttempt/manualTestResult 只看 MANUAL_TEST。
- latestSensorDataAt 只從 live_sensor_readings 計算。
- 首頁 Live 摘要不得讀 manual test 成功。
- Live 失敗不自動切 Demo；Demo 下手動測試仍是真實企業 API 測試，須明確確認。

Runtime mode 不是安全控制。所有寫入端點只接受同源 localhost，檢查 Origin 與 Sec-Fetch-Site，拒絕 CORS。

## 7. 時間契約

- 顯示、排程、歷史分桶使用 Asia/Taipei。
- 絕對時間存 UTC epoch milliseconds，同時保留來源原文。
- sensor updateTime、API responseTime、本機 fetched_at、Collector batch_time、圖表 sample_slot 分別保存，不可混用。
- Excel source_date/time_label 是業務標籤；24:00 保留原文，絕對 interval_end 是次日 00:00。

## 8. 建議目錄邊界

~~~text
src/
  app/                    # 七頁 + Route Handlers
  features/               # 依產品功能分組 UI
  components/             # layout / form / chart / status
  server/
    db/                   # connection, migrations, repositories
    enterprise-api/       # fixed client, schema, mapping
    collector/            # schedule, poll, retention
    history/              # Excel contract, validation, aggregation
    demo/                 # synthetic fixtures/provider
  shared/                 # pure contracts, time, quality
tests/
  unit/ contract/ integration/ e2e/
~~~

Server-only modules必須有 server-only 邊界或等價 build guard，避免環境變數與 DB/API client 進入 client bundle。

## 9. 已採用預設與 Stage 3 技術驗證

| 項目 | 推薦預設 | 替代選項 | 風險/代價 |
|---|---|---|---|
| API 認證 | 預設 none；企業確認需要時才設 bearer/header | 固定 token 為必填 | 認證需求待 smoke test，但不阻止無認證 GET |
| stale | 7 分鐘可設定 | 6 或 9 分鐘 | 太短誤報；太長顯示舊值 |
| metadata recheck | 啟動 + 60 分鐘 + 未知 ID | 每輪都取但 hash 去重 | 請求量與變更發現延遲取捨 |
| node:sqlite | 採用並鎖 Node patch | better-sqlite3 | RC API 變動 vs native addon 交付 |

## 10. 相關文件

- [資料契約](./DATA_CONTRACT.md)
- [SQLite 實體設計](./DATABASE_DESIGN.md)
- [七頁功能規格](./FEATURE_SPEC.md)
- [Stage 3 實作路線](./IMPLEMENTATION_PLAN.md)

外部技術依據：

- [Node.js 24.22.3 LTS 發行資訊](https://nodejs.org/en/blog/release/v24.22.3/)
- [Node.js 24 下載封存與 npm 版本](https://nodejs.org/en/download/archive/v24)
- [Node.js node:sqlite 文件](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- [Next.js 安裝需求](https://nextjs.org/docs/app/getting-started/installation)
- [Recharts 安裝指南](https://recharts.github.io/en-US/guide/installation/)
