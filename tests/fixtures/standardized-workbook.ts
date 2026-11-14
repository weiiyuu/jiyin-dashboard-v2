import type { Sheet } from "read-excel-file/node";

export const MACHINE_HEADERS=["日期","時間","區間開始","區間結束","機台","區域","None秒","Red秒","Yellow秒","Green秒","Blue秒","White秒","四態合計秒","加工小時","待機小時(黃燈)","異常小時","未開機小時","區間加工比例","開機加工比例","品質狀態","品質備註"];
export const ENV_HEADERS=["日期","時間","區間開始","區間結束","區域","感測器編號","類別","平均","最大","中位數","最小","參考門檻","最大值判斷","品質狀態","備註"];
export const ALARM_HEADERS=["事件時間","感測器","感測器ID","類型","群組","規則名稱","規則條件","當前值","持續時間原文","初步事件分類","分類狀態"];
export const QUALITY_HEADERS=["日期","時間","對象","問題","區間合計秒"];

export function standardizedWorkbook(sourceDate="2025-06-01"): Sheet[] {
  const nextDate=new Date(`${sourceDate}T00:00:00Z`);nextDate.setUTCDate(nextDate.getUTCDate()+1);
  const next=nextDate.toISOString().slice(0,10);
  return [
    {sheet:"machine_3min",data:[MACHINE_HEADERS,[sourceDate,"24:00",`${sourceDate} 23:57:00`,`${next} 00:00:00`,"A1","A",0,"Await",0,180,0,0,180,0.05,0,null,0,1,1,"警告","Red Await"]]},
    {sheet:"environment_3min",data:[ENV_HEADERS,[sourceDate,"24:00",`${sourceDate} 23:57:00`,`${next} 00:00:00`,"A",1,"溫度",0,0,null,0,26,"未超過","正常",null]]},
    {sheet:"alarm_events",data:[ALARM_HEADERS]},
    {sheet:"quality_issues",data:[QUALITY_HEADERS]},
    {sheet:"data_dictionary",data:[["項目","定義/規則","說明"],
      ["規則版本","IT確認版 v3 / synthetic",null],["粒度","每3分鐘",null],["區間時間","標籤代表結束",null],
      ["24:00","次日00:00",null],["六態全NaN","維持缺漏",null],["Await/空白/其他非數字","維持缺漏",null],
      ["四態合計秒","None+Red+Yellow+Green",null],["加工小時","Green/3600",null],["加工比例","Green/四態合計",null]]},
    {sheet:"README",data:[["統計項目","數量"],["資料日期",sourceDate],["機台三分鐘筆數",1],["環境三分鐘筆數",1],["可取得警報筆數",0],["Alarm來源狀態","已提供"]]},
  ];
}
