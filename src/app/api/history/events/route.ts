import { openAppDatabase } from "@/server/db/app-database";
import { apiError, ok, requestId } from "@/server/http/api";
import { getHistoryEvents } from "@/server/statistics/history-service";

export const runtime="nodejs";
const ALL=["A1","A2","A3","A4","B1","B2","B3","B4"];

export function GET(request:Request){
  const id=requestId(),params=new URL(request.url).searchParams,startDate=params.get("startDate"),endDate=params.get("endDate");
  if(!startDate||!endDate)return apiError(id,400,"HISTORY_QUERY_INVALID","請提供日期範圍");
  const area=params.get("area"),selected=params.get("machineIds")?.split(",").filter(Boolean)??ALL;
  const machineIds=area==="A"||area==="B"?selected.filter((value)=>value.startsWith(area)):selected;
  const sensorIds=params.get("sensorIds")?.split(",").filter(Boolean),page=Number(params.get("page")??1),pageSize=Number(params.get("pageSize")??50);
  if(!machineIds.length||machineIds.length>8||(sensorIds&&sensorIds.length>50))return apiError(id,400,"HISTORY_QUERY_INVALID","篩選條件超過限制");
  const db=openAppDatabase();
  try{return ok(getHistoryEvents(db,{startDate,endDate,machineIds,sensorIds,sensorType:params.get("sensorType")??undefined,ruleName:params.get("ruleName")??undefined,page,pageSize}),id);}
  catch{return apiError(id,400,"HISTORY_QUERY_INVALID","歷史事件查詢參數無效");}finally{db.close();}
}
