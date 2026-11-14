import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, type AppDatabase } from "@/server/db/connection";
import { applyMigrations } from "@/server/db/migrations";
import { confirmImport } from "@/server/import/import-repository";
import { parseWorkbookSheets } from "@/server/import/workbook-parser";
import { getHistoryEvents, getProcessingComparison, getProcessingRange } from "@/server/statistics/history-service";
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

describe("active historical query integration",()=>{
  it("calculates an eligible six-state share from active database rows",()=>{
    const db=setup(),sheets=standardizedWorkbook("2025-06-05"),machine=sheets[0].data[1];machine[7]=0;machine[15]=0;
    const preview=parseWorkbookSheets(sheets,Buffer.from("six-state"));expect(preview.canConfirm).toBe(true);confirmImport(db,preview,{nowMs:1});
    const result=getProcessingRange(db,{startDate:"2025-06-05",endDate:"2025-06-05",bucketMinutes:60,machineIds:["A1"]});
    expect(result.stateShare).toMatchObject({denominatorSeconds:180,percent:{green:1,red:0},availability:"AVAILABLE"});
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
    expect(result.ranking[0].periods).toMatchObject({A:{greenHours:0.05},B:{greenHours:0.025}});
    expect(result.trend[28].periods).toMatchObject({A:{availability:"NOT_APPLICABLE",greenHours:null},B:{availability:"AVAILABLE",greenHours:0.025}});
    expect(result.coverage).toMatchObject({A:{expectedIntervals:26880},B:{expectedIntervals:29760}});
  });

  it("uses the same active-query formulas for day and week comparisons",()=>{
    const db=setup();importDay(db,"2025-06-01",180,"day-a");importDay(db,"2025-06-08",90,"day-b");importDay(db,"2025-06-11",90,"week-b-day4");
    const day=getProcessingComparison(db,{compareKind:"day",periodA:"2025-06-01",periodB:"2025-06-08",machineIds:["A1"],bucketMinutes:30});
    expect(day.ranking[0].periods).toMatchObject({A:{greenHours:0.05},B:{greenHours:0.025}});
    expect(day.trend.at(-1)?.periods).toMatchObject({A:{greenHours:0.05,availability:"AVAILABLE"},B:{greenHours:0.025,availability:"AVAILABLE"}});
    const week=getProcessingComparison(db,{compareKind:"week",periodA:"2025-06-01",periodB:"2025-06-08",machineIds:["A1"]});
    expect(week.trend[3].periods).toMatchObject({A:{greenHours:null,availability:"MISSING_DATA"},B:{greenHours:0.025,availability:"AVAILABLE"}});
  });

  it("returns Alarm source coverage, stable source rows and nullable duration",()=>{
    const db=setup();importDay(db,"2025-06-01",180,"empty");importDay(db,"2025-06-02",150,"alarm",true);
    const result=getHistoryEvents(db,{startDate:"2025-06-01",endDate:"2025-06-02",machineIds:["A1"],page:1,pageSize:50});
    expect(result.statusHours).toMatchObject({red:null,yellow:0});
    expect(result.alarmCoverage).toEqual([
      {sourceDate:"2025-06-01",sourceStatus:"PROVIDED_EMPTY",rowCount:0},
      {sourceDate:"2025-06-02",sourceStatus:"PROVIDED_NONEMPTY",rowCount:1},
    ]);
    expect(result.items[0]).toMatchObject({kind:"ENVIRONMENT_ALARM",alarmEventId:expect.any(Number),sourceRowNumber:2,sensorId:"sensor-1",currentValue:41,durationOriginal:null});
    expect(result.pagination).toEqual({page:1,pageSize:50,total:1});
  });

  it("does not turn a missing Alarm source into a zero-event claim",()=>{
    const db=setup(),sheets=standardizedWorkbook("2025-06-03");
    sheets[5].data.find((row)=>row[0]==="Alarm來源狀態")![1]="未提供";
    const preview=parseWorkbookSheets(sheets,Buffer.from("missing-alarm-source"));confirmImport(db,preview,{nowMs:1});
    const result=getHistoryEvents(db,{startDate:"2025-06-03",endDate:"2025-06-03",machineIds:["A1"],page:1,pageSize:50});
    expect(result.alarmCoverage).toEqual([{sourceDate:"2025-06-03",sourceStatus:"MISSING",rowCount:null}]);
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
  });
});
