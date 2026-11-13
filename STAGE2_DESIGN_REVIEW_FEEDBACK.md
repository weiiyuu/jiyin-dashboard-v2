# Stage 2 設計審查意見（交給 Codex 修訂）

> 2026-11-14｜狀態：有條件通過、請先完成一次針對性修訂。  
> 審查對象：`docs/ARCHITECTURE.md`、`docs/DATA_CONTRACT.md`、`docs/DATABASE_DESIGN.md`、`docs/FEATURE_SPEC.md`、`docs/IMPLEMENTATION_PLAN.md`。  
> 本文件只授權更新設計文件，不授權初始化 Git、執行 migration、安裝依賴、呼叫企業 API 或開始 Stage 3 功能實作。

## A. 整體結論與保留項目

- 同意以 Next.js + React + TypeScript、獨立 TypeScript Collector、單檔 SQLite（history/live 分表）、Docker Compose 為技術基準；沿用舊版視覺設計與可重用元件，不修改舊專案。
- 同意六表標準化 Excel 的逐欄契約、指標別品質資格與 coverage、完整每日批次的版本替換、交易式回復、preview 不落庫、Live 失敗不自動切 Demo、僅企業固定 origin 的局部自簽 TLS 例外。
- 用本機 SQLite 3.46.1 對 `DATABASE_DESIGN.md` 的 8 個正式 SQL 建表區塊進行語法驗證，16 張表均可建立；末尾 `... FROM` 是不可執行示意查詢，不代表 DDL 錯誤。**語法成功不代表 Node driver、匯入交易、跨程序鎖或壓力測試通過。**
- 保留現有品質保障，不新增 Python API、Redis、中央 DB、登入系統或不必要的 Agent。

## B. Stage 3 前必須消除的五項歧義

### P1 — Demo 模式的日期、新鮮度與重播時間

`ARCHITECTURE.md` 說 Demo 讀固定 synthetic fixture 並顯示 fixture 日期；`FEATURE_SPEC.md` 卻限定環境圖 `date` 為「台灣今日」，而 Live 與 Demo 共用 stale/freshness 視覺模型。這會使過去日期的 Demo fixture 在今天的 09–17 圖表中被查成空白，或整批顯示 STALE。

請定義簡單一致的 Demo 時間模型：建議使用清楚標示的「模擬資料日期／模擬時鐘」，Demo 的趨勢資料、日期軸及 freshness 一律以虛擬時鐘解讀；Live 則使用真實台灣現在時間。不得讓 Demo 冒充今天的真實資料。補上可測的樣本與驗收。

`test_api` 內已有 97 輪、291 個私人企業 JSON，可以僅供本機契約／重播驗證；公開版本預設使用 synthetic fixture。若提供本機私人 replay，必須為明確選配、遵守 `.gitignore`，不得將企業原始紀錄寫入 GitHub。避免為此另做一套大型架構。

### P2 — 同期比較 API 回傳結構與三張圖的語意

`FEATURE_SPEC.md` 定義了 `compare` query（日/週/月），但實際完整 response 範例只展示 `range`。需具體定義 `compare` 的 ranking、trend、stateShare、coverage schema：兩段期間如何表示；每台機器是否各有 A/B 數值；趨勢是「所選機台合計」還是「每台一條線」；六態占比是否是兩個 100% 結果；缺日與不同月份天數如何表示 unavailable。

建議儘量共用 range 的統計函式和圖表元件，提供日/週/月各至少一個可手算驗收案例，勿自行新增不必要控制項。

### P3 — 即時三分鐘趨勢的落點時間、同格衝突與缺口

`ARCHITECTURE.md` 同時保留 Collector batch time、fetched_at、sensor.updateTime；`FEATURE_SPEC.md` 又要求 09:00–17:00 的三分鐘 null slots，卻沒有指定以哪個時間決定圖表 x 軸落點。

請明定：哪個時間用來將 Collector 樣本對應到三分鐘時間格、如何處理啟動立即抓取（例如 10:01）、一格多筆、重試、時間偏差、相同感測器 updateTime 未改變，以及請求失敗時該格留空的規則。sensor.updateTime 要用於資料新鮮度判斷，不能無說明直接混同 x 軸取樣時間。增加「10:01 啟動、10:03 排程、其中一輪失敗」的驗收案例。

### P4 — Live/Demo 切換時的 in-flight Collector 與手動測試稽核

`ARCHITECTURE.md` 說 Demo 停止 Collector 且不寫 DB，但 `app_settings` 由 web 修改、Collector 是另一程序。需寫清楚：正在進行的 Live poll 遇到切換 Demo 時，必須在寫入前重新檢查 provider mode 或明確取消此次操作，確保 Demo 下不殘留新的 Live 寫入；恢復 Live 如何重新排程。

另請分開「手動 API 測試成功」與「Collector 實際取得且保存最新資料」，手動測試不得讓首頁或 API 設定頁錯誤地把 last successful poll/last sensor data time 更新為成功。加入併發與手動測試情境。

### P5 — API 認證不能預設必需 Bearer Token

`ARCHITECTURE.md` 及 `IMPLEMENTATION_PLAN.md` 提議參考舊專案 Bearer Token，但使用者成功的 `test_api/test.py` 是直接 `requests.get(url, verify=False, timeout=...)`，沒有傳入 Bearer header。舊 Next.js `/api/gulin` 的 Bearer 也可能只是內部 Route Handler 的保護機制，不足以證明企業 API 需要 Token。

設計應將「企業 API 是否需要憑證」標為待驗證，先支援不帶認證的 GET；需要時才由 server-only 環境變數添加指定 header。不應因未設定 `ENTERPRISE_API_TOKEN` 而阻止已授權環境的正常啟動。以使用者 Python 已成功的請求方式為 smoke test 參考，仍採 origin allowlist + 局部 TLS 例外。

## C. 可順手修正的三項非阻擋細節

1. **環境監測上方版面**：先前需求是保留舊版 A/B 兩區資訊區塊。`FEATURE_SPEC.md` 描述「每區四張值卡」容易變成八張獨立卡；請改為保留兩個區域容器，各顯示溫度1/2、濕度1/2 四個值，若設計上做子卡也不能破壞 A/B 區群組層次。
2. **初期可驗收的 Docker 骨架**：目前 `IMPLEMENTATION_PLAN.md` 將 Docker 整合留到最後。建議初始化後早期就建立最小可運行的 web/collector/volume smoke test（不要求立刻完成 README），避免跨平台 Node/sqlite 共用 volume、工作目錄、啟停問題拖到最後才發現；完整 README 和跨平台驗收仍可留後段。
3. **品質資格規則升級**：DB 儲存 `quality_rule_version` 與 eligibility flags。請補一段「未來規則版本更新時」如何偵測版本不同、重新計算或停止使用舊旗標的原則；不要求現在建立完整重算 UI。

## D. 已確認、不需重新詢問使用者的事項

- 同來源日修正版採整日替換、保留舊版、交易式切 active；已提供 Alarm 的舊版不得無提示地替換成 Alarm 來源缺失的新檔。
- Excel 選檔清單的「移除」是提交前從清單剔除，不接觸正式 DB；「替換」是另一個事後版本管理操作。
- Live 環境趨勢只顯示真正收集的三分鐘資料；缺口不補值，17:00 後可看當日既有紀錄。
- `stale=7 分鐘` 可作為明確標示為「暫定、可設定」的預設值，無需因企業尚未定義而阻塞開發。
- 僅特定企業 origin 啟用自簽憑證驗證例外，不做 Node 全域 TLS 關閉。
- `README` 必須完整涵蓋 Windows PowerShell、macOS/Linux、clone/cd、Docker 啟停、資料匯入、Live/Demo、備份還原和 `down -v` 風險。

## E. 本輪交付與停止條件

1. **只更新原本五份 Stage 2 設計文件**，保持彼此一致；請勿額外產生大量重複文件或開始功能程式碼。
2. 在回報中列出對照表：問題編號、修改檔案與章節、採用決策、測試／驗收範例。
3. 若仍存在真正會改變產品需求的未決事項，單獨列出最多 3 題；可以自行以保守預設解決的技術細節請直接定義並說明理由。
4. 完成後停止，等待使用者批准進入 Stage 3。
