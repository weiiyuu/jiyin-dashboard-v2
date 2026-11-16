import { openAppDatabase } from "@/server/db/app-database";
import { queryConnectionStatus } from "@/server/live/connection-status";
import { loadEnterpriseClientConfig,safeEnterpriseConfig } from "@/server/enterprise/config";
import { ok,requestId } from "@/server/http/api";
import { displayModeFromRequest } from "@/server/live/display-mode";
export const runtime="nodejs";export const dynamic="force-dynamic";
export function GET(request:Request){const id=requestId(),db=openAppDatabase();try{let config:{tlsMode:"strict"|"custom_ca"|"allowlisted_self_signed";authMode:"none"|"bearer"|"header"}|null=null;try{config=safeEnterpriseConfig(loadEnterpriseClientConfig());}catch{}return ok({...queryConnectionStatus(db,{configured:config!==null,tlsMode:config?.tlsMode,authMode:config?.authMode}),displayMode:displayModeFromRequest(request)},id);}finally{db.close();}}
