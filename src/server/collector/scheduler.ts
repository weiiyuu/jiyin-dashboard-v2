import type { AppDatabase } from "@/server/db/connection";
import { getSettings } from "@/server/db/settings-repository";
import type { EnterpriseGetter } from "./service";
import { collectOnce,recordSkippedOverlap } from "./service";
import { isInsideServiceWindow,nextScheduledAt } from "./schedule";

export class CollectorScheduler{
  private timer:NodeJS.Timeout|null=null;private modeTimer:NodeJS.Timeout|null=null;private running=false;private stopped=false;private lastRevision:number;
  constructor(private readonly db:AppDatabase,private readonly client:EnterpriseGetter,private readonly now:()=>number=Date.now){this.lastRevision=getSettings(db).modeRevision;}
  async start(){const settings=getSettings(this.db);if(settings.providerMode==="LIVE"&&isInsideServiceWindow(this.now()))await this.run("STARTUP");this.scheduleNext();this.watchMode();}
  private async run(trigger:"STARTUP"|"SCHEDULED"|"MODE_RESUME",scheduledForMs?:number){if(this.stopped)return;if(this.running){recordSkippedOverlap(this.db,{trigger,scheduledForMs,nowMs:this.now()});return;}this.running=true;try{await collectOnce(this.db,this.client,{trigger,scheduledForMs,nowMs:this.now()});}finally{this.running=false;}}
  private scheduleNext(){if(this.stopped)return;const due=nextScheduledAt(this.now());this.timer=setTimeout(async()=>{const settings=getSettings(this.db);if(settings.providerMode==="LIVE")await this.run("SCHEDULED",due);this.scheduleNext();},Math.max(0,due-this.now()));}
  private watchMode(){this.modeTimer=setInterval(async()=>{const settings=getSettings(this.db);if(settings.modeRevision!==this.lastRevision){const was=this.lastRevision;this.lastRevision=settings.modeRevision;if(was>=0&&settings.providerMode==="LIVE"&&isInsideServiceWindow(this.now()))await this.run("MODE_RESUME");}},1_000);}
  async stop(waitMs=15_000){this.stopped=true;if(this.timer)clearTimeout(this.timer);if(this.modeTimer)clearInterval(this.modeTimer);const deadline=Date.now()+waitMs;while(this.running&&Date.now()<deadline)await new Promise((resolve)=>setTimeout(resolve,25));}
}
