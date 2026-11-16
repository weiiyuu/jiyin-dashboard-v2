# Stage 8｜GitHub Clone 後跨平台本機運行與交付（修正版 V2）

> 專案：`jiyin-dashboard-v2`。此文件**取代前版** `STAGE8_IMPLEMENTATION_PLAN.md` 的優先順序：**npm 原生安裝為必要且首選，Docker 為可選方案**。任何指令均為目標介面，須檢查實際 repo 後才宣稱已實作。
>
> 背景：Stage 6／7 已驗證企業 API → Collector → SQLite → Live。現有真實 Collector 可能仍在本機運行，開發測試不得碰它。

## 1. 最終交付目標

1. 使用者在 Windows 10/11 或 macOS 上 **clone GitHub 專案 → 按 README 安裝相容 Node.js/npm → `npm ci` → 本機啟動 → 瀏覽 `localhost`**。**不需要 Docker、WSL 或企業 API 憑證即可使用合成 Demo 與歷史 Excel 功能**。
2. **原生 npm 有開發與一般使用兩種啟動入口**：建議目標 `npm run dev:all`（開發）及 `npm run start:all`（先完成必要 build 後的日常執行）；兩者一鍵管理 Web + Collector，保留原有 `npm run dev` 和 `npm run collector:start` 單獨啟動供排錯。具體命名以合理現有 scripts 為準。關閉瀏覽器不影響已啟動的 Collector；關閉終端機通常會停止 npm 啟動的兩個程序，README 必須說清楚，不承諾開機自啟。
3. **Docker Compose 是選用的第二條路徑**，提供一鍵 Web + Collector、持久化 SQLite、容器停止／重啟；不能作為 Windows 正常使用的必備條件。
4. 每台使用者電腦有**各自獨立的 SQLite**，歷史／Live 使用既有分表；不承諾跨電腦同步。GitHub 不含公司私有資料或你本機正在收集的 Live SQLite。
5. Demo 使用內建 **read-only 合成 fixture**，未設定企業 Origin 時也可以啟動，不作真實 API 請求、不顯示虛假的 Live 成功。觀看 Demo **不得停止**背景真實 Live Collector；顯示來源和 Collector 的收集開關／狀態必須解耦。
6. Web 預設僅供本機 `localhost` 訪問；不加入多人共用伺服器、登入／權限、跨機同步、installer。Docker 不能繞過任何企業 API 白名單。

## 2. Stage 8A（下一輪）：npm 跨平台原生運行優先

### A. Windows/macOS 可攜性

- 檢查實際 `package.json`、lockfile、Node 版本、`node:sqlite`、tsx、Next standalone／build、`.env` 載入、相對檔案路徑、路徑含空白／中文、目錄建立、程序啟停與 CLI 指令。
- 以 repo 已驗證的 **Node 24 相容版本**為單一建議，使用 `.nvmrc`、`engines` 和 README 說明；不要籠統說「任意 Node 版本都行」。
- 所有 npm scripts 同時相容 Windows PowerShell/cmd 與 macOS shell：不得要求 Bash、`export`、`rm -rf`、`cp`、`pkill`、Unix 路徑或 WSL；必要時用小型 Node 腳本實作跨平台控制。
- 提供 npm 一鍵啟動 Web + Collector，停止時兩者正常退出；避免重複 Collector，既有單獨啟動指令保留。
- 新 clone 的本機資料目錄應可安全初始化 SQLite／migration；Demo 無企業設定也能使用；環境檔從非機密範本建立且依 OS 提供指令，不包含私有 Origin/Token。
- 不引入重量級執行框架，不要求 Docker；不得把測試資料庫當真實資料庫。

### B. Demo 顯示與背景收集解耦

- 現有全域 runtime mode 與 `mode_revision` 需先確認實際用途。將「瀏覽器顯示 Demo／Live」改成**使用者／瀏覽器的顯示偏好**，不能讓切換 Demo 改動全域 Collector 的收集狀態。
- Collector 繼續獨立依安全設定、09:00–17:00 Asia/Taipei、三分鐘排程收集；保留 compare-before-write、防重複與 in-flight 安全防護，不可直接刪除 mode guard。
- 用隔離 SQLite + Mock 驗證：兩個瀏覽器各看 Demo／Live，Collector 仍寫入 Live；Demo 永遠不寫 readings；未配置企業 API 的全新 clone 不會對外發送請求。

### C. Stage 8A 驗收與停止點

- Mac 原生 npm：clean-install／build／啟動／停止、SQLite migration、Demo、兩程序生命週期通過。
- Windows：若可在隔離 Windows 環境實際執行則驗證 PowerShell clean clone；若沒有 Windows 實機或 VM，標記**尚待實機驗收**，不可宣稱已通過。
- 只跑跨平台啟動、隔離模式、DB 安全相關測試，及必要 Typecheck/Lint/Build／一次瀏覽器 smoke；不得重跑 Stage 0–7 大型測試。
- 現有真實 Collector／SQLite／`.env.local` 一律不碰；不發送真實企業 API；不 Push／部署。結束簡短回報，待人工確認再做 8B。

## 3. Stage 8B：可選 Docker＋README／跨平台正式交付

- 沿用現有 Compose 雛形；Docker 保持**可選**，驗證 Web + Collector、同一持久化 SQLite、health、graceful stop、重啟資料保留；不得用 `docker compose down -v` 刪除真實資料。
- README 必須以**Windows PowerShell 原生 npm**及 **macOS 原生 npm**作為主要 Quick Start，列出 Git／Node 安裝、`git clone`、`npm ci`、安全環境檔建立、Demo 啟動、停止／重啟、埠衝突與缺少 Node 等 FAQ。再提供 production npm 方式和**選用** Docker 步驟。
- 標準使用者不需要知道如何手動啟動 Collector；README 應明確區分 `dev:all`、日常 `start:all`、單獨排錯指令與關閉終端機後的行為。
- 真正的 Windows PowerShell 安裝、啟動、瀏覽器操作必須有 Windows 環境驗證；Mac 測通不等於 Windows 測通。若未取得測試機器，標明交付限制與可交給朋友照 README 驗收的清單。
- 備份／還原在原生 SQLite 和 Docker Volume 各有清楚操作說明及隔離驗證；不可將資料庫和原始企業 Excel/JSON 上傳 Git。
- 發佈前檢查 `git ls-files` 與歷史 commit 是否洩漏企業 Origin／Token、`.env.local`、私有 Excel/JSON、SQLite、備份、截圖與 logs；Push 仍須使用者明確授權。
- 如需將現有持續收集資料由 npm 切至 Docker，必須另行申請授權、先備份並確保同時間**只有一個 Collector**。不要在一般 8B Smoke Test 碰正在使用的真實 DB。

## 4. Stage 8 完成定義／後續

**完成定義**：乾淨 clone 的 Windows 與 Mac 使用者不安裝 Docker 也能依 README 使用 Demo／歷史頁；原生 npm 統一啟動 Web／Collector 正常；可選 Docker 能運行；Demo 切換不影響背景收集；SQLite 持久化／備份安全；真實 API 僅在授權且具網路權限的電腦上可用。沒有實測的 OS 必須明確標註未驗收。

**可延後**：異常事件分析 V2、長期 Live 歷史趨勢、多人遠端共用、登入權限、通知、原生安裝程式／真正 OS 開機自啟。

## 5. Token 節約與操作界線

僅閱讀 `AGENTS.md`、本檔、啟動腳本／mode／DB 相關程式；沿用既有架構。先做 8A，8B 不提前執行。僅執行聚焦測試，避免大量截圖及冗長報告。對目前真實 Collector 不停止、不重啟、不切 mode、不改 DB、不改 `.env.local`、不發出真實 API 請求、不 Push、不部署。
