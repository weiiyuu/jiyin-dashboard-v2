# Stage 7｜即時監控前端驗收

> 結論：Stage 7 已完成 Demo／隔離資料庫範圍的程式開發、自動測試、Production Build 與真實瀏覽器驗收，可以交付人工 UAT。真實企業 Live Collector 的多輪收集仍未執行，不能據此宣稱正式 Live 已驗收。

## 1. 完成功能

### 機台監控

- 六張摘要使用後端互斥分類，固定監控八台設備，Demo 合計為 8。
- A、B 區各四張卡與獨立詳情；A3、B4 可同時選取，互不重設。
- 卡片分離燈色、選取與 freshness；STALE／UNKNOWN／NO_DATA 使用中性外觀，不冒充有效燈色。
- 詳情顯示 Sensor update time、fetched time、解析狀態、語意未確認的 raw status、完成 Detector 原始訊號及四個區域環境測點。
- 沒有 3D 場景、產量推算或虛構故障原因。

### 環境監測

- 聚合四個 Stage 6 查詢為 A／B 各四張 Sensor 卡，共八個獨立讀值。
- 溫度、濕度各一張四線 SVG 圖；實線、共用 Tooltip、鍵盤可操作資料點、圖例 focus／hide、刷新保留圖例選擇。
- X 軸依 Provider `timeContext.now` 從 09:00 向上取 30 分鐘刻度，至少到 09:30、最多到 17:00；Demo 固定使用 manifest clock。
- Y 軸由有效觀測及 26°C／40%RH 暫定參考線分別計算，不固定從 0 起；保留最小跨度與易讀刻度。
- NULL、未觀測及不連續三分鐘格會斷線；0 點顯示空狀態、1 點只畫點、2 點以上且連續才連線。
- Demo fixture 擴充為 160 個三分鐘格並保留刻意缺口，未寫入 Live SQLite。

### API 連線設定

- 分開顯示 Collector 與 Manual Test；values／configs／groups 分別顯示 transport、API、schema、最近嘗試／成功／資料與安全錯誤。
- Live／Demo 控制使用既有 mode revision compare-and-swap；失敗不會自動切換 Demo。
- 手動測試僅在企業設定存在時啟用，並以使用者確認提示說明它會呼叫真實企業 API、但不寫入 readings。
- 非服務時段與未設定狀態有明確說明；畫面不顯示 Origin、Token、憑證或 CA 路徑。

### 首頁

- 保留三大工作區入口及無 Sidebar 首頁。
- 新增 `/api/overview` 與 30 秒本機摘要，顯示 Live／Demo、資料可用性與 Active 歷史日期，不顯示無來源的 OEE、產量或健康 KPI。

主要程式：

- `src/app/monitoring/machines/page.tsx`
- `src/app/monitoring/environment/page.tsx`
- `src/app/settings/api/page.tsx`
- `src/components/live-environment-chart.tsx`
- `src/features/live/live-ui-model.ts`
- `src/app/api/overview/route.ts`

## 2. 自動測試與建置

| 檢查 | 實際結果 |
|---|---|
| Stage 6／7 針對性測試 | 3 files，28 tests passed |
| 完整 Vitest | 16 files passed，126 tests passed；1 個 opt-in 私人 Excel suite skipped |
| Typecheck | passed |
| ESLint | passed，0 warning／error |
| Production Build | Webpack build passed；`/api/overview` 與四個頁面均列入輸出 |
| `git diff --check` | passed |

新增回歸涵蓋：Provider 時鐘與動態 X 軸、NULL／不連續 gap、有效 0、動態 Y 軸、暫定上限與缺資料並存、160 格 Demo、四圖例／參考線／可存取資料點、首頁不含假 KPI、全新 DB overview。

## 3. 真實瀏覽器驗收（合成資料與隔離 SQLite）

- Demo 機台：六摘要為 `8 / 1 / 1 / 1 / 3 / 2`，合計分類 8；A3 與 B4 同時保持選取。
- Stale／Unknown：B4 顯示過期且不保留鮮亮綠色；B3 顯示無法判讀。
- Live 空資料：由受保護本機 route 將隔離 DB 切為 Live 後，八台皆為 NO_DATA、不可用摘要為 8，沒有顯示假燈色；驗收後切回 Demo。
- 環境：八張 Sensor 卡、兩張圖、八個圖例、兩條參考線；Demo 缺口造成額外 path segment，未跨 gap 連線。
- Tooltip：鍵盤／滑鼠焦點可讀 `時間、Sensor、數值、來源時間`；測得例為 `09:03 · A 區溫度 2 / 25.2°C`。
- 圖例：隱藏一條線後重新讀取本機資料，`aria-pressed=false` 保留，沒有被 refresh 重設。
- 1280／1366／1440px：各頁 `document.scrollWidth === viewport width`；兩圖桌面均無內部溢位。
- 760px 基本窄版：頁面無水平溢位；圖表使用自己的 66px 水平捲動空間，沒有把整頁撐寬；鍵盤 Space 可切換圖例。
- 首頁：無 Sidebar、三個工作區、Demo fixture 日期與未匯入歷史狀態正確；瀏覽器 console 無 error／warning。

限制：In-app browser 對原生 `window.confirm` 的自動點擊不穩定，因此 Live／Demo 兩種最終畫面及受保護 route 已驗證，API 設定頁按鈕也確認可見且 enabled，但「點按按鈕 → 原生確認 → 完成切換」仍列為人工 UAT 操作，不虛稱自動化通過。手動測試企業 API 按鈕依規定未點擊。

## 4. 尚待真實 Live 驗收

- 服務時段內至少兩輪真實 Collector 收集、三分鐘 sample slot 與 UI 逐步更新。
- 真實 stale、partial failure、Sensor 未更新及 retention 後的畫面。
- Container 內企業 TLS／自訂 CA／網路與正式 Docker production 運行。
- 目標筆電上的 Live／Demo 原生確認流程與最終主觀排版確認。

上述項目不阻擋 Demo 展示與 Stage 7 人工 UAT，但在完成前不得宣稱企業 Live production ready。

## 5. 安全

- 本輪沒有呼叫真實企業 API、啟動真實 Collector、修改產品 SQLite／Docker Volume、Push 或部署。
- 瀏覽器只使用 `/private/tmp/jiyin-stage7-browser.sqlite`；企業設定不存在，因此 Manual Test 按鈕停用。
- `_reference_inputs/`、企業 Excel／JSON、環境檔與資料庫未加入 Git。
