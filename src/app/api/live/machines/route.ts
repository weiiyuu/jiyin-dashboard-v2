import { openAppDatabase } from "@/server/db/app-database";
import { getMachineMonitoring } from "@/server/live/provider";
import { requestId } from "@/server/http/api";
import { createApiMeta } from "@/shared/contracts/api-response";
import { NextResponse } from "next/server";
export const runtime="nodejs";export const dynamic="force-dynamic";
export function GET(){const id=requestId(),db=openAppDatabase();try{const result=getMachineMonitoring(db);return NextResponse.json({data:result.data,meta:createApiMeta({requestId:id,providerMode:result.providerMode,timeContext:result.timeContext,staleAfterSeconds:result.staleAfterSeconds})});}finally{db.close();}}
