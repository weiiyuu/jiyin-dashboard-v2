# 更新紀錄

本檔案記錄對使用者有影響的主要變更。目前尚未建立正式版本與 Git Tag，所有項目先收錄於 `Unreleased`。

## [Unreleased]

### 重要新增功能

- 異常事件分析升級為 V2 五區介面：提供環境警示 KPI、持續時間、單日／多日趨勢、Active Batch 明細、來源排行，以及獨立的品質合格紅燈時間與連續區間分析。
- Excel 匯入支援一次選取大量檔案並依既有限制循序分批 Preview／Confirm，提供整體進度、部分失敗保留與安全重試；版本記錄新增頁碼導覽及指定頁跳轉。
- 完成標準化 Excel 多檔 Preview／Confirm、資料品質分級、NULL 保留、重複與同日版本取代、Active Batch 與版本回復；所有正式寫入均使用 SQLite transaction。
- 完成機台運轉歷史分析，包含加工時數、趨勢、三態燈號占比、資料覆蓋及日／週／月同期比較；完成異常事件、連續燈號區間與 Alarm 來源呈現。
- 完成企業 `values`／`configs`／`groups` 客戶端、三分鐘 Collector、Sensor mapping、Live SQLite readings／audit／metadata，以及機台、環境與 API 連線狀態畫面。
- Stage 8A：新增 Windows／macOS 原生 npm `dev:all` 與 `start:all`，Web 與 Collector 共用同一本機 SQLite；瀏覽器 Demo／Live 顯示偏好已與背景 Live 收集解耦。
- Stage 8B：新增選用的 production Docker Compose（Migration／Web／Collector）、共用 named volume、healthcheck／restart policy，以及可驗證的 SQLite 備份與還原工具。

### 重要修正

- 完成最終 Dashboard UI UAT 收斂：同期加工長條與時數刻度改用一致比例尺；比較 Tooltip 改以實際日期及各自品質／覆蓋資訊呈現並固定錨定作用中資料；異常事件明細補齊伺服器端頁碼、每頁筆數與指定頁跳轉。
- 異常事件與機台運轉趨勢圖現依固定步距顯示主要 X 軸刻度，不再為末筆資料額外塞入過近標籤；全部資料點與 Tooltip 仍完整保留。Alarm 筆數趨勢改用整數 Y 軸刻度。
- 異常事件 V2 調整為總覽、趨勢、來源排行、逐筆明細的閱讀順序，並簡化 KPI 副標與資料完整性說明。
- Alarm 統計會排除加工完成通知、保留未知分類待確認，並將英文持續時間原文以可追溯純計算解析；缺值或未知格式不補成 0。
- Excel 大量匯入中途停止 Preview 後，已完成檢查且符合條件的檔案現可先行匯入；尚未檢查、檢查失敗與需重新檢查狀態已分開呈現。
- 依組員 UAT 精簡首頁、機台監控、機台運轉分析與 Excel 匯入文案；明確分開 Demo 專用灰燈與 Live 未知狀態，並將累積工時圖的最大刻度對齊實際期間容量。
- 強化 Excel 日期、時間區間、機台身分、衍生公式與統計資格驗證，不將缺值或品質異常默認補為 0。
- 將資料可保存與可參與統計分開處理，並保留原始六態、Alarm 來源與資料品質語意。
- 修正 Live／Demo 寫入保護、手動連線測試與 Collector 成功狀態分流、無資料與有效 0 值的區分，以及 Live 圖表 NULL gap／stale／unknown 呈現。
- 還原操作現在要求明確停機確認，並會拒絕仍有 Collector lock 或 WAL／SHM sidecar 的目標；還原前資料庫會保留可回復副本。

### 已驗證的交付範圍

- macOS 原生 npm 運行、Production Build、Web／Collector 統一啟停與隔離 SQLite 運行。
- Windows 實機已完成 GitHub clean clone、`npm ci` 與 `npm run dev:all` 基本啟動。
- macOS Docker 隔離環境已完成 Production Build、Migration、Web／Collector healthcheck 與空白企業設定安全待機。
- Docker 容器移除後重建，合成資料仍保留於 named volume。
- 原生與 Docker 隔離 SQLite 的備份、還原與 `integrity_check` 已通過；Live readings 保留 3 天，Excel 歷史批次不受此清理影響。
- Demo／Live 顯示解耦、Collector 寫入保護與隔離資料庫流程已有自動化測試。

### 尚待人工驗證

- **Windows 真實 Live**：在合法網路與白名單環境確認三端點、兩個不同 sample slot、SQLite 寫入與 Live 畫面一致；失敗時不得自動改用 Demo。
- **Windows `start:all`**：完成 Production Build 後確認 Web／Collector 共用同一 SQLite，`Ctrl+C` 能安全停止並釋放 lock，重啟後資料仍在。
- **Windows Docker Desktop（選用）**：確認 build／Migration／healthcheck／named volume 持久化與無企業設定的 Demo 運行。
- **正式資料恢復演練**：另行排程停止寫入程序，備份後在隔離副本先演練還原與完整性檢查，不直接覆寫唯一正式資料庫。
- **Docker 真實企業連線**：在授權時段與隔離資料庫驗證企業網路／TLS／Origin Allowlist；本輪不執行。
- **`custom_ca`**：企業實際提供私有 CA 後，驗證已忽略的 private Compose override 能 read-only 掛載 CA，Image 與 Git 不含憑證。
- **npm 轉移至 Docker**：需另行授權的單一 Collector 切換，先備份並確認舊 Collector 已停止，再讓 Docker 使用經驗證的資料副本。
