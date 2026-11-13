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

function text(cell: CellValue | null): string | null {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) return cell.toISOString();
  return String(cell);
}

function requiredText(cell: CellValue | null, label: string): string {
  const value = text(cell);
  if (value === null || value === "") throw new Error(`REQUIRED:${label}`);
  return value;
}

function numeric(cell: CellValue | null, column: string, exceptions: Record<string, string>): number | null {
  if (cell === null || cell === "") return null;
  if (typeof cell === "number" && Number.isFinite(cell)) return cell;
  const raw = text(cell)!;
  const parsed = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(parsed)) return parsed;
  exceptions[column] = raw;
  return null;
}

function validateHeaders(sheetName: string, actual: Array<CellValue | null>, expected: string[], issues: ImportIssue[]) {
  const names = actual.map((cell) => text(cell) ?? "");
  for (const header of expected) if (!names.includes(header)) issues.push({
    ruleCode: "STRUCT_MISSING_COLUMN", severity: "ERROR", sheetName, columnName: header,
    messageSafe: `${sheetName} 缺少必要欄位：${header}`,
  });
  for (const header of names) if (header && !expected.includes(header)) issues.push({
    ruleCode: "STRUCT_UNEXPECTED_COLUMN", severity: "ERROR", sheetName, columnName: header,
    messageSafe: `${sheetName} 含未定義欄位：${header}`,
  });
  return new Map(names.map((name, index) => [name, index]));
}

function cell(row: Array<CellValue | null>, index: Map<string, number>, name: string) {
  return row[index.get(name) ?? -1] ?? null;
}

function canonicalCell(value: CellValue | null): unknown {
  if (value instanceof Date) return ["date", value.toISOString()];
  if (value === null) return ["null"];
  return [typeof value, value];
}

export async function previewWorkbook(bytes: Buffer, originalFileName: string): Promise<ImportPreview> {
  preflightXlsx(bytes);
  const workbook = await readWorkbook(bytes);
  return parseWorkbookSheets(workbook, bytes, originalFileName);
}

export function parseWorkbookSheets(workbook: Sheet[], bytes: Buffer = Buffer.alloc(0), originalFileName = "synthetic.xlsx"): ImportPreview {
  const issues: ImportIssue[] = [];
  const byName = new Map(workbook.map((sheet) => [sheet.sheet, sheet.data]));
  for (const required of REQUIRED_SHEETS) if (!byName.has(required)) issues.push({
    ruleCode: "STRUCT_MISSING_SHEET", severity: "ERROR", sheetName: required,
    messageSafe: `缺少必要工作表：${required}`,
  });
  const canonicalFingerprint = createHash("sha256").update(JSON.stringify(
    REQUIRED_SHEETS.map((name) => [name, (byName.get(name) ?? []).map((row) => row.map(canonicalCell))]),
  )).digest("hex");
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  const sourceDates = new Set<string>();

  const machineData = byName.get("machine_3min") ?? [];
  const machineIndex = validateHeaders("machine_3min", machineData[0] ?? [], MACHINE_HEADERS, issues);
  const machineRows = machineData.slice(1).map((row, offset) => {
    const sourceRowNumber = offset + 2;
    const exceptions: Record<string, string> = {};
    const sourceDate = requiredText(cell(row, machineIndex, "日期"), "日期"); sourceDates.add(sourceDate);
    const timeLabel = requiredText(cell(row, machineIndex, "時間"), "時間");
    const { intervalStartMs, intervalEndMs } = intervalBounds(sourceDate, timeLabel);
    const machineId = requiredText(cell(row, machineIndex, "機台"), "機台");
    const area = requiredText(cell(row, machineIndex, "區域"), "區域");
    const values = ["None秒","Red秒","Yellow秒","Green秒","Blue秒","White秒"].map((name) => numeric(cell(row, machineIndex, name), name, exceptions));
    const issueCodes: string[] = [];
    if (!/^[AB][1-4]$/.test(machineId) || area !== machineId[0]) issueCodes.push("MACHINE_IDENTITY_INVALID");
    if (values.some((value) => value !== null && value < 0)) issueCodes.push("VALUE_NEGATIVE");
    const [noneSeconds, redSeconds, yellowSeconds, greenSeconds, blueSeconds, whiteSeconds] = values;
    const allSixValid = values.every((value) => value !== null && value >= 0);
    const total = allSixValid ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
    if (total !== null && (total < 179 || total > 181)) issueCodes.push("STATE_TOTAL_OUT_OF_TOLERANCE");
    if ((blueSeconds ?? 0) > 0 || (whiteSeconds ?? 0) > 0) issueCodes.push("STATE_BLUE_WHITE_NONZERO");
    for (const code of issueCodes) issues.push({ ruleCode: code, severity: "WARNING", sheetName: "machine_3min", sourceRowNumber, messageSafe: code });
    return {
      sourceRowNumber, sourceDate, timeLabel,
      intervalStartText: requiredText(cell(row, machineIndex, "區間開始"), "區間開始"),
      intervalEndText: requiredText(cell(row, machineIndex, "區間結束"), "區間結束"), intervalStartMs, intervalEndMs,
      machineId, area, noneSeconds, redSeconds, yellowSeconds, greenSeconds, blueSeconds, whiteSeconds,
      sourceFourStateTotalSeconds: numeric(cell(row,machineIndex,"四態合計秒"),"四態合計秒",exceptions),
      sourceProcessingHours: numeric(cell(row,machineIndex,"加工小時"),"加工小時",exceptions),
      sourceYellowHours: numeric(cell(row,machineIndex,"待機小時(黃燈)"),"待機小時(黃燈)",exceptions),
      sourceRedHours: numeric(cell(row,machineIndex,"異常小時"),"異常小時",exceptions),
      sourceNoneHours: numeric(cell(row,machineIndex,"未開機小時"),"未開機小時",exceptions),
      sourceIntervalProcessingRatio: numeric(cell(row,machineIndex,"區間加工比例"),"區間加工比例",exceptions),
      sourcePoweredProcessingRatio: numeric(cell(row,machineIndex,"開機加工比例"),"開機加工比例",exceptions),
      sourceQualityStatus: requiredText(cell(row,machineIndex,"品質狀態"),"品質狀態"),
      sourceQualityNote: text(cell(row,machineIndex,"品質備註")),
      sourceExceptionJson: Object.keys(exceptions).length ? JSON.stringify(exceptions) : null,
      greenHoursEligible: greenSeconds !== null && greenSeconds >= 0 ? 1 : 0,
      fourStateRatioEligible: [noneSeconds,redSeconds,yellowSeconds,greenSeconds].every((value) => value !== null && value >= 0) && ((noneSeconds ?? 0)+(redSeconds ?? 0)+(yellowSeconds ?? 0)+(greenSeconds ?? 0)>0) ? 1 : 0,
      sixStateShareEligible: allSixValid && total !== null && total >= 179 && total <= 181 ? 1 : 0,
      transitionEligible: allSixValid && total !== null && total >= 179 && total <= 181 ? 1 : 0,
      qualityRuleVersion: CURRENT_QUALITY_RULE_VERSION, issueCodesJson: JSON.stringify(issueCodes),
    };
  });
  const machineKeys = new Set<string>();
  for (const row of machineRows) {
    const key = `${row.machineId}|${row.sourceDate}|${row.timeLabel}`;
    if (machineKeys.has(key)) issues.push({ ruleCode: "TIME_DUPLICATE_BUSINESS_KEY", severity: "ERROR", sheetName: "machine_3min", sourceRowNumber: row.sourceRowNumber, messageSafe: "機台區間業務鍵重複" });
    machineKeys.add(key);
  }

  const environmentData = byName.get("environment_3min") ?? [];
  const environmentIndex = validateHeaders("environment_3min", environmentData[0] ?? [], ENV_HEADERS, issues);
  const environmentRows = environmentData.slice(1).map((row, offset) => {
    const sourceRowNumber = offset + 2; const exceptions: Record<string,string> = {};
    const sourceDate = requiredText(cell(row,environmentIndex,"日期"),"日期"); sourceDates.add(sourceDate);
    const timeLabel = requiredText(cell(row,environmentIndex,"時間"),"時間");
    const { intervalStartMs, intervalEndMs } = intervalBounds(sourceDate,timeLabel);
    const averageValue=numeric(cell(row,environmentIndex,"平均"),"平均",exceptions);
    const maximumValue=numeric(cell(row,environmentIndex,"最大"),"最大",exceptions);
    const medianValue=numeric(cell(row,environmentIndex,"中位數"),"中位數",exceptions);
    const minimumValue=numeric(cell(row,environmentIndex,"最小"),"最小",exceptions);
    return { sourceRowNumber,sourceDate,timeLabel,
      intervalStartText:requiredText(cell(row,environmentIndex,"區間開始"),"區間開始"),
      intervalEndText:requiredText(cell(row,environmentIndex,"區間結束"),"區間結束"), intervalStartMs,intervalEndMs,
      area:requiredText(cell(row,environmentIndex,"區域"),"區域"), sensorNumber:Number(requiredText(cell(row,environmentIndex,"感測器編號"),"感測器編號")),
      category:requiredText(cell(row,environmentIndex,"類別"),"類別"), averageValue,maximumValue,medianValue,minimumValue,
      referenceThreshold:numeric(cell(row,environmentIndex,"參考門檻"),"參考門檻",exceptions),
      sourceMaxJudgement:text(cell(row,environmentIndex,"最大值判斷")), sourceQualityStatus:requiredText(cell(row,environmentIndex,"品質狀態"),"品質狀態"),
      sourceNote:text(cell(row,environmentIndex,"備註")), sourceExceptionJson:Object.keys(exceptions).length?JSON.stringify(exceptions):null,
      averageEligible:averageValue!==null&&averageValue>=0?1:0, maximumEligible:maximumValue!==null&&maximumValue>=0?1:0,
      medianEligible:medianValue!==null&&medianValue>=0?1:0, minimumEligible:minimumValue!==null&&minimumValue>=0?1:0,
      qualityRuleVersion:CURRENT_QUALITY_RULE_VERSION,issueCodesJson:"[]" };
  });
  const environmentKeys = new Set<string>();
  for (const row of environmentRows) {
    const key = `${row.area}|${row.sensorNumber}|${row.category}|${row.sourceDate}|${row.timeLabel}`;
    if (environmentKeys.has(key)) issues.push({ ruleCode: "TIME_DUPLICATE_BUSINESS_KEY", severity: "ERROR", sheetName: "environment_3min", sourceRowNumber: row.sourceRowNumber, messageSafe: "環境區間業務鍵重複" });
    environmentKeys.add(key);
    if (!Number.isInteger(row.sensorNumber) || row.sensorNumber <= 0) issues.push({ ruleCode: "VALUE_NON_NUMERIC", severity: "ERROR", sheetName: "environment_3min", sourceRowNumber: row.sourceRowNumber, columnName: "感測器編號", messageSafe: "感測器編號必須為正整數" });
  }

  const metadataRows: MetadataImportRow[] = [];
  for (const [sheetName, headers] of [["data_dictionary",DICTIONARY_HEADERS],["README",README_HEADERS]] as const) {
    const data=byName.get(sheetName)??[]; const index=validateHeaders(sheetName,data[0]??[],headers,issues);
    data.slice(1).forEach((row,offset)=>metadataRows.push({sheetName,sourceRowNumber:offset+2,
      itemKey:requiredText(cell(row,index,headers[0]),headers[0]),valueText:text(cell(row,index,headers[1])),noteText:headers[2]?text(cell(row,index,headers[2])):null}));
  }
  const readme = metadataRows.filter((row)=>row.sheetName==="README");
  const alarmStatusText=readme.find((row)=>/Alarm.*來源狀態/i.test(row.itemKey))?.valueText?.toUpperCase();
  const dictionaryVersion=metadataRows.find((row)=>/版本/.test(row.itemKey))?.valueText??null;

  const alarmData=byName.get("alarm_events")??[]; const alarmIndex=validateHeaders("alarm_events",alarmData[0]??[],ALARM_HEADERS,issues);
  const seenAlarm=new Set<string>();
  const provisionalDate=sourceDates.values().next().value??"";
  const alarmRows=alarmData.slice(1).map((row,offset)=>{
    const sourceRowNumber=offset+2; const eventTimeText=requiredText(cell(row,alarmIndex,"事件時間"),"事件時間");
    const eventAtMs=Date.parse(eventTimeText.includes("T")?eventTimeText:`${eventTimeText.replace(" ","T")}+08:00`);
    if(!Number.isFinite(eventAtMs)) throw new Error("TIME_INVALID_LABEL");
    const fields=ALARM_HEADERS.map((name)=>text(cell(row,alarmIndex,name)));
    const eventFingerprint=createHash("sha256").update(JSON.stringify(fields)).digest("hex");
    const duplicateWithinBatch=seenAlarm.has(eventFingerprint)?1:0; seenAlarm.add(eventFingerprint);
    if(duplicateWithinBatch) issues.push({ruleCode:"ALARM_DUPLICATE_FINGERPRINT",severity:"WARNING",sheetName:"alarm_events",sourceRowNumber,messageSafe:"疑似重複 Alarm"});
    const currentValueText=text(cell(row,alarmIndex,"當前值")); const parsed=currentValueText===null?NaN:Number(currentValueText);
    return {sourceRowNumber,sourceDate:provisionalDate,eventTimeText,eventAtMs,sensorName:requiredText(cell(row,alarmIndex,"感測器"),"感測器"),
      sensorId:requiredText(cell(row,alarmIndex,"感測器ID"),"感測器ID"),sensorType:requiredText(cell(row,alarmIndex,"類型"),"類型"),
      groupText:text(cell(row,alarmIndex,"群組")),ruleName:requiredText(cell(row,alarmIndex,"規則名稱"),"規則名稱"),
      ruleConditionText:requiredText(cell(row,alarmIndex,"規則條件"),"規則條件"),currentValueText,currentValueNumeric:Number.isFinite(parsed)?parsed:null,
      durationOriginal:text(cell(row,alarmIndex,"持續時間原文")),initialClassification:text(cell(row,alarmIndex,"初步事件分類")),
      classificationStatus:text(cell(row,alarmIndex,"分類狀態")),eventFingerprint,duplicateWithinBatch,issueCodesJson:JSON.stringify(duplicateWithinBatch?["ALARM_DUPLICATE_FINGERPRINT"]:[])};
  });
  const qualityData=byName.get("quality_issues")??[]; const qualityIndex=validateHeaders("quality_issues",qualityData[0]??[],QUALITY_HEADERS,issues);
  const qualityIssueRows=qualityData.slice(1).map((row,offset)=>{const exceptions:Record<string,string>={};const sourceDate=requiredText(cell(row,qualityIndex,"日期"),"日期");sourceDates.add(sourceDate);
    return {sourceRowNumber:offset+2,sourceDate,timeLabel:text(cell(row,qualityIndex,"時間")),subjectText:requiredText(cell(row,qualityIndex,"對象"),"對象"),
      problemText:requiredText(cell(row,qualityIndex,"問題"),"問題"),intervalTotalSeconds:numeric(cell(row,qualityIndex,"區間合計秒"),"區間合計秒",exceptions),
      sourceExceptionJson:Object.keys(exceptions).length?JSON.stringify(exceptions):null};});
  if(sourceDates.size!==1) issues.push({ruleCode:"DATE_MULTIPLE_SOURCE_DATES",severity:"ERROR",messageSafe:"檔案必須只包含一個來源日"});
  const sourceDate=sourceDates.values().next().value??"";
  for(const alarm of alarmRows) alarm.sourceDate=sourceDate;
  let alarmSourceStatus: ImportPreview["alarmSourceStatus"] = "UNKNOWN";
  if(alarmStatusText?.includes("未提供")||alarmStatusText==="MISSING") alarmSourceStatus="MISSING";
  else if(alarmRows.length>0) alarmSourceStatus="PROVIDED_NONEMPTY";
  else if(alarmStatusText?.includes("已提供")||alarmStatusText==="PROVIDED_EMPTY") alarmSourceStatus="PROVIDED_EMPTY";
  else alarmSourceStatus="MISSING";
  if(alarmSourceStatus==="MISSING") issues.push({ruleCode:"ALARM_SOURCE_MISSING",severity:"WARNING",sheetName:"alarm_events",messageSafe:"Alarm 來源未提供，不可解讀為零事件"});
  return {originalFileName,fileSizeBytes:bytes.byteLength,fileSha256,canonicalFingerprint,contractVersion:"jiyin-v1-draft",dictionaryVersion,sourceDate,
    alarmSourceStatus,machineRows,environmentRows,alarmRows,qualityIssueRows,metadataRows,issues,canConfirm:!issues.some((issue)=>issue.severity==="ERROR")};
}
