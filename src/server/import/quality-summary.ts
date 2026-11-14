import type { ImportIssue, ImportPreview, IssueSeverity } from "./types";

export type ImportAcceptance = "ACCEPT" | "ACCEPT_WITH_WARNINGS" | "INVALID" | "REVIEW_REQUIRED";

export interface ImportQualityGroup {
  key: string;
  sourceDate: string;
  timeLabel: string | null;
  ruleCode: string;
  severity: IssueSeverity;
  affectedRowCount: number;
  affectedObjects: string[];
  metricScopes: string[];
  exampleRows: number[];
}

export interface ImportQualitySummary {
  acceptance: ImportAcceptance;
  arrival: {machineRows:number;environmentRows:number;alarmRows:number;qualityIssueRows:number;quarantinedRows:number};
  eligibility: {
    greenHours:number;sixStateShare:number;transition:number;
    environmentAverage:number;environmentMaximum:number;environmentMedian:number;environmentMinimum:number;
  };
  issueLevels: {blocking:number;severe:number;warning:number;info:number};
  groups: ImportQualityGroup[];
  quarantine: {supported:false;rowCount:0};
}

const reviewCodes=new Set(["DICTIONARY_SEMANTIC_CHANGE"]);

export function importAcceptance(issues:ImportIssue[]):ImportAcceptance {
  if(issues.some((issue)=>issue.severity==="ERROR"&&reviewCodes.has(issue.ruleCode)))return "REVIEW_REQUIRED";
  if(issues.some((issue)=>issue.severity==="ERROR"))return "INVALID";
  return issues.length?"ACCEPT_WITH_WARNINGS":"ACCEPT";
}

function issueContext(preview:ImportPreview,issue:ImportIssue){
  const rowNumber=issue.sourceRowNumber;
  if(issue.sheetName==="machine_3min"){
    const row=preview.machineRows.find((item)=>item.sourceRowNumber===rowNumber);
    return{sourceDate:row?.sourceDate??preview.sourceDate,timeLabel:row?.timeLabel??null,object:row?.machineId};
  }
  if(issue.sheetName==="environment_3min"){
    const row=preview.environmentRows.find((item)=>item.sourceRowNumber===rowNumber);
    return{sourceDate:row?.sourceDate??preview.sourceDate,timeLabel:row?.timeLabel??null,object:row?`${row.area}區 ${row.category}${row.sensorNumber}`:undefined};
  }
  if(issue.sheetName==="alarm_events"){
    const row=preview.alarmRows.find((item)=>item.sourceRowNumber===rowNumber);
    return{sourceDate:row?.sourceDate??preview.sourceDate,timeLabel:row?.eventTimeText??null,object:row?.sensorId};
  }
  if(issue.sheetName==="quality_issues"){
    const row=preview.qualityIssueRows.find((item)=>item.sourceRowNumber===rowNumber);
    return{sourceDate:row?.sourceDate??preview.sourceDate,timeLabel:row?.timeLabel??null,object:row?.subjectText};
  }
  return{sourceDate:preview.sourceDate,timeLabel:null,object:undefined};
}

export function buildImportQualitySummary(preview:ImportPreview):ImportQualitySummary {
  const grouped=new Map<string,ImportQualityGroup&{rows:Set<number>;objects:Set<string>;metrics:Set<string>}>();
  for(const issue of preview.issues){
    const context=issueContext(preview,issue),key=`${context.sourceDate}|${context.timeLabel??""}|${issue.ruleCode}`;
    const current=grouped.get(key)??{key,sourceDate:context.sourceDate,timeLabel:context.timeLabel,ruleCode:issue.ruleCode,severity:issue.severity,affectedRowCount:0,affectedObjects:[],metricScopes:[],exampleRows:[],rows:new Set<number>(),objects:new Set<string>(),metrics:new Set<string>()};
    if(issue.sourceRowNumber!==undefined)current.rows.add(issue.sourceRowNumber);
    if(context.object)current.objects.add(context.object);
    if(issue.metricScope)current.metrics.add(issue.metricScope);
    if(severityRank(issue.severity)>severityRank(current.severity))current.severity=issue.severity;
    grouped.set(key,current);
  }
  const groups=[...grouped.values()].map((group)=>({
    key:group.key,sourceDate:group.sourceDate,timeLabel:group.timeLabel,ruleCode:group.ruleCode,severity:group.severity,
    affectedRowCount:group.rows.size||1,affectedObjects:[...group.objects].slice(0,16),metricScopes:[...group.metrics],exampleRows:[...group.rows].slice(0,5),
  })).sort((a,b)=>severityRank(b.severity)-severityRank(a.severity)||a.key.localeCompare(b.key));
  return{
    acceptance:importAcceptance(preview.issues),
    arrival:{machineRows:preview.machineRows.length,environmentRows:preview.environmentRows.length,alarmRows:preview.alarmRows.length,qualityIssueRows:preview.qualityIssueRows.length,quarantinedRows:0},
    eligibility:{
      greenHours:preview.machineRows.filter((row)=>row.greenHoursEligible===1).length,
      sixStateShare:preview.machineRows.filter((row)=>row.sixStateShareEligible===1).length,
      transition:preview.machineRows.filter((row)=>row.transitionEligible===1).length,
      environmentAverage:preview.environmentRows.filter((row)=>row.averageEligible===1).length,
      environmentMaximum:preview.environmentRows.filter((row)=>row.maximumEligible===1).length,
      environmentMedian:preview.environmentRows.filter((row)=>row.medianEligible===1).length,
      environmentMinimum:preview.environmentRows.filter((row)=>row.minimumEligible===1).length,
    },
    issueLevels:{
      blocking:preview.issues.filter((issue)=>issue.severity==="ERROR").length,
      severe:preview.issues.filter((issue)=>issue.severity==="SEVERE").length,
      warning:preview.issues.filter((issue)=>issue.severity==="WARNING").length,
      info:preview.issues.filter((issue)=>issue.severity==="INFO").length,
    },
    groups,quarantine:{supported:false,rowCount:0},
  };
}

function severityRank(value:IssueSeverity){return value==="ERROR"?4:value==="SEVERE"?3:value==="WARNING"?2:1;}
