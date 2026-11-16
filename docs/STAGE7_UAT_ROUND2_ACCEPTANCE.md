# Stage 7｜UAT Round 2 局部修正驗收

> 結論：七項局部修正已完成。驗收全程使用合成 Demo、Mock Enterprise Getter 與隔離 SQLite；未呼叫企業 API、未啟動 Collector、未寫產品資料庫。

## 1. 完成項目

1. **手動測試與服務狀態同步**：`queryConnectionStatus` 現在從既有 endpoint audit 顯示最近一輪手動測試或自動收集來源；Collector 摘要仍只查正式收集 trigger。
2. **部分測試語意**：手動測試改為 values → configs → groups 依序執行，首個失敗即停止。未執行端點保存 `attempted=0 / NOT_DUE`，UI 顯示「未測試」及前一端點失敗說明。
3. **處理中回饋**：按鈕在送出前立即切換 `busy=test`，文字為「正在測試…」、`aria-busy=true` 並停用重複提交；完成後重新讀取本機 audit。
4. **機台區塊縮短**：右側詳情改為三欄時間摘要並縮減 padding／gap；左側 2×2 卡片跟隨整區自然縮短，仍均高且與右側底邊對齊。
5. **選取框降權**：選取內框由 2px／高不透明改為 1px／低不透明；五色外框、glow、燈點與中性 unavailable 狀態不變。
6. **環境圖表**：觀測線改用 round cap／join 與 3.2px 實線；不平滑、不插值。孤立單點段保留 Marker；26°C／40%RH 改為較粗紅色虛線，標籤緊鄰 plot 右側專用留白。
7. **本機更新操作**：兩監控頁改為小型「更新畫面」，附「每 30 秒自動更新」及不會向企業 API 發送請求的 title；原 30 秒本機刷新機制未改。

## 2. Mock 與資料安全驗證

- values `TIMEOUT`：僅呼叫 values；values 顯示「連線逾時」與安全網路／白名單說明，configs/groups 顯示「未測試」。
- 三端點成功：三列皆顯示「正常」、手動測試來源及實際測試時間。
- configs 單端點 HTTP／API／Schema 錯誤：values 保持成功、configs 顯示對應錯誤、groups 未測試。
- Mock 失敗與下一輪 Mock 成功前後，`live_sensor_readings` 都是 0；Collector 摘要仍為 `NEVER_POLLED`，手動測試未冒充收集成功。
- 無 Schema migration；未修改 Enterprise Client、Collector 排程、Live／Demo 隔離或 Stage 5 功能。

## 3. 瀏覽器驗收

- 六張 `_reference_inputs/stage7_uat_round2/` 截圖均已實際開啟比對，且維持 Git ignore。
- 1280px DOM：A／B 區 grid 與 detail 底邊差均為 `0px`；四卡各高 `186.90px`，整區 `417.80px`。Round 1 驗收卡高約 `283px`，本輪減少約 `96px`。
- 1280px 圖表：兩張圖常態 Marker 0；12 個真實斷線段；警示線 `#ff777d / 2.6px / 9 6 dash`，標籤為 `26°C`、`40%RH` 並緊鄰 plot。
- 圖面任意位置操作可吸附 13:00 最近時間格，Tooltip 一次顯示四測點原始值與來源時間，Hover 暫時顯示 4 個 Marker。
- 1280px 與窄版 in-app browser 頁面 overflow 為 0；Chrome Headless 另檢視 1366、1440、760px，未見文字裁切、頁面級水平溢位或選取框壓過燈色。
- 驗收截圖保留於本機 `/private/tmp/stage7-r2-*.png`，只含合成 Demo，不納入 Git。

## 4. 自動檢查與待人工確認

- 相關回歸：Stage 6／7 三個測試檔共 32 tests passed。
- Typecheck、Lint、Production Build：passed。
- 待人工確認：目標螢幕上的機台卡密度、紅色警示線強度及小型更新操作的主觀偏好。
- 真實企業 API、白名單、真實 Live 多輪 Collector 仍未驗收；本輪沒有嘗試。

本輪 Commit Hash 於最終交付回報。
