import { openAppDatabase } from "@/server/db/app-database";
import { getEnvironmentMonitoring } from "@/server/live/provider";
import { apiError,requestId } from "@/server/http/api";
import { createApiMeta } from "@/shared/contracts/api-response";
import { NextResponse } from "next/server";
export const runtime="nodejs";export const dynamic="force-dynamic";
export function GET(request:Request){const id=requestId(),params=new URL(request.url).searchParams,area=params.get("area"),metric=params.get("metric");if((area!=="A"&&area!=="B")||(metric!=="temperature"&&metric!=="humidity"))return apiError(id,400,"LIVE_QUERY_INVALID","請提供有效的區域與環境指標");const db=openAppDatabase();try{const result=getEnvironmentMonitoring(db,{area,metric,date:params.get("date")});return NextResponse.json({data:result.data,meta:createApiMeta({requestId:id,providerMode:result.providerMode,timeContext:result.timeContext,staleAfterSeconds:result.staleAfterSeconds})});}catch(error){if(error instanceof Error&&error.message==="DATE_CONTEXT_MISMATCH")return apiError(id,400,"DATE_CONTEXT_MISMATCH","日期與目前資料模式不一致");return apiError(id,500,"LIVE_QUERY_FAILED","無法讀取本機即時資料");}finally{db.close();}}
