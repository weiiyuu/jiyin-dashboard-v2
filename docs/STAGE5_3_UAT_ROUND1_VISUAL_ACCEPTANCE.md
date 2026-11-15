# Stage 5.3 UAT Round 1 視覺實作驗收

- 日期：2026-11-15
- 分支：`dev`
- 主要實作 Commit：`ce603c8`
- 主要規格：`STAGE5_3_UAT_ROUND1_VISUAL_FINAL_APPROVED_SPEC.md` V2.0
- 結論：**程式實作、自動測試與合成資料瀏覽器驗證完成；使用者人工視覺 UAT 待確認。**

## 範圍與依據

本輪只修正「機台運轉分析」六張圖、頁面文字層級、局部互動與合成瀏覽器 fixture。未修改歷史統計公式、品質資格、Active Batch 查詢、SQLite schema、Excel 匯入、異常事件頁或實時模組。

已實際開啟 `_reference_inputs/stage5_3/` 的 9 張示意圖，逐圖與 V2.0 對照。差異基線見 `STAGE5_3_UAT_ROUND1_VISUAL_GAP_CHECK.md`。參考圖僅作唯讀視覺依據，未加入 Git。

## 完成實作

### 區間分析

- **R1 累積加工時數排行**：改為共用零起點動態小時尺度的實心水平 Bar，取消深色滿版進度槽與百分比排行。末端值使用 `X 小時 Y 分`、`Y 分`、`不足 1 分`，有效 0 顯示 `0 分`，缺資料顯示`資料不足`。
- **R2 機台運轉趨勢圖**：保留真實 48/24 桶，單日主刻度為 00:00、03:00…21:00 及 24:00 邊界；多日使用簡短日期。新增鼠標／鍵盤共用 Tooltip、全時段、每序列時數與 coverage；同值折線不 jitter，透過圖例聚焦與隱藏單獨檢視。
- **R3 各機台／整體燈號時間占比**：分機台改為同一全寬圖中 N 條 100% 堆疊條；整體模式改為同一寬度的 1 條。單一圖例固定為「加工」、「待機／完成」、「異常／故障」；窄區段不硬塞文字，詳細值由 Tooltip 提供。

### 同期比較

- **C1 同期加工時數比較**：每台 A/B 並列實心 Bar 共用同一小時尺度，右側顯示 A→B 易讀時分。月比較排行單位為「平均每日加工時數」，一般標籤使用`／日`。
- **C2 機台運轉趨勢比較**：固定兩條 A/B 折線，日比較 24 相對小時、週比較第 1–7 日、月比較第 1–31 日稀疏刻度。整體／單機切換位於圖內工具列，Tooltip 顯示 A/B 實際日期。
- **C3 燈號時間占比比較**：整體模式顯示 A/B 兩條全寬堆疊條；各機台模式依機台分組，A/B 相鄰。百分點差異使用後端值，未在前端重算分母。

### 共用視覺能力

- `niceHourScale` 從 0 開始，依實際最大值產生可讀的整齊間距與 4–6 主區間，不照抄示意圖刻度。
- 時分格式只用於顯示，不回寫、截斷或修改後端精度。
- coverage 改為簡潔可展開狀態，不再用大型指標方塊壓縮圖表。
- 六張圖維持正式頁面名稱、專屬副標、分析模式標籤與每卡 24px 父層間距。

## D01–D10 修正對照

| ID | 結果 | 證據 |
|---|---|---|
| D01 | 完成：R1 使用實心 Bar，A2 24 小時可清楚識別 | `history-widgets.tsx`、VF-02 截圖 |
| D02 | 完成：不以百分比代替小時，時分標籤無多餘小數 | `chart-ui-model.ts`、`stage53-visual-v2.test.tsx` |
| D03 | 完成：單日簡短時間刻度，完整日期放在副標與 Tooltip | VF-02/VF-03 |
| D04 | 完成：不改值地重疊，共用 Tooltip 可同時讀取 A1/A4，圖例可聚焦／隱藏 | VF-02/VF-11 |
| D05 | 完成：真實鼠標與鍵盤 Tooltip，不依賴 SVG `<title>` | component 測試、Chrome focus 實測 |
| D06 | 完成：R3 分機台為單圖 N 條 | VF-02/VF-04 |
| D07 | 完成：R3 整體條使用全寬 | VF-05 |
| D08 | 完成：標題、座標、圖例、副標依 V2.0 重建 | 差異核對與全部截圖 |
| D09 | 完成：C1/C2/C3 全面對齊 A/B 分組、切換與百分點 | VF-07–VF-10 |
| D10 | 完成：提供真實 Chrome 截圖與 DOM 實測；本文不宣稱人工 UAT 通過 | 本驗收文件 |

## VF-01–VF-12

| ID | 結果 | 實測重點 |
|---|---|---|
| VF-01 | 通過 | 未選機台時查詢停用，三張全寬卡正確空狀態，無假 0。 |
| VF-02 | 通過 | 2025/06/01 A1/A2/A4；R1 為 24 小時/0/0；R2 48 鍵盤 Tooltip 區，共用 Tooltip 同讀 A1/A4；R3 單圖 3 條。 |
| VF-03 | 通過 | 60 分鐘改為 24 個 Tooltip 區/72 點；排行與三態 aria 值與 30 分鐘完全一致。 |
| VF-04 | 通過 | 06/01–06/05 A1/A2/B4，每台 5 點，短日期軸與完整起迄副標正確。 |
| VF-05 | 通過 | 分機台 3 條→整體 1 條，全頁選擇保持 3 台，無重查其他圖。 |
| VF-06 | 通過（合成資料） | A1/A4 有效 Green=0 與全黃皆正確；A3 缺機台顯示`資料不足`與`無可計算的開機時間`，假堆疊區段數為 0。 |
| VF-07 | 通過 | 日對日 C1 每台 A/B 兩條、C2 24 相對時點、C3 整體 A/B 兩條，實際日期可讀。 |
| VF-08 | 通過 | 週對週軸為第 1–7 日，C1 分組排行、C3 各機台 A/B 相鄰。 |
| VF-09 | 通過 | 2025-02 vs 2025-03；C1 顯示`平均每日加工時數`與時分／日，C2 31 位置與月日刻度，2 月不存在日未補 0。 |
| VF-10 | 通過 | C1 高亮後全頁仍 3 台，C2 整體→單機與 C3 整體→各機台互不干擾。 |
| VF-11 | 通過（合成資料） | A1/A4 全天同值 0；共用 Tooltip 同時列兩序列，圖例 focus 使 2 組線淡化，hide 後 1 圖例 muted，選機仍為 3。 |
| VF-12 | 通過（合成 Chrome） | 1280/1366/1440px，device scale factor 1；兩模式均 `scrollWidth === clientWidth`，所有圖表 `chartOverflow=false`。 |

## H01–H20 回歸

原 Stage 5.3 H01–H20 的統計、品質、Active Batch 及局部互動規則並未改寫。本輪完整執行 98 個測試案例：97 通過，1 個需私有 workbook 的 opt-in 測試依規格跳過。

| 群組 | 覆蓋 H | 結果與證據 |
|---|---|---|
| 空選擇、30/60、缺日、局部互動、模式重置 | H01–H07 | 自動測試通過；Chrome 再驗證 48→24 桶、數值不變、圖例與占比切換。 |
| 日／週／月比較、未完整月、三態比較 | H08–H12 | `history-service.test.ts` 與 Chrome 日週月實測通過；月期望區間仍依實際機台數。 |
| 有效 0、NULL、零分母、嚴重不完整、部分 coverage | H13–H17 | 統計／歷史整合回歸通過；Chrome 缺機台狀態無假 0 或假 100% 條。 |
| 零基期、Active Batch 替換回復、桌面響應式 | H18–H20 | 後端差值／版本 route 測試持續通過；1280/1366/1440 Chrome DOM 無溢位。 |

## 測試與建置

| 命令 | 實際結果 |
|---|---|
| `npm run typecheck` | 通過 |
| `npm run lint` | 通過，0 warning/error |
| `npm test` | 13 個測試檔通過，1 個 opt-in 檔跳過；97 passed / 1 skipped |
| `npm run build` | Next.js 16.4.6 Webpack production build 通過，18 個 route 成功建置 |
| `node scripts/stage53-browser-acceptance.mjs` | 真實 headless Google Chrome，localhost production build，合成 SQLite；VF-01–VF-12 的 DOM／互動／截圖檢核通過 |

`next start` 仍顯示既有 `output: standalone` 警告；本次本機伺服與瀏覽器流程實際成功。正式 standalone/Docker production 部署仍屬後續授權範圍。

## Chrome 截圖證據

- [未選機台空狀態](evidence/stage5_3_uat_v2/01-empty-1366.png)
- [區間 30 分鐘與重疊共用 Tooltip](evidence/stage5_3_uat_v2/02-range-30-overlap-tooltip-1366.png)
- [區間 60 分鐘](evidence/stage5_3_uat_v2/03-range-60-1366.png)
- [缺機台與 MISSING_DATA](evidence/stage5_3_uat_v2/03b-range-missing-machine-1366.png)
- [多日區間、整體占比（1280px）](evidence/stage5_3_uat_v2/04-range-multi-total-1280.png)
- [多日區間、整體占比（1366px）](evidence/stage5_3_uat_v2/04-range-multi-total-1366.png)
- [多日區間、整體占比（1440px）](evidence/stage5_3_uat_v2/04-range-multi-total-1440.png)
- [日對日整體比較](evidence/stage5_3_uat_v2/05-compare-day-overall-1366.png)
- [日對日單機趨勢與各機台占比](evidence/stage5_3_uat_v2/06-compare-day-single-machine-share-1366.png)
- [週對週](evidence/stage5_3_uat_v2/07-compare-week-1366.png)
- [月對月](evidence/stage5_3_uat_v2/08-compare-month-1366.png)

## 資料安全與未完成項目

- 瀏覽器資料庫為 `/private/tmp` 的公開合成 fixture；未讀寫真實 SQLite，未呼叫企業 API。
- 合成 T02 只驗證「A2 全天加工、A1/A4 有效 0/全黃」的視覺形狀。使用者本機真實 2025/06/01 的最終數值與美感仍需人工唯讀確認，本文不宣稱真實資料 UAT 已通過。
- 私有 workbook opt-in 測試未執行；不影響公開 fixture 主要測試。
- 仍待使用者人工確認六張圖的字體、色彩、視覺密度與示意圖符合主觀期待。
- 未 Push、未部署、未開始 Stage 6/7。
