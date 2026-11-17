import { openAppDatabase } from "@/server/db/app-database";
import { apiError, ok, requestId } from "@/server/http/api";
import { getHistoryEvents, getHistoryEventsDefaults } from "@/server/statistics/history-service";

export const runtime="nodejs";
const ALL=["A1","A2","A3","A4","B1","B2","B3","B4"];

export function GET(request:Request){
  const id=requestId(),params=new URL(request.url).searchParams,startDate=params.get("startDate"),endDate=params.get("endDate");
  if(params.get("defaults")==="1"){
    const db=openAppDatabase();try{return ok(getHistoryEventsDefaults(db),id);}finally{db.close();}
  }
  if(!startDate||!endDate)return apiError(id,400,"HISTORY_QUERY_INVALID","請提供日期範圍");
  const area=params.get("area"),selected=params.get("machineIds")?.split(",").filter(Boolean)??ALL;
  const machineIds=area==="A"||area==="B"?selected.filter((value)=>value.startsWith(area)):selected;
  const sensorIds=params.get("sensorIds")?.split(",").filter(Boolean),detailSensorIds=params.has("detailSensorIds")?(params.get("detailSensorIds")??"").split(",").filter(Boolean):undefined,page=Number(params.get("page")??1),pageSize=Number(params.get("pageSize")??20);
  const mode=params.get("mode")??"all",detailKind=params.get("detailKind")??(mode==="red"?"red":"alarm");
  if(!["all","alarm","red"].includes(mode)||!["alarm","red"].includes(detailKind))return apiError(id,400,"HISTORY_QUERY_INVALID","異常類型無效");
  if(!machineIds.length||machineIds.length>8||(sensorIds&&sensorIds.length>50)||(detailSensorIds&&detailSensorIds.length>50))return apiError(id,400,"HISTORY_QUERY_INVALID","篩選條件超過限制");
  const db=openAppDatabase();
  try{return ok(getHistoryEvents(db,{startDate,endDate,machineIds,sensorIds,detailSensorIds,sensorType:params.get("sensorType")??undefined,ruleName:params.get("ruleName")??undefined,sensorQuery:params.get("sensorQuery")??undefined,ruleQuery:params.get("ruleQuery")??undefined,mode:mode as "all"|"alarm"|"red",detailKind:detailKind as "alarm"|"red",page,pageSize}),id);}
  catch{return apiError(id,400,"HISTORY_QUERY_INVALID","歷史事件查詢參數無效");}finally{db.close();}
}
