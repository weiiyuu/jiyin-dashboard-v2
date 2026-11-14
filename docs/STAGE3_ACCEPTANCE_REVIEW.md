# Stage 3 第一輪（Stage 0–4）獨立驗收審查

> 審查日期：2026-11-14  
> 審查範圍：Stage 0–4；不含 Stage 5 UI 及 Stage 6 企業 API/正式 Collector  
> 方法：重新比對五份 Stage 2 設計文件、目前程式碼、35 個測試與 `BUILD_LOG.md`。本輪以靜態證據與既有執行紀錄為主，未把「測試曾通過」本身視為規格已滿足的充分證據。

## 1. 結論

**Stage 0–4 目前不可整體正式驗收。**

- Stage 0：可正式驗收。
- Stage 1：基礎環境與最小 Docker smoke 範圍大致成立，但完整 Stage 1 驗收仍為「部分滿足」。
- Stage 2：Schema 主體與多項 SQLite 行為已完成，但 repository/Collector 邊界、Live/Demo 寫入保護及查詢基線未完整，為「部分滿足」。
- Stage 3：交易主流程已有可用骨架，但 Excel 語意驗證、Preview/Confirm 競態契約、寫入端點安全及 fault injection 未達設計要求，為「未通過正式驗收」。
- Stage 4：純函式已有正確的 Green 與六態核心公式，但歷史查詢服務、缺資料語意、週/月完整比較及 Alarm 查詢未完成，為「部分滿足」。

`BUILD_LOG.md` 將 Stage 1–4 都標為 Complete；依本次逐項證據審查，這個狀態應理解為「第一輪實作已完成」，不能解讀為「設計規格已正式驗收」。

## 2. 判定圖例

| 判定 | 定義 |
|---|---|
| 已滿足 | 程式行為與測試證據均足以支持設計條件 |
| 部分滿足 | 有主要程式骨架或部分測試，但缺少關鍵語意、整合或反例驗證 |
| 未滿足 | 設計要求沒有實作，或目前實作明顯違反要求 |
| 未驗證 | 程式可能存在，但沒有足夠可重現證據確認實際行為 |

## 3. Stage 0：安全初始化

| 驗收項目 | 判定 | 證據與說明 |
|---|---|---|
| Repository 根目錄正確 | 已滿足 | Git top-level 為 `jiyin-dashboard-v2`；目前分支為 `dev`。 |
| 私有 Excel/JSON、API 測試資料排除 | 已滿足 | [`.gitignore`](../.gitignore#L1-L11) 排除 `_reference_inputs/`、`test_api/`、private replay、Excel 與已知 API JSON；`git check-ignore` 對本機參考檔生效。 |
| 環境變數、憑證、DB、log、volume 排除 | 已滿足 | [`.gitignore`](../.gitignore#L13-L44) 排除 `.env.*`、key/cert、SQLite、data、volume、backup、log 與建置產物。 |
| `.env.example` 可公開 | 已滿足 | [`.env.example`](../.env.example#L1-L5) 只含非敏感本機預設，沒有企業 origin、token 或 CA 路徑。 |
| Git 現況與歷史沒有私有檔 | 已滿足 | `git ls-files` 與 `git rev-list --objects --all` 未發現 `_reference_inputs`、`test_api`、Excel、DB 或實際 `.env`；秘密格式掃描未發現 private key、GitHub/OpenAI/AWS token。文件中的 `192.0.2.10` 是保留的公開範例位址。 |
| Remote 不含認證資訊 | 已滿足 | `origin` 為 `https://github.com/weiiyuu/jiyin-dashboard-v2.git`，沒有嵌入帳密。 |

**Stage 0 結論：通過。**

## 4. Stage 1：專案骨架與基礎環境

### 4.1 逐項驗收

| 驗收項目 | 判定 | 證據與缺口 |
|---|---|---|
| Next.js 16 / React 19 / TypeScript strict / Tailwind / npm lock | 已滿足 | [package.json](../package.json#L6-L38)、[tsconfig.json](../tsconfig.json#L1-L40) 與 `package-lock.json` 存在。實際 React/Tailwind patch 比設計文件更新，沒有看到語意性衝突。 |
| Node 24 patch 固定 | 部分滿足 | [Dockerfile](../Dockerfile#L1-L18) 固定 `node:24.22.3-bookworm-slim`，但未依架構文件鎖 image digest；`engines` 只限制 Node 24 範圍（[package.json](../package.json#L16-L19)）。 |
| 共用 ApiResponse/ApiMeta | 已滿足 | [api-response.ts](../src/shared/contracts/api-response.ts#L30-L81) 定義必要/選填欄位，並以型別及 runtime check 綁定 `providerMode`/`timeContext`。 |
| 所有 Route Handler 使用共用 envelope | 部分滿足 | 匯入路由透過 [api.ts](../src/server/http/api.ts#L7-L13) 使用共用 envelope；但 `/api/health` 仍回傳自訂結構（[health route](../src/app/api/health/route.ts#L1-L5)）。 |
| shared 時間、lamp/freshness/connection enum | 已滿足 | [status.ts](../src/shared/contracts/status.ts#L1-L28)、[taipei.ts](../src/shared/time/taipei.ts#L1-L26)。 |
| 共用 validation issue code | 未滿足 | issue code 仍是 parser 中散落的字串，沒有 Stage 1 要求的共用穩定 enum/contract。 |
| server-only 環境 schema | 未滿足 | `zod` 已安裝，但沒有環境 schema；[app-database.ts](../src/server/db/app-database.ts#L1-L9) 直接讀取 `process.env.DATABASE_PATH`。 |
| 30 秒 local refresh primitive | 部分滿足 | [use-local-refresh.ts](../src/components/use-local-refresh.ts#L5-L34) 實作 mount/focus/visibility/abort signal。測試只驗證常數為 30 秒（[refresh-policy.test.ts](../tests/refresh-policy.test.ts#L4-L7)），沒有驗證 hidden、focus、visibility、cleanup 或不重疊；hidden 時 timer 仍存在，只是 callback 返回。 |
| Stage 1 unit 必測：24:00、stale、lamp、ApiMeta | 已滿足 | [time.test.ts](../tests/time.test.ts#L4-L14) 與 [contracts.test.ts](../tests/contracts.test.ts#L5-L31)。 |
| Stage 1 unit 必測：error mapping | 未滿足 | 沒有錯誤分類或 HTTP/error-code mapping 測試。 |
| 三份離線 API JSON contract、未知欄位降級 | 未滿足 | 目前沒有企業 API JSON parser，也沒有對三份 ignored JSON 的本機 contract test。這不代表正式 Enterprise client 應提前完成，但不符合 Stage 1 明列的 contract gate。 |
| typecheck/lint/build | 已滿足（既有紀錄） | `BUILD_LOG.md` 記錄已通過；build script 明確使用 webpack（[package.json](../package.json#L7-L14)）。本次審查沒有用重跑 build 取代規格比對。 |
| 最小 Docker Compose smoke | 已滿足 Stage 1 範圍；非正式服務 | [compose.yaml](../compose.yaml#L1-L38) 使用 development target、localhost port 與 named volume；[idle collector](../src/server/collector/idle.ts#L1-L15) 只檢查共享目錄後等待。`BUILD_LOG.md` 記錄兩服務 healthy、Node patch 相同及共享 volume 交叉讀寫。這只證明基礎容器環境，沒有證明 migration ownership、正式 Collector、企業 API 或 production service。 |

### 4.2 Webpack 與 Docker production build

- 使用 Webpack 的設定位置是 [package.json](../package.json#L8)：`next build --webpack`。
- `BUILD_LOG.md` 記錄原因為受限 sandbox 中 Turbopack 內部 helper port 無法綁定；這是執行環境限制，不是產品語意變更。
- [Dockerfile](../Dockerfile#L13-L16) 的 builder 執行 `npm run build`，因此未來 production image build 會使用同一個 Webpack 命令。
- 目前 [compose.yaml](../compose.yaml#L3-L6) 與 [compose.yaml](../compose.yaml#L23-L26) 都使用 `development` target；所以已執行的 Compose smoke **沒有驗證 runner production image**。production image build/run smoke 屬後續完整 Docker/交付驗收，不能由 Stage 1 smoke 推論已完成。

**Stage 1 結論：基礎環境有條件通過，但完整 Stage 1 gate 尚未通過。**

## 5. Stage 2：SQLite、Migration 與 Repository

| 驗收項目 | 判定 | 證據與缺口 |
|---|---|---|
| 16 張 STRICT 表、索引、seed | 已滿足 | [migrations.ts](../src/server/db/migrations.ts#L11-L231) 建立設計中的 15 張業務表；`schema_migrations` 由 [applyMigrations](../src/server/db/migrations.ts#L240-L257) 建立，共 16 張。測試確認數量、版本與八台 seed（[db.test.ts](../tests/db.test.ts#L34-L41)）。 |
| foreign_keys、WAL、busy_timeout、synchronous | 已滿足 | [connection.ts](../src/server/db/connection.ts#L7-L14)；對應測試在 [db.test.ts](../tests/db.test.ts#L71-L84)。 |
| migration 空 DB、重跑、checksum、失敗 rollback | 已滿足 | [migrations.ts](../src/server/db/migrations.ts#L236-L263)；測試在 [db.test.ts](../tests/db.test.ts#L34-L41) 與 [db.test.ts](../tests/db.test.ts#L57-L69)。 |
| foreign key、STRICT、partial unique | 已滿足 | [db.test.ts](../tests/db.test.ts#L43-L55)。 |
| WAL 同時讀寫 | 部分滿足 | [db.test.ts](../tests/db.test.ts#L71-L97) 驗證同檔兩 connection 的設定值讀寫與 writer lock；沒有使用實際 Collector reading write 對 active history query，也沒有量測較大型歷史讀取。 |
| Import `BEGIN IMMEDIATE` 競爭 | 部分滿足 | transaction 預設 IMMEDIATE（[connection.ts](../src/server/db/connection.ts#L17-L26)）；競爭測試只更新 `app_settings`，沒有兩個 `confirmImport` 或 import 對歷史讀取的競爭情境。 |
| backup/restore | 已滿足（最小範圍） | [backup.ts](../src/server/db/backup.ts#L1-L8) 使用 SQLite backup API；[db.test.ts](../tests/db.test.ts#L99-L108) 驗證備份可重開及資料/版本一致。 |
| active history repository | 已滿足（僅 machine） | [history-repository.ts](../src/server/db/history-repository.ts#L3-L17) 僅提供 active machine range query。 |
| live latest repository | 未滿足 | 只有 `latestCollectionSuccessMs`（[poll-repository.ts](../src/server/db/poll-repository.ts#L68-L73)）；沒有依 sensor/updateTime/fetchedAt 選取 latest reading 的 repository。 |
| collector 只驗 schema version、不 migration | 未滿足 | Collector 目前只是 idle process，沒有 schema version check（[idle.ts](../src/server/collector/idle.ts#L1-L15)）。 |
| web migration ownership/啟動鎖 | 部分滿足 | [app-database.ts](../src/server/db/app-database.ts#L5-L9) 由每次 route 開 DB 時執行 migration，沒有架構指定的 web startup migration lock；空 DB 並發第一批 request 的行為未測。 |
| mode revision compare-before-write | **未滿足完整安全語意** | [poll-repository.ts](../src/server/db/poll-repository.ts#L40-L64) 只要求目前 mode/revision 等於起始值，沒有要求 mode 必須是 `LIVE`；若起始與目前都為 DEMO，函式可寫入 live readings，違反「Demo fixture 永不寫 DB」。此外 readings 為空仍可把 run 標為 SUCCESS。現有測試只涵蓋 DEMO→LIVE revision 改變後 discard（[db.test.ts](../tests/db.test.ts#L119-L134)），沒有測 DEMO 同 revision 或空 readings。 |
| MANUAL_TEST 與 collection success 分離 | 已滿足（最小查詢） | [poll-repository.ts](../src/server/db/poll-repository.ts#L49-L64) 阻止 manual reading；[db.test.ts](../tests/db.test.ts#L136-L145) 確認不計入 last collection success。尚未驗證 latestSensorDataAt。 |
| repository 不暴露 node:sqlite | 未滿足 | [connection.ts](../src/server/db/connection.ts#L1-L5) 將 `AppDatabase` 直接 alias 為 `DatabaseSync`，而 [backup.ts](../src/server/db/backup.ts#L1-L7) 也直接公開 `DatabaseSync`。 |
| EXPLAIN QUERY PLAN 五項基線 | 部分滿足 | 只驗 machine range 使用 `idx_machine_query`（[db.test.ts](../tests/db.test.ts#L110-L115)）；environment、Alarm、latest sensor、active replacement lookup 未驗。 |

**Stage 2 結論：Schema 核心可接受，但 Stage 2 整體不能正式驗收。Live/Demo 寫入保護是必修問題。**

## 6. Stage 3：Excel 匯入後端

### 6.1 已實作且有證據的部分

| 項目 | 判定 | 證據 |
|---|---|---|
| 六張必要 sheet 與 52 個來源欄名映射 | 部分滿足 | Header 與逐欄映射存在於 [workbook-parser.ts](../src/server/import/workbook-parser.ts#L9-L14) 及 [workbook-parser.ts](../src/server/import/workbook-parser.ts#L80-L193)。但測試沒有逐一 assert 52 欄。 |
| file SHA / canonical fingerprint | 已實作 | [workbook-parser.ts](../src/server/import/workbook-parser.ts#L55-L77)。沒有針對樣式/壓縮 metadata 改變但 canonical 不變的測試。 |
| XLSX file/expanded/cell limits、公式/外連/巨集拒絕 | 部分滿足 | [xlsx-preflight.ts](../src/server/import/xlsx-preflight.ts#L3-L34) 有限制與拒絕邏輯；測試只涵蓋公式、externalLinks path、cell count（[import.test.ts](../tests/import.test.ts#L62-L70)），未測 compressed/uncompressed byte limit、macro、external relationship、錯誤 cell 或真實 zip-bomb 反例。 |
| NULL、0、Await 與 exception token | 已滿足（小型 fixture） | [workbook-parser.ts](../src/server/import/workbook-parser.ts#L28-L35) 與 [import.test.ts](../tests/import.test.ts#L34-L43)。 |
| 24:00 | 已滿足（基本語意） | 時間函式與 import synthetic test 驗證次日午夜並保留來源日（[import.test.ts](../tests/import.test.ts#L34-L43)）。 |
| 空 quality_issues | 已滿足 | [import.test.ts](../tests/import.test.ts#L34-L43) 及本機實檔測試。 |
| duplicate / conflict / replacement / rollback | 部分滿足 | 主交易在 [import-repository.ts](../src/server/import/import-repository.ts#L10-L114)；基本流程測試在 [import.test.ts](../tests/import.test.ts#L73-L105)。競態契約與 replacement fault injection 缺失，詳見下節。 |
| Alarm regression guard | 已滿足（repository 層） | [import-repository.ts](../src/server/import/import-repository.ts#L22-L26) 與 [import.test.ts](../tests/import.test.ts#L94-L100)。 |
| Confirm 重新讀檔、重算、重驗 | 已實作 | [confirm route](../src/app/api/import/confirm/route.ts#L8-L18) 重新呼叫 `previewWorkbook`，不直接信任前一次 preview object。 |
| 本機私有標準化 Excel contract | 部分滿足 | [private-excel-contract.test.ts](../tests/private-excel-contract.test.ts#L13-L29) 驗證來源日、3840/3840/11/0、`canConfirm`、可 confirm 及 DB 表筆數。 |

### 6.2 Excel 驗證的實際深度

目前不只是「只驗筆數」：synthetic fixture 有 spot check `0`、`Await→NULL`、exception JSON、24:00、environment `0/NULL`、duplicate key 與 Alarm source status。

但私有實檔 contract test 主要仍是**筆數與可入庫測試**。它沒有驗證：

- 52 欄逐一映射後的代表性值與來源列號。
- A1–B4、A/B、sensor number/category 的實際分布。
- 首列、中間列、24:00 末列的原文時間與 epoch 對應。
- source derived fields 與秒數公式是否相符。
- exception token、quality note、Alarm 11 欄內容與 fingerprint。
- 匯入後以 active repository 查出的內容是否與 preview 一致。
- 對該實檔計算 Green、六態、coverage、Red/Yellow 或 Alarm 統計的已知結果。

因此目前證據只能支持「檔案可解析且列數可完整寫入」，不能支持「實際資料內容、全部欄位映射與統計結果均正確」。

### 6.3 規格不符與阻擋缺口

| 項目 | 判定 | 實際問題 |
|---|---|---|
| `區間開始/結束` 契約驗證 | **未滿足** | Parser 只用 `sourceDate + timeLabel` 自行產生 epoch（[workbook-parser.ts](../src/server/import/workbook-parser.ts#L85-L103)、[workbook-parser.ts](../src/server/import/workbook-parser.ts#L133-L142)），來源的完整開始/結束只存文字，沒有解析並驗證相差 180 秒或與 label 一致。錯誤來源時間可在 preview 通過。 |
| machine/area 身分錯誤阻止整檔 | **未滿足** | 非法 machine/area 只加入 WARNING（[workbook-parser.ts](../src/server/import/workbook-parser.ts#L91-L99)），而品質矩陣要求身分非法阻止；目前可能到 DB constraint 才失敗。 |
| VALUE_NON_NUMERIC issue | 未滿足 | `numeric()` 把非數字保存為 exception，但不建立 `VALUE_NON_NUMERIC` warning（[workbook-parser.ts](../src/server/import/workbook-parser.ts#L28-L35)）。 |
| 上游衍生公式驗算 | **未滿足** | 雖保存四態總秒、加工/紅/黃/None 小時與兩種比例（[workbook-parser.ts](../src/server/import/workbook-parser.ts#L105-L111)），沒有比較 Green/3600、四態合計或比例，也沒有 `DERIVED_VALUE_MISMATCH`。Stage 3 明列的公式驗算測試不存在。 |
| 品質狀態與 indicator eligibility | **部分/不正確** | eligibility 主要只看 numeric、非負與總秒（[workbook-parser.ts](../src/server/import/workbook-parser.ts#L115-L119)）；沒有將來源品質狀態、quality_issues 或 metric-specific issue 納入。environment 亦只看值是否非負（[workbook-parser.ts](../src/server/import/workbook-parser.ts#L148-L150)）。 |
| 字典/README 語意相容性 | **未滿足** | 只擷取第一個含「版本」的 metadata 值及 Alarm status（[workbook-parser.ts](../src/server/import/workbook-parser.ts#L160-L168)）；沒有 README 日期/列數/SHA 比對、未知版本 warning、必要語意變更的 REVIEW_REQUIRED。 |
| Alarm source 一致性 | 部分滿足 | 空表的 MISSING/PROVIDED_EMPTY 有測；若有 alarm rows，parser 直接判 `PROVIDED_NONEMPTY`，沒有驗證 README 明示狀態是否矛盾（[workbook-parser.ts](../src/server/import/workbook-parser.ts#L197-L202)）。 |
| Preview duplicate/conflict decision | **未滿足** | Preview route 不開 DB，只回 parser 結果（[preview route](../src/app/api/import/preview/route.ts#L6-L22)），所以不會回傳 `DUPLICATE/CONFLICT` 或 `activeBatchId`。 |
| API path 與正式契約 | 未滿足 | 設計為 `/api/imports/...`；目前為 `/api/import/...`。Preview 只收單檔，不是設計的多檔 preview。 |
| Confirm optimistic concurrency | **未滿足** | 正式契約要求 `expectedSha256`、`expectedCanonicalFingerprint`、`action`、`expectedActiveBatchId`。目前只有 `replace=true`（[confirm route](../src/app/api/import/confirm/route.ts#L11-L20)）。若 preview 後 active batch 改變，會替換當下 active，而不是回 `ACTIVE_VERSION_CHANGED`。 |
| Rollback optimistic concurrency | **未滿足** | activate route 只收 batchId（[activate route](../src/app/api/import/batches/[batchId]/activate/route.ts#L7-L13)），沒有 `currentActiveBatchId` 或確認文字，存在 stale-client 切錯版本風險。 |
| 寫入 Route same-origin / Fetch Metadata | **未滿足** | Confirm/activate 沒有 Origin 或 Sec-Fetch-Site 驗證，與共通寫入安全規格不符。 |
| 安全錯誤回應 | **未滿足** | Confirm/activate 把原始 exception message 直接回給 client（[confirm route](../src/app/api/import/confirm/route.ts#L22-L25)、[activate route](../src/app/api/import/batches/[batchId]/activate/route.ts#L11-L12)），可能曝露 SQLite/schema 細節；沒有 stable error mapping。 |
| Fault injection 覆蓋 | **未滿足** | 只在 fresh DB 的 machine 寫入後注入一次（[import.test.ts](../tests/import.test.ts#L101-L105)）。沒有 metadata、environment、alarm、quality、activation 各點，也沒有在 replacement 中失敗後驗證舊 active 的四表內容與事件完全不變。 |
| Route Handler integration tests | 未滿足 | 現有測試直接呼叫 parser/repository；沒有 multipart route、HTTP status、response envelope、DB 路徑或 concurrency 的整合測試。 |

**Stage 3 結論：不可正式驗收。Excel 主流程骨架可保留，但上述語意與競態問題必須在 Stage 5 前修正。**

## 7. Stage 4：歷史查詢與純計算

| 驗收項目 | 判定 | 證據與缺口 |
|---|---|---|
| Green 先 SUM 秒再除 3600 | 已滿足 | [history-statistics.ts](../src/server/statistics/history-statistics.ts#L65-L84)，測試 180+90=0.075h（[statistics.test.ts](../tests/statistics.test.ts#L15-L19)）。 |
| 六態先 SUM 再除 | 已滿足 | [history-statistics.ts](../src/server/statistics/history-statistics.ts#L86-L109)，測試 Green/Blue/White 90/45/45（[statistics.test.ts](../tests/statistics.test.ts#L27-L33)）。 |
| NULL 與 0、分母 0 | 已滿足（純函式） | [statistics.test.ts](../tests/statistics.test.ts#L21-L33)。 |
| 30/60 分鐘與每日 bucket | 已滿足基本算式 | [history-statistics.ts](../src/server/statistics/history-statistics.ts#L111-L136)、[statistics.test.ts](../tests/statistics.test.ts#L48-L53)。 |
| 無 eligible 資料不得呈現 0 | **未滿足** | `bucketGreenSeconds` 只要有 imported row 就建立 bucket；全數 ineligible 時回 `greenSeconds=0`、`greenHours=0`（[history-statistics.ts](../src/server/statistics/history-statistics.ts#L127-L135)），沒有 availability/null，會把「無可用資料」誤成 0。`calculateGreenHours` 同樣缺少 hasData/availability。 |
| selected machine expectedIntervals | 已滿足 | [history-statistics.ts](../src/server/statistics/history-statistics.ts#L29-L52)；兩台 2025-02/03 測為 26,880/29,760（[statistics.test.ts](../tests/statistics.test.ts#L55-L60)）。 |
| 日/週/月比較 | 部分滿足 | [alignComparisonPositions](../src/server/statistics/history-statistics.ts#L138-L151) 能區分 MISSING/NOT_APPLICABLE；測試只有月 position（[statistics.test.ts](../tests/statistics.test.ts#L69-L75)）。沒有從日期/active batches 建立日 bucket、週 1–7、月 1–31 的完整 service，也沒有週第 4 日缺資料測試。 |
| A/B 各自 coverage 與 stateShare denominator | 部分滿足 | A/B Green 獨立測試存在（[statistics.test.ts](../tests/statistics.test.ts#L62-L67)）；沒有 A/B stateShare 各自 denominator/100% 的比較測試。 |
| Red/Yellow 時數 | 部分滿足 | [calculateStateHours](../src/server/statistics/history-statistics.ts#L55-L59) 只看 rule version 與非負值，沒有 color-specific eligibility/issue。 |
| Red/Yellow 連續區間 | 部分滿足 | 基本相鄰/跨日與 gap 測試存在（[history-statistics.ts](../src/server/statistics/history-statistics.ts#L153-L171)、[statistics.test.ts](../tests/statistics.test.ts#L79-L87)）；實作以 `transitionEligible` 代替「該色值合格」，可能過度排除總秒超差但 Red/Yellow 本身可信的列。 |
| 純綠→純黃、混綠黃 | 已滿足基本規則 | [history-statistics.ts](../src/server/statistics/history-statistics.ts#L173-L186)、[statistics.test.ts](../tests/statistics.test.ts#L89-L96)。 |
| 24:00/跨日 | 部分滿足 | 跨午夜 interval adjacency 有測；沒有把 `timeLabel=24:00` 經 bucket service 驗證到正確來源日/次日邊界。 |
| Blue/White、總秒超差但 Green 有效 | 部分滿足 | Blue/White share 有測；沒有直接測「總秒超差但 Green 仍納入」。 |
| quality rule mismatch/recompute | 部分滿足 | 舊版本會排除並計 warning（[history-statistics.ts](../src/server/statistics/history-statistics.ts#L69-L77)）；沒有批次重算後恢復或 active batch 整合測試。 |
| active history query 整合 | 未滿足 | active machine repository 與 statistics 函式沒有 service 串接；沒有 DB→row mapping→ranking/trend/share/coverage 的整合測試。 |
| ranking / trend / per-machine availability | 未滿足 | 目前只有聚合 primitive，沒有規格中的 per-machine ranking 與 relative-position trend service。 |
| Alarm source status 與事件列表 | **未滿足** | Stage 4 明列範圍沒有實作；目前只有匯入批次/Alarm rows 儲存，沒有 active Alarm coverage/event query、穩定排序或 MISSING 日語意。 |

**Stage 4 結論：核心數學 primitive 多數正確，但尚不是完整可驗收的歷史查詢/統計服務。**

## 8. 35 個測試的覆蓋盤點

| 類別 | 數量 | 已覆蓋 | 主要缺口 |
|---|---:|---|---|
| Stage 1 contracts/time/refresh | 7 | ApiMeta、lamp 全零/多色、freshness、24:00、30 秒常數 | refresh 行為、error mapping、API JSON contracts、env schema、validation codes |
| SQLite/repository | 9 | 16 表、migration、STRICT/FK/unique、rollback、WAL、writer lock、backup、1 個 query plan、mode revision、manual separation | Live latest、DEMO 禁寫、空 reading success、實際 import concurrency、4 個 query-plan 基線、collector schema check |
| Excel/import（含私有 contract） | 8 | NULL/0/Await、24:00、duplicate key、Alarm empty/missing、preflight 三反例、duplicate/replace/rollback、Alarm regression、實檔列數 | 52 欄內容、時間原文一致性、衍生公式、字典語意、Preview decision、版本競態、route integration、replacement fault matrix |
| Historical statistics | 11 | Green、六態、NULL/0、rule mismatch、Red/Yellow hours、bucket、coverage、月 expected、月 availability、continuous run、completion | 全 ineligible 不得為 0、週比較、A/B stateShare、DB 整合、ranking/trend、Alarm query、實檔統計 |
| **合計** | **35** | 測試全數曾通過 | 通過數量不能覆蓋上述未測與錯誤語意 |

特別說明：私有 contract test 使用 `it.skipIf(!existsSync(...))`。本機有檔時屬第 35 個測試；CI/公開 clone 沒有私有檔時會 skip，因此必須另有可公開的完整 synthetic workbook fixture 承擔 CI contract gate。

## 9. 高風險測試缺口（依風險排序）

以下不是為增加測試數量，而是針對可能造成錯誤資料、錯誤版本或安全邊界失效的情境：

### P0：正式驗收前必須補

1. **Excel 來源時間與衍生公式真值**：錯誤 `區間開始/結束`、四態合計、Green/3600、兩種比例必須在 preview 被正確阻止或警告，且不可只靠 DB constraint。
2. **同日版本 optimistic concurrency**：preview 後另一版本先成為 active 時，舊 client 的 replace/activate 必須回 `ACTIVE_VERSION_CHANGED`，不能替換新的 active。
3. **Replacement fault injection matrix**：在 metadata、machine、environment、alarm、quality、active switch/event 等各關鍵點失敗；驗證舊 active batch、四表 rows、issues、events 完整不變。
4. **DEMO 永不寫 DB**：provider mode 為 DEMO 且 revision 未變時，repository 必須拒絕 readings/endpoint success；0 readings 不得標 collection SUCCESS。
5. **全 ineligible/missing 不得變 0**：Green bucket/ranking/trend 應回 null/NO_DATA/MISSING_DATA，不可回 0 小時。
6. **active DB → statistics 整合真值**：用公開 synthetic 完整日或小型可手算 fixture，從 import confirm 經 active repository 到 Green、六態、coverage、比較與 Red/Yellow group，驗證 DB 欄位映射和統計端到端一致。
7. **Alarm active query**：PROVIDED_EMPTY 與 MISSING、replacement/rollback 後來源狀態、事件列表內容與穩定排序。
8. **寫入路由安全與錯誤消毒**：Origin/Fetch Metadata、multipart 限制、錯誤 code/status、DB/schema message 不外洩。

### P1：Stage 0–4 gate 應補

1. 52 欄代表值與來源列號 mapping；至少覆蓋每張表首/中/末列、NULL/0/text/date。
2. data_dictionary/README 的日期、版本、規則語意、列數與 Alarm status 一致性。
3. XLSX 壓縮/解壓 byte limit、macro、external relationship、錯誤 cell、檔名消毒。
4. Preview 0 writes 與 duplicate 0 writes 的 Route Handler + test DB 整合測試。
5. 週比較第 4 日 MISSING_DATA、日 30/60 相對位置、A/B 獨立 stateShare denominator。
6. environment、Alarm、latest sensor、active batch lookup 的 EXPLAIN QUERY PLAN 基線。
7. migration 空 DB 並發啟動與 collector schema-version mismatch 行為。
8. refresh mount/focus/visibility/hidden/abort/cleanup 的行為測試，以及三份 API JSON 離線 contract。

## 10. Git 與資料安全結論

- 目前工作樹在建立本審查文件前為乾淨 `dev` 分支。
- Git 現況與所有 commit object 未發現企業 Excel/JSON、`test_api`、DB、真實 `.env`、log、private replay 或憑證。
- `.env.example` 是唯一追蹤的環境範例，內容安全。
- 沒有發現私鑰或常見 GitHub/OpenAI/AWS credential 格式。
- 文件中的 enterprise env 名稱、自簽警告與 `192.0.2.10` 均為公開設計說明/保留範例，不是實際憑證。

**資料安全驗收：通過。**

## 11. 正式驗收前的必要修正清單

Stage 0–4 要正式驗收，至少必須先完成以下項目；這些都屬 Stage 0–4 修正，不需要開始 Stage 5：

1. 補齊 Excel 時間、身分、非數字、衍生公式、品質與 dictionary/README 語意驗證。
2. 讓 Preview 回傳 DB duplicate/conflict/active 資訊，Confirm/activate 實作 expected fingerprint/active batch compare-and-swap。
3. 對 import/activate POST 加上同源與 Fetch Metadata 驗證，建立安全 error mapping，不回傳 raw SQLite message。
4. 擴充 replacement fault injection，實證任何中途失敗都不改舊 active 及其四表內容。
5. 修正 poll repository：只有 LIVE 可寫 readings，且至少一筆 reading 才可標 collection SUCCESS。
6. 完成 live latest query、collector schema-version check，並補齊其 repository 測試。
7. 修正統計的 missing/ineligible 0 語意，完成 ranking/trend、日/週/月 service、A/B stateShare 與 active DB 整合。
8. 完成 Alarm source coverage/event list 查詢與 MISSING/PROVIDED_EMPTY 測試。
9. 用公開 synthetic fixture 驗證 52 欄內容與端到端統計；私有實檔另增加代表欄值與統計 checksum/已知結果驗證，但仍不得提交檔案或衍生敏感資料。
10. 補齊 Stage 1 必測的 refresh 行為、error mapping、環境 schema 與離線 API contract；Docker image 補鎖 digest或在設計文件正式記錄不鎖 digest 的理由。

完成以上修正並重新審查前，不建議將 Stage 1–4 標記為正式 Accepted，也不應開始 Stage 5 UI 把尚未穩定的契約固化到畫面。
