# Stage 7｜UAT 第一輪 UI／UX 精修驗收

> 結論：九張交接圖所指向的 Stage 7 視覺與資訊層級問題已完成修正。合成 Demo、隔離 SQLite、自動測試、Production Build 與 1280／1366／1440／760px 真實瀏覽器檢查均通過；真實企業 Live Collector 仍不在本輪驗收範圍。

## 1. 九張參考圖對照

本輪已實際開啟 `_reference_inputs/stage7_uat_round1/` 全部九張圖片，該目錄維持忽略與唯讀：

| 參考圖 | 修正結果 |
|---|---|
| `00_reference_threshold_band.png` | 只採用門檻線／淡色上方區域的視覺概念；文案依最新決策改為正式 `26°C`、`40%RH`，不沿用「暫定」。 |
| `01_machine_card_border.png` | 五種有效燈色改為高對比 2px 邊框、柔和外發光及燈點；STALE／UNKNOWN／NO_DATA／OTHER 保持中性且不發光。 |
| `02_machine_area_detail.png` | A／B 各四卡以 2×2 均分撐滿左欄，與精簡後詳情面板等高；移除 parse/raw 等工程欄位與重複環境小卡。 |
| `03_environment_sensor_cards.png` | 八卡統一為「溫度／濕度監測器 1／2」、門檻狀態、值與單位；時間移到區域抬頭。 |
| `04_temperature_chart.png` | 移除重複標題與密集常駐點，保留四條乾淨實線、26°C 虛線與右側專用標籤。 |
| `05_humidity_chart.png` | 同步套用乾淨實線與最近時間格 Tooltip，門檻標籤改為 40%RH。 |
| `06_api_settings_demo.png` | 移除切換成功通知；Demo 文案改為一般使用者可理解的資料來源說明。 |
| `07_api_settings_live.png` | Live 文案明確說明只顯示本機已收集資料，連線失敗不自動切換 Demo。 |
| `08_api_endpoints_table.png` | 端點表精簡為「資料來源／目前狀態／最近檢查／訊息」四欄並使用中文服務名稱。 |

## 2. 實作結果

- 機台卡與詳情：`src/app/monitoring/machines/page.tsx`、`src/app/globals.css`
  - 卡片只保留機台 ID、可靠名稱、燈號、最後回報及必要的缺漏提示。
  - 詳情只保留目前狀態、來源更新、平台取得及加工完成 ON／OFF／無資料；未推算產量或故障原因。
  - A／B 選取仍相互獨立，區域抬頭保留簡短環境警示並連到完整環境頁。
- 環境卡與狀態：`src/app/monitoring/environment/page.tsx`、`src/features/live/live-ui-model.ts`
  - Fresh 且有效值 `<=` 門檻為正常，`>` 為超過警示值；有效 0 不當缺資料。
  - STALE、NO_DATA、無法解析分別顯示資料逾時、尚無資料、無法判讀。
  - 區域時間取四測點中最新來源／平台時間，不暗示同步更新。
- 趨勢圖：`src/components/live-environment-chart.tsx`
  - 0 點顯示空狀態；單點顯示一個 Marker；兩點以上只畫實線，沒有常駐 Marker。
  - 繪圖區有整面命中層，可直接吸附最近有效三分鐘格；Hover 暫時突出同時間格可見序列並顯示數值、時間、來源。
  - 隱藏／聚焦圖例、鍵盤逐點焦點、動態 X／Y 軸、NULL／非連續 slot 斷線及刷新後互動狀態均保留。
- API 設定：`src/app/settings/api/page.tsx`
  - 改為資料來源、自動資料收集、手動連線測試、三項服務狀態四個使用者任務區塊。
  - 失敗仍保留安全錯誤提示；本輪未點擊手動連線測試，也未觸發任何企業 API。
- Live 查詢相容性：`src/server/live/live-query.ts`
  - 僅補回既有前端契約已宣告的環境 `fetchedAt`，供區域平台取得時間使用；無 Schema／Collector／統計語意變更。

## 3. 自動測試與瀏覽器結果

- 針對性回歸：Stage 6／7 共 29 tests passed；新增門檻邊界、有效 0、STALE／NO_DATA／UNREADABLE、最近有效 slot、單點／多點 Marker 規則。
- Typecheck、Lint：passed，0 warning／error。
- 完整 Vitest：16 files passed、127 tests passed；1 個 opt-in 私人 Excel suite skipped。
- Production Build：`next build --webpack` passed；Stage 7 三頁與既有 routes 全部列入輸出。
- 1366px 機台頁：A／B 左右底邊差均為 `0px`；四卡高度各區完全一致；頁面水平 overflow `0px`。
- A／B 獨立選取：A2 切換後 `aria-pressed=true`，B1 仍為 `true`。
- 環境頁：八張卡狀態及紅／綠邊框符合 26°C／40%RH；兩圖常態可見 Marker 均為 `0`，兩圖各有 634 個透明鍵盤目標但不形成視覺點海。
- Tooltip：在圖面中央移動可吸附 `13:00`，一次顯示四個序列的值與來源時間；Hover Marker 為 4。鍵盤焦點同樣顯示 Tooltip。
- 圖例：隱藏一條溫度線後重新讀取本機資料，`aria-pressed=false` 維持。
- 1280／1366／1440px：機台、環境、API 三頁皆無頁面或 main 水平溢位；桌面機台左右底邊差均為 0px。
- 760px：三頁無頁面水平溢位；機台欄依規格解除強制等高並堆疊，圖表／表格使用內部捲動。
- 瀏覽器 console：0 warning／error。

主要 1366px 畫面已在本輪真實瀏覽器中擷取並逐圖檢查：機台全頁、環境八卡與兩圖、API 精簡頁。畫面只含公開合成 Demo；未將交接私圖或瀏覽器暫存證據加入 Git。

## 4. 尚待人工確認／後續 Live 驗收

- 使用者主觀確認五色發光強度、卡片高度密度與字級是否符合目標螢幕偏好。
- 目標 Mac 上實際操作 Live／Demo 原生確認對話框；本輪未切換模式，以免修改既有狀態。
- 企業服務時段內至少兩輪受監督真實 Collector 收集、真實 stale／partial failure／retention 與容器 TLS／網路仍維持 Stage 6 後續驗收項目。

## 5. 安全與版本

- 使用 `/private/tmp/jiyin-stage7-uat1.sqlite`，沒有修改或重建產品 SQLite／Docker Volume。
- 未呼叫企業 API、未啟動真實 Collector、未 Push／部署、未修改 Stage 5 核心，也未開始 Stage 8。
- `_reference_inputs/` 未加入 Git；本輪 Commit Hash 以最終交付回報為準。
