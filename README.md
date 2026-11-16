# jiyin-dashboard-v2

## 1. 專案介紹與主要功能

本專案是單機版設備監控 Dashboard，提供：

- **Demo 模式**：使用內建合成資料展示完整畫面，不需要企業 API。
- **Live 監測**：在具備授權網路與正確設定時，收集機台與環境感測資料。
- **Excel 匯入與歷史分析**：匯入本機標準化 Excel，查看機台運轉與異常事件。

Windows 10/11 與 macOS 皆以原生 npm 運行為主，**不需要 Docker、WSL、Python 或 VS Code**。Stage 8A 已實際完成 Windows Clone、`npm ci` 與 `npm run dev:all` 啟動驗證。

## 2. 環境需求與首次安裝

必要環境：

- Node.js `24.15.x`
- npm `11.x`（會隨 Node.js 一起安裝）
- Git
- Windows 10/11 或 macOS
- 最新版 Chrome、Edge、Firefox 或 Safari

先開啟 Windows PowerShell 或 macOS Terminal，檢查現有版本：

```text
node -v
npm -v
git --version
```

`node -v` 應顯示 `v24.15.x`，`npm -v` 應為 `11.x`。如果版本已符合且 Git 可正常顯示版本，**不需要重新安裝**。

### Windows 安裝或升級

1. 從 [Node.js 官方 v24.15.0 下載頁](https://nodejs.org/download/release/v24.15.0/) 下載 `node-v24.15.0-x64.msi`；Windows on ARM 請使用 `node-v24.15.0-arm64.msi`。
2. 執行 MSI，保留預設元件與加入 PATH 的設定。已有舊版時可直接執行新 MSI 升級。
3. 從 [Git for Windows 官方下載頁](https://git-scm.com/download/win) 安裝或升級 Git；不確定選項時可保留預設值。
4. 關閉舊 PowerShell，重新開啟後再執行上述三個版本檢查指令。

若升級後仍顯示舊版，使用 `where.exe node`、`where.exe npm` 找出重複安裝路徑，移除不再使用的舊版後重開 PowerShell。

### macOS 安裝或升級

1. 從 [Node.js 官方 v24.15.0 下載頁](https://nodejs.org/download/release/v24.15.0/) 下載並執行 `node-v24.15.0.pkg`。已有舊版時可直接執行新 PKG 升級。
2. 從 [Git for macOS 官方下載頁](https://git-scm.com/download/mac) 安裝或升級 Git。若 macOS 提示安裝 Apple Command Line Tools，依系統提示完成即可。
3. 關閉舊 Terminal，重新開啟後再執行上述三個版本檢查指令。

若升級後仍顯示舊版，使用 `which -a node`、`which -a npm` 找出重複安裝路徑，調整 PATH 或移除舊版後重開 Terminal。

## 3. 取得專案與安裝依賴

目前 Stage 8A 位於 GitHub `dev` 分支。Windows PowerShell 與 macOS Terminal 皆可執行：

```text
git clone --branch dev https://github.com/weiiyuu/jiyin-dashboard-v2.git
cd jiyin-dashboard-v2
npm ci
```

`npm ci` 完成且沒有錯誤訊息，即表示依賴已安裝。若已 Clone 專案，可改用：

```text
git fetch origin
git switch dev
git pull --ff-only origin dev
npm ci
```

`dev` 是目前驗收分支，不代表未來一般使用者永遠必須使用 `dev`。正式版若發佈至 `main`，請改依 Repository 當時的正式分支說明 Clone。

## 4. 建立與設定 `.env.local`

所有使用者都先從公開範本建立本機設定檔。

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
```

macOS Terminal：

```bash
cp .env.example .env.local
```

`.env.local` 已被 Git 排除，是每台電腦各自管理的私人設定，**不得提交至 GitHub**。

### Demo 使用者

不需要企業 API。保留 `.env.local` 預設內容，直接進入下一節啟動平台。Collector 會安全待機，不會發出企業請求。

### Live 使用者

需要企業授權的網路環境與 IP 白名單。開啟設定檔：

Windows PowerShell：

```powershell
notepad .env.local
```

macOS Terminal：

```bash
nano .env.local
```

將企業核准的完整 HTTPS 伺服器 Origin（**含 Port、不含 API 路徑**）填入下列兩項。兩個值必須完全相同：

```dotenv
ENTERPRISE_API_ORIGIN=https://<核准伺服器>:<Port>
ENTERPRISE_API_ALLOWED_ORIGINS=https://<核准伺服器>:<Port>
```

範本已預先設定 `ENTERPRISE_TLS_MODE=allowlisted_self_signed`、`ENTERPRISE_API_AUTH_MODE=none`、`API_TIMEOUT_MS=20000` 與 `API_MAX_RESPONSE_BYTES=2097152`，Live 使用者不需要再改這四項。目前企業 API 使用 IP 白名單，不需要另外 API Key 或 Token。

`allowlisted_self_signed` **僅適用於這個經企業核准、且受 `ENTERPRISE_API_ALLOWED_ORIGINS` 精確限制的自簽憑證伺服器**，不得當成其他 HTTPS 服務的通用設定，也不要全域關閉 TLS 驗證。若企業日後提供可受信任憑證，應改用 `strict`；若提供專用 CA 檔，才使用 `custom_ca` 與 `ENTERPRISE_CA_FILE`。

儲存方式：

- Windows Notepad：按 `Ctrl+S` 後關閉視窗。
- macOS nano：按 `Ctrl+O`、`Enter` 儲存，再按 `Ctrl+X` 離開。

README、`.env.example` 與 Git 中不得寫入真實企業 IP、Port、Origin、憑證或私人資料。

## 5. 啟動平台

以下兩種方式都會同時啟動 Web 與 Collector，**不需要再開第二個終端啟動 Collector**。一次只選擇其中一種：

開發／驗收模式：

```text
npm run dev:all
```

一般使用模式（會先執行 Production Build）：

```text
npm run start:all
```

看到 Next.js 顯示 Ready 後，用瀏覽器開啟 <http://localhost:3000>。關閉瀏覽器不會停止 Collector；要停止平台，請回到啟動用的 PowerShell／Terminal 按 `Ctrl+C`，Web 與 Collector 會一起安全停止。

## 6. 驗證與常見問題

### 如何確認啟動成功

- Web：終端顯示 Next.js Ready，且 <http://localhost:3000> 可開啟。
- Demo：未設定企業 API 時，終端會顯示 Collector 未設定並安全待機；Demo 畫面仍可完整使用。
- Live：設定正確且在企業服務時段內，Collector 會啟動排程。可在「API 連線設定」頁查看設定、Collector 與三個資料服務的狀態。

### 連線問題判斷

- 顯示「本機連線設定尚未設定」：檢查 `.env.local` 的 Origin、Allowlist 與 TLS mode 是否已儲存。
- 連線逾時或沒有 HTTP 回應：通常是網路不可達、IP 白名單尚未開啟或企業服務不可用。請停止重複嘗試並聯繫企業管理者。
- TLS／憑證錯誤：檢查 `ENTERPRISE_TLS_MODE`、Origin Allowlist，以及是否使用核准的伺服器。不要繞過憑證或全域關閉 TLS 驗證。
- Live 收集只在授權網路與 Asia/Taipei `09:00–17:00` 服務時段內進行；HTTP 200 也不代表資料已寫入，請以 Collector 成功狀態為準。

### 本機環境與資料

- Windows PowerShell 回報 `npm.ps1` 無法執行時，不需要改動全機執行政策；將 `npm` 改成 `npm.cmd`，例如 `npm.cmd ci` 或 `npm.cmd run dev:all`。
- 出現 `node`、`npm` 或 `git` 無法辨識時，先重開終端。Windows 可用 `where.exe node`／`where.exe npm`，macOS 可用 `which -a node`／`which -a npm` 檢查 PATH。
- SQLite 持久儲存在本機 `data/jiyin-dashboard.sqlite`，正常停止與重新啟動不會自動清空，也不會自動與其他電腦同步。Live readings 依現有規則保留 3 天；Excel 匯入的歷史批次使用獨立版本管理。不要將 SQLite、`.env.local`、企業 Excel／JSON、Token 或憑證提交至 GitHub。
- 每個瀏覽器可獨立選擇 Demo 或 Live 畫面。切換為 Demo 只會改變該瀏覽器的顯示，不會中斷背景 Live Collector。

## 7. 選用：Docker Compose

Docker 是第二種運行方式，原生 npm 仍是 Windows／macOS 一般使用者的首選。若要使用 Docker，請先安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop/)，並確認 `docker compose version` 可正常執行。

Docker 與原生 npm 都會啟動 Collector。**切換運行方式前，必須先以 `Ctrl+C` 停止原生 npm 平台**；不可同時執行兩個 Collector 對企業 API 進行收集。

建立 Docker 專用的本機設定（此檔案已被 Git 排除）：

Windows PowerShell：

```powershell
Copy-Item .env.example .env.docker
```

macOS Terminal：

```bash
cp .env.example .env.docker
```

Demo 使用者保留空白 Origin 即可。Live 使用者依第 4 節的相同規則編輯 `.env.docker`；設定只在容器執行時傳入，不會被寫入 Image。啟動、查看狀態與 logs：

```text
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f web collector
```

完成後開啟 <http://localhost:3000>。`migrate` 會先完成 SQLite Migration，再由獨立的 `web` 與 `collector` 服務共用同一個 named volume。未設定企業 Origin 時 Collector 只會安全待機，Demo 仍可使用。

若主機的 3000 port 已被使用，可在 `.env.docker` 增加 `WEB_PORT=3190`，重新啟動後改開 <http://localhost:3190>。

停止與重新啟動：

```text
docker compose --env-file .env.docker down
docker compose --env-file .env.docker up -d
```

`down` **不會刪除** named volume，容器重建後資料仍會保留。不要執行 `docker compose down -v`。更新程式時，先完成下一節的備份，再執行：

```text
docker compose --env-file .env.docker down
git pull --ff-only origin dev
docker compose --env-file .env.docker up --build -d
```

`strict` 與精確 Allowlist 限制的 `allowlisted_self_signed` 可直接由 `.env.docker` 設定。若企業日後改用 `custom_ca`，必須以本機、已忽略的 private Compose override 將 CA 檔案 read-only 掛載至容器，並把 `ENTERPRISE_CA_FILE` 指向容器內路徑；不可將 CA 放入 Image 或 Git。

## 8. SQLite 備份與還原

備份工具使用 SQLite 的一致性備份機制，會將 WAL 中已提交的資料納入同一個可驗證的 `.sqlite` 檔案。為了避免人為選錯資料庫，建議備份與還原前都先安全停止 Web 與 Collector。備份檔位於已忽略的 `backups/`，不得提交 GitHub。

### 原生 npm

先在啟動平台的終端按 `Ctrl+C`，然後執行：

```text
npm run db:backup -- --output backups/jiyin-dashboard-backup.sqlite
```

還原前必須再次確認 Web 與 Collector 已停止：

```text
npm run db:restore -- --input backups/jiyin-dashboard-backup.sqlite --confirm-stopped
```

還原會先檢查備份完整性，並將還原前的資料庫保留為同目錄的 `.pre-restore-...sqlite` 安全副本。若發現 Collector lock 或 WAL／SHM sidecar，工具會拒絕還原；請找出仍在使用資料庫的程序，不要手動刪除這些檔案繞過保護。

### Docker named volume

以下指令只停止 Web／Collector，不刪除 volume：

```text
docker compose --env-file .env.docker stop web collector
docker compose --env-file .env.docker --profile maintenance run --rm --no-deps maintenance node --import tsx scripts/sqlite-maintenance.ts backup --output /app/backups/jiyin-dashboard-backup.sqlite
docker compose --env-file .env.docker up -d
```

備份會出現在主機的 `backups/`。還原時同樣先停止寫入服務：

```text
docker compose --env-file .env.docker stop web collector
docker compose --env-file .env.docker --profile maintenance run --rm --no-deps maintenance node --import tsx scripts/sqlite-maintenance.ts restore --input /app/backups/jiyin-dashboard-backup.sqlite --confirm-stopped
docker compose --env-file .env.docker up -d
```

若 Docker 回報 volume 權限或資料庫正在使用，請保留現狀並檢查 `docker compose --env-file .env.docker ps`；不要刪除 volume、WAL 或 lock 檔。
