import { openAppDatabase } from "@/server/db/app-database";
import { getMachineMonitoring } from "@/server/live/provider";
import { requestId } from "@/server/http/api";
import { createApiMeta } from "@/shared/contracts/api-response";
import { NextResponse } from "next/server";
import { displayModeFromRequest } from "@/server/live/display-mode";
export const runtime="nodejs";export const dynamic="force-dynamic";
export function GET(request:Request){const id=requestId(),db=openAppDatabase();try{const result=getMachineMonitoring(db,Date.now(),displayModeFromRequest(request));return NextResponse.json({data:result.data,meta:createApiMeta({requestId:id,providerMode:result.providerMode,timeContext:result.timeContext,staleAfterSeconds:result.staleAfterSeconds})});}finally{db.close();}}
