import type { AppDatabase } from "@/server/db/connection";
import { getSettings } from "@/server/db/settings-repository";
import { DEMO_MANIFEST } from "./demo-fixture";
import type { ProviderMode } from "@/shared/contracts/api-response";

function iso(value:number|null){return value===null?null:new Date(value).toISOString();}
export function queryOverview(db:AppDatabase,nowMs=Date.now(),displayMode?:ProviderMode){
  const settings=getSettings(db);
  const latest=db.prepare("SELECT MAX(COALESCE(sensor_update_at_ms,fetched_at_ms)) value FROM live_sensor_readings").get() as {value:number|null};
  const history=db.prepare("SELECT MIN(source_date) date_from,MAX(source_date) date_to,COUNT(DISTINCT source_date) day_count FROM import_batches WHERE status='ACTIVE'").get() as {date_from:string|null;date_to:string|null;day_count:number};
  const mode=displayMode??settings.providerMode,live=mode==="DEMO"?{status:"DEMO_READY" as const,lastReadingAt:DEMO_MANIFEST.demoClockAt,dataDate:DEMO_MANIFEST.dataDate}:{status:latest.value===null?"NO_DATA" as const:nowMs-latest.value>settings.staleAfterSeconds*1000?"STALE" as const:"AVAILABLE" as const,lastReadingAt:iso(latest.value),dataDate:null};
  return {runtimeMode:mode,collectorMode:settings.providerMode,live,history:{activeDateFrom:history.date_from,activeDateTo:history.date_to,activeDayCount:history.day_count}};
}
