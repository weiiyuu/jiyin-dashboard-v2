import { createHash } from "node:crypto";
import readWorkbook, { type CellValue, type Sheet } from "read-excel-file/node";
import { intervalBounds } from "@/shared/time/taipei";
import { preflightXlsx } from "./xlsx-preflight";
import { REQUIRED_SHEETS, type ImportIssue, type ImportPreview, type MetadataImportRow } from "./types";

export const CURRENT_QUALITY_RULE_VERSION = "jiyin-quality-v1";

const MACHINE_HEADERS = ["日期","時間","區間開始","區間結束","機台","區域","None秒","Red秒","Yellow秒","Green秒","Blue秒","White秒","四態合計秒","加工小時","待機小時(黃燈)","異常小時","未開機小時","區間加工比例","開機加工比例","品質狀態","品質備註"];
const ENV_HEADERS = ["日期","時間","區間開始","區間結束","區域","感測器編號","類別","平均","最大","中位數","最小","參考門檻","最大值判斷","品質狀態","備註"];
const ALARM_HEADERS = ["事件時間","感測器","感測器ID","類型","群組","規則名稱","規則條件","當前值","持續時間原文","初步事件分類","分類狀態"];
const QUALITY_HEADERS = ["日期","時間","對象","問題","區間合計秒"];
const DICTIONARY_HEADERS = ["項目","定義/規則","說明"];
const README_HEADERS = ["統計項目","數量"];
const KNOWN_QUALITY = new Set(["通過", "警告", "待核對", "正常"]);

function text(value: CellValue | null): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
function required(value: CellValue | null, label: string) {
  const result = text(value);
  if (result === null || result === "") throw new Error(`REQUIRED:${label}`);
  return result;
}
function present(value:CellValue|null,issues:ImportIssue[],sheetName:string,row:number,columnName:string,ruleCode:string){
  const result=text(value)??"";if(result==="")add(issues,{ruleCode,severity:"ERROR",sheetName,sourceRowNumber:row,columnName});return result;
}
function numeric(value: CellValue | null, column: string, exceptions: Record<string,string>): number|null {
  if (value === null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw=text(value)!; const result=Number(raw);
  if(raw.trim()!==""&&Number.isFinite(result))return result;
  exceptions[column]=raw; return null;
}
function add(issues:ImportIssue[], issue:Omit<ImportIssue,"messageSafe">&{messageSafe?:string}) {
  issues.push({...issue,messageSafe:issue.messageSafe??issue.ruleCode});
}
function headers(sheetName:string, actual:Array<CellValue|null>, expected:string[], issues:ImportIssue[]) {
  const names=actual.map((value)=>text(value)??"");
  for(const name of expected)if(!names.includes(name))add(issues,{ruleCode:"STRUCT_MISSING_COLUMN",severity:"ERROR",sheetName,columnName:name,messageSafe:`${sheetName} 缺少必要欄位：${name}`});
  for(const name of names)if(name&&!expected.includes(name))add(issues,{ruleCode:"STRUCT_UNEXPECTED_COLUMN",severity:"ERROR",sheetName,columnName:name,messageSafe:`${sheetName} 含未定義欄位：${name}`});
  return new Map(names.map((name,index)=>[name,index]));
}
function cell(row:Array<CellValue|null>, index:Map<string,number>, name:string){return row[index.get(name)??-1]??null;}
function canonicalCell(value:CellValue|null):unknown{return value instanceof Date?["date",value.toISOString()]:value===null?["null"]:[typeof value,value];}
function validDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const epoch=Date.parse(`${value}T00:00:00+08:00`);
  return Number.isFinite(epoch)&&new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei"}).format(new Date(epoch))===value;
}
function localDateTime(value:string):number|null{
  const normalized=value.trim().replace(" ","T");
  const withZone=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(normalized)?`${normalized.length===16?`${normalized}:00`:normalized}+08:00`:normalized;
  const epoch=Date.parse(withZone);return Number.isFinite(epoch)?epoch:null;
}
function validatedBounds(sourceDate:string,timeLabel:string,startText:string,endText:string,sheetName:string,row:number,issues:ImportIssue[]){
  let intervalStartMs=0,intervalEndMs=180_000;
  try{if(!validDate(sourceDate))throw new Error();({intervalStartMs,intervalEndMs}=intervalBounds(sourceDate,timeLabel));}
  catch{add(issues,{ruleCode:"TIME_INVALID_LABEL",severity:"ERROR",sheetName,sourceRowNumber:row});return{intervalStartMs,intervalEndMs};}
  const sourceStart=localDateTime(startText),sourceEnd=localDateTime(endText);
  if(sourceStart===null||sourceEnd===null)add(issues,{ruleCode:"TIME_INVALID_LABEL",severity:"ERROR",sheetName,sourceRowNumber:row});
  else if(sourceStart!==intervalStartMs||sourceEnd!==intervalEndMs||sourceEnd-sourceStart!==180_000)add(issues,{ruleCode:"TIME_INTERVAL_MISMATCH",severity:"ERROR",sheetName,sourceRowNumber:row});
  return{intervalStartMs,intervalEndMs};
}
function close(source:number|null,expected:number|null){return source===null||expected===null?source===expected:Math.abs(source-expected)<=Math.max(1e-9,Math.abs(expected)*1e-8);}
function derived(issues:ImportIssue[],row:number,columnName:string,source:number|null,expected:number|null){
  if(!close(source,expected)){add(issues,{ruleCode:"DERIVED_VALUE_MISMATCH",severity:"WARNING",sheetName:"machine_3min",sourceRowNumber:row,columnName});return true;}return false;
}
function numericIssues(issues:ImportIssue[],sheetName:string,row:number,exceptions:Record<string,string>,values:Array<[string,number|null]>){
  for(const columnName of Object.keys(exceptions))add(issues,{ruleCode:"VALUE_NON_NUMERIC",severity:"WARNING",sheetName,sourceRowNumber:row,columnName});
  for(const [columnName,value] of values)if(value!==null&&value<0)add(issues,{ruleCode:"VALUE_NEGATIVE",severity:"WARNING",sheetName,sourceRowNumber:row,columnName});
}
function quality(issues:ImportIssue[],sheetName:string,row:number,status:string){
  if(!KNOWN_QUALITY.has(status))add(issues,{ruleCode:"QUALITY_STATUS_UNKNOWN",severity:"WARNING",sheetName,sourceRowNumber:row,columnName:"品質狀態"});
}

export async function previewWorkbook(bytes:Buffer,originalFileName:string):Promise<ImportPreview>{preflightXlsx(bytes);return parseWorkbookSheets(await readWorkbook(bytes),bytes,originalFileName);}

export function parseWorkbookSheets(workbook:Sheet[],bytes:Buffer=Buffer.alloc(0),originalFileName="synthetic.xlsx"):ImportPreview{
  const issues:ImportIssue[]=[];const byName=new Map(workbook.map((sheet)=>[sheet.sheet,sheet.data]));
  for(const name of REQUIRED_SHEETS)if(!byName.has(name))add(issues,{ruleCode:"STRUCT_MISSING_SHEET",severity:"ERROR",sheetName:name,messageSafe:`缺少必要工作表：${name}`});
  const canonicalFingerprint=createHash("sha256").update(JSON.stringify(REQUIRED_SHEETS.map((name)=>[name,(byName.get(name)??[]).map((row)=>row.map(canonicalCell))]))).digest("hex");
  const fileSha256=createHash("sha256").update(bytes).digest("hex");const sourceDates=new Set<string>();

  const machineData=byName.get("machine_3min")??[];const mi=headers("machine_3min",machineData[0]??[],MACHINE_HEADERS,issues);
  const machineRows=machineData.slice(1).map((row,index)=>{
    const sourceRowNumber=index+2,exceptions:Record<string,string>={};
    const sourceDate=present(cell(row,mi,"日期"),issues,"machine_3min",sourceRowNumber,"日期","TIME_INVALID_LABEL"),timeLabel=present(cell(row,mi,"時間"),issues,"machine_3min",sourceRowNumber,"時間","TIME_INVALID_LABEL");sourceDates.add(sourceDate);
    const intervalStartText=present(cell(row,mi,"區間開始"),issues,"machine_3min",sourceRowNumber,"區間開始","TIME_INVALID_LABEL"),intervalEndText=present(cell(row,mi,"區間結束"),issues,"machine_3min",sourceRowNumber,"區間結束","TIME_INVALID_LABEL");
    const bounds=validatedBounds(sourceDate,timeLabel,intervalStartText,intervalEndText,"machine_3min",sourceRowNumber,issues);
    const machineId=text(cell(row,mi,"機台"))??"",area=text(cell(row,mi,"區域"))??"";
    if(!/^[AB][1-4]$/.test(machineId)||!/^[AB]$/.test(area)||area!==machineId[0])add(issues,{ruleCode:"MACHINE_IDENTITY_INVALID",severity:"ERROR",sheetName:"machine_3min",sourceRowNumber});
    const stateNames=["None秒","Red秒","Yellow秒","Green秒","Blue秒","White秒"] as const;
    const values=stateNames.map((name)=>numeric(cell(row,mi,name),name,exceptions));
    const [noneSeconds,redSeconds,yellowSeconds,greenSeconds,blueSeconds,whiteSeconds]=values;
    numericIssues(issues,"machine_3min",sourceRowNumber,exceptions,stateNames.map((name,i)=>[name,values[i]]));
    const issueCodes=new Set<string>();if(Object.keys(exceptions).length)issueCodes.add("VALUE_NON_NUMERIC");if(values.some((v)=>v!==null&&v<0))issueCodes.add("VALUE_NEGATIVE");
    if(values.every((v)=>v===null)){issueCodes.add("STATE_ALL_MISSING");add(issues,{ruleCode:"STATE_ALL_MISSING",severity:"WARNING",sheetName:"machine_3min",sourceRowNumber});}
    const allSixValid=values.every((v)=>v!==null&&v>=0);const total=allSixValid?values.reduce<number>((sum,v)=>sum+v!,0):null;
    if(total!==null&&(total<179||total>181)){issueCodes.add("STATE_TOTAL_OUT_OF_TOLERANCE");add(issues,{ruleCode:"STATE_TOTAL_OUT_OF_TOLERANCE",severity:"WARNING",sheetName:"machine_3min",sourceRowNumber});}
    if((blueSeconds??0)>0||(whiteSeconds??0)>0){issueCodes.add("STATE_BLUE_WHITE_NONZERO");add(issues,{ruleCode:"STATE_BLUE_WHITE_NONZERO",severity:"WARNING",sheetName:"machine_3min",sourceRowNumber});}
    const sourceFourStateTotalSeconds=numeric(cell(row,mi,"四態合計秒"),"四態合計秒",exceptions),sourceProcessingHours=numeric(cell(row,mi,"加工小時"),"加工小時",exceptions),sourceYellowHours=numeric(cell(row,mi,"待機小時(黃燈)"),"待機小時(黃燈)",exceptions),sourceRedHours=numeric(cell(row,mi,"異常小時"),"異常小時",exceptions),sourceNoneHours=numeric(cell(row,mi,"未開機小時"),"未開機小時",exceptions),sourceIntervalProcessingRatio=numeric(cell(row,mi,"區間加工比例"),"區間加工比例",exceptions),sourcePoweredProcessingRatio=numeric(cell(row,mi,"開機加工比例"),"開機加工比例",exceptions);
    const four=[noneSeconds,redSeconds,yellowSeconds,greenSeconds],fourValid=four.every((v)=>v!==null&&v>=0),fourTotal=fourValid?four.reduce<number>((sum,v)=>sum+v!,0):null;
    const powered=[redSeconds,yellowSeconds,greenSeconds],poweredValid=powered.every((v)=>v!==null&&v>=0),poweredTotal=poweredValid?powered.reduce<number>((sum,v)=>sum+v!,0):null;
    const derivedValues:Array<[string,number|null,number|null]>=[["四態合計秒",sourceFourStateTotalSeconds,fourTotal],["加工小時",sourceProcessingHours,greenSeconds!==null&&greenSeconds>=0?greenSeconds/3600:null],["待機小時(黃燈)",sourceYellowHours,yellowSeconds!==null&&yellowSeconds>=0?yellowSeconds/3600:null],["異常小時",sourceRedHours,redSeconds!==null&&redSeconds>=0?redSeconds/3600:null],["未開機小時",sourceNoneHours,noneSeconds!==null&&noneSeconds>=0?noneSeconds/3600:null],["區間加工比例",sourceIntervalProcessingRatio,fourTotal!==null&&fourTotal>0?greenSeconds!/fourTotal:null],["開機加工比例",sourcePoweredProcessingRatio,poweredTotal!==null&&poweredTotal>0?greenSeconds!/poweredTotal:null]];
    if(derivedValues.map(([column,source,expected])=>derived(issues,sourceRowNumber,column,source,expected)).some(Boolean))issueCodes.add("DERIVED_VALUE_MISMATCH");
    const derivedExceptions=Object.fromEntries(Object.entries(exceptions).filter(([column])=>!stateNames.includes(column as typeof stateNames[number])));numericIssues(issues,"machine_3min",sourceRowNumber,derivedExceptions,derivedValues.map(([column,source])=>[column,source]));
    const sourceQualityStatus=text(cell(row,mi,"品質狀態"))??"";if(sourceQualityStatus==="")add(issues,{ruleCode:"QUALITY_STATUS_UNKNOWN",severity:"ERROR",sheetName:"machine_3min",sourceRowNumber,columnName:"品質狀態"});else quality(issues,"machine_3min",sourceRowNumber,sourceQualityStatus);const qualityKnown=KNOWN_QUALITY.has(sourceQualityStatus);
    return{sourceRowNumber,sourceDate,timeLabel,intervalStartText,intervalEndText,...bounds,machineId,area,noneSeconds,redSeconds,yellowSeconds,greenSeconds,blueSeconds,whiteSeconds,sourceFourStateTotalSeconds,sourceProcessingHours,sourceYellowHours,sourceRedHours,sourceNoneHours,sourceIntervalProcessingRatio,sourcePoweredProcessingRatio,sourceQualityStatus,sourceQualityNote:text(cell(row,mi,"品質備註")),sourceExceptionJson:Object.keys(exceptions).length?JSON.stringify(exceptions):null,greenHoursEligible:greenSeconds!==null&&greenSeconds>=0&&qualityKnown?1:0,fourStateRatioEligible:fourTotal!==null&&fourTotal>0&&qualityKnown?1:0,sixStateShareEligible:allSixValid&&total!==null&&total>=179&&total<=181&&qualityKnown?1:0,transitionEligible:allSixValid&&total!==null&&total>=179&&total<=181&&qualityKnown?1:0,qualityRuleVersion:CURRENT_QUALITY_RULE_VERSION,issueCodesJson:JSON.stringify([...issueCodes])};
  });
  const machineKeys=new Set<string>();for(const row of machineRows){const key=`${row.machineId}|${row.sourceDate}|${row.timeLabel}`;if(machineKeys.has(key))add(issues,{ruleCode:"TIME_DUPLICATE_BUSINESS_KEY",severity:"ERROR",sheetName:"machine_3min",sourceRowNumber:row.sourceRowNumber,messageSafe:"機台區間業務鍵重複"});machineKeys.add(key);}

  const envData=byName.get("environment_3min")??[];const ei=headers("environment_3min",envData[0]??[],ENV_HEADERS,issues);
  const environmentRows=envData.slice(1).map((row,index)=>{
    const sourceRowNumber=index+2,exceptions:Record<string,string>={};const sourceDate=present(cell(row,ei,"日期"),issues,"environment_3min",sourceRowNumber,"日期","TIME_INVALID_LABEL"),timeLabel=present(cell(row,ei,"時間"),issues,"environment_3min",sourceRowNumber,"時間","TIME_INVALID_LABEL");sourceDates.add(sourceDate);
    const intervalStartText=present(cell(row,ei,"區間開始"),issues,"environment_3min",sourceRowNumber,"區間開始","TIME_INVALID_LABEL"),intervalEndText=present(cell(row,ei,"區間結束"),issues,"environment_3min",sourceRowNumber,"區間結束","TIME_INVALID_LABEL"),bounds=validatedBounds(sourceDate,timeLabel,intervalStartText,intervalEndText,"environment_3min",sourceRowNumber,issues);
    const area=text(cell(row,ei,"區域"))??"";if(!/^[AB]$/.test(area))add(issues,{ruleCode:"MACHINE_IDENTITY_INVALID",severity:"ERROR",sheetName:"environment_3min",sourceRowNumber,columnName:"區域"});
    const sensorNumberRaw=numeric(cell(row,ei,"感測器編號"),"感測器編號",exceptions),sensorNumber=sensorNumberRaw??0;if(!Number.isInteger(sensorNumberRaw)||sensorNumber<=0)add(issues,{ruleCode:"VALUE_NON_NUMERIC",severity:"ERROR",sheetName:"environment_3min",sourceRowNumber,columnName:"感測器編號",messageSafe:"感測器編號必須為正整數"});
    const averageValue=numeric(cell(row,ei,"平均"),"平均",exceptions),maximumValue=numeric(cell(row,ei,"最大"),"最大",exceptions),medianValue=numeric(cell(row,ei,"中位數"),"中位數",exceptions),minimumValue=numeric(cell(row,ei,"最小"),"最小",exceptions),referenceThreshold=numeric(cell(row,ei,"參考門檻"),"參考門檻",exceptions),numericValues:Array<[string,number|null]>=[["平均",averageValue],["最大",maximumValue],["中位數",medianValue],["最小",minimumValue],["參考門檻",referenceThreshold]];numericIssues(issues,"environment_3min",sourceRowNumber,exceptions,numericValues);
    const sourceQualityStatus=text(cell(row,ei,"品質狀態"))??"";if(sourceQualityStatus==="")add(issues,{ruleCode:"QUALITY_STATUS_UNKNOWN",severity:"ERROR",sheetName:"environment_3min",sourceRowNumber,columnName:"品質狀態"});else quality(issues,"environment_3min",sourceRowNumber,sourceQualityStatus);const qualityKnown=KNOWN_QUALITY.has(sourceQualityStatus),issueCodes=[...new Set([...(Object.keys(exceptions).length?["VALUE_NON_NUMERIC"]:[]),...(numericValues.some(([,v])=>v!==null&&v<0)?["VALUE_NEGATIVE"]:[]),...(!qualityKnown?["QUALITY_STATUS_UNKNOWN"]:[])])];
    return{sourceRowNumber,sourceDate,timeLabel,intervalStartText,intervalEndText,...bounds,area,sensorNumber,category:required(cell(row,ei,"類別"),"類別"),averageValue,maximumValue,medianValue,minimumValue,referenceThreshold,sourceMaxJudgement:text(cell(row,ei,"最大值判斷")),sourceQualityStatus,sourceNote:text(cell(row,ei,"備註")),sourceExceptionJson:Object.keys(exceptions).length?JSON.stringify(exceptions):null,averageEligible:averageValue!==null&&averageValue>=0&&qualityKnown?1:0,maximumEligible:maximumValue!==null&&maximumValue>=0&&qualityKnown?1:0,medianEligible:medianValue!==null&&medianValue>=0&&qualityKnown?1:0,minimumEligible:minimumValue!==null&&minimumValue>=0&&qualityKnown?1:0,qualityRuleVersion:CURRENT_QUALITY_RULE_VERSION,issueCodesJson:JSON.stringify(issueCodes)};
  });
  const envKeys=new Set<string>();for(const row of environmentRows){const key=`${row.area}|${row.sensorNumber}|${row.category}|${row.sourceDate}|${row.timeLabel}`;if(envKeys.has(key))add(issues,{ruleCode:"TIME_DUPLICATE_BUSINESS_KEY",severity:"ERROR",sheetName:"environment_3min",sourceRowNumber:row.sourceRowNumber,messageSafe:"環境區間業務鍵重複"});envKeys.add(key);}

  const metadataRows:MetadataImportRow[]=[];for(const [sheetName,expected] of [["data_dictionary",DICTIONARY_HEADERS],["README",README_HEADERS]] as const){const data=byName.get(sheetName)??[],index=headers(sheetName,data[0]??[],expected,issues);data.slice(1).forEach((row,i)=>metadataRows.push({sheetName,sourceRowNumber:i+2,itemKey:required(cell(row,index,expected[0]),expected[0]),valueText:text(cell(row,index,expected[1])),noteText:expected[2]?text(cell(row,index,expected[2])):null}));}
  const readme=metadataRows.filter((row)=>row.sheetName==="README"),dictionary=metadataRows.filter((row)=>row.sheetName==="data_dictionary"),alarmStatusText=readme.find((row)=>/Alarm.*來源狀態/i.test(row.itemKey))?.valueText?.toUpperCase(),dictionaryVersion=dictionary.find((row)=>/版本/.test(row.itemKey))?.valueText??null,dictionaryText=dictionary.map((row)=>`${row.itemKey} ${row.valueText??""} ${row.noteText??""}`).join("\n");
  const semantic:Array<[string,RegExp]>=[["三分鐘粒度",/3\s*分鐘/],["區間標籤為結束",/標籤.*結束|結束.*標籤/],["24:00 次日零時",/24:00[\s\S]*次日\s*0?0:00|次日\s*0?0:00[\s\S]*24:00/],["六態全缺保持缺漏",/六態全.*(?:NaN|缺漏)[\s\S]*(?:缺漏|NaN)/],["Await 保持缺漏",/Await[\s\S]*缺漏|缺漏[\s\S]*Await/],["四態公式",/四態合計秒[\s\S]*(?:None|Green)/],["加工公式",/加工.*小時[\s\S]*(?:Green|3600)/],["比例公式",/加工比例[\s\S]*(?:四態|Green)/]];
  const missing=semantic.filter(([,pattern])=>!pattern.test(dictionaryText)).map(([name])=>name);if(missing.length)add(issues,{ruleCode:"DICTIONARY_SEMANTIC_CHANGE",severity:"ERROR",sheetName:"data_dictionary",messageSafe:`必要規則缺少或語意不相容：${missing.join("、")}`});if(dictionaryVersion&&!/v3/i.test(dictionaryVersion))add(issues,{ruleCode:"DICTIONARY_VERSION_DIFFERENT",severity:"WARNING",sheetName:"data_dictionary"});

  const alarmData=byName.get("alarm_events")??[],ai=headers("alarm_events",alarmData[0]??[],ALARM_HEADERS,issues),seenAlarm=new Set<string>(),provisionalDate=sourceDates.values().next().value??"";
  const alarmRows=alarmData.slice(1).map((row,index)=>{const sourceRowNumber=index+2,eventTimeText=required(cell(row,ai,"事件時間"),"事件時間"),eventAtMs=localDateTime(eventTimeText);if(eventAtMs===null)add(issues,{ruleCode:"TIME_INVALID_LABEL",severity:"ERROR",sheetName:"alarm_events",sourceRowNumber});const fields=ALARM_HEADERS.map((name)=>text(cell(row,ai,name))),eventFingerprint=createHash("sha256").update(JSON.stringify(fields)).digest("hex"),duplicateWithinBatch=seenAlarm.has(eventFingerprint)?1:0;seenAlarm.add(eventFingerprint);if(duplicateWithinBatch)add(issues,{ruleCode:"ALARM_DUPLICATE_FINGERPRINT",severity:"WARNING",sheetName:"alarm_events",sourceRowNumber,messageSafe:"疑似重複 Alarm"});const currentValueText=text(cell(row,ai,"當前值")),parsed=currentValueText===null?NaN:Number(currentValueText);return{sourceRowNumber,sourceDate:provisionalDate,eventTimeText,eventAtMs:eventAtMs??0,sensorName:required(cell(row,ai,"感測器"),"感測器"),sensorId:required(cell(row,ai,"感測器ID"),"感測器ID"),sensorType:required(cell(row,ai,"類型"),"類型"),groupText:text(cell(row,ai,"群組")),ruleName:required(cell(row,ai,"規則名稱"),"規則名稱"),ruleConditionText:required(cell(row,ai,"規則條件"),"規則條件"),currentValueText,currentValueNumeric:Number.isFinite(parsed)?parsed:null,durationOriginal:text(cell(row,ai,"持續時間原文")),initialClassification:text(cell(row,ai,"初步事件分類")),classificationStatus:text(cell(row,ai,"分類狀態")),eventFingerprint,duplicateWithinBatch,issueCodesJson:JSON.stringify(duplicateWithinBatch?["ALARM_DUPLICATE_FINGERPRINT"]:[])}});
  const qualityData=byName.get("quality_issues")??[],qi=headers("quality_issues",qualityData[0]??[],QUALITY_HEADERS,issues),qualityIssueRows=qualityData.slice(1).map((row,index)=>{const exceptions:Record<string,string>={},sourceDate=required(cell(row,qi,"日期"),"日期"),intervalTotalSeconds=numeric(cell(row,qi,"區間合計秒"),"區間合計秒",exceptions);sourceDates.add(sourceDate);numericIssues(issues,"quality_issues",index+2,exceptions,[["區間合計秒",intervalTotalSeconds]]);return{sourceRowNumber:index+2,sourceDate,timeLabel:text(cell(row,qi,"時間")),subjectText:required(cell(row,qi,"對象"),"對象"),problemText:required(cell(row,qi,"問題"),"問題"),intervalTotalSeconds,sourceExceptionJson:Object.keys(exceptions).length?JSON.stringify(exceptions):null}});
  if(sourceDates.size!==1)add(issues,{ruleCode:"DATE_MULTIPLE_SOURCE_DATES",severity:"ERROR",messageSafe:"檔案必須只包含一個來源日"});const sourceDate=sourceDates.values().next().value??"";for(const alarm of alarmRows)alarm.sourceDate=sourceDate;
  const readmeDate=readme.find((row)=>/資料日期/.test(row.itemKey))?.valueText;if(readmeDate&&readmeDate!==sourceDate)add(issues,{ruleCode:"DATE_README_MISMATCH",severity:"ERROR",sheetName:"README"});
  const counts:Array<[RegExp,number,string]>=[[/機台.*筆數/,machineRows.length,"machine_3min"],[/環境.*筆數/,environmentRows.length,"environment_3min"],[/警報.*筆數|Alarm.*筆數/i,alarmRows.length,"alarm_events"]];for(const [pattern,actual,sheetName] of counts){const raw=readme.find((row)=>pattern.test(row.itemKey))?.valueText;if(raw!=null){const expected=Number(String(raw).replace(/,/g,""));if(Number.isFinite(expected)&&expected!==actual)add(issues,{ruleCode:"README_COUNT_MISMATCH",severity:"ERROR",sheetName,messageSafe:`README 列數與 ${sheetName} 不符`});}}
  let alarmSourceStatus:ImportPreview["alarmSourceStatus"]="UNKNOWN";const declaresMissing=alarmStatusText?.includes("未提供")||alarmStatusText==="MISSING",declaresProvided=alarmStatusText?.includes("已提供")||alarmStatusText?.startsWith("PROVIDED");if(alarmRows.length){alarmSourceStatus="PROVIDED_NONEMPTY";if(declaresMissing)add(issues,{ruleCode:"ALARM_STATUS_MISMATCH",severity:"ERROR",sheetName:"README"});}else if(declaresProvided)alarmSourceStatus="PROVIDED_EMPTY";else if(declaresMissing)alarmSourceStatus="MISSING";if(alarmSourceStatus==="MISSING"||alarmSourceStatus==="UNKNOWN")add(issues,{ruleCode:"ALARM_SOURCE_MISSING",severity:"WARNING",sheetName:"alarm_events",messageSafe:"Alarm 來源未提供，不可解讀為零事件"});
  return{originalFileName,fileSizeBytes:bytes.byteLength,fileSha256,canonicalFingerprint,contractVersion:"jiyin-v1-draft",dictionaryVersion,sourceDate,alarmSourceStatus,machineRows,environmentRows,alarmRows,qualityIssueRows,metadataRows,issues,canConfirm:!issues.some((issue)=>issue.severity==="ERROR")};
}
