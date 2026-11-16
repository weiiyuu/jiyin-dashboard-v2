# jiyin-dashboard-v2

本專案是單機版設備監控 Dashboard。Windows 10/11 與 macOS 皆以原生 npm 為主要運行方式；Docker 不是必要條件。

## 基本需求

- Node.js `24.15.x`
- npm `11.x`
- Git
- Windows 10/11 或 macOS
- 現代瀏覽器（建議使用最新版 Chrome、Edge、Firefox 或 Safari）

Docker 不是必要環境；本專案以 Windows／macOS 原生 npm 運行為主。npm 會隨 Node.js 一起安裝，不需要另外安裝 Docker、WSL、Python 或 VS Code。專案可放在含空白或中文的路徑。每台電腦會使用自己的 `data/jiyin-dashboard.sqlite`，不會跨電腦同步。

## Windows 環境準備

### 1. 檢查現有版本

開啟 PowerShell 並執行：

```powershell
node -v
npm -v
git --version
```

若三個指令都可執行，確認 `node -v` 為 `v24.15.x`、`npm -v` 為 `11.x`。Git 只要能正常顯示版本即可。

### 2. 尚未安裝

1. 前往 [Node.js 官方 v24.15.0 下載頁](https://nodejs.org/download/release/v24.15.0/)。大多數 Windows 10/11 電腦請下載 `node-v24.15.0-x64.msi`；Windows on ARM 請選擇 `node-v24.15.0-arm64.msi`。
2. 執行 MSI 安裝程式，保留預設元件與「加入 PATH」設定。npm 會一併安裝。
3. 前往 [Git for Windows 官方下載頁](https://git-scm.com/download/win)，執行安裝程式。不確定選項時可保留預設值，但要允許從命令列使用 Git。
4. 關閉所有舊的 PowerShell 視窗，重新開啟 PowerShell，再執行版本檢查。

### 3. 已安裝舊版

1. 關閉正在執行的 Node.js／npm 程序。
2. 下載並執行上述 Node.js `v24.15.0` MSI，安裝程式通常會直接升級現有版本。若重開 PowerShell 後仍顯示舊版，請從 Windows「已安裝的應用程式」移除舊 Node.js，再重新執行 MSI。
3. Git 可由 [Git for Windows 官方下載頁](https://git-scm.com/download/win) 取得新版安裝程式並直接升級。
4. 重開 PowerShell 後再次執行 `node -v`、`npm -v`、`git --version`。

### 4. Windows 常見問題

- 出現「`node`／`npm`／`git` 不是可辨識的指令」：先關閉並重開 PowerShell。仍無法使用時，執行 `where.exe node`、`where.exe npm` 和 `where.exe git` 檢查 PATH；沒有結果時請重新執行官方安裝程式，並確認加入 PATH。
- 版本仍是舊版：用 `where.exe node` 與 `where.exe npm` 確認是否有多個安裝路徑，移除不再使用的舊版後重開 PowerShell。
- PowerShell 回報 `npm.ps1` 無法執行：不需要改動全機執行政策，可將下方指令中的 `npm` 改為 `npm.cmd`，例如 `npm.cmd -v`、`npm.cmd ci` 或 `npm.cmd run dev:all`。

## macOS 環境準備

### 1. 檢查現有版本

開啟 Terminal 並執行：

```bash
node -v
npm -v
git --version
```

若三個指令都可執行，確認 `node -v` 為 `v24.15.x`、`npm -v` 為 `11.x`。Git 只要能正常顯示版本即可。

### 2. 尚未安裝

1. 前往 [Node.js 官方 v24.15.0 下載頁](https://nodejs.org/download/release/v24.15.0/)，下載並執行 `node-v24.15.0.pkg`。安裝程式會同時安裝 Node.js 與 npm。
2. 前往 [Git for macOS 官方下載頁](https://git-scm.com/download/mac)，依頁面說明安裝 Git。
3. 關閉所有舊的 Terminal 視窗，重新開啟 Terminal，再執行版本檢查。

### 3. 已安裝舊版

1. 關閉正在執行的 Node.js／npm 程序。
2. 下載並執行上述 `node-v24.15.0.pkg`，安裝後重開 Terminal。
3. Git 可由 [Git for macOS 官方下載頁](https://git-scm.com/download/mac) 取得新版安裝方式。
4. 再次執行 `node -v`、`npm -v`、`git --version` 確認升級結果。

### 4. macOS 常見問題

- Terminal 顯示 `command not found`：先關閉並重開 Terminal。仍無法使用時，執行 `command -v node`、`command -v npm` 和 `command -v git` 檢查 PATH；沒有結果時請重新執行官方安裝程式。
- 版本仍是舊版：執行 `which -a node`、`which -a npm` 和 `which -a git` 找出多個安裝路徑，調整 PATH 或移除不再使用的舊版後重開 Terminal。
- 系統首次執行 `git` 時若要求安裝 Apple Command Line Tools，可完成系統提示的安裝後再執行 `git --version`。

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

`dev` 是目前 Stage 8A 跨平台驗收分支，不代表未來一般使用者永遠必須使用 `dev`。未來正式版若發佈至 `main`，使用者可改用 `git clone --branch main ...`，或在 `main` 成為預設分支後直接使用一般 `git clone`。實際以 Repository 當時的正式分支說明為準。

## Windows PowerShell 啟動平台

確認上述環境版本後，執行：

```powershell
git clone --branch dev https://github.com/weiiyuu/jiyin-dashboard-v2.git
Set-Location jiyin-dashboard-v2
npm ci
Copy-Item .env.example .env.local
npm run dev:all
```

若 PowerShell 限制 `npm.ps1`，將上述 `npm ci` 與 `npm run dev:all` 改為 `npm.cmd ci` 與 `npm.cmd run dev:all`。

## macOS Terminal 啟動平台

確認上述環境版本後，執行：

```bash
git clone --branch dev https://github.com/weiiyuu/jiyin-dashboard-v2.git
cd jiyin-dashboard-v2
npm ci
cp .env.example .env.local
npm run dev:all
```

開發啟動完成後，保留 PowerShell／Terminal 視窗運作，並用瀏覽器開啟 <http://localhost:3000>。未設定企業 API 時，Web 與 Collector 仍可正常啟動，畫面預設使用內建 Demo，Collector 保持待機且不發出企業請求。

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
