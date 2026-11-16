import { openAppDatabase } from "@/server/db/app-database";
import { queryOverview } from "@/server/live/overview";
import { ok,requestId } from "@/server/http/api";
import { displayModeFromRequest } from "@/server/live/display-mode";
export const runtime="nodejs";export const dynamic="force-dynamic";
export function GET(request:Request){const id=requestId(),db=openAppDatabase();try{return ok(queryOverview(db,Date.now(),displayModeFromRequest(request)),id);}finally{db.close();}}
