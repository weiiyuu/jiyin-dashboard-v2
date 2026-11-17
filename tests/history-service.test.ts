import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, type AppDatabase } from "@/server/db/connection";
import { applyMigrations } from "@/server/db/migrations";
import { confirmImport } from "@/server/import/import-repository";
import { parseWorkbookSheets } from "@/server/import/workbook-parser";
import { getHistoryEvents, getHistoryEventsDefaults, getProcessingComparison, getProcessingRange } from "@/server/statistics/history-service";
import { standardizedWorkbook } from "./fixtures/standardized-workbook";

const roots:string[]=[];const dbs:AppDatabase[]=[];
function setup(){const root=mkdtempSync(join(tmpdir(),"jiyin-history-test-"));roots.push(root);const db=openDatabase(join(root,"test.sqlite"));dbs.push(db);applyMigrations(db);return db;}
afterEach(()=>{while(dbs.length)dbs.pop()!.close();while(roots.length)rmSync(roots.pop()!,{recursive:true,force:true});});

function importDay(db:AppDatabase,date:string,green:number,token:string,withAlarm=false){
  const sheets=standardizedWorkbook(date);const machine=sheets[0].data[1];
  machine[9]=green;machine[12]=green;machine[13]=green/3600;machine[17]=green?1:null;machine[18]=green?1:null;
  if(withAlarm){
    sheets[2].data.push([`${date} 00:43:23`,"濕度感測器","sensor-1","analog","A","濕度過高","ruleValueHigh40.00",41,null,"環境/類比感測器警示","初步"]);
    sheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=1;
  }
  const preview=parseWorkbookSheets(sheets,Buffer.from(token));expect(preview.canConfirm).toBe(true);
  return confirmImport(db,preview,{nowMs:1});
}

function importThreeStateDay(db:AppDatabase,date:string,values:{green:number;yellow:number;red:number},token:string,machineId="A1"){
  const sheets=standardizedWorkbook(date),machine=sheets[0].data[1];
  machine[4]=machineId;machine[5]=machineId[0];machine[6]=0;machine[7]=values.red;machine[8]=values.yellow;machine[9]=values.green;machine[10]=0;machine[11]=0;
  machine[12]=values.red+values.yellow+values.green;machine[13]=values.green/3600;machine[14]=values.yellow/3600;machine[15]=values.red/3600;machine[16]=0;
  machine[17]=machine[12]===0?null:values.green/(machine[12] as number);machine[18]=machine[12]===0?null:values.green/(machine[12] as number);machine[19]="正常";machine[20]=null;
  const preview=parseWorkbookSheets(sheets,Buffer.from(token));expect(preview.canConfirm).toBe(true);
  return confirmImport(db,preview,{nowMs:1});
}

function importMachineSet(db:AppDatabase,date:string,entries:Array<{machineId:string;green:number;yellow:number;red:number}>,token:string){
  const sheets=standardizedWorkbook(date),template=sheets[0].data[1];
  sheets[0].data.splice(1,sheets[0].data.length-1,...entries.map(({machineId,green,yellow,red})=>{const row=[...template];row[4]=machineId;row[5]=machineId[0];row[6]=0;row[7]=red;row[8]=yellow;row[9]=green;row[10]=0;row[11]=0;row[12]=red+yellow+green;row[13]=green/3600;row[14]=yellow/3600;row[15]=red/3600;row[16]=0;row[17]=green+yellow+red===0?null:green/(green+yellow+red);row[18]=row[17];row[19]="正常";row[20]=null;return row;}));
  sheets[5].data.find((row)=>row[0]==="機台三分鐘筆數")![1]=entries.length;
  const preview=parseWorkbookSheets(sheets,Buffer.from(token));expect(preview.canConfirm).toBe(true);
  return confirmImport(db,preview,{nowMs:1});
}

describe("active historical query integration",()=>{
  it("defaults the anomaly date range to the latest seven active dates without using today",()=>{
    const db=setup();importDay(db,"2025-05-01",180,"early");importDay(db,"2025-06-10",180,"latest");
    expect(getHistoryEventsDefaults(db)).toEqual({startDate:"2025-06-04",endDate:"2025-06-10"});
  });
  it("calculates an eligible six-state share from active database rows",()=>{
    const db=setup(),sheets=standardizedWorkbook("2025-06-05"),machine=sheets[0].data[1];machine[7]=0;machine[15]=0;
    const preview=parseWorkbookSheets(sheets,Buffer.from("six-state"));expect(preview.canConfirm).toBe(true);confirmImport(db,preview,{nowMs:1});
    const result=getProcessingRange(db,{startDate:"2025-06-05",endDate:"2025-06-05",bucketMinutes:60,machineIds:["A1"]});
    expect(result.stateShare).toMatchObject({denominatorSeconds:180,percent:{green:1,red:0},availability:"AVAILABLE"});
  });

  it("returns independent three-state shares and keeps 30/60-minute changes out of totals",()=>{
    const db=setup();importThreeStateDay(db,"2025-06-05",{green:90,yellow:60,red:30},"three-state");
    const thirty=getProcessingRange(db,{startDate:"2025-06-05",endDate:"2025-06-05",bucketMinutes:30,machineIds:["A1"]});
    const sixty=getProcessingRange(db,{startDate:"2025-06-05",endDate:"2025-06-05",bucketMinutes:60,machineIds:["A1"]});
    expect(thirty.threeStateShare).toMatchObject({denominatorSeconds:180,percent:{green:.5,yellow:1/3,red:1/6},availability:"AVAILABLE"});
    expect(thirty.threeStateShareByMachine[0]).toMatchObject({machineId:"A1",share:{denominatorSeconds:180}});
    expect(thirty.ranking).toEqual(sixty.ranking);
    expect(thirty.threeStateShare).toEqual(sixty.threeStateShare);
    expect(thirty.seriesByMachine[0].points).toHaveLength(48);
    expect(sixty.seriesByMachine[0].points).toHaveLength(24);
  });

  it("uses only the active replacement and returns ranking, trend, state share and coverage without false zeroes",()=>{
    const db=setup();const first=importDay(db,"2025-06-01",180,"old") as {batchId:number};
    const sheets=standardizedWorkbook("2025-06-01");const machine=sheets[0].data[1];machine[9]=90;machine[12]=90;machine[13]=0.025;
    const replacement=parseWorkbookSheets(sheets,Buffer.from("new"));
    confirmImport(db,replacement,{replace:true,expectedActiveBatchId:first.batchId,nowMs:2});
    const result=getProcessingRange(db,{startDate:"2025-06-01",endDate:"2025-06-01",bucketMinutes:30,machineIds:["A1","A2"]});
    expect(result.ranking).toEqual([
      expect.objectContaining({machineId:"A1",greenHours:0.025,availability:"AVAILABLE"}),
      expect.objectContaining({machineId:"A2",greenHours:null,availability:"MISSING_DATA"}),
    ]);
    expect(result.trend.at(-1)).toMatchObject({greenHours:0.025,availability:"AVAILABLE"});
    expect(result.seriesByMachine).toEqual([
      expect.objectContaining({machineId:"A1",points:expect.arrayContaining([expect.objectContaining({greenHours:0.025,availability:"AVAILABLE"})])}),
      expect.objectContaining({machineId:"A2",points:expect.arrayContaining([expect.objectContaining({greenHours:null,availability:"MISSING_DATA"})])}),
    ]);
    expect(result.stateShareByMachine.map((item)=>item.machineId)).toEqual(["A1","A2"]);
    expect(result.stateShare.denominatorSeconds).toBe(0);
    expect(result.coverage).toMatchObject({requestedDays:1,daysWithActiveBatch:1,expectedIntervals:960,importedIntervals:1,greenEligibleIntervals:1,sixStateEligibleIntervals:0,excludedByRule:{VALUE_NON_NUMERIC:1}});
  });

  it("keeps per-machine all-zero trends available while six-state shares retain backend denominators",()=>{
    const db=setup();importDay(db,"2025-06-06",0,"zero-a1");
    const result=getProcessingRange(db,{startDate:"2025-06-06",endDate:"2025-06-06",bucketMinutes:60,machineIds:["A1"]});
    expect(result.seriesByMachine[0].points.at(-1)).toMatchObject({greenHours:0,availability:"AVAILABLE"});
    expect(result.stateShareByMachine[0]).toMatchObject({machineId:"A1",share:{denominatorSeconds:0,availability:"MISSING_DATA"}});
  });

  it("aligns independent month periods and marks impossible dates NOT_APPLICABLE",()=>{
    const db=setup();importDay(db,"2025-02-28",180,"feb");importDay(db,"2025-03-29",90,"mar");
    const result=getProcessingComparison(db,{compareKind:"month",periodA:"2025-02",periodB:"2025-03",machineIds:["A1","A2"]});
    expect(result.ranking[0].periods).toMatchObject({A:{greenHours:0.05/28,totalGreenHours:0.05,unit:"HOURS_PER_DAY"},B:{greenHours:0.025/31,totalGreenHours:0.025,unit:"HOURS_PER_DAY"}});
    expect(result.trend[28].periods).toMatchObject({A:{availability:"NOT_APPLICABLE",greenHours:null},B:{availability:"AVAILABLE",greenHours:0.025}});
    expect(result.coverage).toMatchObject({A:{expectedIntervals:26880},B:{expectedIntervals:29760}});
    expect(result.threeStateShareByMachine).toHaveLength(2);
  });

  it("uses the same active-query formulas for day and week comparisons",()=>{
    const db=setup();importDay(db,"2025-06-01",180,"day-a");importDay(db,"2025-06-08",90,"day-b");importDay(db,"2025-06-11",90,"week-b-day4");
    const day=getProcessingComparison(db,{compareKind:"day",periodA:"2025-06-01",periodB:"2025-06-08",machineIds:["A1"],bucketMinutes:30});
    expect(day.trend).toHaveLength(24);
    expect(day.seriesByMachine[0].trend).toHaveLength(24);
    expect(day.ranking[0].periods).toMatchObject({A:{greenHours:0.05},B:{greenHours:0.025}});
    expect(day.trend.at(-1)?.periods).toMatchObject({A:{greenHours:0.05,availability:"AVAILABLE"},B:{greenHours:0.025,availability:"AVAILABLE"}});
    const week=getProcessingComparison(db,{compareKind:"week",periodA:"2025-06-01",periodB:"2025-06-08",machineIds:["A1"]});
    expect(week.trend[3].periods).toMatchObject({A:{greenHours:null,availability:"MISSING_DATA"},B:{greenHours:0.025,availability:"AVAILABLE"}});
  });

  it("marks an overall trend point partial when not every selected machine is covered",()=>{
    const db=setup();importDay(db,"2025-06-07",180,"partial-a1");
    const result=getProcessingRange(db,{startDate:"2025-06-07",endDate:"2025-06-07",bucketMinutes:60,machineIds:["A1","A2"]});
    const point=result.trend.at(-1)!;
    expect(point).toMatchObject({greenHours:.05,coverage:{expectedIntervals:40,importedIntervals:1,eligibleIntervals:1,completeness:"PARTIAL"}});
    expect(result.seriesByMachine.find((series)=>series.machineId==="A2")!.points.at(-1)).toMatchObject({greenHours:null,availability:"MISSING_DATA"});
  });

  it("uses real calendar dates for multi-day range points and leaves a missing day null",()=>{
    const db=setup();importDay(db,"2025-06-01",180,"multi-first");importDay(db,"2025-06-03",90,"multi-third");
    const result=getProcessingRange(db,{startDate:"2025-06-01",endDate:"2025-06-03",bucketMinutes:30,machineIds:["A1"]});
    expect(result.seriesByMachine[0].points).toEqual([
      expect.objectContaining({position:"2025-06-01",greenHours:.05,availability:"AVAILABLE"}),
      expect.objectContaining({position:"2025-06-02",greenHours:null,availability:"MISSING_DATA"}),
      expect.objectContaining({position:"2025-06-03",greenHours:.025,availability:"AVAILABLE"}),
    ]);
  });

  it("keeps comparison relative growth unavailable when A is zero and exposes the absolute difference",()=>{
    const db=setup();importThreeStateDay(db,"2025-06-09",{green:0,yellow:180,red:0},"zero-a");importThreeStateDay(db,"2025-06-10",{green:180,yellow:0,red:0},"positive-b");
    const result=getProcessingComparison(db,{compareKind:"day",periodA:"2025-06-09",periodB:"2025-06-10",machineIds:["A1"]});
    expect(result.ranking[0]).toMatchObject({difference:.05,relativeChange:null,periods:{A:{greenHours:0},B:{greenHours:.05}}});
    expect(result.trend.at(-1)?.periods.A).toMatchObject({greenHours:0,availability:"AVAILABLE"});
    expect(result.threeStateShare.periods.A).toMatchObject({denominatorSeconds:180,percent:{green:0,yellow:1,red:0},availability:"AVAILABLE"});
  });

  it("marks an unfinished month without changing the full-calendar-day average denominator",()=>{
    const db=setup();importDay(db,"2025-06-01",180,"partial-month");
    const result=getProcessingComparison(db,{compareKind:"month",periodA:"2025-05",periodB:"2025-06",machineIds:["A1"],nowMs:Date.UTC(2025,5,15)});
    expect(result.periods).toMatchObject({A:{partial:false,elapsedCalendarDays:31},B:{partial:true,elapsedCalendarDays:15,days:30}});
    expect(result.ranking[0].periods.B).toMatchObject({totalGreenHours:.05,greenHours:.05/30,unit:"HOURS_PER_DAY"});
  });

  it("sorts per-machine three-state comparison by period B Green share and returns percentage-point deltas",()=>{
    const db=setup();
    importMachineSet(db,"2025-06-12",[{machineId:"A1",green:90,yellow:90,red:0},{machineId:"A2",green:180,yellow:0,red:0}],"share-a");
    importMachineSet(db,"2025-06-13",[{machineId:"A1",green:180,yellow:0,red:0},{machineId:"A2",green:45,yellow:135,red:0}],"share-b");
    const result=getProcessingComparison(db,{compareKind:"day",periodA:"2025-06-12",periodB:"2025-06-13",machineIds:["A1","A2"]});
    expect(result.threeStateShareByMachine.map((item)=>item.machineId)).toEqual(["A1","A2"]);
    expect(result.threeStateShareByMachine[0]).toMatchObject({machineId:"A1",periods:{A:{percent:{green:.5}},B:{percent:{green:1}}},deltaPercentagePoints:{green:50}});
  });

  it("returns Alarm source coverage, stable source rows and nullable duration",()=>{
    const db=setup();importDay(db,"2025-06-01",180,"empty");importDay(db,"2025-06-02",150,"alarm",true);
    const result=getHistoryEvents(db,{startDate:"2025-06-01",endDate:"2025-06-02",machineIds:["A1"],page:1,pageSize:50});
    expect(result.statusHours).toMatchObject({red:null,yellow:0});
    expect(result.alarmCoverage).toEqual([
      {sourceDate:"2025-06-01",sourceStatus:"PROVIDED_EMPTY",rowCount:0},
      {sourceDate:"2025-06-02",sourceStatus:"PROVIDED_NONEMPTY",rowCount:1},
    ]);
    expect(result.v2.alarm.coverage).toEqual(result.alarmCoverage);
    expect(result.items[0]).toMatchObject({kind:"ENVIRONMENT_ALARM",alarmEventId:expect.any(Number),sourceRowNumber:2,sensorId:"sensor-1",currentValue:41,durationOriginal:null});
    expect(result.pagination).toEqual({page:1,pageSize:50,total:1});
  });

  it("keeps nullable Alarm descriptions nullable while retaining the event by sensor ID",()=>{
    const db=setup(),sheets=standardizedWorkbook("2025-06-03");
    sheets[2].data.push(["2025-06-03 00:43:23",null,"sensor-null",null,null,null,null,null,null,null,null]);
    sheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=1;
    confirmImport(db,parseWorkbookSheets(sheets,Buffer.from("nullable-alarm-query")),{nowMs:1});
    const result=getHistoryEvents(db,{startDate:"2025-06-03",endDate:"2025-06-03",machineIds:["A1"],page:1,pageSize:50});
    expect(result.items[0]).toMatchObject({sensorId:"sensor-null",sensorName:null,sensorType:null,ruleName:null,ruleCondition:null,currentValue:null,durationOriginal:null});
  });

  it("does not turn a missing Alarm source into a zero-event claim",()=>{
    const db=setup(),sheets=standardizedWorkbook("2025-06-03");
    sheets[5].data.find((row)=>row[0]==="Alarm來源狀態")![1]="未提供";
    const preview=parseWorkbookSheets(sheets,Buffer.from("missing-alarm-source"));confirmImport(db,preview,{nowMs:1});
    const result=getHistoryEvents(db,{startDate:"2025-06-03",endDate:"2025-06-03",machineIds:["A1"],page:1,pageSize:50});
    expect(result.alarmCoverage).toEqual([{sourceDate:"2025-06-03",sourceStatus:"MISSING",rowCount:null}]);
    expect(result.v2.alarm.summary.count).toBeNull();
    expect(result.v2.alarm.trend.every((point)=>point.value===null)).toBe(true);
  });

  it("excludes replaced Alarm rows from active history queries",()=>{
    const db=setup(),oldSheets=standardizedWorkbook("2025-06-04");
    oldSheets[2].data.push(["2025-06-04 01:00:00","old","sensor-old","analog","A","old-rule","x",1,null,"old","initial"]);oldSheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=1;
    const old=confirmImport(db,parseWorkbookSheets(oldSheets,Buffer.from("alarm-old")),{nowMs:1}) as {batchId:number};
    const newSheets=standardizedWorkbook("2025-06-04");newSheets[2].data.push(["2025-06-04 02:00:00","new","sensor-new","analog","A","new-rule","x",2,null,"new","initial"]);newSheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=1;
    confirmImport(db,parseWorkbookSheets(newSheets,Buffer.from("alarm-new")),{replace:true,expectedActiveBatchId:old.batchId,nowMs:2});
    const result=getHistoryEvents(db,{startDate:"2025-06-04",endDate:"2025-06-04",machineIds:["A1"],page:1,pageSize:50});
    expect(result.items.map((item)=>item.sensorId)).toEqual(["sensor-new"]);
    expect(result.alarmCoverage[0]).toMatchObject({sourceStatus:"PROVIDED_NONEMPTY",rowCount:1});
    expect(result.v2.alarm.details.items.map((item)=>item.sensorId)).toEqual(["sensor-new"]);
  });

  it("uses one consistent V2 classification and duration population for KPI, trend, detail and ranking",()=>{
    const db=setup(),sheets=standardizedWorkbook("2025-06-05");
    sheets[2].data.push(
      ["2025-06-05 01:00:00","溫度 1","temp-1","analog","A","高溫","x",27,"1 minute","環境/類比感測器警示","已分類"],
      ["2025-06-05 02:00:00","溫度 1","temp-1","analog","A","高溫","x",28,"3 minutes","環境/類比感測器警示","已分類"],
      ["2025-06-05 03:00:00","溫度 2","temp-2","analog","A","高溫","x",29,null,"環境/類比感測器警示","已分類"],
      ["2025-06-05 04:00:00","A3 燈號","lamp-a3","lamp","A","Print Complete","x",1,"2 seconds","加工完成通知","已分類"],
    );
    sheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=4;
    confirmImport(db,parseWorkbookSheets(sheets,Buffer.from("v2-alarm")),{nowMs:1});
    const result=getHistoryEvents(db,{startDate:"2025-06-05",endDate:"2025-06-05",machineIds:["A1"],mode:"all",detailKind:"alarm",page:1,pageSize:20});
    expect(result.v2.alarm.summary).toMatchObject({count:3,averageDurationSeconds:120,maximumDurationSeconds:180,validDurationCount:2});
    expect(result.v2.alarm.sourceBoundary).toMatchObject({environmentAlertRows:3,excludedNotificationRows:1});
    expect(result.v2.alarm.details.items).toHaveLength(3);
    expect(result.v2.alarm.ranking[0]).toMatchObject({key:"temp-1",value:2});
    expect(result.v2.alarm.trend.reduce((sum,point)=>sum+(point.value??0),0)).toBe(3);
  });

  it("filters the complete Alarm detail set by selected sensors without changing KPI, trend or ranking",()=>{
    const db=setup(),sheets=standardizedWorkbook("2025-06-05");
    sheets[2].data.push(
      ["2025-06-05 01:00:00","A 區溫度監測器 1","curf","analog","A","高溫","x",27,"1 minute","環境/類比感測器警示","已分類"],
      ["2025-06-05 02:00:00","列印B區濕度2","e5e0","analog","B","高濕","x",41,"2 minutes","環境/類比感測器警示","已分類"],
      ["2025-06-05 03:00:00","額外環境來源","other-env","analog","其他","高溫","x",28,"3 minutes","環境/類比感測器警示","已分類"],
    );
    sheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=3;
    confirmImport(db,parseWorkbookSheets(sheets,Buffer.from("detail-sensor-filter")),{nowMs:1});
    const all=getHistoryEvents(db,{startDate:"2025-06-05",endDate:"2025-06-05",machineIds:["A1"],mode:"alarm",detailKind:"alarm",page:1,pageSize:20});
    const selected=getHistoryEvents(db,{startDate:"2025-06-05",endDate:"2025-06-05",machineIds:["A1"],mode:"alarm",detailKind:"alarm",detailSensorIds:["curf"],page:1,pageSize:20});
    const empty=getHistoryEvents(db,{startDate:"2025-06-05",endDate:"2025-06-05",machineIds:["A1"],mode:"alarm",detailKind:"alarm",detailSensorIds:[],page:1,pageSize:20});
    expect(all.v2.alarm.detailSensors).toHaveLength(9);
    expect(all.v2.alarm.detailSensors).toEqual(expect.arrayContaining([
      {sensorId:"curf",sensorName:"A 區溫度監測器 1",area:"A"},
      {sensorId:"e5e0",sensorName:"B 區濕度監測器 2",area:"B"},
      {sensorId:"other-env",sensorName:"額外環境來源",area:null},
    ]));
    expect(selected.v2.alarm.details.items.map((item)=>item.sensorId)).toEqual(["curf"]);
    expect(selected.v2.alarm.details.pagination.total).toBe(1);
    expect(empty.v2.alarm.details).toMatchObject({items:[],pagination:{page:1,total:0,totalPages:1}});
    expect(selected.v2.alarm.summary).toEqual(all.v2.alarm.summary);
    expect(selected.v2.alarm.trend).toEqual(all.v2.alarm.trend);
    expect(selected.v2.alarm.ranking).toEqual(all.v2.alarm.ranking);
    expect(empty.v2.alarm.summary).toEqual(all.v2.alarm.summary);
  });

  it("keeps an unknown Alarm classification visible for review without adding it to KPI or ranking",()=>{
    const db=setup(),sheets=standardizedWorkbook("2025-06-05");
    sheets[2].data.push(["2025-06-05 08:00:00","待確認來源","unknown-1",null,null,null,null,null,null,null,null]);
    sheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=1;
    confirmImport(db,parseWorkbookSheets(sheets,Buffer.from("unknown-alarm")),{nowMs:1});
    const result=getHistoryEvents(db,{startDate:"2025-06-05",endDate:"2025-06-05",machineIds:["A1"],page:1,pageSize:20});
    expect(result.v2.alarm.summary).toMatchObject({count:0,unknownClassificationCount:1});
    expect(result.v2.alarm.ranking).toEqual([]);
    expect(result.v2.alarm.details.items[0]).toMatchObject({sensorId:"unknown-1",sourceKind:"UNKNOWN"});
  });

  it("assigns a 23:59 Alarm to its start day without clipping a cross-day duration",()=>{
    const db=setup(),sheets=standardizedWorkbook("2025-06-06");
    sheets[2].data.push(["2025-06-06 23:59:00","溫度 1","temp-1","analog","A","高溫","x",27,"12 hours 14 seconds","環境/類比感測器警示","已分類"]);
    sheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=1;
    confirmImport(db,parseWorkbookSheets(sheets,Buffer.from("cross-day-alarm")),{nowMs:1});
    const day=getHistoryEvents(db,{startDate:"2025-06-06",endDate:"2025-06-06",machineIds:["A1"],page:1,pageSize:20});
    expect(day.v2.alarm.summary).toMatchObject({count:1,maximumDurationSeconds:43214});
    expect(day.v2.alarm.trend[23].value).toBe(1);
    const next=getHistoryEvents(db,{startDate:"2025-06-07",endDate:"2025-06-07",machineIds:["A1"],page:1,pageSize:20});
    expect(next.v2.alarm.summary.count).toBeNull();
  });
});
