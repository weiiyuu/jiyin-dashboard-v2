export interface SelectedUpload {id:string;file:File}
export interface PreviewDecision {decision:"INSERT"|"DUPLICATE"|"CONFLICT"|"INVALID";activeBatchId:number|null;errors:unknown[]}
export const importIssueLabels:Record<string,string>={STRUCT_MISSING_VALUE:"必要識別值缺少",SOURCE_DESCRIPTION_MISSING:"來源描述未提供，保留空值",SOURCE_VALUE_MISSING:"來源觀測值未提供，保留空值",SOURCE_QUALITY_MISSING:"來源品質狀態未提供",VALUE_NON_NUMERIC:"數值格式異常",DERIVED_VALUE_MISMATCH:"計算結果不一致",STATE_TOTAL_OUT_OF_TOLERANCE:"燈號秒數總和超出容差",STATE_SEVERE_INCOMPLETE:"三分鐘秒數嚴重不足，已排除受影響統計",ALARM_SOURCE_MISSING:"警示來源未提供",DICTIONARY_VERSION_DIFFERENT:"字典版本差異",DICTIONARY_SEMANTIC_CHANGE:"資料字典核心語意變更，需審閱",XLSX_PARSE_FAILED:"Excel 結構無法讀取"};
export function importAlarmSourceLabel(value:string){return value==="PROVIDED_NONEMPTY"?"已提供":value==="PROVIDED_EMPTY"?"已提供（0 筆）":value==="MISSING"?"未提供":"狀態待確認";}
export function importIssueExplanation(ruleCode:string,messageSafe:string){if(ruleCode==="DERIVED_VALUE_MISMATCH")return "Excel 填寫的比例，與系統依原始秒數重新計算的結果不同";if(ruleCode==="SOURCE_VALUE_MISSING"||ruleCode==="SOURCE_DESCRIPTION_MISSING")return "保留空值，不自動補 0";return messageSafe;}
export function removeSelectedUpload(files:SelectedUpload[],id:string){return files.filter((item)=>item.id!==id);}
export function confirmPlan(preview:PreviewDecision,replaceApproved:boolean){
  if(preview.errors.length||preview.decision==="INVALID")return{allowed:false,action:null,reason:"INVALID" as const};
  if(preview.decision==="DUPLICATE")return{allowed:false,action:null,reason:"DUPLICATE" as const};
  if(preview.decision==="CONFLICT"&&!replaceApproved)return{allowed:false,action:null,reason:"REPLACE_CONFIRMATION_REQUIRED" as const};
  return{allowed:true,action:preview.decision==="CONFLICT"?"REPLACE" as const:"INSERT" as const,reason:null};
}
