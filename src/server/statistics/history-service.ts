import type { AppDatabase } from "@/server/db/connection";
import { getActiveAlarmEvents, getActiveBatchCoverage, getActiveMachineIntervalsBySourceDate } from "@/server/db/history-repository";
import {
  CURRENT_QUALITY_RULE_VERSION,
} from "@/server/import/workbook-parser";
import {
  bucketGreenSeconds, calculateGreenHours, calculateSixStateShare, calculateStateHours,
  expectedIntervals, groupContinuousStateRuns, type Availability, type StatisticInterval,
} from "./history-statistics";

const DAY_MS=86_400_000;
const MACHINE_IDS=["A1","A2","A3","A4","B1","B2","B3","B4"] as const;

function parseDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error("DATE_INVALID");const epoch=Date.parse(`${value}T00:00:00Z`);if(!Number.isFinite(epoch)||new Date(epoch).toISOString().slice(0,10)!==value)throw new Error("DATE_INVALID");return epoch;}
function dateAt(epoch:number){return new Date(epoch).toISOString().slice(0,10);}
function addDays(value:string,days:number){return dateAt(parseDate(value)+days*DAY_MS);}
function daysInclusive(start:string,end:string){const days=(parseDate(end)-parseDate(start))/DAY_MS+1;if(!Number.isInteger(days)||days<1||days>366)throw new Error("DATE_RANGE_INVALID");return days;}
function machines(ids:string[]){const unique=[...new Set(ids)];if(!unique.length||unique.some((id)=>!MACHINE_IDS.includes(id as typeof MACHINE_IDS[number])))throw new Error("MACHINE_IDS_INVALID");return unique;}

function statisticRow(row:Record<string,unknown>):StatisticInterval{return{
  machineId:String(row.machine_id),sourceDate:String(row.source_date),timeLabel:String(row.time_label),intervalStartMs:Number(row.interval_start_ms),intervalEndMs:Number(row.interval_end_ms),
  noneSeconds:nullableNumber(row.none_seconds),redSeconds:nullableNumber(row.red_seconds),yellowSeconds:nullableNumber(row.yellow_seconds),greenSeconds:nullableNumber(row.green_seconds),blueSeconds:nullableNumber(row.blue_seconds),whiteSeconds:nullableNumber(row.white_seconds),
  greenHoursEligible:Boolean(row.green_hours_eligible),sixStateShareEligible:Boolean(row.six_state_share_eligible),transitionEligible:Boolean(row.transition_eligible),qualityRuleVersion:String(row.quality_rule_version),
  issueCodes:parseIssueCodes(row.issue_codes_json),
};}
function nullableNumber(value:unknown){return value===null||value===undefined?null:Number(value);}
function nullableText(value:unknown){return value===null||value===undefined?null:String(value);}
function parseIssueCodes(value:unknown){try{const parsed=JSON.parse(String(value));return Array.isArray(parsed)?parsed.filter((item):item is string=>typeof item==="string"):[];}catch{return[];}}
function activeRows(db:AppDatabase,machineIds:string[],startDate:string,endDate:string){return getActiveMachineIntervalsBySourceDate(db,machineIds,startDate,endDate).map(statisticRow);}
function activeDates(db:AppDatabase,startDate:string,endDate:string){return getActiveBatchCoverage(db,startDate,endDate);}

function coverage(db:AppDatabase,rows:StatisticInterval[],startDate:string,endDate:string,machineCount:number){
  const requestedDays=daysInclusive(startDate,endDate),green=calculateGreenHours(rows,CURRENT_QUALITY_RULE_VERSION,expectedIntervals(requestedDays,machineCount)),six=calculateSixStateShare(rows,CURRENT_QUALITY_RULE_VERSION,expectedIntervals(requestedDays,machineCount));
  return{requestedDays,daysWithActiveBatch:activeDates(db,startDate,endDate).length,expectedIntervals:expectedIntervals(requestedDays,machineCount),importedIntervals:rows.length,greenEligibleIntervals:green.coverage.metricEligibleIntervals,sixStateEligibleIntervals:six.coverage.metricEligibleIntervals,excludedByRule:{...green.coverage.excludedByReason,...six.coverage.excludedByReason}};
}
function stateShare(rows:StatisticInterval[]){const result=calculateSixStateShare(rows,CURRENT_QUALITY_RULE_VERSION,0);return{seconds:result.seconds,percent:result.shares,denominatorSeconds:result.denominatorSeconds,availability:result.coverage.metricEligibleIntervals?"AVAILABLE" as const:"MISSING_DATA" as const};}
function ranking(rows:StatisticInterval[],machineIds:string[]){return machineIds.map((machineId)=>{const result=calculateGreenHours(rows.filter((row)=>row.machineId===machineId),CURRENT_QUALITY_RULE_VERSION,0);return{machineId,greenHours:result.hours,hasData:result.availability==="AVAILABLE",availability:result.availability,eligibleIntervals:result.coverage.metricEligibleIntervals};}).sort((a,b)=>(b.greenHours??-1)-(a.greenHours??-1)||a.machineId.localeCompare(b.machineId));}
function clock(minute:number){return minute===1440?"24:00":`${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;}
function bucketLabel(index:number,bucket:30|60){return`${clock(index*bucket)}-${clock((index+1)*bucket)}`;}

export interface ProcessingRangeInput {startDate:string;endDate:string;bucketMinutes:30|60;machineIds:string[]}
function rangeTrend(rows:StatisticInterval[],startDate:string,requestedDays:number,bucketMinutes:30|60){
  const grain=requestedDays===1?bucketMinutes:"DAY" as const,buckets=bucketGreenSeconds(rows,grain,CURRENT_QUALITY_RULE_VERSION),byKey=new Map(buckets.map((bucket)=>[bucket.key,bucket]));
  return requestedDays===1
    ?Array.from({length:1440/bucketMinutes},(_,index)=>{const minute=index*bucketMinutes,key=`${startDate} ${clock(minute)}`,bucket=byKey.get(key),position=bucketLabel(index,bucketMinutes);return{position,sourceLabel:`${startDate} ${position}`,greenHours:bucket?.greenHours??null,availability:bucket?.availability??"MISSING_DATA" as Availability,importedIntervals:bucket?.importedIntervals??0,eligibleIntervals:bucket?.eligibleIntervals??0};})
    :Array.from({length:requestedDays},(_,index)=>{const sourceDate=addDays(startDate,index),bucket=byKey.get(sourceDate);return{position:sourceDate,sourceLabel:sourceDate,greenHours:bucket?.greenHours??null,availability:bucket?.availability??"MISSING_DATA" as Availability,importedIntervals:bucket?.importedIntervals??0,eligibleIntervals:bucket?.eligibleIntervals??0};});
}
export function getProcessingRange(db:AppDatabase,input:ProcessingRangeInput){
  const machineIds=machines(input.machineIds),requestedDays=daysInclusive(input.startDate,input.endDate),rows=activeRows(db,machineIds,input.startDate,input.endDate);
  const trend=rangeTrend(rows,input.startDate,requestedDays,input.bucketMinutes);
  const seriesByMachine=machineIds.map((machineId)=>({machineId,points:rangeTrend(rows.filter((row)=>row.machineId===machineId),input.startDate,requestedDays,input.bucketMinutes)}));
  const stateShareByMachine=machineIds.map((machineId)=>({machineId,share:stateShare(rows.filter((row)=>row.machineId===machineId))}));
  return{mode:"range" as const,ranking:ranking(rows,machineIds),trend,seriesByMachine,stateShare:stateShare(rows),stateShareByMachine,coverage:coverage(db,rows,input.startDate,input.endDate,machineIds.length)};
}

export type CompareKind="day"|"week"|"month";
export interface ProcessingComparisonInput {compareKind:CompareKind;periodA:string;periodB:string;machineIds:string[];bucketMinutes?:30|60}
interface Period {label:string;startDate:string;endDate:string;days:number;positions:number}
function period(kind:CompareKind,value:string,bucket:30|60):Period{
  if(kind==="day"){parseDate(value);return{label:value,startDate:value,endDate:value,days:1,positions:1440/bucket};}
  if(kind==="week"){parseDate(value);return{label:value,startDate:value,endDate:addDays(value,6),days:7,positions:7};}
  if(!/^\d{4}-\d{2}$/.test(value))throw new Error("PERIOD_INVALID");const [year,month]=value.split("-").map(Number);if(month<1||month>12)throw new Error("PERIOD_INVALID");const days=new Date(Date.UTC(year,month,0)).getUTCDate();return{label:value,startDate:`${value}-01`,endDate:`${value}-${String(days).padStart(2,"0")}`,days,positions:31};
}
function trendMap(rows:StatisticInterval[],kind:CompareKind,periodValue:Period,bucket:30|60){
  const result=new Map<number,{sourceDate:string;greenHours:number|null;availability:Availability}>();
  if(kind==="day"){
    const buckets=bucketGreenSeconds(rows,bucket,CURRENT_QUALITY_RULE_VERSION),byKey=new Map(buckets.map((item)=>[item.key,item]));
    for(let i=0;i<periodValue.positions;i++){const minute=i*bucket,key=`${periodValue.startDate} ${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`,item=byKey.get(key);result.set(i+1,{sourceDate:periodValue.startDate,greenHours:item?.greenHours??null,availability:item?.availability??"MISSING_DATA"});}
  }else{
    const buckets=new Map(bucketGreenSeconds(rows,"DAY",CURRENT_QUALITY_RULE_VERSION).map((item)=>[item.key,item]));
    for(let i=0;i<periodValue.positions;i++){
      if(i>=periodValue.days){result.set(i+1,{sourceDate:"",greenHours:null,availability:"NOT_APPLICABLE"});continue;}
      const sourceDate=addDays(periodValue.startDate,i),item=buckets.get(sourceDate);result.set(i+1,{sourceDate,greenHours:item?.greenHours??null,availability:item?.availability??"MISSING_DATA"});
    }
  }return result;
}
function rankingPeriod(rows:StatisticInterval[],machineId:string){const result=calculateGreenHours(rows.filter((row)=>row.machineId===machineId),CURRENT_QUALITY_RULE_VERSION,0);return{greenHours:result.hours,availability:result.availability,eligibleIntervals:result.coverage.metricEligibleIntervals};}

export function getProcessingComparison(db:AppDatabase,input:ProcessingComparisonInput){
  const machineIds=machines(input.machineIds),bucket=input.bucketMinutes??30,a=period(input.compareKind,input.periodA,bucket),b=period(input.compareKind,input.periodB,bucket),rowsA=activeRows(db,machineIds,a.startDate,a.endDate),rowsB=activeRows(db,machineIds,b.startDate,b.endDate),trendA=trendMap(rowsA,input.compareKind,a,bucket),trendB=trendMap(rowsB,input.compareKind,b,bucket),positions=Math.max(a.positions,b.positions);
  return{mode:"compare" as const,compareKind:input.compareKind,periods:{A:a,B:b},ranking:machineIds.map((machineId)=>({machineId,periods:{A:rankingPeriod(rowsA,machineId),B:rankingPeriod(rowsB,machineId)}})),trend:Array.from({length:positions},(_,index)=>{const numericPosition=index+1,pa=trendA.get(numericPosition)!,pb=trendB.get(numericPosition)!;return{position:input.compareKind==="day"?bucketLabel(index,bucket):numericPosition,periods:{A:{sourceDate:pa.sourceDate||null,greenHours:pa.greenHours,availability:pa.availability},B:{sourceDate:pb.sourceDate||null,greenHours:pb.greenHours,availability:pb.availability}}};}),stateShare:{periods:{A:stateShare(rowsA),B:stateShare(rowsB)}},coverage:{A:coverage(db,rowsA,a.startDate,a.endDate,machineIds.length),B:coverage(db,rowsB,b.startDate,b.endDate,machineIds.length)}};
}

export interface HistoryEventsInput {startDate:string;endDate:string;machineIds:string[];sensorIds?:string[];sensorType?:string;ruleName?:string;page:number;pageSize:number}
export function getHistoryEvents(db:AppDatabase,input:HistoryEventsInput){
  const machineIds=machines(input.machineIds),requestedDays=daysInclusive(input.startDate,input.endDate),rows=activeRows(db,machineIds,input.startDate,input.endDate),red=calculateStateHours(rows,"red",CURRENT_QUALITY_RULE_VERSION),yellow=calculateStateHours(rows,"yellow",CURRENT_QUALITY_RULE_VERSION),batchRows=activeDates(db,input.startDate,input.endDate),batchByDate=new Map(batchRows.map((row)=>[row.source_date,row]));
  const alarmCoverage=Array.from({length:requestedDays},(_,index)=>{const sourceDate=addDays(input.startDate,index),batch=batchByDate.get(sourceDate);if(!batch)return{sourceDate,sourceStatus:"MISSING" as const,rowCount:null};const readable=batch.alarm_source_status==="PROVIDED_NONEMPTY"||batch.alarm_source_status==="PROVIDED_EMPTY";return{sourceDate,sourceStatus:batch.alarm_source_status,rowCount:readable?batch.alarm_row_count:null};});
  const alarms=getActiveAlarmEvents(db,{startDate:input.startDate,endDate:input.endDate,sensorIds:input.sensorIds,sensorType:input.sensorType,ruleName:input.ruleName,page:input.page,pageSize:input.pageSize});
  const items=alarms.rows.map((row)=>({kind:"ENVIRONMENT_ALARM" as const,alarmEventId:Number(row.alarm_event_id),sourceRowNumber:Number(row.source_row_number),eventAtMs:Number(row.event_at_ms),eventTimeText:String(row.event_time_text),sensorId:String(row.sensor_id),sensorName:nullableText(row.sensor_name),sensorType:nullableText(row.sensor_type),ruleName:nullableText(row.rule_name),ruleCondition:nullableText(row.rule_condition_text),currentValue:nullableNumber(row.current_value_numeric),currentValueText:nullableText(row.current_value_text),durationOriginal:nullableText(row.duration_original),classification:nullableText(row.initial_classification),classificationStatus:nullableText(row.classification_status)}));
  return{statusHours:{red:red.hours,yellow:yellow.hours},affectedMachines:{red:[...new Set(rows.filter((row)=>(row.redSeconds??0)>0).map((row)=>row.machineId))],yellow:[...new Set(rows.filter((row)=>(row.yellowSeconds??0)>0).map((row)=>row.machineId))]},statusGroups:{red:groupContinuousStateRuns(rows,"red",CURRENT_QUALITY_RULE_VERSION),yellow:groupContinuousStateRuns(rows,"yellow",CURRENT_QUALITY_RULE_VERSION)},alarmCoverage,items,pagination:{page:input.page,pageSize:input.pageSize,total:alarms.total}};
}
