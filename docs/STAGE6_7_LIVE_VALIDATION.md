# Stage 6／7｜真實企業 API 與 Live Collector 驗證

> 驗證時間：2026-11-16 11:52–11:57（Asia/Taipei）。本次只使用既有 values、configs、groups GET，並使用本機忽略的暫存 SQLite；沒有寫入專案正式／歷史資料庫，也沒有保存或輸出 Origin、憑證或原始回應。

## A. 手動企業 API 測試

- 在允許時段由 Stage 7 API 設定頁只觸發一次「測試連線」。
- values、configs、groups 均為 HTTP 200、`responseCode="00"`、既有 schema 驗證成功，每項只嘗試 1 次。
- 結構數量與契約相符：48 個 values／configs Sensor、5 個 groups、47 筆 group assignment。
- 手動測試後 `live_sensor_readings=0`、Collector 成功次數為 0；手動測試沒有被當成收集成功。
- 頁面三個端點均显示「正常」、同一實際檢查時間及「手動測試」來源。

## B. 受監督 Collector

| Poll | Trigger | sample slot | 結果 | 寫入 |
|---|---|---|---|---:|
| 1 | STARTUP | 11:54 | SUCCESS | 48 readings |
| 2 | SCHEDULED | 11:57 | SUCCESS | 48 readings |

- 兩輪共 96 readings、48 個獨立 Sensor，Sensor 集合完全一致，沒有本輪缺漏。
- 第一輪在 metadata due 時取得 values／configs／groups；第二輪只取得 values，configs／groups 正確記為 `NOT_DUE`。
- 48 個 Sensor 的第二輪 `updateTime` 都與第一輪不同；兩輪各有獨立 `fetchedAt`，sample slot 分別固定在 11:54 與 11:57。
- catalog 共 48：24 MAPPED（8 lamp、8 completion detector、8 analog），24 依契約保留為 OUT_OF_SCOPE／Unmapped；沒有以名稱或相似 ID 猜測 mapping。
- 兩輪均為完整 SUCCESS，本次未發生部分失敗、Sensor 缺漏或來源更新時間重複。
- 第二輪完成後立即透過 SIGINT graceful shutdown，沒有留下長時間收集。

## C. Live 頁面

- 機台監控：顯示 8 台機台的真實新鮮燈號、來源更新時間與平台取得時間，並保留紅燈不等於已證實故障的語意。
- 環境監測：A／B 區合計 8 個真實溫濕度測點均有效，趨勢圖可取得兩個三分鐘時間格；沒有使用 Demo、補 0 或插值。
- API 設定：Collector 顯示正常、最近成功收集及最新現場資料時間。

## D. 本次發現與最小修正

1. `npm run collector:start` 原本不會像 Next.js 自動載入 `.env.local`，第一次受控啟動因 `CONFIG` 失敗且 0 readings。啟動 script 改用 Node 24 `--env-file-if-exists=.env.local`；容器無此檔時仍使用外部環境變數。
2. 每三分鐘 values-only poll 的 metadata `NOT_DUE` 會蓋掉 configs／groups 上一次實際成功狀態。查詢改為忽略一般 `NOT_DUE`，但仍保留手動測試中 `PREVIOUS_ENDPOINT_FAILED` 的「未測試」語意。
3. 真實 completion detector 是 `ON/OFF` 字串，現有 numeric parser 使頁面顯示無資料。已新增只適用 detector 的可追溯解析 `ON→1、OFF→0`，原文仍保留，其他值仍降級為未知；不推算產量。Live query 也兼容本次修正前已保存的 ON／OFF 原文。

修正後 Stage 6／7 相關 32 tests、Typecheck、Lint、Production Build 與 `git diff --check` 均通過，未重跑無關的大型測試。使用已保存資料以 11:58 時點重查，8 個 detector 全部為 OFF、UNKNOWN=0；API 頁也正確保留 configs／groups 最近一次實際成功狀態。這些重查沒有再次發出企業請求。
