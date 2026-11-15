import { openAppDatabase } from "@/server/db/app-database";
import { apiError, ok, requestId } from "@/server/http/api";
import { getProcessingComparison, getProcessingRange, type CompareKind } from "@/server/statistics/history-service";

export const runtime="nodejs";
function machineIds(params:URLSearchParams){const raw=params.get("machineIds");if(!raw)return null;const ids=raw.split(",").filter(Boolean);if(!ids.length||ids.length>8)return null;return ids;}
function bucket(params:URLSearchParams):30|60|null{const raw=params.get("bucket")??"30m";return raw==="30m"?30:raw==="60m"?60:null;}

export function GET(request:Request){
  const id=requestId();const params=new URL(request.url).searchParams,ids=machineIds(params),bucketMinutes=bucket(params);if(!ids||!bucketMinutes)return apiError(id,400,"HISTORY_QUERY_INVALID","機台或時間粒度參數無效");
  const db=openAppDatabase();
  try{
    if(params.get("mode")==="range"){
      const startDate=params.get("startDate"),endDate=params.get("endDate");if(!startDate||!endDate)return apiError(id,400,"HISTORY_QUERY_INVALID","請提供日期範圍");
      return ok(getProcessingRange(db,{startDate,endDate,bucketMinutes,machineIds:ids}),id);
    }
    if(params.get("mode")==="compare"){
      const compareKind=params.get("compareKind") as CompareKind|null,periodA=params.get("periodA"),periodB=params.get("periodB");
      if(!compareKind||!["day","week","month"].includes(compareKind)||!periodA||!periodB)return apiError(id,400,"HISTORY_QUERY_INVALID","比較期間參數無效");
      return ok(getProcessingComparison(db,{compareKind,periodA,periodB,machineIds:ids,bucketMinutes}),id);
    }
    return apiError(id,400,"HISTORY_QUERY_INVALID","mode 必須是 range 或 compare");
  }catch{return apiError(id,400,"HISTORY_QUERY_INVALID","歷史查詢參數無效");}finally{db.close();}
}
