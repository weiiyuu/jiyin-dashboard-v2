# Stage 6 驗收紀錄

> 日期：2026-11-15（Asia/Taipei）
>
> 實作 Commit：`8a8e711`
>
> 範圍：企業 API 受控連線驗證、Enterprise Client、Collector、Live/Demo Provider、即時資料查詢與控制 API。未進入 Stage 7 UI。

## 1. 結論

Stage 6 在本次授權範圍內完成。三個既有固定企業 GET 端點已於允許時段各驗證一次；離線後端、合成 Demo、SQLite 交易與 Stage 7 所需資料接口已實作並通過完整自動測試及 Production Build。

本次沒有修改 SQLite schema：Stage 2／Stage 3 已建立的 `sensor_catalog`、`sensor_metadata_snapshots`、`api_poll_runs`、`api_endpoint_runs`、`live_sensor_readings` 與 `app_settings` 已足以承載 Stage 6。所有寫入測試使用 `/private/tmp` 隔離資料庫，沒有讀寫產品資料庫或 Docker Volume。

## 2. A｜真實企業 API 受控驗證

執行時間為 2026-11-15 16:07（台灣時間），沿用先前成功 Python 方法的固定 origin、固定 path、無認證 GET 與該 origin 專用的自簽 TLS 例外。每個端點只發出一個 request，沒有 retry、redirect、掃描其它 path 或後續輪詢。

| 端點 | HTTP | responseCode | 結構結果 | 非敏感摘要 |
|---|---:|---|---|---|
| values | 200 | `00` | 通過 | object，48 筆，5,479 bytes，614 ms |
| configs | 200 | `00` | 通過 | object，48 筆，4,647 bytes，658 ms |
| groups | 200 | `00` | 通過 | array，5 群、47 個指派，2,217 bytes，544 ms |

驗證內容包含共通 envelope、endpoint data 類型、values 的 key／內部 id 與必要欄位、configs 的 config 欄位、groups 的群組與 sensors 結構。結果與現有 `DATA_CONTRACT.md` 的樣本結構一致，未觀察到 schema 差異。

安全結果：

- 未保存原始 response、Sensor 值、企業 origin、憑證或任何認證資訊。
- 未寫入 SQLite，也未修改 `test_api` 或 `_reference_inputs`。
- TLS 例外只套用至這三個已核准 request；未設定 `NODE_TLS_REJECT_UNAUTHORIZED=0`。
- 沒有啟動真實 Collector 或執行第二輪企業請求。

尚未驗證：真實 Collector 連續兩輪的 slot／stale 行為、容器內企業網路與 custom CA、真實 Live 寫入及 retention。這些需要後續另行授權的受監督操作，不以本次單次 GET 冒充已通過。

## 3. B｜Stage 6 離線開發

### 3.1 Enterprise Client

主要檔案：

- `src/server/enterprise/config.ts`
- `src/server/enterprise/client.ts`
- `src/server/enterprise/types.ts`
- `src/server/enterprise/mapping.ts`

完成固定 `values`／`configs`／`groups` allowlist、HTTPS origin 驗證、`none` 預設認證、受限 bearer／custom header、strict／custom CA／allowlisted self-signed 三種 TLS 模式、timeout、2 MiB 上限、禁止 redirect、安全錯誤分類及完整 endpoint schema 驗證。自簽例外使用 client 專屬 `https.Agent`，不改全域 TLS。

mapping 僅使用 `DATA_CONTRACT.md` 已證實的八台 lamp、八個環境 Sensor 與八個 completion detector ID。configs 決定 display name／type／unit，groups 決定群組；未分群或未知 Sensor 保留但不猜 mapping。原始 status、values 與 updateTime 分開保存，數值解析失敗不補 0。

### 3.2 Collector 與 SQLite

主要檔案：

- `src/server/collector/schedule.ts`
- `src/server/collector/service.ts`
- `src/server/collector/scheduler.ts`
- `src/server/collector/main.ts`
- `src/server/db/poll-repository.ts`

完成 Asia/Taipei 09:00–17:00、三分鐘格點後 15 秒、STARTUP／MODE_RESUME 立即輪、sample slot、單程序 overlap audit、network／timeout／5xx 最多一次 retry、metadata 60 分鐘 refresh/hash 去重、partial failure、mode revision compare-before-write、manual audit 分流、三天 Live retention 與 graceful shutdown。

只有 LIVE 且 values 實際保存至少一筆 reading 才能成為 collection success。DEMO 不會執行排程寫入；Live failure 不會切換 Demo。跨 slot 相同 updateTime 仍保留 raw audit reading，但查詢輸出 NULL gap，不複製上一值。

獨立 Collector 使用既有 DB 且只驗 schema version，不執行 migration；Compose 等待 web health 後啟動正式 Collector。以隔離 Demo DB 執行 `node --import tsx src/server/collector/main.ts`，啟動與 graceful SIGINT 均成功，且沒有企業設定時未發出網路請求。

### 3.3 Live／Demo Provider 與 Stage 7 接口

主要檔案：

- `src/server/live/demo-fixture.ts`
- `src/server/live/live-query.ts`
- `src/server/live/provider.ts`
- `src/server/live/connection-status.ts`
- `src/app/api/live/machines/route.ts`
- `src/app/api/live/environment/route.ts`
- `src/app/api/connection-status/route.ts`
- `src/app/api/connection-status/test/route.ts`
- `src/app/api/runtime-mode/route.ts`

完成：

- `GET /api/live/machines`：固定八台、燈號／freshness 分離、六卡摘要、completion detector 原始訊號與 Collector 狀態。
- `GET /api/live/environment`：A/B、溫度／濕度各兩點、09:00–17:00 三分鐘 slots、latest、source times、freshness 與 NULL gap reason。
- `GET /api/connection-status`：Collector、manual test、endpoint transport/API/schema、latest sensor data 分流。
- `POST /api/connection-status/test`：localhost 同源、非服務時段需再次確認、只寫 MANUAL_TEST audit。
- `GET/PUT /api/runtime-mode`：localhost 同源、expected mode/revision compare-and-swap。

公開 Demo manifest 固定 `dataDate`、`demoClockAt`、Asia/Taipei 與 `SYNTHETIC`，提供八台 lamp、八個 completion detector、A/B 共八個環境點及多時點序列。Demo freshness 只使用 manifest clock，host 日期不同也不改語意；fixture 為 read-only，測試確認 0 DB writes。

Stage 7 UI 尚未實作。這些接口已能供後續機台監控、環境監測與 API 狀態頁直接讀取；環境四組查詢可在 Stage 7 聚合為兩張四序列圖。

## 4. 測試結果

最終完整驗證：

| 命令／項目 | 結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `npm run lint` | 通過，0 error／0 warning |
| `npm test -- --run` | 15 files 通過、1 個 opt-in private workbook suite 跳過；118 passed、1 skipped |
| `npm run build` | 通過，Next.js 16.4.6 Webpack Production Build；5 個 Stage 6 API 均為 dynamic Node route |
| Collector isolated smoke | 直接 Node/tsx 啟動及 graceful SIGINT 通過；Demo mode，0 network requests |
| `git diff --check` | 通過 |

Stage 6 新增測試證據：

- 48 Sensor、五色 lamp、analog numeric、detector、24 個未進 v1 畫面的 auxiliary Sensor、5 群／47 指派與未分群 Sensor。
- allowlist、認證設定、局部 TLS、redirect、HTTP 5xx、oversize、timeout、API responseCode 與 schema 分層。
- 10:01 STARTUP→10:00、10:03:15 SCHEDULED→10:03、MODE_RESUME、17:00 外跳過、overlap audit。
- metadata snapshot 去重、metadata partial failure、retry attempt count、48 reading transaction。
- in-flight mode revision 改變時 0 endpoint success／0 readings。
- MANUAL_TEST 0 readings 且不更新 collector last success。
- Live failure 不自動 Demo；Demo fixture 0 DB writes。
- unchanged updateTime 產生 NULL gap；retention 只刪 Live poll/readings、不動 import/history。
- runtime mode localhost same-origin、revision conflict、Demo time context 與 date mismatch。

## 5. 資料安全與未完成事項

- 未提交企業 Excel／JSON、真實 response、企業 origin、Token、憑證、`.env`、SQLite 或 `_reference_inputs`。
- `.env.example` 只有 RFC 5737 的 `192.0.2.10` 文件保留位址與空認證欄位。
- 未呼叫任何未授權 endpoint，未 Push、未部署、未清除 DB／Volume、未修改 Stage 5 歷史或 Excel 邏輯。
- Production Docker image／容器內企業 TLS 與網路、受監督真實 Collector 多輪、Stage 7 頁面及 30 秒 UI refresh 的端到端驗收仍留後續階段。
- 私人 replay provider 未實作；公開 synthetic Demo 已足以完成本階段，避免增加非必要 replay 管理功能。

## 6. Commit

- `8a8e711 feat: implement stage 6 live data backend`
- 本驗收文件與 BUILD_LOG 更新另以文件 Commit 保存。
