import { openAppDatabase } from "@/server/db/app-database";
import { queryOverview } from "@/server/live/overview";
import { ok,requestId } from "@/server/http/api";
export const runtime="nodejs";export const dynamic="force-dynamic";
export function GET(){const id=requestId(),db=openAppDatabase();try{return ok(queryOverview(db),id);}finally{db.close();}}
