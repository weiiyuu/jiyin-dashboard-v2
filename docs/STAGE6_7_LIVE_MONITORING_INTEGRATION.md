# Stage 6／Stage 7｜即時資料與監控頁整合規格

> 狀態：依近期討論整合的執行依據；Stage 6 現在進行離線後端實作，Stage 7 才進行前端實作。
>
> 放置建議：`jiyin-dashboard-v2/docs/STAGE6_7_LIVE_MONITORING_INTEGRATION.md`。
>
> 本文件補充原專案 `AGENTS.md`、`IMPLEMENTATION_PLAN.md`、`ARCHITECTURE.md`、`DATA_CONTRACT.md`、`FEATURE_SPEC.md`。原架構與資料安全規則繼續有效；**只對本文件列明的最新 UI 決策採用此版**，尤其環境折線四序列與動態顯示軸。不覆寫先前 Stage 5 歷史分析或資料品質規則。

## 1. 目標與階段邊界

- **Stage 6：** 企業 API Client、Collector、SQLite Live readings、Sensor mapping、Live/Demo Provider、收集健康狀態及手動測試／模式控制 API；以合成資料與測試 DB 完成離線驗證，不自行存取企業 API。
- **Stage 7：** 完成機台監控、環境監測、API 連線設定及首頁 Live 摘要的正式使用者介面。沿用現有 Next.js 版面與 Stage 5.3 折線圖的視覺／互動模式。
- Stage 6 應讓 Stage 7 不必為了呈現八台機台及八個環境測點而重建儲存模型；但 **不得以 Stage 7 規格為由，未授權提前開發頁面**。

## 2. 企業 API：沿用已驗證取得方式、改為正式 TS 架構

- 先前 `test.py` 以 Python `requests.get()` 不帶 Authorization，成功取得 `values`、`configs`、`groups` 三個 GET API，`scheduler.py` 在每三分鐘格點後 15 秒執行；`test_api` 曾取得 97 輪、291 個 JSON。Codex 應閱讀相關本機樣本與現有契約，**不得僅憑猜測定義企業 API 認證／欄位**。
- 正式版用既有 Node.js／TypeScript 與獨立 Collector，不將原 Python 當作新的常駐服務。以 server-only 設定建構固定 allowlisted origin/path，只有三個預先核定的 GET 端點；預設不需認證，企業確定需要時才使用指定 header／Bearer。
- TLS 預設正常驗證；必要的企業自簽例外只在**已核准且 allowlisted 的專用 client** 局部啟用。不得全域關閉 TLS 驗證。限制逾時、回應大小、redirect、敏感日誌。
- `values` 每輪取得；`configs`／`groups` 啟動、無已驗證 mapping、未知 Sensor ID 或預定重新確認時取得；原設計的初始 metadata 更新間隔為 60 分鐘（可設定），不是企業保證永遠不變。
- **本次只授權離線實作**：不呼叫真實企業 API、不讀取私有憑證、不修改真實 DB。真正的企業網路 smoke test 需另行明確授權。

## 3. Stage 6 資料處理、時間與儲存

### 3.1 Sensor 與原始資料

- `values` 中的 `sensorId`、原始 `values`（含數值字串、五色燈）、原始 `status`、`sensor.updateTime` 保留；用 `configs` 決定 display name、type、unit，用 `groups` 決定群組。解析後另存 typed value／lamp state；解析失敗保留原始內容與 warning，不猜值、不補 0。
- 八台機台燈號（A1–A4、B1–B4）、八個環境點（A／B 各溫度 1/2、濕度 1/2）、八台完成偵測 detector，以**既有 `DATA_CONTRACT` 的已證實 Sensor ID** 映射。不能以感測器名稱或相似 ID 自行補映射。完成偵測只儲存訊號，不推算產量。
- 即時燈號五色：GREEN／YELLOW／RED／BLUE／WHITE；恰一個亮才判該色，多色同亮為 OTHER、五色全 0／非法值為 UNKNOWN。`status=1/2` 的企業語意仍未確認，不宣稱正常或故障；即時來源沒有歷史 Excel 的 `None` 狀態。
- **燈號狀態、資料新鮮度、連線健康分開存／回傳**。初始 stale 門檻為可設定的 420 秒（暫定），超時的最後觀測不可當作目前有效機台狀態。

### 3.2 排程與時間

- Asia/Taipei 09:00–17:00 收集時段；定時排程每 3 分鐘格點後 15 秒執行（最後 16:57:15）。Live 在服務時段啟動／恢復時可立即收集一輪，之後恢復格點排程；避免重疊、妥善重試與停止。
- **絕不能混用時間欄位**：Collector `batch_time`、API `responseTime`、收回 `fetched_at`、Sensor `updateTime` 與圖表 `sample_slot` 分開保存。儲存 UTC epoch milliseconds 與必要的來源原文，顯示按 Asia/Taipei。
- 趨勢 X 座標依 `sample_slot`：10:03:15 收集落 10:03；10:01 的啟動立即輪落 10:00。10:06 失敗或來源 Sensor `updateTime` 未更新時，10:06 顯示 NULL gap；不可複製上一值、插值、補零、硬接折線。
- 保存 poll／endpoint audit、readings、metadata snapshots 與 mode settings；優先使用已存在的 migration/repository。Live 預設保留 3 天；清理只影響 Live tables／相關 audit，不碰 Excel/history/import。

## 4. 簡化版 Demo：一組可完整展示的合成資料集

- **只有兩種模式：LIVE、DEMO；由使用者手動切換。** Live API 失敗、IP 非白名單、超出服務時段時只顯示錯誤或提示可切 Demo，**不得自動切換**，也不得把 Demo 值寫入 Live readings 或假扮真實觀測。
- Demo 預設使用一組公開、完全合成的唯讀 JSON fixture（可由若干檔組成同一組情境）；**不是只存一個時間點**。至少覆蓋八台燈號、完成訊號、A/B 共八個溫濕度值與跨多個三分鐘格點的序列，且具備少量資料缺口、過期／未知等 UI 測試情境。
- 必須有 manifest：`fixtureId`、`dataDate`、`demoClockAt`、`timezone=Asia/Taipei`、`source=SYNTHETIC`。Demo 用自己的資料日期與模擬時鐘，不能把過往 fixture 當「今天」，也不能用 host 現在時間把整組資料判為 stale。
- Demo 透過**同一個 Provider 介面**產生與 Live 一致的查詢回應，不另建虛擬企業 API 服務、資料產生管理平台或需要寫入 SQLite 的 Demo 匯入器。
- 開發者可用明確的本機環境設定**預設 DEMO**，確保無企業網路時也可開發；此啟動預設與 Live 連線失敗的「自動降級」不同。切換 mode 時用既有 `mode_revision` 及 transaction 前二次檢查，防止 in-flight Live poll 在 Demo 模式誤落庫。
- 過去 `test_api` 的 291 份私人 JSON 僅作離線 contract／選配 read-only replay；若現成 replay provider 可重用就保留，不額外做 replay UI，且絕不提交私人原始資料。
- 使用者介面在 Demo 時**持續且醒目標示「模擬資料」**，列出 fixture 日期，不能讓使用者誤解為真實 API 正常。

## 5. Stage 7｜機台監控頁最新布局與資訊契約

### 5.1 布局

1. 頁首保留資料來源、最後更新、連線狀態。
2. 保留原本六張設備狀態摘要卡。
3. 移除大型 3D 機台場景。
4. **A 區一列：左側四台機台卡片（建議 2×2），右側 A 區獨立詳細資訊**。
5. **B 區一列：左側四台機台卡片（建議 2×2），右側 B 區獨立詳細資訊**。
6. 兩區選取互不干擾（如 A2 與 B4 可同時查看）。手機／窄版轉為垂直堆疊，但不合併兩區詳情。

### 5.2 六張摘要（使用者已選方案 A）

| 名稱 | 分類及邏輯 |
|---|---|
| 監控設備總數 | A1–B4 固定 8 台，無資料也仍是監控設備 |
| 加工中 | 新鮮、恰單一綠燈 |
| 待機／完成 | 新鮮、恰單一黃燈；不代表 detector 已證實完成 |
| 紅燈異常 | 新鮮、恰單一紅燈；不直接稱機台故障 |
| 其他燈號 | 新鮮的單一藍燈／白燈，或多色同亮 |
| 資料不可用 | 五色全 0／非法／無法判讀、STALE 或 NO_DATA；細因仍獨立保留 |

五個狀態數字加總應為 8，且每台只能被分類一次。這些分類是**燈號與資料可用性摘要**，不等於來源 `status=1/2` 的正式機台健康語意。

### 5.3 左側機台卡片

- 顯示：**機台 ID**（最醒目）、既有機台類別／名稱（若有可靠來源）、即時燈號文字 Badge、最後來源更新時間、簡潔的 FRESH／STALE／無資料狀態。
- 不顯示：加工完成 detector 詳細值、原始 Sensor ID、raw API status／Batch ID／長篇技術文字；整張卡可點擊以更新該區右側詳情。
- **發光外框**只參考使用者提供的「發光示意圖」的邊框視覺，不採用圖內資料。GREEN／YELLOW／RED／BLUE／WHITE 各有柔和對應光暈；OTHER 多色或 UNKNOWN 不猜單一顏色；STALE／NO_DATA 不持續用鮮亮舊燈色暗示現況。
- 選取高亮與燈色要採不同視覺線索；支援鍵盤、焦點、降低動畫偏好。

### 5.4 右側獨立設備詳細資訊

- 基本資訊：機台 ID、區域與可靠的設備類別。
- 當前燈號：目前有效的解析顏色／多色／未知、最新觀測顏色（若過期則明確標為最後觀測）。
- 資料資訊：Sensor update time、系統 fetched time、FRESH／STALE／NO_DATA、收集／連線相關可讀狀態。原始 `status` 意義未知，不轉成「感測器連線正常」。
- **加工完成 detector：僅放在右側**，顯示來源 ON／OFF／UNKNOWN、來源時間與資料品質；不直接解讀為「加工已完成」，不得用來算產量。
- **所屬區域環境摘要：** 附在較下方，顯示該區兩個溫度、兩個濕度監測點的簡明摘要或「是否高於暫定參考上限」，註明這是區域共用而非單一機台感測器。
- 避免 B4 專有參數、智能電錶、虛構故障原因；深度診斷資訊仍留資料層／API 連線設定。

### 5.5 區域環境在機台頁的呈現

- **不放到每台機台卡。** A、B 區標題附近各放一個精簡的「區域環境參考狀態」，右側詳情可呈現補充四個測點資訊。
- 以暫定 26°C／40%RH 比較時，文字用「高於暫定參考上限」「目前讀值未高於暫定參考上限」「部分資料不足」等，不能寫「已合格／已故障」。
- 當不同測點有超出參考線與缺資料並存，兩者需分別提示，不得把缺值當作未超過。

## 6. Stage 7｜環境監測頁最新布局與圖表

### 6.1 目前值

- 資料來源使用**即時企業 API 經 Stage 6 Collector 整理的 Live Provider**；Demo 則明確使用合成 fixture。不得將 Excel 歷史數據冒充即時來源。
- 頂部兩個主要容器：「A 區環境資料」「B 區環境資料」。每區四張小卡：**溫度 1、溫度 2、濕度 1、濕度 2**。一共八個獨立 Sensor，不平均、不合成單一區域數值。
- 最新數值按原單位（°C／%RH）顯示，獨立保留 updateTime、fetchedAt、freshness；缺資料顯示「—／無資料」而不是 0。最新 reading 無效時不能跳過它偽裝上一筆有效值為最新。

### 6.2 趨勢圖：兩張、每張四條線

1. **溫度趨勢圖**：A 區溫度 1／2、B 區溫度 1／2，共四個獨立序列。
2. **濕度趨勢圖**：A 區濕度 1／2、B 區濕度 1／2，共四個獨立序列。
3. 沿用 Stage 5.3 歷史趨勢圖的**實線、四線清晰對比、圖例 focus/hide、共用時間 Tooltip、動態軸刻度、鍵盤互動**；不引用 Stage 5.3 歷史資料或歷史計算。
4. 固定每三分鐘 `sample_slot`，資料斷缺畫 NULL gap，不能用 0／插值／connectNulls 連接。兩張圖共用相同 X 軸範圍。
5. **參考線**：溫度 26°C、濕度 40%RH，使用與資料線有視覺區隔的虛線與標籤「暫定參考上限」，非正式品質門檻；首版不使用大面積紅／綠背景，後續可選「僅參考線以上極淡紅色背景」。

### 6.3 隨時間累積的自適應 X／Y 軸（本輪新增）

> 對既有 Stage 2「X 軸可視範圍完整固定 09:00～17:00」的**顯示層**明確調整；資料收集時段、時間格與後端儲存契約均**不變**。

- **X 軸：** 起點固定 09:00。Live 依最新已收集的 sample slot，右端向上擴至下一個易讀刻度（建議 30 分鐘階梯），初期至少保留約 30 分鐘可視範圍；隨資料累積逐步擴展，最大 17:00；17:00 後固定當日完整 09:00～17:00。Demo 使用 fixture `dataDate/demoClockAt` 的相應時間情境，不能隨主機時鐘移動。
- X 軸標籤密度依容器寬度自適應（例 15／30／60 分鐘或更稀疏），**不是每 3 分鐘都印一個標籤**；圖上每個實際 3 分鐘資料格仍有其精確位置。時間軸擴展時只縮放視圖，不移動原始時間資料。
- **Y 軸：** 溫度四個點共用溫度軸、濕度四個點共用濕度軸；以**當日到目前可見的有效數值**以及 26／40 參考線共同計算自動上下界。不要固定從 0 開始；留適當上下邊距、最小顯示範圍與易讀刻度。
- 避免 Y 軸每次新值都跳動：初始合理視窗加緩衝，新有效值碰到邊界附近才擴展；已擴展的當日範圍不因細微波動反覆收縮。不可裁掉真實有效值，亦不可用過度縮放誇大微小變化。
- 0 個有效點顯示無資料，1 個只畫點，2 個及以上按正確時間連線；若時間格不連續，中途必須斷線。折線與 Tooltip 不虛構沒有收集到的值。
- 兩圖時軸同步，方便交叉比對；不同單位的 Y 軸互相獨立。日後可提供「完整工作日」檢視選項，但首版不額外增加操作控制。

### 6.4 區域環境參考判讀

- 26°C／40%RH **未獲企業正式確認為品質／警報判定門檻**；只能稱「暫定參考上限」。
- 可以顯示個別 Sensor「高於參考值」，但不可據此產生正式故障、警報、正常／合格判定；沒有讀值時呈現資料不足。
- 區域摘要需以各 Sensor 的獨立值判讀，不取四個不同量綱的平均，也不得以其中一個 Sensor 代表整個區域。

## 7. Stage 6 應準備的前端資料接口

保留既有 `FEATURE_SPEC` API 端點與核心語意，必要時僅做相容性補充：

- `GET /api/live/machines`：八台固定 ID、機台燈號狀態／activeColors、freshness、來源時間、Collector 健康；支援 A／B 獨立查看，完成 detector 讀值與時效應可供右側詳情使用。摘要可在 server 算，也可由完整標準化讀值一致地導出，但不可有重複計數。
- `GET /api/live/environment?area=A|B&metric=temperature|humidity`：四種查詢可取得總計八個獨立 Sensor 的最新值與三分鐘 samples（含 `sampleSlot`、`observed`／gapReason、source update time 與 freshness）。Stage 7 將四組查詢聚合為兩張四線圖。原始 API 資料不可混作 Excel 來源。
- `GET /api/connection-status`、`POST /api/connection-status/test`、`PUT /api/runtime-mode`：Collector／Manual Test 分離、切換 revision、無企業網路時不偽稱成功。
- Server 的 `timeContext` 可提供當日／Demo 日期與有效模擬時間；Stage 7 的**可視時間域演算法屬前端顯示層**，不需變更 sampleSlot 來源或 DB schema。
- 環境「暫定參考上限」若會跨頁使用，建議由共用設定／純計算模組一致取得（26°C／40%RH），不是分別寫在三個元件、導致文案或數值不一致。

## 8. 驗收與安全

### Stage 6（離線後端）

- Contract：三端點樣本、48 sensors、五燈、數字字串、未分群 Sensor、未知 status。
- Scheduler：Asia/Taipei 09～17、三分鐘格、啟動與模式恢復、重疊防護／安全 shutdown。
- Persist：retries、partial failure、去重、sampleSlot／sensor.updateTime 分離、缺失 NULL、只清 Live。
- Demo：一組 synthetic fixture 能供八台機台與八個環境點／多時點序列；不寫 Live DB、不自動切換、manifest clock、mode revision in-flight 防護。
- API：手動測試不影響 Collector success、新舊模式有一致的資料來源提示。
- Typecheck、Lint、相關 Unit/Integration Tests、Build、隔離的 Collector 啟停 smoke；不為這個後端階段做大量視覺截圖。

### Stage 7（使用者介面，後續另行授權）

- 六摘要分類合計 8；A/B 各四卡、各自右側詳情、完成 detector 只在詳情、柔和燈色發光與 stale 中性化。
- 環境八個獨立數值、兩張四線圖、26／40 暫定線、自適應 X/Y 軸、缺口與 no-data 畫法正確。
- 真實／Demo 來源清楚區分，鍵盤、Tooltip、focus/hide、1280/1366/1440 主要版面可讀性檢查。

### 全程限制

- 不呼叫企業 API、不部署、不 Push，直到獲得明確授權。
- 不編輯／重建真實 SQLite、不提交私人 JSON、憑證、企業 origin 或 `_reference_inputs/` 私有截圖。
- 只在獨立測試 DB 上測試寫入；不改動 Stage 5.3 的歷史公式、Excel 匯入與資料品質邏輯。
- 外部企業 API 尚未驗收就明確標「待實網授權測試」，不可稱 Live 已經通過。

## 9. 非本輪目標

- 不建立 Replay 操作頁、複雜 Demo 模式管理工具或第二套 Demo DB。
- 不開發 3D 監控場景、智慧電錶、B4 特殊進度與推算產量。
- 不依暫定溫濕度參考線發出企業正式故障／警報。
- 不在 Stage 6 實作 Stage 7 的機台／環境圖表 UI。
