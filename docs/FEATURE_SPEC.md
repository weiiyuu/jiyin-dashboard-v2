# 七頁功能、UX 與查詢契約

> 狀態：Stage 2 設計草案  
> 本文件不授權功能實作。資料與計算語意以 [DATA_CONTRACT.md](./DATA_CONTRACT.md) 為準。

## 1. 共通產品規格

### 1.1 導覽

~~~text
首頁
即時監控
  機台監控
  環境監測
歷史分析
  歷史加工分析
  異常事件分析
資料管理
  Excel 匯入
  API 連線設定
~~~

不建立獨立資料品質頁。品質資訊出現在匯入摘要、圖表覆蓋率、警告與資料明細。

### 1.2 視覺與可及性

- 沿用深酒紅暗色、卡片、固定左側導覽、品牌與 breadcrumb 的方向。
- 狀態不可只靠顏色；每個 badge 同時有文字與可讀 icon。
- 表單有 label、錯誤靠近欄位、提交中狀態、成功/失敗摘要；無空按鈕。
- 圖表有可讀表格摘要或 tooltip，缺資料與 0 明確不同。
- 桌面優先；窄螢幕側欄可收合，表格允許水平捲動。

### 1.3 共通 API envelope

ApiResponse/ApiMeta 的正式型別定義在 DATA_CONTRACT.md。必要 meta 為 generatedAt、timezone、requestId、warnings；providerMode、timeContext、coverage、pagination、staleAfterSeconds 依路由選填，但 providerMode 存在時 timeContext 必須同時存在。

成功：

~~~json
{
  "data": {},
  "meta": {
    "generatedAt": "2026-11-14T10:00:00+08:00",
    "timezone": "Asia/Taipei",
    "requestId": "local-safe-id",
    "providerMode": "LIVE",
    "timeContext": {
      "kind": "REAL",
      "dataDate": "2026-11-14",
      "now": "2026-11-14T10:00:00+08:00"
    },
    "warnings": []
  }
}
~~~

失敗：

~~~json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "開始日期不可晚於結束日期",
    "fields": {"startDate": "INVALID_RANGE"},
    "requestId": "local-safe-id"
  }
}
~~~

不把 stack、DB path、認證值、企業 URL 或原始 API body 回給瀏覽器。GET 查詢不得改狀態。POST/PUT 只接受 localhost 同源請求並驗證 Origin/Fetch Metadata。

### 1.4 即時頁本機自動更新

機台監控、環境監測、API 連線設定使用同一個 local refresh policy：

- 頁面 mount、瀏覽器重新取得 focus、document 從 hidden 變 visible 時立即 GET 對應本機 Route Handler。
- 頁面可見期間每 30 秒重新 GET；hidden 時停止 interval。
- 同一路由前一請求未完成時取消或略過，不允許重疊。
- 自動更新只讀本機 SQLite/Demo provider；不得呼叫 connection test，也不得直接或間接觸發企業 API。
- 失敗保留最後成功畫面並標示本機讀取失敗時間，不把舊值重新標成 fresh。

## 2. 首頁

### 2.1 目的與版面

**[檔案證據]** 舊首頁有品牌、合作方、三張工作區卡片、功能標籤與空資料提示，沒有營運 KPI。新版保留此資訊層級：

1. 品牌/專案說明。
2. 三張工作區卡：
   - 即時監控：機台監控、環境監測。
   - 歷史分析：歷史加工分析、異常事件分析。
   - 資料管理：Excel 匯入、API 連線設定。
3. 系統資料可用性摘要：目前 provider、Live 最後資料、歷史 active 日期範圍、是否有警告。

不顯示「產能、稼動率、故障率、今日產量」等無依據 KPI。

### 2.2 資料、控制與狀態

| 項目 | 規格 |
|---|---|
| 資料來源 | app_settings、最新 Collector collection/readings、active import batch 範圍 |
| 控制 | 六個功能入口；不在首頁改 Live/Demo |
| 空狀態 | 尚無 Live、尚未匯入歷史可分別存在 |
| 錯誤 | DB 查詢失敗時卡片仍可導航，摘要顯示不可用 |
| 過期 | Live 摘要顯示 STALE 與最後資料時間 |

### 2.3 API

GET /api/overview

~~~json
{
  "data": {
    "runtimeMode": "LIVE",
    "live": {
      "status": "STALE",
      "lastReadingAt": "2026-11-14T09:42:15+08:00"
    },
    "history": {
      "activeDateFrom": "2025-06-01",
      "activeDateTo": "2025-06-01",
      "activeDayCount": 1
    }
  },
  "meta": {"timezone": "Asia/Taipei", "warnings": ["LIVE_DATA_STALE"]}
}
~~~

### 2.4 驗收

- 全新 DB 不顯示 0 產量或假 KPI，只顯示尚無資料。
- 只有歷史資料時，歷史入口可用，Live 顯示尚未收集。
- Live 過期時不顯示綠色正常摘要。
- 手動 API 測試成功但 Collector 尚未保存 reading 時，首頁仍顯示「尚未收集」，不把測試當 Live 成功。
- 所有工作區卡可用鍵盤進入正確頁面。

## 3. 機台監控

### 3.1 版面

- 頂部整體設備摘要，只統計「fresh 且狀態可判讀」的八台；另列 stale、unknown、no data。
- A 區與 B 區上下排列。
- 每區左側四台快速卡；右側該區目前選取機台詳細資訊。
- A/B 各自保存選取，不因切另一區重設。
- 刪除大型 3D 場景。

詳細資訊只顯示有依據的欄位：解析狀態、active colors、sensor update time、fetched time、新鮮度、連線批次、raw status（標示「語意未確認」）。不顯示智慧電錶、B4 專有進度/參數、假故障原因。

### 3.2 狀態模型

| 維度 | 值 |
|---|---|
| lampState | GREEN、YELLOW、RED、BLUE、WHITE、OTHER、UNKNOWN |
| freshness | FRESH、STALE、NO_DATA |
| connection | HEALTHY、PARTIAL、FAILED、OUTSIDE_WINDOW、NEVER_POLLED |
| provider | LIVE、DEMO |

Live 五色全 0 是 UNKNOWN；Live 沒有 None。歷史 None 不出現在此頁的即時狀態。

### 3.3 控制與回饋

- 點擊或鍵盤選 A1–A4/B1–B4。
- provider 只顯示，不在本頁切換。
- 可手動重新查詢本機 DB；不因此直接打企業 API。
- Demo 時頁首固定 banner，含「模擬資料」、fixture dataDate 與 demoClockAt；freshness 以 demoClockAt 計算，不使用 host 現在時間。

### 3.4 API

GET /api/live/machines

~~~json
{
  "data": {
    "summary": {
      "freshKnown": 5,
      "green": 3,
      "yellow": 1,
      "red": 1,
      "other": 0,
      "unknown": 1,
      "stale": 1,
      "noData": 1
    },
    "areas": [{
      "area": "A",
      "machines": [{
        "machineId": "A1",
        "lampState": "GREEN",
        "activeColors": ["green"],
        "freshness": "FRESH",
        "sensorUpdateAt": "2026-11-14T09:57:15+08:00",
        "fetchedAt": "2026-11-14T09:57:16+08:00",
        "rawStatus": 1,
        "rawStatusMeaning": "UNCONFIRMED"
      }]
    }]
  },
  "meta": {
    "providerMode": "LIVE",
    "timeContext": {
      "kind": "REAL",
      "dataDate": "2026-11-14",
      "now": "2026-11-14T10:00:00+08:00"
    },
    "staleAfterSeconds": 420,
    "warnings": []
  }
}
~~~

### 3.5 驗收

- A/B 各四台且版面為左總覽、右詳細。
- 全零五色顯示未知；多色同時為 1 顯示其它/多色，不選優先色。
- raw status=2 不自動顯示故障。
- stale 機台不進 fresh 狀態數字，且仍可查看最後值與時間。
- values 失敗不自動 Demo；Demo banner 永遠可見。
- 固定 Demo fixture 即使日期早於 host 今日，仍依 demoClockAt 正確判 fresh/stale，不整批變成 stale。

## 4. 環境監測

### 4.1 資料與版面

- 上方保留兩個主要區域容器：A 區、B 區。每個容器內顯示溫度 1/2、濕度 1/2 四個獨立值；可用四個子卡，但不可拆散 A/B 群組層次。
- 共八個值點，每點獨立顯示，不平均。
- 下方折線圖有「溫度/濕度」與「A/B 區」控制；同圖兩條線對應點 1/2。
- Live 的 X 軸固定真實台灣今日 09:00–17:00；Demo 固定 fixture dataDate 09:00–17:00，不冒充今日。
- Collector 未啟動前、poll 失敗與資料斷線位置都是 NULL gap，不補 0、不插值、圖表 connectNulls=false。
- Live 在 17:00 後仍顯示今日已收集資料，但卡片標「非可取得時段」及 freshness；隔日自動顯示新日期。Demo 則以 demoClockAt 判斷模擬服務時段。

### 4.2 目前值與三分鐘落格

每點取該 sensor 最新「可解析 numeric」reading。若最新 reading 無效，不跳過它假裝前一筆仍是最新；回傳 value=null、lastValidValue 可選擇另列並清楚標示。stale 以 sensor updateTime 優先判定。

圖表 x 軸只用 collection run 的 sampleSlot：

- SCHEDULED 使用預定三分鐘格點；10:03:15 請求落 10:03。
- 10:01 STARTUP/MODE_RESUME 立即輪向下落 10:00。
- 同 sensor/slot 多筆取較新的 sensor updateTime；同 updateTime 再取較晚 fetchedAt。
- 跨 slot updateTime 未增加，後一格 observed=false/value=null。
- retry 屬同一 poll，不新增格；請求失敗的格保持 NULL。
- sensor updateTime 判 freshness，不直接決定 x 軸。

26°C/40%RH 若顯示，只能標「待確認參考值」，不能以紅綠合格色表示正式品質。

### 4.3 API

GET /api/live/environment?area=A&metric=temperature

日期由 server 的 timeContext 決定：Live 使用台灣今日，Demo 使用 manifest dataDate。一般 UI 不傳 date；測試若傳入 date，必須與目前 timeContext.dataDate 相同，否則回 400 DATE_CONTEXT_MISMATCH。使用者不可查三天 Live archive 當歷史分析。

~~~json
{
  "data": {
    "axis": {
      "date": "2026-11-14",
      "start": "09:00",
      "end": "17:00",
      "stepMinutes": 3
    },
    "latest": [{
      "area": "A",
      "metric": "temperature",
      "point": 1,
      "sensorId": "curf",
      "value": 24.6,
      "unit": "度",
      "freshness": "FRESH",
      "sensorUpdateAt": "2026-11-14T10:00:00+08:00"
    }],
    "series": [{
      "point": 1,
      "sensorId": "curf",
      "samples": [
        {"time": "10:00", "sampleSlot": "2026-11-14T10:00:00+08:00", "value": 24.3, "observed": true},
        {"time": "10:03", "sampleSlot": "2026-11-14T10:03:00+08:00", "value": 24.4, "observed": true},
        {"time": "10:06", "sampleSlot": "2026-11-14T10:06:00+08:00", "value": null, "observed": false, "gapReason": "POLL_FAILED"}
      ]
    }]
  },
  "meta": {
    "providerMode": "LIVE",
    "timeContext": {
      "kind": "REAL",
      "dataDate": "2026-11-14",
      "now": "2026-11-14T10:07:00+08:00"
    },
    "serviceWindow": "09:00-17:00",
    "warnings": ["GAPS_PRESENT"]
  }
}
~~~

NULL slots只是 response 的顯示骨架，不寫成 fake DB reading。

### 4.4 驗收

- A/B 兩個主要容器層次清楚；八個點都有獨立 label，不出現未說明的平均。
- 10:01 啟動成功落 10:00；10:03 排程成功落 10:03；10:06 失敗時該格 NULL，09:00–09:57 全空白。
- 連續兩輪失敗產生斷線，不以折線跨接。
- 10:06 成功但 sensor updateTime 仍等於 10:03 時，10:06 格為 NULL，freshness 仍依該 updateTime 判斷。
- 刷新頁面後已收集資料仍在；容器重建但 volume 保留時資料仍在。
- Live 17:00 後軸仍是今日 09–17；隔日無資料時顯示新日空圖。
- Demo dataDate 固定為過去日期時，軸與 freshness 都依 demoClockAt，banner 不得顯示「今日」。

## 5. 歷史加工分析

### 5.1 共通資料

只查 active import batches 的 history_machine_intervals。三張圖：

1. 累積 Green 加工工時排行：橫向長條。
2. Green 加工工時趨勢：時間序列。
3. 六態時間占比：100% 堆疊。

Green 工時與六態占比使用不同 eligibility。每張圖都顯示自己的 imported/eligible/expected coverage 與排除原因，不用共同「通過率」掩蓋差異。

### 5.2 區間分析

控制：

- startDate、endDate（含首尾）。
- 同日可選 30 分鐘或 60 分鐘桶。
- 跨日固定 1 天桶，粒度控制停用並說明。
- machineIds 多選，預設八台。
- 不新增開始/結束時分選擇器；同日是完整來源日。

空日期、缺日不當 0。排行榜只呈現有 eligible Green 的機台；選中但無 eligible 值者在尾端顯示「無可用資料」，不是 0 小時。

### 5.3 同期比較

| 模式 | 控制 | 對齊 |
|---|---|---|
| 日對日 | dateA、dateB、30/60 分鐘 | 當日時刻 bucket |
| 週對週 | startA、startB，各 7 個連續日 | 第 1–7 日 |
| 月對月 | yearMonthA、yearMonthB | 月內日序 1–31 |

月份天數不同的位置為 NOT_APPLICABLE/null。比較圖 tooltip 同時顯示相對位置與原始日期。每期間各自回傳 coverage，不用共同分母美化差距。

三張圖的比較語意固定：

- ranking：每台機器一列，A/B 各一根 Green 小時長條與自己的 coverage。
- trend：所選機台在每個相對位置合計為 A/B 兩條線；不是每台再各畫一條線。
- stateShare：所選機台合併後，A/B 各自是一個 100% 六態堆疊，各用自己的 eligible seconds 分母。
- AVAILABLE 有值；MISSING_DATA 表示位置存在但資料缺少；NOT_APPLICABLE 表示期間沒有該位置（例如 2 月第 30 日）。後兩者 value 都是 null，但 UI 文案不同。

### 5.4 API

GET /api/history/processing

區間 query：

~~~text
mode=range&startDate=2025-06-01&endDate=2025-06-01
&bucket=30m&machineIds=A1,A2,B1
~~~

比較 query：

~~~text
mode=compare&compareKind=month
&periodA=2025-02&periodB=2025-03&machineIds=A1,A2
~~~

~~~json
{
  "data": {
    "mode": "range",
    "ranking": [{"machineId":"A1","greenHours":12.5,"hasData":true}],
    "trend": [{
      "position": "00:00-00:30",
      "sourceLabel": "2025-06-01 00:00-00:30",
      "greenHours": 0.42
    }],
    "stateShare": {
      "seconds": {
        "none": 1000, "red": 100, "yellow": 500,
        "green": 7000, "blue": 0, "white": 0
      },
      "percent": {
        "none": 0.1163, "red": 0.0116, "yellow": 0.0581,
        "green": 0.8140, "blue": 0, "white": 0
      }
    },
    "coverage": {
      "requestedDays": 1,
      "daysWithActiveBatch": 1,
      "expectedIntervals": 1440,
      "importedIntervals": 1432,
      "greenEligibleIntervals": 1430,
      "sixStateEligibleIntervals": 1400,
      "excludedByRule": {"STATE_TOTAL_OUT_OF_TOLERANCE": 32}
    }
  },
  "meta": {"warnings": ["INCOMPLETE_COVERAGE"]}
}
~~~

compare response 共用同一 endpoint 與相同統計函式，結構如下：

~~~json
{
  "data": {
    "mode": "compare",
    "compareKind": "month",
    "periods": {
      "A": {"label":"2025-02","startDate":"2025-02-01","endDate":"2025-02-28"},
      "B": {"label":"2025-03","startDate":"2025-03-01","endDate":"2025-03-31"}
    },
    "ranking": [{
      "machineId": "A1",
      "periods": {
        "A": {"greenHours":12.5,"availability":"AVAILABLE","eligibleIntervals":250},
        "B": {"greenHours":14.0,"availability":"AVAILABLE","eligibleIntervals":280}
      }
    }],
    "trend": [{
      "position": 29,
      "periods": {
        "A": {"sourceDate":null,"greenHours":null,"availability":"NOT_APPLICABLE"},
        "B": {"sourceDate":"2025-03-29","greenHours":1.2,"availability":"AVAILABLE"}
      }
    }],
    "stateShare": {
      "periods": {
        "A": {
          "seconds":{"none":1000,"red":100,"yellow":500,"green":7000,"blue":0,"white":0},
          "percent":{"none":0.1163,"red":0.0116,"yellow":0.0581,"green":0.8140,"blue":0,"white":0},
          "denominatorSeconds":8600
        },
        "B": {
          "seconds":{"none":900,"red":80,"yellow":420,"green":7600,"blue":0,"white":0},
          "percent":{"none":0.1000,"red":0.0089,"yellow":0.0467,"green":0.8444,"blue":0,"white":0},
          "denominatorSeconds":9000
        }
      }
    },
    "coverage": {
      "A": {"requestedDays":28,"daysWithActiveBatch":27,"expectedIntervals":26880,"greenEligibleIntervals":25500,"sixStateEligibleIntervals":25000},
      "B": {"requestedDays":31,"daysWithActiveBatch":31,"expectedIntervals":29760,"greenEligibleIntervals":29000,"sixStateEligibleIntervals":28500}
    }
  },
  "meta": {"warnings":["PERIOD_A_INCOMPLETE_COVERAGE"]}
}
~~~

日/週/月只改 period 定義與 position：

- 日：position 是 30/60 分鐘 bucket label；sourceDate 為所選日期。
- 週：position 為 1–7；sourceDate 是各週對應日期。
- 月：position 為 1–31；不存在的日為 NOT_APPLICABLE。

### 5.5 驗收

- 手工向量 180+90 秒顯示 0.075 Green 小時。
- 六態先加秒再除，結果不等於列百分比平均時要能驗證差異。
- 同日只允許 30/60 分鐘；跨日只每日桶，沒有時分欄位。
- 缺日/缺機台顯示 coverage 與空值，不畫零生產。
- 日比較：A 的 Green=180 秒、B=90 秒時，ranking/trend 分別為 0.05/0.025 小時。
- 週比較：A 第 4 日缺資料、B 完整時，position 4 的 A=MISSING_DATA/null、B=AVAILABLE。
- 月比較：2 月對 3 月時，2 月不存在的 29–31 日為 NOT_APPLICABLE；3 月依實際資料為 AVAILABLE 或 MISSING_DATA。
- A/B stateShare 各自加總為 100%（允許顯示四捨五入誤差），不得共用 denominator。
- expectedIntervals 依實際選取機台數計算；兩台 × 480 × 28/31 日分別為 26,880/29,760。
- 所有文案避免 OEE、產能、產量、良率、故障率。

## 6. 異常事件分析

### 6.1 三種資料

| 區塊 | 來源 | 稱呼 |
|---|---|---|
| Red | machine_3min Red秒 | 紅燈狀態時數/出現區間 |
| Yellow | machine_3min Yellow秒 | 黃燈狀態時數/出現區間 |
| Environment Alarm | alarm_events | 來源 Alarm 事件 |

Red/Yellow 不稱故障/待機事件數。Alarm 才是來源事件列，但分類仍是初步。

### 6.2 控制與列表

- 日期範圍。
- 區域 A/B。
- machineIds 或 sensorIds。
- 類型：紅燈、黃燈、環境 Alarm。
- Alarm rule/type。
- 分頁與穩定排序：event/interval start DESC，再用 row ID。

摘要顯示 Red/Yellow 累積小時、受影響機台、Alarm 來源狀態與事件列數。若某日 Alarm=MISSING，不把事件數顯示為 0；顯示「來源未提供」。

### 6.3 連續區間

相同機台、相鄰絕對時間恰三分鐘、每列該色秒數 >0 且該色值合格才合併。0、缺列、品質不合格都中斷。合併結果命名「紅燈/黃燈出現區間群組」，回傳 sumColorSeconds、firstStart、lastEnd、rowCount、crossesSourceDate；不稱事件或根因。

### 6.4 API

GET /api/history/events?startDate=2025-06-01&endDate=2025-06-01&type=all&area=A&page=1&pageSize=50

~~~json
{
  "data": {
    "statusHours": {
      "red": 1.25,
      "yellow": 3.5
    },
    "alarmCoverage": [{
      "sourceDate": "2025-06-01",
      "sourceStatus": "PROVIDED_NONEMPTY",
      "rowCount": 11
    }],
    "items": [{
      "kind": "ENVIRONMENT_ALARM",
      "eventAt": "2025-06-01T00:43:23+08:00",
      "sensorId": "5cu1",
      "ruleName": "濕度過高",
      "ruleCondition": "ruleValueHigh40.00, ruleValueLow0.00",
      "currentValue": 41,
      "durationOriginal": "1 hour 58 minutes 27 seconds",
      "classification": "環境/類比感測器警示"
    }]
  },
  "meta": {"warnings": ["THRESHOLDS_NOT_FORMALLY_CONFIRMED"]}
}
~~~

### 6.5 驗收

- 連續三列 Red>0 合併一個「區間群組」，Red 秒數仍是三列加總，不顯示 3 次故障。
- 中間缺列時分成兩組。
- Alarm 持續時間缺漏保持 NULL/「未提供」，不算 0 秒。
- MISSING Alarm 日不顯示 0 事件。
- 26°C/40%RH 只標參考門檻。

## 7. Excel 匯入

### 7.1 流程與兩種「移除/替換」

~~~text
選取多檔
  → 本機選檔清單（可移除選錯檔；不碰 DB）
  → Preview/Validate（不寫 DB）
  → 每檔新增/重複/衝突/錯誤/警告摘要
  → 使用者逐檔選擇略過或整日替換
  → Confirm 重新上傳、重算指紋與重驗
  → 每檔獨立 transaction
  → 結果與版本歷程
~~~

選檔清單「移除」只改瀏覽器記憶體。已入庫同日修正版「替換」是 DB active version transaction，兩者文案與按鈕分開。

### 7.2 限制與預覽

- 只接受 .xlsx 標準化檔；拒絕原始公司寬表。
- 檔案數、單檔 bytes、解壓後 bytes、工作表 cell 數都有 server limit；數值在 Stage 3 依範例大小做壓力測試後鎖定。
- 拒絕公式、外部連結、巨集與錯誤儲存格；只讀取需要的六張表。
- Preview 顯示 source date、版本、四表列數、Alarm source status、errors/warnings、duplicate/conflict 與 active batch。
- 未知字典名稱但語意相容可 warning；必要語意改變則 REVIEW_REQUIRED。

### 7.3 API

POST /api/imports/preview，multipart/form-data，可多檔。Preview 不建立 DB batch。

~~~json
{
  "data": {
    "files": [{
      "clientFileId": "local-1",
      "fileName": "standardized.xlsx",
      "sha256": "abc...",
      "canonicalFingerprint": "def...",
      "sourceDate": "2025-06-01",
      "decision": "CONFLICT",
      "activeBatchId": 12,
      "counts": {"machine":3840,"environment":3840,"alarm":11,"qualityIssues":0},
      "alarmSourceStatus": "PROVIDED_NONEMPTY",
      "errors": [],
      "warnings": [{"code":"DICTIONARY_VERSION_DIFFERENT","count":1}]
    }]
  }
}
~~~

POST /api/imports/confirm，單檔 multipart，欄位含 expectedSha256、expectedCanonicalFingerprint、action=INSERT|REPLACE、expectedActiveBatchId。後端不信任 preview 結果，完整重驗。

~~~json
{
  "data": {
    "result": "REPLACED",
    "batchId": 13,
    "sourceDate": "2025-06-01",
    "replacedBatchId": 12,
    "counts": {"machine":3840,"environment":3840,"alarm":11,"qualityIssues":0}
  }
}
~~~

其它：

- GET /api/imports?sourceDate=YYYY-MM-DD：批次與結果。
- GET /api/imports/{batchId}：metadata、issues、counts。
- POST /api/imports/{batchId}/activate：回復舊版本，需 currentActiveBatchId 防競態與確認文字。

### 7.4 衝突與失敗

- 相同 fingerprint：DUPLICATE，Confirm 不增加資料。
- 同日不同 fingerprint：CONFLICT；預設不替換，使用者明確選 REPLACE。
- Preview 後 active batch 改變：409 ACTIVE_VERSION_CHANGED，必須重新 preview。
- 舊版 Alarm 已提供、修正版 MISSING/UNKNOWN：阻止 replacement。
- transaction 任一步失敗：舊 active 完全不變；顯示安全錯誤與 request ID。

### 7.5 驗收

- 從選檔清單移除檔案後，DB row count 不變。
- Preview 後 DB row count 不變。
- quality_issues 空表可匯入；缺工作表不可。
- 重複匯入 0 新 rows。
- replacement 故意在中途失敗，舊 active 仍完整可查。
- 回復舊版只切 active，不複製或刪除 rows。
- 原始公司 Excel 被清楚拒絕，文案說 v1 只接受標準化格式。

## 8. API 連線設定

### 8.1 目的與版面

固定顯示 values/configs/groups 三列：

- transport health、API response 結果、schema 結果。
- last attempt、last success、latest data time。
- Collector collection 與 manual test 分開顯示；手動測試成功不更新最後收集成功或最新 sensor data。
- 是否在服務時段、是否 stale、safe error category。
- 目前 provider mode。
- TLS mode 只顯示 strict/custom CA/受限自簽例外；認證只顯示 none/bearer/custom header 類型，不顯示 origin、認證值或 CA path。

不提供任意 URL 輸入。

### 8.2 控制

- 手動測試連線：由 server 依序/受控並行測三端點，不寫 live readings；固定保存 MANUAL_TEST audit，但不可把它當 Collector 成功。
- Live/Demo 手動切換：切 Demo 前確認「Collector 將停止排程；Demo 不代表 API 成功」。PUT 成功時 modeRevision 遞增；in-flight poll 寫入前若發現 revision 改變，丟棄 endpoint success/readings 並標 DISCARDED_MODE_CHANGED。
- 切回 Live 後，Collector 最多 1 秒內觀察新 revision；服務時段內先跑 MODE_RESUME 立即輪，再回到三分鐘排程。
- Demo 模式按測試仍是真實企業測試，需再次確認，結果不因 Demo 而成功。

### 8.3 API

GET /api/connection-status

~~~json
{
  "data": {
    "runtimeMode": "LIVE",
    "modeRevision": 4,
    "insideServiceWindow": true,
    "tlsMode": "ALLOWLISTED_SELF_SIGNED",
    "authMode": "NONE",
    "collector": {
      "lastAttemptAt": "2026-11-14T10:00:16+08:00",
      "lastSuccessAt": "2026-11-14T10:00:16+08:00",
      "latestSensorDataAt": "2026-11-14T10:00:15+08:00"
    },
    "manualTest": {
      "lastAttemptAt": "2026-11-14T10:01:10+08:00",
      "result": "SUCCESS",
      "endpoints": [
        {"endpoint":"values","result":"SUCCESS"},
        {"endpoint":"configs","result":"SUCCESS"},
        {"endpoint":"groups","result":"SUCCESS"}
      ]
    },
    "endpoints": [{
      "endpoint": "values",
      "transport": "SUCCESS",
      "apiResult": "SUCCESS",
      "schemaResult": "SUCCESS",
      "collectionLastAttemptAt": "2026-11-14T10:00:16+08:00",
      "collectionLastSuccessAt": "2026-11-14T10:00:16+08:00",
      "latestDataAt": "2026-11-14T10:00:15+08:00",
      "stale": false,
      "error": null
    }]
  }
}
~~~

POST /api/connection-status/test，body {"confirmOutsideWindow":true|false}。  
PUT /api/runtime-mode，body {"mode":"LIVE"|"DEMO","expectedMode":"LIVE"|"DEMO","expectedRevision":4}；回傳新 modeRevision。

### 8.4 驗收

- HTTP 成功但 responseCode/schema 失敗時三層狀態正確分開。
- 非服務時段顯示 OUTSIDE_WINDOW，不偽裝 API 壞掉。
- TLS、白名單、timeout、network 有不同安全訊息。
- Live 失敗不更改 runtime mode。
- Live poll 發出後切 Demo：該 poll 即使 HTTP 成功也不新增 readings，不更新 collectorLastSuccess；audit 為 DISCARDED_MODE_CHANGED。
- Demo 切回 Live 且在 10:01：MODE_RESUME 落 10:00，下一排程落 10:03。
- 手動測試成功但沒有 Collector reading：manualTest 顯示成功，collector/首頁仍維持原狀。
- 未設定認證時 authMode=NONE 可正常啟動與測試 GET；只有企業確認需要時才加 server-only header。
- 頁面/response/log 都不洩漏認證值或真實 origin。

## 9. 舊 UI 選擇性移植

| 可移植概念 | 新版調整 |
|---|---|
| DashboardLayout、Sidebar、Topbar、Brand | 重建七頁導覽與層級，移除資料品質頁 |
| 深酒紅 tokens、卡片、邊框、焦點樣式 | 拆成 tokens/layout/components，提高次要文字對比 |
| Panel、MetricCard、Notice、EmptyState、EmptyTable | 接真實狀態，不保留假數字/假圖 |
| A/B 機台卡選取與 aria | 改每區左四卡、右詳細，移除 3D 場景 |
| API allowlist/error 類別概念 | 新增局部自簽模式，不移植任意 URL |
| Excel 大小限制與 transaction 模式 | 完全換成 v3 六表契約與版本替換 |

## 10. 七頁驗收矩陣

| 頁面 | 真實資料來源 | 核心驗證 | 關鍵反例 |
|---|---|---|---|
| 首頁 | settings + live audit + active batches | 導覽與資料可用性 | 空 DB 不顯示假 KPI |
| 機台監控 | latest live lamp readings / Demo fixture | 八台、狀態/新鮮度分離 | 全零燈號不是 None/正常 |
| 環境監測 | 8 個 live analog sensors | 09–17 固定軸、缺口、兩點分離 | 刷新不清除；斷線不補 0 |
| 歷史加工 | active machine intervals | Green SUM、六態分母、coverage | 缺日/月天數差不補 0 |
| 異常事件 | active machine + alarm rows | 狀態時數 vs 真實 Alarm | 連續 Red 不稱多次故障 |
| Excel 匯入 | 標準化 xlsx + import audit | preview 無寫入、重複、替換 rollback | 缺 Alarm 來源不抹舊資料 |
| API 設定 | endpoint audit + runtime setting | transport/API/schema 分層 | Live 失敗不自動 Demo |

## 11. 相關文件

- [資料契約](./DATA_CONTRACT.md)
- [架構](./ARCHITECTURE.md)
- [資料庫設計](./DATABASE_DESIGN.md)
- [實作計畫](./IMPLEMENTATION_PLAN.md)
