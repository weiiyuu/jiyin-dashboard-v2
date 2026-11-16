# jiyin-dashboard-v2

本專案是單機版設備監控 Dashboard。Windows 10/11 與 macOS 皆以原生 npm 為主要運行方式；Docker 不是必要條件。

## 基本需求

- Node.js `24.15.x`
- npm `11.x`
- Git
- Windows 10/11 或 macOS
- 現代瀏覽器（建議使用最新版 Chrome、Edge、Firefox 或 Safari）

Docker 不是必要環境；本專案以 Windows／macOS 原生 npm 運行為主。專案可放在含空白或中文的路徑。每台電腦會使用自己的 `data/jiyin-dashboard.sqlite`，不會跨電腦同步。

## 安裝 Node.js 與 Git

1. 從 [Node.js 官方 v24.15.0 下載頁](https://nodejs.org/download/release/v24.15.0/) 安裝對應平台版本：Windows 可使用 `node-v24.15.0-x64.msi`，macOS 可使用 `node-v24.15.0.pkg`。本專案需要 Node.js `24.15.x`，不要直接改用其他主版本。
2. npm 會隨 Node.js 一起安裝，不需要另外下載。
3. 從 [Git 官方下載頁](https://git-scm.com/downloads/) 安裝 Windows 或 macOS 版 Git。
4. 安裝完成後關閉並重新開啟 PowerShell 或 Terminal，再執行下列檢查。

Windows PowerShell：

```powershell
node -v
npm -v
git --version
```

macOS Terminal：

```bash
node -v
npm -v
git --version
```

`node -v` 應顯示 `v24.15.x`，`npm -v` 應為 `11.x`。若 Windows PowerShell 因 `npm.ps1` 執行原則而無法執行 npm，不需要改動全機安全政策；可將指令中的 `npm` 改為 `npm.cmd`，例如 `npm.cmd ci` 或 `npm.cmd run dev:all`。

## Stage 8A 測試分支

目前最新 Stage 8A 位於 GitHub `dev` 分支。本輪 Windows／macOS 驗收請 Clone `dev`：

```text
git clone --branch dev https://github.com/weiiyuu/jiyin-dashboard-v2.git
```

若已 Clone 專案，可切換並更新 `dev`：

```text
git fetch origin
git switch dev
git pull --ff-only origin dev
```

`dev` 是目前 Stage 8A 跨平台驗收分支，不代表未來一般使用者永遠必須使用 `dev`。正式版本發佈後，應以 Repository 當時的預設／正式分支說明為準。

## Windows PowerShell

```powershell
git clone --branch dev https://github.com/weiiyuu/jiyin-dashboard-v2.git
Set-Location jiyin-dashboard-v2
npm ci
Copy-Item .env.example .env.local
npm run dev:all
```

## macOS

```bash
git clone --branch dev https://github.com/weiiyuu/jiyin-dashboard-v2.git
cd jiyin-dashboard-v2
npm ci
cp .env.example .env.local
npm run dev:all
```

開啟 <http://localhost:3000>。未設定企業 API 時，Web 與 Collector 仍可正常啟動，畫面預設使用內建 Demo，Collector 保持待機且不發出企業請求。

## 一般使用模式

```text
npm run start:all
```

`start:all` 會先執行 Production Build，然後用同一份 SQLite 啟動 Web 與 Collector。關閉瀏覽器不會停止 Collector；在啟動終端按 `Ctrl+C` 會安全停止兩個程序。這是終端程序管理，不是 OS 開機自啟或永久背景服務。

供排錯使用的單獨指令：

- `npm run dev`：只啟動開發用 Web。
- `npm run start`：只啟動已 Build 的 Web。
- `npm run collector:start`：只啟動 Collector；資料庫必須先由 Web 或統一啟動器完成 migration。

## Live 設定

只有具備合法企業 API 網路與授權時，才將真實設定寫入本機、已被 Git 排除的 `.env.local`。請依 `.env.example` 內的註解設定 Origin、allowlist、TLS 與認證。不要提交 `.env.local`、CA、Token 或 SQLite。

每個瀏覽器可獨立選擇 Demo 或 Live 畫面。切換為 Demo 只會改變該瀏覽器的顯示偏好，不會停止已設定的背景 Live Collector。

> Windows 實機驗收尚待進行；目前指令、路徑處理與程序管理已使用無 shell 依賴的 Node.js 實作。
