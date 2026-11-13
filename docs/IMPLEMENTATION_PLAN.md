# Stage 3 實作與驗收路線

> 狀態：Stage 2 設計草案。  
> 本文件只規劃後續工作；Stage 2 不執行任何步驟。

## 1. 路線原則

- 依依賴順序實作：安全初始化 → 專案/最小 Docker 骨架 → 契約/DB → 匯入 → 統計 → 歷史頁 → Collector/Demo → 即時頁 → 完整 Docker/交付。
- 先以小型可手算 fixture 驗證資料真值，再做圖表。UI 不擁有公式。
- 每一階段都有可獨立驗收成果；失敗時停在上一個可用整合狀態。
- 2026-11-18（三）展示用來安排整合節點，不自動刪減已確認範圍。
- 「可供組員檢視」只代表該垂直切片通過指定驗收，不等於完整產品驗收。

## 2. Stage 3 第一步：安全初始化

這一步必須先於 git init、git add、create-next-app 或任何依賴安裝。

### 2.1 範圍

1. 在 jiyin-dashboard-v2 建立 .gitignore，至少排除：

~~~gitignore
_reference_inputs/
test_api/
.env*
!.env.example
*.db
*.db-*
*.sqlite
*.sqlite3
data/
volumes/
logs/
node_modules/
.next/
coverage/
playwright-report/
test-results/
~~~

2. 用 git check-ignore 或等價方法驗證每類敏感檔真的被排除。
3. 列出待提交檔清單，人工確認沒有企業 Excel/JSON、Token、DB、log。
4. 只在 jiyin-dashboard-v2 內初始化 Git。不得在 agent練習 根目錄、舊專案或 test_api 初始化/提交。
5. 建立公開 .env.example，只放假值與說明。

### 2.2 驗收與失敗處理

| 驗收 | 完成條件 |
|---|---|
| 私有資料 | _reference_inputs、test_api、.env、DB、volume/log 全部 ignored |
| 公開範例 | .env.example 可追蹤且沒有真實 origin/token |
| repo 邊界 | git top-level 正是 jiyin-dashboard-v2 |

任一敏感檔可能被追蹤就停止，不做 git add。若已誤加入 index，先以非破壞方式移出 index 並再次檢查；不刪使用者原檔。

## 3. 階段 1：專案骨架與可執行契約

### 輸入依賴

- 五份 Stage 2 文件已由使用者審查。
- 重大待確認事項已有預設處理或新決策。
- 安全初始化通過。

### 實作範圍

- 初始化 Next.js 16 / React 19 / TypeScript strict / Tailwind / npm。
- 鎖 Node 24 patch、package-lock、Docker base image；記錄 node:sqlite RC 風險。
- 建 shared contracts：時間、provider mode、lamp/freshness/connection enum、validation issue code。
- 建唯一的 ApiResponse/ApiMeta 型別；測試必要/選填欄位與 providerMode/timeContext 條件。
- 建即時頁共用 30 秒本機 refresh primitive：mount/focus/visibility 更新、hidden 暫停、請求不重疊，且不得呼叫企業 client。
- server-only 環境 schema；禁止 client bundle 引用。
- 早期建立最小 Compose smoke 骨架：web、可啟停的 collector idle entrypoint、localhost port、同一 named volume 與固定工作目錄。此時不呼叫 API、不執行 migration，只驗證兩容器啟停、volume 掛載權限與 Node 版本一致。
- 建 AGENTS.md，只放 repo 邊界、測試命令、資料安全與文件真值來源，不複製全部規格。

### 產出

- 可 build 的空骨架。
- 契約型別與純函式測試。
- .env.example 初稿。
- 最小 web/collector/volume Compose smoke 結果；完整 Dockerfile 優化與 README 仍留階段 8。

### 測試與完成判準

| 層級 | 必測 |
|---|---|
| unit | 24:00、Asia/Taipei、stale、lamp 全零/多色、error mapping、ApiMeta、30 秒 refresh policy |
| contract | API JSON 三份離線樣本可解析；未知欄位安全降級 |
| build | typecheck、lint、production build |
| container smoke | web/collector 使用同一 Node patch；localhost 綁定；兩者可讀寫測試用 volume 路徑且清理後不留下產品資料 |

完成＝不需企業網路即可 build/test；任何秘密未進 bundle。

## 4. 階段 2：SQLite、migration 與 repository

### 輸入依賴

- DATA_CONTRACT、DATABASE_DESIGN 已核准。
- Node patch 與 node:sqlite 行為已在容器內確認。

### 實作範圍

- connection factory、PRAGMA、schema_migrations、版本化 SQL migration。
- 建 16 張設計表、索引、seed machines/app_settings。
- repository 只暴露業務介面；所有 SQL parameterized。
- web 擁有 migration；collector 只驗 schema version。
- backup/restore 小工具的設計與測試，不先做複雜管理 UI。

### 產出

- 空 DB 可由零升到最新版本。
- migration 重跑不重複、失敗可回滾。
- active batch query 與 live latest query repository。
- mode_revision/sample_slot/manual-test audit schema 與 compare-before-write repository primitive。

### 測試、失敗與完成判準

| 層級 | 必測 |
|---|---|
| unit | repository input validation、row mapping |
| integration | foreign keys、STRICT、partial unique、WAL、busy timeout |
| integration | migration from empty、重跑、故意中途失敗 |
| concurrency | collector 小寫入與歷史讀取；import BEGIN IMMEDIATE 競爭 |
| integration | mode_revision 改變時 readings 不寫入；MANUAL_TEST 不影響 collection success query |

失敗時不得自動刪 DB 重建；顯示 migration version 與安全錯誤。完成＝schema 驗收與 EXPLAIN QUERY PLAN 基線通過。

## 5. 階段 3：Excel preview、confirm 與版本控制

### 輸入依賴

- DB repository 可用。
- 標準化 2025-06-01 檔只作本機 contract test；不可提交公開 Git。
- 檔案大小/解壓限制已有壓力測試候選值。

### 實作範圍

- 唯讀 XLSX reader：六 sheet、標題、cell type、公式/外部連結拒絕。
- 逐欄 parser、來源列號、metadata、source_exception_json。
- validation issue engine 與 indicator eligibility。
- file SHA、canonical fingerprint。
- preview 不落庫；confirm 重新上傳、重算、重驗。
- INSERT/REPLACE/DUPLICATE、Alarm regression guard、每檔 transaction。
- 版本列表與 rollback endpoint。

### 產出

- POST preview/confirm、GET batches/details、POST activate。
- 可查的 active/replaced 版本與 validation issues。

### 測試

| 層級 | 必測 |
|---|---|
| unit | 52 欄 mapping、NaN/0/Await、180±1、公式驗算、fingerprint |
| contract | 範例 3840/3840/11/0；六 sheet header |
| integration | preview 0 writes、duplicate 0 writes、replacement、rollback |
| fault injection | 各表寫入中途失敗；舊 active 完整不變 |
| security | zip bomb/cell count、公式、錯誤 cell、檔名/訊息消毒 |

完成＝有效檔可匯入；錯誤檔不污染；同日版本可追溯/回復；Alarm 缺源不抹舊資料。

## 6. 階段 4：歷史查詢與純計算

### 輸入依賴

- active history repository。
- DATA_CONTRACT 測試向量。

### 實作範圍

- Green SUM、小時換算、30/60 分鐘與日桶。
- 六態先 SUM 秒再除；各指標 coverage。
- 日/週/月相對位置對齊。
- Red/Yellow 時數與連續區間群組。
- 純綠→純黃、同列混綠黃候選。
- Alarm source status 與事件列表。

### 測試

高覆蓋純函式測試是此階段重點：

- NULL vs 0、缺列、缺日、分母 0。
- 24:00、跨日相鄰、不同月份天數。
- Blue/White 非零、總秒超差但 Green 有效。
- 相鄰/不相鄰完成判讀。
- Alarm MISSING vs PROVIDED_EMPTY。
- 日比較 A=180秒/B=90秒；週比較單日 MISSING_DATA；月比較 NOT_APPLICABLE。
- quality rule version mismatch 時不使用舊 eligibility；批次重算後才恢復。

完成＝每個 API response 的數字都可由小型 fixture 手算，不依圖表驗證公式。

## 7. 階段 5：歷史三頁垂直切片

### 實作範圍

1. Excel 匯入完整 UI。
2. 歷史加工分析的區間/同期比較與三圖。
3. 異常事件分析的狀態時數、區間群組、Alarm 列表。
4. 共用 coverage、warning、empty/error components。

### 驗收

- UI 只顯示 API 回傳真值；不留 CSS 假圖或靜態數字。
- 同日只有 30/60 分鐘，跨日固定每日；無時分 selector。
- 缺資料不是 0；所有圖有 coverage 與可讀 tooltip。
- Red/Yellow 文案不變成故障/待機事件。
- 多檔匯入可先從清單移除；替換是另一個明確流程。

### 測試策略

- component tests：控制項狀態、warning/empty/error。
- integration：Route Handler + test DB。
- e2e：有效匯入、重複、衝突替換、失敗 rollback、三圖 filter。
- 小型純 UI 樣式調整不重跑全部 DB fault tests；merge 前跑風險相關集合與完整 CI。

完成＝組員可在離線環境匯入 synthetic fixture 並驗算三張歷史圖。

## 8. 階段 6：Enterprise client、Collector 與 Demo

### 輸入依賴

- 私有三份 JSON 可本機 contract test，但不提交。
- 合成公開 fixture 已建立並明標 synthetic。
- API method=GET、固定三端點與自簽限制已納入。

### 實作範圍

- 固定 allowlisted origin/path、undici 專用 dispatcher。
- auth 預設 none；未設定認證值可正常啟動。企業確認需要時才啟用 bearer 或經 header-name 驗證的 custom header。
- strict/custom_ca/allowlisted_self_signed 三種局部 TLS mode。
- timeout、max bytes、redirect error、安全 log、錯誤分類。
- Collector startup/MODE_RESUME + 3 分鐘排程、sample_slot、metadata refresh/hash、retry、partial、dedupe、retention、shutdown。
- Demo manifest 提供 dataDate/demoClockAt；公開 synthetic 與本機私人 replay 共用同一 read-only provider 介面，不另建服務。
- app_settings mode_revision 與寫入前二次檢查；Demo fixture 不寫 DB。
- connection status/manual test/runtime mode endpoints；manual audit 與 collection health 分流。

### 離線測試

| 類型 | 情境 |
|---|---|
| contract | 48 sensors、五色 lamp、數字字串、SRIP 未分群 |
| integration | values 成功/configs 失敗；舊 mapping 降級 |
| HTTP | timeout、redirect、oversize、4xx/5xx、invalid JSON |
| TLS | 只有 allowlisted dispatcher 可 rejectUnauthorized=false；全域仍 true |
| scheduler | startup、格點、overlap、outside window、SIGTERM |
| retention | 只清 live，不碰 history |
| time slot | 10:01 startup→10:00、10:03 scheduled→10:03、10:06 failure→NULL；未變 updateTime 不複製 |
| provider | host 今日不同仍用 demoClockAt；Live 失敗不改 Demo；fixture 0 DB writes |
| concurrency | in-flight Live poll 遇 mode_revision 改變，不寫 endpoint success/readings |
| audit | MANUAL_TEST 成功不更新 collectorLastSuccess/latestSensorDataAt |
| auth | none 模式不帶 header 可啟動；bearer/header 只在明確設定時添加 |

### 授權網路 smoke test

Stage 3 才可由使用者在授權網路執行：

1. 依已成功 Python 方式，先以 auth=none 在主機端確認 GET 三端點；若企業明確要求認證，再測指定 server-only header。
2. 容器 strict mode 預期自簽錯誤，確認錯誤分類。
3. 只對 allowlisted origin 啟用自簽例外，確認三端點。
4. 驗證認證值/origin 不在 browser/log。
5. 觀察至少兩輪 3 分鐘資料、去重與 stale。
6. poll 進行中切 Demo，確認 readings 不落庫；切回 Live 觸發 MODE_RESUME 並恢復排程。
7. 手動測試成功不改 Collector 最後成功與最新 sensor data。

任何步驟失敗都不得改用全域 TLS 關閉或自動 Demo。完成＝離線完整測試通過，且授權環境至少一輪受控 smoke test 留有非敏感結果。

## 9. 階段 7：即時頁、首頁與視覺移植

### 實作範圍

- 選擇性移植 layout/sidebar/topbar/brand 與 tokens。
- 機台 A/B 兩區、左四卡、右詳細。
- 環境 A/B 兩個區域容器（各含四值）、固定 09–17 軸、sample-slot null gaps。
- API 連線設定與 Live/Demo banner。
- 首頁三工作區與資料可用性，不做假 KPI。

### 驗收

- 八台 mapping 與八個環境點逐一對應已證實 Sensor ID。
- 五燈全 0=UNKNOWN；stale 與 lamp state 分離。
- 10:01 啟動落 10:00、10:03 排程落 10:03、失敗格為空；斷線不跨接。
- Demo 使用 manifest 日期/時鐘，過去 fixture 不因 host 今日而 stale。
- API transport/API/schema 三層 health 可區分。
- 鍵盤、focus、對比、空/錯誤/載入狀態通過。

### 測試

- unit/component：狀態呈現與控制。
- integration：Live/Demo provider response。
- e2e：mode 切換、stale、gap、頁面導航。
- screenshot regression 只覆蓋七頁關鍵 viewport，不為每個 CSS 小改跑資料 fault suite。

完成＝七頁都接真實 query/provider，沒有假圖、假按鈕或未定義欄位。

## 10. 階段 8：Docker、跨平台與交付

### 實作範圍

- 多階段 Dockerfile；web/collector 共用 image 與 Node patch。
- Compose：web、collector、named volume、localhost port、health/dependency。
- Mac + Windows Docker Desktop smoke test。
- synthetic seed/fixture 操作與正式資料隔離。
- 初學者 README。

### README 必備

1. 前置：Git、Docker Desktop 版本與啟動確認。
2. Windows PowerShell 與 macOS/Linux 分別提供：
   - git clone、cd。
   - 複製/編輯環境檔。
   - docker compose up --build。
   - logs、stop、down、重建。
3. 開啟 http://localhost:3000。
4. 匯入標準化 Excel、Live/Demo 操作。
5. 授權網路、09:00–17:00、自簽例外與容器排錯。
6. SQLite volume、備份、還原、重設。
7. 醒目警告 docker compose down -v 會刪資料。
8. port 3000、Docker 未啟動、env 缺漏、網路/TLS、格式錯誤 FAQ。

### 驗收

- 全新 clone 依 README 可在 Mac/Windows 啟動。
- localhost:3000 可操作七頁。
- stop/up 與 image rebuild 後 DB 保留。
- backup/restore 通過；down -v 風險已人工確認。
- git ls-files 不含私有 JSON/Excel、.env、DB、logs。

完成＝兩平台 smoke test checklist 有日期與結果，交付文件無真實秘密。

## 11. 展示前關卡

### 可供組員檢視

- synthetic Demo 可離線啟動。
- 標準化範例在本機私有環境完成匯入驗證。
- 七頁導航與核心互動完成。
- 已知限制與待確認門檻可見。

### 完整驗收

- 所有資料/transaction 高風險測試通過。
- 授權網路 Live smoke test 完成，或明確記錄外部阻塞且 Demo 不冒充。
- Mac/Windows 指令、volume persistence、備份還原通過。
- 公開 repo 安全檢查通過。

若展示日前只達「可供檢視」，報告需清楚列出尚未通過的完整驗收，不可將其稱為已完成。

## 12. 測試分層與執行頻率

| 層級 | 對象 | 何時跑 |
|---|---|---|
| unit | 時間、品質、aggregation、fingerprint、state | 每次相關變更 |
| contract | Excel/API 樣本與 synthetic fixtures | 契約/parser 變更、CI |
| integration | SQLite、transaction、Route Handler、Collector HTTP | 對應模組變更、CI |
| e2e | 七頁關鍵使用者流程 | 整合節點、release |
| manual smoke | 授權 API、Mac/Windows、Docker/volume | 環境可用時與 release |

資料計算、去重、replacement/rollback、TLS scope 必須高覆蓋。純樣式修改不必重跑所有 fault injection，但 release gate 要跑完整集合。

## 13. 失敗處理原則

- 不以刪 DB、清 volume、重建專案當自動修復。
- 不把 import warning 靜默轉換成資料。
- 不因 Live 失敗切 Demo。
- 不因 deadline 略過 transaction、contract 或資料安全測試。
- 外部 API 不可用時，完成離線 contract/integration，將授權 smoke test 明列未完成。

## 14. 設計決策表

| 決策 | 採用方案 | 原因 | 替代 | 風險 | 待使用者決定 |
|---|---|---|---|---|---|
| 主架構 | Next + TS + SQLite + 獨立 TS Collector | 最小單一技術棧 | Python API | 增加雙棧部署 | 否 |
| SQLite driver | node:sqlite + repository 隔離 | 零 native dependency | better-sqlite3 | node:sqlite 尚為 RC | 否；Stage 3 可依測試回退 |
| DB | 一個檔、history/live 分表 | 單機、備份簡單 | 兩 DB/Postgres | 共享寫鎖 | 否 |
| Metadata | 啟動/60 分鐘/未知 ID 重驗，hash 變化才存 | 樣本 97 輪相同但非永久承諾 | 每 3 分鐘寫一份 | 變更發現最多延遲 | 可接受預設 |
| TLS | allowlisted client 局部自簽例外 | 企業已確認限制 | 全域關閉/等待正式 CA | MITM 風險 | 否；已確認需求 |
| raw rows | 不建 raw_excel_rows；保留逐欄、來源列、exceptions | 避免約 280 萬列/年再複製 JSON | 全列 JSON | DB 膨脹 | 否 |
| 字典版本 | 結構＋必要語意相容，不只看版本字串 | Stage 2 明確要求 | v3 字串白名單 | parser 較多規則 | 否 |
| 品質 | 指標別 eligibility + coverage | 不誤排有效 Green | 整列全排/全納入 | UI 需解釋 | 否 |
| Alarm 修正版 | 舊已提供、修正版缺源時阻止 | 防止無提示抹除 | 強制 override | 使用者需補檔 | 否；審查已確認 |
| stale | 7 分鐘可設定 | 約兩個 3 分鐘週期 | 6/9 分鐘 | 尚無企業規範 | 否；暫定預設已確認 |
| Demo 時間 | manifest dataDate + demoClockAt | 不冒充今日且可重播 | 依 host 現在 | 舊 fixture 全 stale | 否 |
| 趨勢落格 | sample_slot；updateTime 判 freshness | 時間語意可測 | 直接用 updateTime | 格點漂移/重複 | 否 |
| 模式切換 | mode_revision + 寫前二次檢查 | 跨程序最小可靠方案 | IPC/訊息佇列 | 最多完成網路請求但不落資料 | 否 |
| API 認證 | 預設 none；確認後才加 header | 符合成功 Python 證據 | Bearer 必填 | 需授權 smoke test | 否；技術驗證 |
| 同日 UX | 完整日 + 30/60 分鐘桶，無時分 selector | Stage 2 已定 | 時分 selector | 增加產品範圍 | 否 |
| Web 安全 | localhost、無登入、同源寫入檢查 | 本機單人最小架構 | LAN + 帳號 | 無法多人遠端 | 否，除非需求改 LAN |

## 15. Stage 3 驗證事項（不改變產品需求）

本輪沒有仍需使用者選擇的產品決策。以下以保守預設進入實作驗證：

1. 企業 API 先以 auth=none 測 GET；只有企業明確要求時才設定 header。
2. 7 分鐘 stale 保持「暫定、可設定」。
3. Alarm regression 採硬性阻止，不提供強制覆蓋。

## 16. 可選的 Codex 協作

Sub-agent 非必要。若使用，只分派獨立可驗收工作，例如 SQLite schema review、匯入 contract review 或測試缺口檢查；主線仍由一份資料契約與同一驗收標準控制，不讓多個 agent 同時改同一高衝突檔案。
