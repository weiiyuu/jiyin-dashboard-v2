import type { Sheet } from "read-excel-file/node";
import { ALARM_HEADERS, ENV_HEADERS, MACHINE_HEADERS, QUALITY_HEADERS } from "./standardized-workbook";

const MACHINES=["A1","A2","A3","A4","B1","B2","B3","B4"];

function nextDate(sourceDate:string){const date=new Date(`${sourceDate}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);}
function clock(minutes:number){return minutes===1440?"24:00":`${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`;}
function dateTime(sourceDate:string,minutes:number){return minutes===1440?`${nextDate(sourceDate)} 00:00:00`:`${sourceDate} ${clock(minutes)}:00`;}

export function fullDayStandardizedWorkbook(sourceDate:string):Sheet[]{
  const machineRows:Array<Array<string|number|null>>=[MACHINE_HEADERS];
  const environmentRows:Array<Array<string|number|null>>=[ENV_HEADERS];
  for(let slot=1;slot<=480;slot++){
    const endMinute=slot*3,timeLabel=clock(endMinute),start=dateTime(sourceDate,endMinute-3),end=dateTime(sourceDate,endMinute);
    for(const machine of MACHINES)machineRows.push([sourceDate,timeLabel,start,end,machine,machine[0],0,0,0,180,0,0,180,.05,0,0,0,1,1,"正常",null]);
    for(const area of ["A","B"])for(const category of ["溫度","濕度"])for(const sensor of [1,2]){
      const base=category==="溫度"?24+sensor/10:50+sensor/10;
      environmentRows.push([sourceDate,timeLabel,start,end,area,sensor,category,base,base+.2,base,base-.2,category==="溫度"?26:40,"僅供參考","正常",null]);
    }
  }
  return[
    {sheet:"machine_3min",data:machineRows},
    {sheet:"environment_3min",data:environmentRows},
    {sheet:"alarm_events",data:[ALARM_HEADERS]},
    {sheet:"quality_issues",data:[QUALITY_HEADERS]},
    {sheet:"data_dictionary",data:[["項目","定義/規則","說明"],["規則版本","IT確認版 v3 / public synthetic",null],["粒度","每3分鐘",null],["區間時間","標籤代表結束",null],["24:00","次日00:00",null],["六態全NaN","維持缺漏",null],["Await/空白/其他非數字","維持缺漏",null],["四態合計秒","None+Red+Yellow+Green",null],["加工小時","Green/3600",null],["加工比例","Green/四態合計",null]]},
    {sheet:"README",data:[["統計項目","數量"],["資料日期",sourceDate],["機台三分鐘筆數",3840],["環境三分鐘筆數",3840],["可取得警報筆數",0],["Alarm來源狀態","已提供"]]},
  ];
}
