export type Availability="AVAILABLE"|"MISSING_DATA"|"NOT_APPLICABLE";
export function formatHours(value:number|null,availability:Availability="AVAILABLE"){
  if(value===null)return availability==="NOT_APPLICABLE"?"不適用":"無可用資料";
  return `${value.toFixed(value===0?3:2)} 小時`;
}
export function alarmSourceLabel(status:string,rowCount:number|null){
  if(status==="PROVIDED_NONEMPTY")return`來源已提供 · ${rowCount??0} 筆`;
  if(status==="PROVIDED_EMPTY")return"來源已提供 · 確認 0 筆";
  if(status==="MISSING")return"來源未提供 · 不可解讀為 0";
  return"來源狀態待確認";
}
export function availabilityLabel(value:Availability){return value==="AVAILABLE"?"有資料":value==="NOT_APPLICABLE"?"期間不適用":"缺少可用資料";}
