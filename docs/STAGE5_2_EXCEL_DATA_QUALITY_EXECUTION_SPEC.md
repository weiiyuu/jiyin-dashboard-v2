# Stage 5.2｜Excel 資料品質、NULL 接納與低人工介入匯入 — Codex 正式執行守則

> **任務類型：** 已完成規則討論後的實作授權；沿用 Stage 5.1，**不是重做 Excel 格式或儀表板**。
>
> **專案：** `jiyin-dashboard-v2`（Next.js / TypeScript / SQLite / 本機部署）；在既有 `dev` 分支續作。
>
> **最優先目標：** 讓合法結構、可識別來源的歷史 Excel，即使含部分欄位 NULL 或品質不完整，也能低人工介入地入庫；不可藉此偽造數值、污染正式統計或破壞已匯入資料。
> **範圍：** Excel 六表契約、Parser / Validation、SQLite 版本化 migration、匯入交易、品質與統計資格、品質摘要與必要的匯入頁提示；**不重設歷史／異常圖表、不做 Stage 6–7、不得呼叫企業 API 或 Push。**

## 0. 請先閱讀的專案文件與程式碼

1. `PROJECT_BRIEF.md`
2. `docs/DATA_CONTRACT.md`、`docs/DATABASE_DESIGN.md`、`docs/FEATURE_SPEC.md`、`docs/ARCHITECTURE.md`、`docs/IMPLEMENTATION_PLAN.md`（實際檔名／位置以 repo 為準，注意歷史的核准版與已修訂文件）
3. `docs/STAGE5_1_ACCEPTANCE.md`、`docs/BUILD_LOG.md`，以及目前 schema migration、repositories、Parser、Preview/Confirm、quality eligibility 和歷史查詢 API 的**真實程式碼**
4. 本文件；有條件才參考先前五日 Excel 審計資料。**不要假設聊天中上傳給 ChatGPT 的私人 Excel，Codex 在 Mac 上就有權存取。**

優先稽核檔案（路徑依現況）：`src/server/import/workbook-parser.ts`、`src/server/import/xlsx-preflight.ts`、`src/app/api/import/preview/route.ts`、`src/server/statistics/history-service.ts`、`src/app/imports/page.tsx`、`tests/import.test.ts`、`tests/stage5-route-flow.test.ts`、既有 migration 和資料列 eligibility 計算。先確認哪些欄位已為 nullable，避免重複修改。

## 1. 不得違反的十項原則

1. **六工作表固定：** `machine_3min`、`environment_3min`、`alarm_events`、`quality_issues`、`data_dictionary`、`README`。維持清洗後的名稱、欄名與業務語意。上游已完成的條件式 NaN→0 不再重複執行，也不更改原始 XLSX。
2. **保存（ingestion）和統計資格（eligibility）是兩種不同決策。** 某欄缺值可入庫，不代表每個指標都能用它計算。
3. **NULL ≠ 0 ≠ Await ≠ 無來源 ≠ 不適用 ≠ 推導值。** 保留來源 exception/token、缺值原因及行號；不可默默用 0 補空白。
4. **可識別資料優先保存：** 描述欄缺值、部分合法觀測缺值、低品質觀測值不應阻擋整日；無法辨識的單列應安全隔離，未支援隔離前不得假裝略過就完成匯入。
5. **不可自動臆測來源值：** 不用 AI、相鄰時段平均、其他機台／感測點數據、六態剩餘差額來捏造正式觀測。能以可信來源恢復或用合格數值確定性計算時，另存衍生值和來源規則。
6. **版本與交易安全優先：** 保留 `ACTIVE` / `REPLACED`、同日重複 `DUPLICATE`、同日修正版 `CONFLICT`、替換、回復、`ACTIVE_VERSION_CHANGED` 與每檔原子 Confirm。不可清除或重建使用者現有 SQLite、Docker volume。
7. **Alarm 來源三態保持正確：** `MISSING`、`PROVIDED_EMPTY`、`PROVIDED_NONEMPTY`，另有 `UNKNOWN` 時不得當成已證實零筆；修正版不可無提示抹除舊 Active Batch 已提供的警示。
8. **品質異常不是設備故障：** 六態不完整、缺感測值或來源異常只能列為資料品質事件，不轉寫成 Red/Yellow、已證實故障、待機或企業 Alarm 事件。
9. **資料仍留本機：** 私有 XLSX、原始 JSON、資料庫、備份、公司識別、憑證及日誌不可提交或 Push。測試使用合成 fixture；有本機私人測試檔時只能從 `.gitignore` 保護的路徑唯讀讀取。
10. **測試有證據才能宣稱通過：** schema、migration、Preview、Confirm、Active query、replace/rollback、品質與 UI 資料顯示需驗證；沒有實際測的項目標示 `NOT VERIFIED`。

## 2. 欄位分類與 NULL 政策（不改六表格局）

> 概念上分成 **K＝識別／血緣關鍵欄、M＝觀測與分析欄、O＝輔助／描述／衍生欄**。*「重要」不等於 SQL 必須 NOT NULL*。

### 2.1 `machine_3min`（21 欄）

| 等級 | 欄位 | 規則 |
|---|---|---|
| K | `日期`、`時間`、`區間開始`、`區間結束`、`機台`、`區域` | 日期／時間／機台身分須可靠。`區域` 可從可信 A1–A4/B1–B4 唯一導出；時間端點僅依唯一且一致的 180 秒時間規則重建；衝突則列隔離／阻擋。`24:00` 仍屬原來源日。 |
| M | `None秒`、`Red秒`、`Yellow秒`、`Green秒`、`Blue秒`、`White秒` | **全可 NULL**。缺該燈號時留 NULL；不得因空白補零；六態總和不足 180 秒應保留真實數值並發品質 issue。 |
| M（品質控制） | `品質狀態` | 來源空白不視為「正常」；保留來源缺值，系統另產生 `UNKNOWN_SOURCE_QUALITY` 與資格判斷。若現行 DB `NOT NULL`，請用獨立系統欄位或最小安全 migration，不要寫假的來源狀態。 |
| O | `四態合計秒`、`加工小時`、`待機小時(黃燈)`、`異常小時`、`未開機小時`、`區間加工比例`、`開機加工比例`、`品質備註` | 均可 NULL。衍生值只用合格來源秒數依既定公式推導；保留來源原值及 mismatch warning，勿覆蓋來源。 |

### 2.2 `environment_3min`（15 欄）

| 等級 | 欄位 | 規則 |
|---|---|---|
| K | `日期`、`時間`、`區間開始`、`區間結束`、`區域`、`感測器編號`、`類別` | 可從可信 metadata 唯一恢復的才還原；否則隔離。不可混用不同區域或感測點。 |
| M | `平均`、`最大`、`中位數`、`最小` | **各自可 NULL、各自判斷資格**；缺平均不影響同列有效最大值。不用其他統計值或相鄰點補平均。 |
| M（品質控制） | `品質狀態` | 同機台品質政策，來源缺失不可默認合格。 |
| O | `參考門檻`、`最大值判斷`、`備註` | 可 NULL。待企業確認的 26°C／40%RH 不可被寫成已核准正式限值。 |

### 2.3 `alarm_events`（11 欄）

| 等級 | 欄位 | 規則 |
|---|---|---|
| K | `事件時間`、`感測器ID`、來源批次與原始列號 | 必須能定位同一筆來源事件；缺時間／ID 且無唯一可信映射時，該筆隔離，不得捏造；不能靜默刪除事件或跨版本指紋去重。 |
| M | `當前值`、`規則條件` | 允許 NULL／未解析原文字串；缺數值仍保留警示事件，不得補 0；無條件不能推測門檻。 |
| O | `感測器`、`類型`、`群組`、`規則名稱`、`持續時間原文`、`初步事件分類`、`分類狀態` | **全部可 NULL**。來源未提供就顯示「未提供」，不會因缺顯示名、類型、規則而阻擋整天。`規則名稱` 缺值時來源 `rule_name=NULL`，可另生 `derived_display_label` 並標明推導來源，但不得冒充來源正式規則名。 |

注意目前 Stage 2 schema 中 `history_alarm_events.rule_name`、`sensor_name`、`sensor_type`、`rule_condition_text` 為 `NOT NULL`；**先讀取實際 repo migration** 再決定如何安全調整。`rule_name` 是最優先阻擋點。任何 Alarm query/filter/排序、畫面與事件 fingerprint 必須兼容 NULL。

### 2.4 `quality_issues`、`data_dictionary`、`README`

- `quality_issues`：`時間`、`區間合計秒` 可 NULL；若列上的 `對象`／`問題` 缺失，以隔離診斷保存，不得強行歸責到某台機器。空品質表合法，但不能表示已證明所有資料完全正常。
- `data_dictionary`：保留項目、規則及說明；非核心說明缺漏可 NULL。時間、NaN、六態、公式等**核心語意若衝突或改版**，要 `REVIEW_REQUIRED`，不可因容錯放寬默認接受。
- `README`：來源日期、版本與 Alarm 來源狀態不得亂猜；來源檔名或既有 SHA 資訊缺漏可警告並記錄實際本機檔案 hash。`README` 的來源 SHA 若與本次上傳的原始檔不同，標示 lineage 待查，不要假稱來源已完全驗證。
- 六工作表與已核准欄名仍必須存在。**允許儲存格 NULL 不等於允許缺工作表或缺必須識別的表頭。**

## 3. 缺值的自動補足／降級標準

按以下順序，優先低風險：

1. **安全正規化**：trim 字串、格式合法轉換、可靠時區／日期解析、獨立的來源時間標籤還原，全部記錄處理版本。
2. **可信來源還原**：同一觀測原始檔確實有值、標準化檔轉換遺失，且能唯一對應來源列才還原。沒有原始檔則不得使用想像中的資料。
3. **重算衍生欄**：Green 小時＝Green秒/3600、比例＝合格秒數／合格分母，按現行契約另行計算；保留來源欄與 mismatch issue。
4. **上游核准的條件式 NaN→0**：五日的清洗檔已實施；**匯入器不得再次對這批清洗檔執行**。若未來另開原始 ETL，需先核對 IT 核准規則、保存轉換前 token／血緣。
5. **真正觀測缺失**：保留 NULL 和 exception、相關統計不適用；不按前後平均推回正式資料。可視覺估計僅作未來獨立功能，預設關閉且不得寫入正式歷史分析、故障警示或 coverage。
6. **身分／時間不可確認**：以有來源行號的隔離資料保存；無隔離機制時明確 `INVALID` 或 `REVIEW_REQUIRED`，不能丟列後回報完整成功。

**禁止事項：** 將六態不足的部分自動補給 None/Green；用別台機台或另一感測點補數值；用 `加工小時` 反推未經證實的原始 Green 秒；將推導規則名回寫官方來源名；將所有 NaN／Await／空白通用轉 0。

## 4. 統計資格、時間語意、品質規則版本

1. 保留並支援既有各項資格：`green_hours_eligible`、`four_state_ratio_eligible`、`six_state_share_eligible`、`transition_eligible`、環境 AVG/MAX/MED/MIN 各自資格。不得採「整筆只要有缺值就全部排除」。
2. 只以資格合格的 Green 秒數換算工時；Green 有效且為 0，必須顯示真 0；缺值或不合格，則是 NULL／缺口。
3. 六態占比：六態完整且符合核准秒數容差（現行 179–181 秒）及品質規則才合格；先跨有效列 SUM(seconds)，再除以六態總 SUM；禁止平均每列百分比。
4. 跨日／同期比較及 coverage 都要看 Active Batch，保留 `MISSING_DATA`、`NOT_APPLICABLE`、真 0 的差別；不因剛好有列就宣稱該指標 100% 有效。
5. `24:00` 結束屬次日 00:00 的絕對時間，但依來源日歸檔；不增造區間或改日期。
6. **嚴重不完整三分鐘資料的 Green 規則要做「限縮版本升級」而非一刀切：** 對已由來源 `待核對` / `quality_issues` 證實，且六態只剩極少秒數的觀測（五日實例：2025-06-04 00:54，A1–B4 各合計 0.01–0.18 秒），保留來源 Green 值，但正式 Green 工時、六態占比與連續狀態資格**排除該不可信區間**，並扣除相應 metric eligibility。其他單純輕微 180 秒超差、Blue/White 非零的資料，不得一律排除 Green。
7. **不要自行發明一個全新全站容差或神奇閾值**。先用可靠的來源品質標示與已核准的品質原因來辨識極端異常；若需要數值閾值才可通用化，將建議閾值及其對真實資料影響列入決策文件，未經核准不影響其他資料。對五日明確已知案例需有精確測試。
8. 若此變更調整了舊 eligibility，必須升級 `quality_rule_version`、設計交易式重算/重新啟用及回退方法，確保舊紀錄不被用過時旗標誤算；不能為了測試通過直接改動來源秒數或 fingerprint。

### 4.1 資料到達率與統計有效率分開

- **資料到達率** = 已收到且可對應時間／身分的列數 ÷ 預期列數。
- **某指標有效率** = 此指標 eligibility 為真的列數 ÷ 預期列數。
- 同一筆可能已入庫、Green 不合格，但某些來源欄仍值得保留；Alarm 事件筆數與來源狀態另計。
- Preview 和歷史查詢應能回報不合格的原因及數量；不能只顯示 3,840/3,840 讓使用者誤以為全都可用。

## 5. 資料品質異常通知（限本機 UI，非設備 Alarm）

1. 新增或沿用**資料品質 issue**：來源必要描述缺值、指標讀值缺失、六態嚴重不足、無法辨識行、血緣 SHA 不一致等；issue 包含來源日、工作表、列號、機台／感測器、區間、原因、嚴重度、受影響指標、規則版本、資料批次。具體 schema 由 Codex 依現有 `validation_issues` / `history_quality_issues` 最小擴充決定。
2. **三級：** `INFO`＝一般描述欄缺值；`WARNING`＝重要指標 NULL 或低品質、需排除統計；`SEVERE`＝多台同步嚴重不完整、隔離列較多或關鍵來源矛盾。`SEVERE` 在 UI 是資料品質重要提示，**不得轉成正式機台故障**。
3. 不要每列都彈窗。**按來源日＋時間區間＋原因聚合**，並可展開看八台機器及環境點；例如 `2025-06-04 00:54` 八台六態嚴重不足＋B區濕度1缺失，顯示一組或兩類相關品質提示，而非九次打斷。
4. 匯入完成顯示「已匯入但含資料品質警告」，並顯示正常入庫列數、可空缺值、品質不合格列數、隔離列數、各指標覆蓋率。可逐項展開中文原因及來源行號。
5. **不實作背景通知、Email、Slack 或其他外部通報**；本 Stage 僅針對匯入結果摘要、版本管理和可查品質訊息。若不需要重排儀表板其他頁面，只修改匯入頁必要的資訊區塊。
6. UI 不顯示生硬的 `STRUCT_MISSING_VALUE` 等字串作為主要文案；工程代碼保留在技術詳情供追查。禁止透露企業內部路徑、秘密與原始敏感內容。

## 6. 匯入結果分級、部分失敗及交易

| 分類 | 何時使用 | Preview / Confirm |
|---|---|---|
| `ACCEPT` | 結構與身份有效、觀測正常 | 可自動 Preview/Confirm，保留原契約。 |
| `ACCEPT_WITH_WARNINGS` | Alarm 規則名缺值、部分環境 NULL、六態嚴重不足但身份仍可靠 | 可 Confirm；保存 NULL／原值及 issue，統計資格獨立排除。 |
| `ACCEPT_WITH_QUARANTINE` | 少量列 K 欄不可還原、其餘有效，**且隔離儲存／對帳已完整實作** | 僅在安全隔離完成後允許 Confirm；明示隔離數、位置與覆蓋率，不得報成完整匯入。 |
| `INVALID` | 檔案損壞、必要工作表/表頭缺失、來源日期全檔衝突、無法建立來源鍵 | 該檔不可 Confirm；同批其他檔照常處理。 |
| `REVIEW_REQUIRED` | 核心資料契約語意變更、危險的版本替換或無法安全做出通用決策 | 不可自動 Confirm；列出具體原因。 |

請先設計可驗證的逐列隔離儲存與數量對帳，若會大幅增加風險，**最小可行版本先讓一般 NULL / 低品質資料成功入庫，遇真正不可識別列時只阻擋受影響檔案，並在驗收文件標示 `QUARANTINE NOT IMPLEMENTED`；絕對不可無聲跳過**。不要因這個非必要進階功能延後已確認 6/3–6/5 的匯入修復。

每檔獨立交易；預覽不寫 SQLite；Confirm 再驗證內容與 fingerprint，避免預覽後檔案變更。跨版本維持一日一個 Active、來源 Alarm 完整性與安全 rollback，嚴禁覆蓋既有資料而無版本紀錄。

## 7. 執行順序與自主授權

### P0 — 現況檢查（先做）

- 實際比對 repo 的資料庫 schema、migration、Parser、Preview、Confirm、fingerprint、統計資格、UI。先列出「已支援」「須調整」「會影響哪些測試」，不要只修改一個 `required()` 就結案。
- 確認是否已有可用 DB 備份與 migration 節點；不清空 DB。新 migration 必須可在非空資料庫正常升級。SQLite 修改 NOT NULL 可能要重建表，先採安全交易／備份／完整性及索引驗證。

### P1 — 契約 / DB / Parser

- 明確修訂 `DATA_CONTRACT`、`DATABASE_DESIGN`、版本化 quality policy；nullable 及來源例外語意對齊。
- 設定 Alarm `rule_name` / `sensor_name` / `sensor_type` / `rule_condition_text` 可 NULL；必要時讓 `source_quality_status` 缺值不偽造為正常。保留 K 欄與唯一鍵。加入原始字串與缺值來源稽核。
- Parser 應將可空缺值分類為 Info/Warning，而不是 `STRUCT_MISSING_VALUE` 致命錯誤；無法讀取/關鍵身份錯誤仍要可診斷。
- Migration 須保留舊 Active/REPLACED batch、row count、索引、外鍵、trigger 與 event metadata；新 schema `foreign_key_check` / `integrity_check` 全過。

### P2 — 品質資格、聚合報告與安全匯入

- 資料到達率和 Green／六態／環境等 metric eligibility 分開計算。必要時按新的 `quality_rule_version` 重新標記歷史批次，保留來源值。
- 依來源日／時間／原因聚合品質警告；保留所有不合格資料的定位資訊。
- 擴充匯入頁 Preview、Confirm、版本紀錄中的品質摘要。這部分是 Excel 頁資訊強化，**不得重做歷史圖表、首頁或其他 UI**。
- 維持現有上傳上限（單次最多 8 檔、25 MiB/檔、50 MiB/請求等），不因放寬 NULL 而停用 ZIP/公式/外部連結安全檢查。

### P3 — 測試／回歸／文件／Commit

- 按第 8 節執行可重現測試，遇 failing-first 問題先加 regression test。
- 完整通過 typecheck、lint、test、production build；可作本機瀏覽器 smoke。按技術里程碑本機 Commit；不 Push。
- 建立 `docs/STAGE5_2_ACCEPTANCE.md`，更新 `docs/BUILD_LOG.md`，列出 migration、欄位分類、品質規則版本、修正根因、測試明細、已知缺口及 Commit hash。完成後停止，不自動進 Stage 6–7。

## 8. 可重現驗收案例（Codex 不得只看代號）

### 8.1 真實五日預期（私人資料只限本機、無權存取則使用同型 synthetic fixture）

| 來源日 | machine_3min | environment_3min | alarm_events | `rule_name=NULL` | 上游品質問題 |
|---|---:|---:|---:|---:|---|
| 2025-06-01 | 3,840 | 3,840 | 11 | 0 | 無已列出的品質問題 |
| 2025-06-02 | 3,840 | 3,840 | 14 | 0 | 無已列出的品質問題 |
| 2025-06-03 | 3,840 | 3,840 | 20 | 3 | Alarm `rule_name` 空白（原始行 16、18、19） |
| 2025-06-04 | 3,840 | 3,840 | 15 | 6 | Alarm 缺規則名（行 2、3、6、7、15、16）；00:54 八台六態秒數極度不足＋B區濕度1四項統計缺失，共 9 筆來源品質紀錄 |
| 2025-06-05 | 3,840 | 3,840 | 14 | 2 | Alarm 缺規則名（行 2、14） |
| **五日合計** | **19,200** | **19,200** | **74** | **11** | **9 筆上游品質紀錄** |

> 這些值來自事先完成的十份附件稽核，不意味著 Codex 目前能讀到該附件；不准宣稱未執行的原檔測試通過。若原檔未在本機允許路徑，使用**不含公司資料的合成 fixture**逐項模擬。

**必驗操作：**

1. **單檔 6/3 Preview：** 具有 `alarm_events` 第 16、18、19 行規則名為 NULL 的合成檔；應 Preview 成功、列 `ACCEPT_WITH_WARNINGS`，不是 500／整檔 INVALID；確認後共保存 20 筆來源事件、其中 3 筆 `rule_name=NULL`。來源名稱與推導說明分開。
2. **混合多檔：** 6/1–6/5 五個不同來源日，同批 Preview；五份均可被清楚分類且每檔獨立 Confirm；原檔不存在時以合成等價資料測試，不可複製企業資料到 Git。
3. **6/4 00:54：** 八台保留來源極短六態秒數（0.06/0.01/0.02/0.05/0.18/0.05/0.12/0.07 秒）而不是補至 180；B區濕度1的 AVG/MAX/MED/MIN 為 NULL；該時間有可追蹤的聚合品質提示。到達率與各指標有效率不同；必要資格依第 4 節處理。
4. **核心 Green 缺值：** 合成某機台 1 筆 Green 空白但其他五態有值；該 Green 工時不應變成 0，趨勢相應位置為缺口，Green eligibility 為 0；其他可用指標照常計算。
5. **六態全缺：** 六態全部空白／Await，不准自動補六個 0，不准被視為 `None=180`；保留來源異常且不納入 Green、六態占比、轉換統計。
6. **環境部分缺值：** AVG=NULL、MAX=有效值；AVG eligibility=0、MAX eligibility=1（除非來源品質明確否定 MAX）。
7. **Alarm 輔助欄缺值：** sensor_id/event_time 可信，但 sensor_name/type/rule_name/condition/current_value/duration 可 NULL；事件仍入庫，可用 sensor ID 顯示預設代稱；若事件時間或 ID 不可識別則隔離或明確錯誤，不得假造。
8. **來源狀態：** `PROVIDED_EMPTY` 真正 0 事件、`MISSING` 未提供、`PROVIDED_NONEMPTY` 有事件各自顯示；修正版不能在未提示下抹去舊來源事件。
9. **時間／業務鍵：** 24:00、缺區間、同機台同時段重複、時間與來源日矛盾，各自按契約處理，不得移日或靜默刪列。
10. **來源真值與衍生值：** Green/3600，比例的分母資格，浮點容差和來源 mismatch 警告可查；不能只為消除大量 `DERIVED_VALUE_MISMATCH` 就取消驗證。
11. **已存在 SQLite migration：** 用非空舊 schema fixture，先建 6/1、6/2 Active 及舊版資料，再執行 migration；證明舊資料仍可查、foreign keys/indexes/rows 正常、失敗可 rollback；不可只在空 DB 測試。
12. **端到端交易：** Preview 不寫入；Confirm 有 commit、重複跳過、同日不同版本須明確確認；替換/rollback 恢復正確 Active、原警示來源保留、品質 issue 隨 batch 一起變更。含錯檔不破壞同批合法檔。
13. **UI 結果：** INFO/WARNING/SEVERE 三級中文品質摘要、按日期時間聚合、可展開行號；一般缺值不製造大量 toast，與設備 Alarm 分開。
14. **效能與限制：** 保留 XLSX ZIP preflight / 拒絕公式外部連結、資源限制；1、2、4、8 檔 Preview/Confirm 的既有 regression 仍通過。

### 8.2 測試覆蓋分類

- **單元／純邏輯：** NULL 區分、eligibility、六態品質、時間映射、警告聚合。
- **整合：** migration、Parser→Preview→Confirm→SQLite→Active Query、batch versioning。
- **瀏覽器：** 匯入頁錯誤／警告／版本摘要，可讀性與間距（現有 1366px 筆電不應再次出現 Preview 卡黏合）。
- **真實私人附件：** Codex 有權在本機指定忽略路徑唯讀使用才實測；否則列人工回驗，不能宣稱已完成。

## 9. 交付與報告格式

最終一次提供：

1. **完成摘要**：有做到哪些 nullable / 資料品質接納／統計資格／通知／資料庫改動。
2. **仍阻擋的情境與理由**：清楚區分一般缺值、不可辨識身份、結構毀損，以及是否已支援隔離。
3. **資料與品質對帳表**：每日 expected/imported/eligible/quarantined，Alarm 來源狀態和 NULL 數。
4. **schema／migration 記錄**：如何確保舊資料完整與升級/回退。
5. **測試證據**：指令與結果、是否跑過真實五日私人 XLSX、未驗證項目。
6. **瀏覽器驗收**：匯入區塊間距、中文品質摘要、錯誤可理解、版本切換。
7. **安全檢查**：無原始/清洗企業 Excel、JSON、憑證、DB、備份進 Git；`git status` clean；未 Push／企業 API／部署／Stage 6–7。
8. `docs/STAGE5_2_ACCEPTANCE.md`、更新 `docs/BUILD_LOG.md`、本機 commit hash。

**完成所有授權且驗收通過後停止；不得因為資料容錯而調整組員尚未定版的歷史／異常分析圖表呈現。**
