# 極印 3D 列印監控儀表板 v2｜Codex Stage 2 詳細設計任務

> **狀態**：Stage 1 唯讀盤點已結束，現在進入 **Stage 2 — Design & Specification**。  
> **日期**：2026-11-14；預計展示 2026-11-18（三）。展示日期供安排依賴順序與驗收，不構成擅自刪減需求、略過測試的理由。  
> **正式工作區**：`agent練習/jiyin-dashboard-v2/`（新專案）。  
> **參考資料夾**：`../jiyin-dashboard/` 舊程式、`../test_api/` 私有 API 測試資料；均**唯讀**。  
> **請先閱讀**：`PROJECT_BRIEF.md`、本文件及 `_reference_inputs/` 裡相關 Excel / API JSON / 六張畫面截圖。如有 `_reference_inputs/STAGE1_ANALYSIS_REFERENCE.md`，亦請閱讀。

## 0. 指令優先序與階段授權

1. **本文件是 Stage 2 的最新決策增補**。與 `PROJECT_BRIEF.md` 的舊版 Stage 1 限制、TLS 設定或其他提議衝突時，**以本文件及使用者近期確認的決策為準**。Stage 1 報告是「分析證據＋技術建議」，不是不可修改的要求。
2. **現在允許在 `jiyin-dashboard-v2/` 內建立或更新 Markdown 設計文件**；請勿修改其他兩個資料夾，也不得修改、刪除、重新命名或整理參考附件。
3. **本階段不得**：實作產品功能、初始化/重建 Next.js、安裝 npm 套件、執行 migration、建立/更動 SQLite、啟動 Collector、請求真實企業 API、初始化 Git、提交 Commit、推送 GitHub、複製整包舊專案，或以「先做做看」為由改動產品程式。
4. 可以唯讀檢視檔案、解析本機提供的樣本並做**不改動來源的推演或文件內的範例計算**。若需要產生暫存檔或執行會有寫入副作用的檢查，先記錄待驗證，不要自行擴大權限。
5. 如果 Codex 工作區設定在 `jiyin-dashboard-v2/`，兄弟目錄可能因 sandbox 而無法讀取。不要擅自關閉 sandbox 或擴大可寫範圍；優先使用已提供的 Stage 1 分析與本地 `_reference_inputs/`。必要的舊專案細節列出待補充即可。
6. 每個結論標示 **[已確認需求]、[檔案證據]、[建議設計]、[待確認]**。不得將尚未驗證的猜測寫成企業契約。重要取捨要說明原因、替代方案、成本與風險。
7. 若有無法從附件回答的真正阻塞問題，集中列出，**先推薦合理預設與不確定性**；不需要每個小型工程決策都要求使用者選擇。完成設計草案後停止，等待使用者審查，再進 Stage 3 實作。

## 1. 專案與 Stage 1 結論摘要

- 產品：3D 列印公司 A/B 區共八台設備、環境感測器的即時監控，與標準化每日 Excel 驅動的歷史分析。七個頁面：首頁、機台監控、環境監測、歷史加工分析、異常事件分析、Excel 匯入、API 連線設定；**不做獨立資料品質頁**。
- 舊專案已確認：Next.js 16.4.6 App Router、React 19.3.0、TypeScript Strict、Tailwind 4.3.3、npm；大量自寫 CSS；只有 UI 外觀與選取互動，正式圖表及主要資料流尚未串通；部分 API 安全連線、Excel/SQLite 交易處理與 90 個具名測試可參考但未執行驗證。
- 值得選擇性移植：深酒紅暗色視覺 tokens、layout/sidebar/topbar、品牌、Panel/MetricCard/EmptyState、機台選取互動、API allowlist/timeout/error 類別、Excel 檔案限制與 SQLite transaction 模式。
- 不移植：大型 3D 佔位場景、舊資料品質頁、假圖表／假數據、任意輸入 API URL、舊 Excel schema（其中「待機小時」與 v3 的「待機小時(黃燈)」不符）、整包耦合 CSS。
- Stage 1 API 盤點：`test_api/data` 於 2026-11-12 12:09:15–16:57:15 有 97 輪 × 三端點＝291 個 JSON；`values` 48 sensors、`configs` 48 sensors、`groups` 5 groups；`groups/configs` 在 97 輪內容不變。Lamp 只提供 blue/green/red/white/yellow **五色**，不含歷史 Excel 的 `None`。`values.status=1/2` 尚無官方意義；五色全零不能推斷未開機。`SRIP` 沒有 group 指派。
- Stage 1 Excel 盤點：標準化 `2025-06-01` 檔六張工作表：`machine_3min` 3840 列／21 欄、`environment_3min` 3840 列／15 欄、`alarm_events` 11 列／11 欄、`quality_issues` 可為空、`data_dictionary`、`README`。原始 `2026-09-21` 公司 Excel **只供研究**，不是 v1 匯入格式。兩檔日期不同不可用來宣稱清洗結果可逐列比對。
- 本階段技術基準是 **Next.js + TypeScript + SQLite + TypeScript Collector + Docker Compose + npm**。Node 24 原生 `node:sqlite`、Recharts、明確 SQL repository / migration（無 ORM）屬優先評估方案，應在設計中檢查相容性與權衡後定案，不因舊程式使用而盲從。

## 2. 本輪最新確認決策（不可被舊文件覆蓋）

### 2.1 企業 API 的自簽 TLS 憑證

**[已確認需求／企業回覆]** 企業明確表示 API 經 HTTPS 加密、採**自簽憑證**、目前**直接透過 IP 位址**連線，短期不能提供正式網域/信任鏈方案；企業建議在測試時以 `curl -k` 暫時略過驗證。使用者的 Python `requests(..., verify=False)` 因此能請求成功。這是**僅限此專題、受授權企業 API** 的實際約束，不要再把「必須先取得正式憑證才能開發」列為阻塞條件。

**Stage 2 必須設計**：
- 只在**固定、明確 allowlist 的企業 API 連線**上允許有意識的 TLS 驗證例外；給出最簡單可靠的 Node 實作方案與設定方式（例如 server-only 的專用 HTTPS/Undici client 或 dispatcher），標示其安全風險。
- **不得**使用會讓整個 Node 程序放棄驗證的全域設定（例如 `NODE_TLS_REJECT_UNAUTHORIZED=0`），亦不得讓瀏覽器端繞過驗證、接收任意 URL 或關閉 redirect/timeout 等安全界線。
- 用明確的 server-only 環境設定啟用此**受限測試例外**，其他一般 HTTPS 連線仍正常驗證；若以後企業提供可信任 CA，須能方便恢復驗證。記錄於最終 README 和環境設定範例；不可把 IP/Token/憑證等敏感資訊寫進公開程式。
- 舊 Python 已證實使用 `GET` 取得三端點；企業回覆中的 `curl.exe -k -X POST` 只是一個通用示例，**不要將 GET 擅自改成 POST**。
- 本階段**不實際呼叫** API；Docker + IP 白名單 + TLS 成功與否，留至授權網路的 Stage 3 smoke test。

### 2.2 Excel 匯入：兩種不同的「移除／替換」

**[已確認需求]** 前端可批量選檔，先列出本次選取的檔案與初步資訊，使用者可直接**從尚未提交的選取清單移除選錯檔案**，此時不影響資料庫；選好才交給後端 preview/validate，顯示新增/重複/衝突/錯誤與警告，再由使用者**最後確認**才 transaction 寫入 DB。

**另外已確認**：資料庫內同日重複內容應略過；同日修正版需明確詢問、以「**整份每日標準化檔**」替換該來源日的有效版本，留存上一個版本並支援追溯/回復，不做跨版本的靜默合併。若修正版缺少來源、少工作表或 Alarm 來源不完整，應警告或阻止，**不可無提示地抹掉原本已有資料**。

請在文件及 UI 流程中把 **「選檔清單的移除」** 與 **「已入庫資料的版本替換」** 分開說明，不能因中文字都叫刪除而混同。

### 2.3 近期即時環境趨勢

**[已確認需求]** Collector 真正從何時開始取得資料，折線圖就從該時間開始。X 軸固定**當日 09:00–17:00 Asia/Taipei**；早於啟動時間、抓取失敗的區間或整天沒資料者留空，不補 0、不插值。重新整理網頁不清除已擷取資料；17:00 後可顯示當天已存的快照但標明過期或非 API 可取得時段；隔日改顯示當日資料。短期 Live 留存**約三天**為目前預設，不混入 Excel 歷史分析。

### 2.4 Live/Demo、展示方式與保密

- 由組員自己的筆電執行本機 Dashboard + Collector + SQLite，連學校或其他列入白名單的網路；Docker 不繞過白名單。前端走 server-side Route Handlers，不在瀏覽器直接打企業 API。
- Live 失敗要誠實顯示錯誤、過期或未知，**不能自動切 Demo**。Demo 由使用者切換，UI 明確標示「測試／模擬」與資料日期；Demo 不寫入正式歷史表、不將模擬狀態誤作實際 API 成功。
- 私有的 291 份企業 JSON 可做**本機離線驗證**；若最終 GitHub 公開，Demo fixture 須使用人工合成或經明確授權、可公開的資料，不能原封不動提交企業原始快照。
- 智慧電錶與 B4 特有列印參數先列**未來擴充**，本版聚焦八台機器與 A/B 環境。
- 新專案內目前沒有 `.gitignore`；**Stage 3 初始化時先建立 `.gitignore` 並檢查私有檔、DB、.env 被排除，才允許 `git init`/`git add`**。Stage 2 只需把此步驟寫進實作計畫；不必現在初始化 Git。

## 3. Stage 2 必須完成的五份設計文件

請放在 `jiyin-dashboard-v2/docs/` 下。若資料夾不存在，可為設計文件建立；**勿建立執行程式碼**。文件彼此連結，但避免大段重複。

### 3.1 `docs/ARCHITECTURE.md` — 系統責任、選型與部署

至少包括：

- 一張可閱讀的文字或 Mermaid 架構圖：Web UI、Route Handlers、data/query service、Excel import service、獨立 Collector、enterprise client、Demo provider、同一 SQLite 的 live/history 表分層、Docker Compose 及 named volume。
- 邊界：React 只呈現與互動；後端負責 Excel 驗證/匯入/統計與企業 API；Collector 獨立於開頁、刷新與 Route Handler；所有環境設定 server-only；只有授權網路能 Live。
- Node/Next/React/npm、SQLite access（原生 `node:sqlite` 或其它方案）、圖表庫等的版本與取捨；如採多容器共用 SQLite，交代 WAL、busy timeout、鎖競爭、資料庫初始化/升級及**共享 volume 的單機條件**；不過度拆服務。
- 企業專用的**局部 TLS 驗證例外**、URL allowlist、逾時、拒絕轉址、錯誤分類；設定示意不能露出私有真實值。
- Collector：每 3 分鐘收集策略與 Asia/Taipei 09:00–17:00；三端點不同步/部分失敗、重試、避免重複、metadata 快取（97 輪不變，但需定期重驗）、過期判定（暫評估 7 分鐘）、3 天保留、graceful shutdown。
- 本機安全邊界：若不做登入，Docker 主機埠只綁 `127.0.0.1:3000`（容器內仍可正常監聽），不要無意開放給整個校園 LAN；未來若開放 LAN 才另做權限設計。
- Live/Demo provider 切換規則、API 狀態監測與錯誤呈現；資料時區及時戳語意。

### 3.2 `docs/DATA_CONTRACT.md` — 真實資料契約與計算語意

此文件是 **schema、匯入、統計、測試共同遵循的資料契約**。

- `values`／`configs`／`groups` 結構、Sensor ID 關聯、機台 A1–B4/環境感測點對應、五色 lamp 與 status 未明、沒有 `None` 的處理、感測器 updateTime/responseTime/fetchedAt/批次時間分別保存；未知欄位不猜。
- Excel 六張工作表的**每一個真實欄名**、資料型別、可空值、來源與業務意義；`machine_3min` 21 欄、`environment_3min` 15 欄、`alarm_events` 11 欄、`quality_issues` 5 欄，還有字典/README 的管理策略。明確區分不接受原始公司 Excel 的 v1 限制。
- 來源日期 + 三分鐘**區間結束標籤**（`10:39` 意味 10:36–10:39）、`24:00` 是次日 00:00 的絕對時間但仍屬當日來源、Asia/Taipei、週/月跨期分桶與可用資料覆蓋率。
- 六態意義：Green 加工、Yellow 黃燈≠確定待機、Red 紅燈≠已證實故障、None 依歷史定義未開機≠缺漏、Blue/White 保留；Live 五色全 0 = 未知，不直接轉 None。
- NaN/0/Await 區分；部分 NaN 的補零規則已在上游標準化執行，新系統**驗證而非再清洗**；六態全 NaN 不補零；180±1 秒為**暫定**規則且不改原值；品質狀態、備註、品質問題要保留。
- 加工小時=Green 秒/3600；四態合計=None+Red+Yellow+Green；區間加工比例=Green/四態合計；開機加工比例=Green/(Red+Yellow+Green)；分母 0／品質不足留空、不叫 OEE。六態占比採六態有效秒數先合計再計算百分比，不可平均區間比例；Green 分析與六態占比是**不同指標**。
- **設計一張清晰的品質決策矩陣**：阻止整檔 vs 允許匯入但警告 vs 哪一種具體指標可納入/排除；不可把 Blue/White 非零、來源有註記的所有紀錄一律排除所有分析，也不可偷改值。含 Alarm 缺少來源 vs 已取得零事件、環境缺漏、品質問題表空表。
- 綠→黃只在相鄰有效**純綠→純黃**可推定區間邊界完成；同區間綠黃混合只能標疑似，不能自稱精確完成時間或完工件數。不跨無資料區間推定。
- Alarm 的事件時間、持續時間原文、分類/規則；26°C / 40%RH 只能當**待確認參考門檻**。
- 分析示例/測試向量：手工可驗算的少量數據，含缺日、缺值、0、六態非標準、跨日、重複、同日修正版、不同天數月份等。
- 對照 `PROJECT_BRIEF.md` 和標準化 Excel `data_dictionary`：列出可能衝突的地方與採用依據，不自行重清洗。

### 3.3 `docs/DATABASE_DESIGN.md` — 完整 SQLite 實體設計

- 真正以已提供的標準化 Excel **逐欄映射**，不能只列幾個示意欄位。每個實體表的 schema 欄位、型別、nullable、約束、外鍵、索引、查詢用途及來源欄位均需明示；必要時用表格與可讀的 SQL DDL **草案**（文檔中的 SQL，不建立 DB）。
- 至少評估：`machines`、`sensor_catalog`、`api_poll_runs`、`api_endpoint_runs`、`live_sensor_readings`、`import_batches`、`history_machine_intervals`、`history_environment_intervals`、`history_alarm_events`、`history_quality_issues`；只在有明確查詢/追溯用途時新增 `validation_issues`、`raw_excel_rows`、`app_settings`，**避免沒有價值的大量複製 JSON**。
- 用**一個** SQLite DB、分開歷史/Live 表，歷史永久或由使用者管理，Live 預設保留 3 天。來源值/派生值/品質標記的追溯策略；特殊時間處理及唯一鍵。
- 「選擇清單可移除」不涉及 SQL；同日相同 file/content fingerprint 不重複匯入；同日不同 fingerprint 使用**整份每日檔**、single transaction、active/replaced 版本切換、回退策略；每份檔案可獨立提交，失敗不污染其它日期。
- 單一來源日只允許一個 active batch；修正版缺 Alarm 來源/內容不完整時的提示或拒絕策略；分清「沒有 Alarm 事件」和「沒有 Alarm 來源」。
- 以**業務鍵**去重：machine_id + source_date + end label；環境的區域+感測點+類別+來源日+結束標籤；事件缺 event ID 的限制不可隱瞞。除了單一批次內唯一性，需說明跨 active/replaced 批次怎麼查詢。
- SQLite WAL、transaction、索引、migration、讀寫併發、volume 備份/還原與刪除風險；預估資料量，評估 raw rows 是否有必要。

### 3.4 `docs/FEATURE_SPEC.md` — 七頁的 UX + 查詢契約

對每頁列出**資料來源、可操作控制、空狀態/錯誤/過期、重要圖表、計算規則、API contract（輸入/輸出範例）、驗收情境**。

1. **首頁**：沿用舊資訊層級，更新正確名稱與導航；不虛構 KPI。
2. **機台監控**：A/B 各四台，區域上下排列；每區左側快速卡片、右側選取機台資訊；刪除大型 3D 場景。未知/過期/未連線/五色狀態需分開，未納入 B4 特有欄位與智慧電錶。
3. **環境監測**：A/B 感測點最新溫濕度，趨勢可切溫度/濕度、A/B；四組各兩點不可暗中平均；X 軸固定 09–17，缺資料斷線，隔天按新日顯示，17:00 後保留今日已有紀錄並標過期。
4. **歷史加工分析**：**區間分析／同期比較**；同日 30 分鐘或 1 小時桶、跨日每天一桶（不必擅自加入時分選擇器）；日對日選兩日、週對週以各自起始日算 7 天、月對月選年/月。圖一 Green 累積排行（橫條）；圖二 Green 工時趨勢；圖三六態占比（100% 堆疊）。比較時依相對時間位置對齊，完整呈現資料涵蓋率/缺日與月份天數差異。
5. **異常事件分析**：Red/Yellow 是**狀態時數**而非可證實的故障/待機事件次數；環境 `alarm_events` 是真正來源事件。列表與篩選；連續紅燈區間如何合併需定明確規則且不跨資料缺口。
6. **Excel 匯入**：選取多檔→檢視清單→移除錯檔→預覽/驗證→衝突告知→確認匯入→記錄結果；preview 不寫正式資料，confirm 需重新驗證檔案/指紋；同日修正版走整份替換/追溯，品質來源缺失須提示或拒絕。第一版不做原始 Excel 清洗。
7. **API 連線設定**：固定 values/groups/configs、每端點連線健康/最後成功/最新資料/錯誤/是否時段內、手動測試、Live/Demo 手動切換；不得提供任意 URL 輸入或將 Demo 當連線成功。

版面以舊深酒紅風格/卡片與左側導覽為基礎，要求常用控件的明確互動與表單回饋，避免假圖表、空按鈕。建議列出需從舊專案選擇性移植的 UI 清單與新設計差異。

### 3.5 `docs/IMPLEMENTATION_PLAN.md` — 真正可執行的分階段路線

- 依**依賴**而非只依頁面切工作：資料契約→安全初始化/資料庫→Excel import/查詢與計算→歷史頁→Collector/Demo→即時頁→Docker/跨平台/交付。可調整先後，但需解釋原因。
- 每階段列：具體實作範圍、輸入依賴、產出成果、驗收標準、失敗處理、測試層級（unit / contract / integration / e2e）及完成判準；避免每個 UI 小修改都做昂貴全套測試，但資料計算、去重、rollback 必須高覆蓋。
- Stage 3 **第一步**：在新專案建立 `.gitignore` 排除 `_reference_inputs/`、`test_api` 私有資料、`.env*`（保留公開 `.env.example`）、SQLite DB、volume / logs、`node_modules/`、`.next/`；驗證排除生效後才能 Git 初始化與 `git add`。不要在 `agent練習` 根目錄或舊專案初始化 Git。
- 隔離正式與 Demo 資料，私人企業 JSON 不進 GitHub，合成 fixture 應標為 synthetic。寫出正確 API 方法/白名單/受限 TLS 例外的測試步驟。
- Docker Compose 適用 Mac + Windows，包含 web、collector、DB volume（若需 migration 可啟動時執行）；README 必須從 clone、cd、啟動 Docker Desktop、環境設定、`docker compose up --build`、開啟 `http://localhost:3000`、匯入 Excel、Live/Demo 操作、logs、停止、重建、備份及 `down -v` 資料風險，分別提供 PowerShell 與 macOS/Linux 指令。
- 11/18（三）展示、希望週末可供組員試用，但品質優先。區分「可供檢視的整合狀態」與「完整驗收」，不為日期自動刪減已確認範圍。
- 若用 Codex sub-agent，限定獨立可驗收的工作（例如 SQLite schema review、匯入 contract review、測試檢查）；不是硬性必用。`AGENTS.md` 可在正式實作開始前按已定案規則建立，不堆疊所有規格內容。
- 最後附上 **設計決策表**：採用方案／原因／替代方案／風險／是否仍待使用者決定；只保留真正重要的待決事項。

## 4. 要專門檢查、不要默默決定的分歧

請在文件內明確裁決並以證據說明，或列為決策請求：

1. **匯入的版本限制**：不應僅因工作表 `README` 上的 `IT確認版 v3 / 2026-11-12` 字串不同就一律拒絕。以**必要工作表、欄位、資料型別與契約**為首要驗證；字典/清洗版本不同則清楚提示差異與相容性風險，必要時停止匯入待審核。
2. **Blue / White 非零／警告資料**：保留原值與標記，採**依指標決定 eligibility**，不可一律排除該三分鐘所有 Green 工時，也不可直接忽略不可信區間；品質矩陣要能解釋。
3. **`raw_excel_rows`**：比較「逐列 JSON 全複製」與「標準化資料＋來源檔指紋/原文必要欄/來源列序號」兩種方案；根據追溯需求與筆數決定，避免為了看似完整而無限增加資料量。
4. **`configs/groups` 快取策略**：97 輪靜態相同是樣本觀察，不是永遠不變的官方承諾；設計初始化及週期重驗、無 mapping 時的安全降級，避免每三分鐘無條件重複寫入大量相同 metadata。
5. **六態時間占比的缺值/品質分母**：定出可測試的演算法、哪些數據不納入某項圖表、覆蓋率與可信度提示；避免將不完整資料算作完整的 180 秒。
6. **同日/跨日篩選 UX**：前面已決定「同日 30/60 分鐘桶、跨日每日桶」，不為了抽象的「小於一天」重新增加開始/結束時分選擇器；如發現真正無法支持某需求，列出具體使用案例再提出修改。
7. **`status`/`responseCode`、五色全零、stale 門檻**：區分技術連線成功、API 回應成功、感測器有更新、資料可用；7 分鐘只能是可配置初始門檻，尚無正式規範。
8. **本機 web service 的安全邊界**：若無帳號登入，須限制為 localhost，對匯入/模式變更/連線測試的寫入端點明確定義使用範圍；不可把 Demo 當安全控制。

## 5. 完成 Stage 2 時怎麼回報

完成五份設計草案後，**停止，不要自行進 Stage 3**。請在 Codex 對話中提供：

1. **已產生的文件清單**（相對路徑），各自一句用途。
2. **建議的最終架構摘要**：一張資料流/部署圖，列定案技術與原因。
3. **完整資料庫表清單及重要唯一鍵**，並註記與 Stage 1 建議相比的增刪理由。
4. **資料品質與計算規則摘要**：特別指出缺值、六態占比、同日修正/Alarm 來源、時間跨日。
5. **七頁驗收矩陣**，說明每頁資料從哪來、要怎麼驗證實際顯示。
6. **最多列出真正影響實作的重大待確認事項**，每項提供推薦選項、代價、預設處理。不必為小型技術選擇反覆詢問。
7. **資料與安全檢查**：明確確認此階段未觸發 API、未改舊專案、未執行 migration/Git/依賴安裝；並提醒 Stage 3 初始化第一步是 `.gitignore`。

**Stage 2 交付＝可供人類審查的設計文件與具驗收點的實作計畫；不是功能程式碼或已部署產品。**
