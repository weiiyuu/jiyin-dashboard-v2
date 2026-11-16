import { afterEach,describe,expect,it } from "vitest";
import { mkdtempSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GET as getMachines } from "@/app/api/live/machines/route";
import { GET as getEnvironment } from "@/app/api/live/environment/route";
import { GET as getRuntimeMode,PUT as putRuntimeMode } from "@/app/api/runtime-mode/route";
import { GET as getConnectionStatus } from "@/app/api/connection-status/route";
import { GET as getOverview } from "@/app/api/overview/route";
import { openDatabase } from "@/server/db/connection";
import { getSettings,switchProviderMode } from "@/server/db/settings-repository";

let root:string|undefined;const original=process.env.DATABASE_PATH;
const enterpriseKeys=["ENTERPRISE_API_ORIGIN","ENTERPRISE_API_ALLOWED_ORIGINS","ENTERPRISE_TLS_MODE","ENTERPRISE_API_AUTH_MODE","ENTERPRISE_API_AUTH_VALUE"] as const;
const enterpriseOriginal=Object.fromEntries(enterpriseKeys.map((key)=>[key,process.env[key]]));
function useDatabase(){root=mkdtempSync(join(tmpdir(),"jiyin-stage6-route-"));process.env.DATABASE_PATH=join(root,"route.sqlite");for(const key of enterpriseKeys)delete process.env[key];}
afterEach(()=>{process.env.DATABASE_PATH=original;for(const key of enterpriseKeys){const value=enterpriseOriginal[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}if(root)rmSync(root,{recursive:true,force:true});root=undefined;});

describe("Stage 6 local route contracts",()=>{
  it("serves Demo machine/environment APIs with provider metadata",async()=>{useDatabase();const machines=await getMachines(new Request("http://localhost:3000/api/live/machines")),machineBody=await machines.json();expect(machineBody.meta).toMatchObject({providerMode:"DEMO",staleAfterSeconds:420,timeContext:{dataDate:"2026-01-15",source:"SYNTHETIC"}});expect(machineBody.data.areas.flatMap((area:{machines:unknown[]})=>area.machines)).toHaveLength(8);const environment=await getEnvironment(new Request("http://localhost:3000/api/live/environment?area=A&metric=temperature")),environmentBody=await environment.json();expect(environmentBody.data.latest).toHaveLength(2);expect(environmentBody.data.axis.date).toBe("2026-01-15");expect(environmentBody.data.series[0].samples).toHaveLength(160);const overview=await (await getOverview(new Request("http://localhost:3000/api/overview"))).json();expect(overview.data).toMatchObject({runtimeMode:"DEMO",live:{status:"DEMO_READY"}});});
  it("rejects a date outside the provider time context",async()=>{useDatabase();const response=await getEnvironment(new Request("http://localhost:3000/api/live/environment?area=A&metric=temperature&date=2026-01-16"));expect(response.status).toBe(400);expect((await response.json()).error.code).toBe("DATE_CONTEXT_MISMATCH");});
  it("keeps localhost display preferences in a browser cookie without changing collector settings",async()=>{useDatabase();await getMachines(new Request("http://localhost:3000/api/live/machines"));const db=openDatabase(process.env.DATABASE_PATH!);switchProviderMode(db,"LIVE",0);db.close();const initial=await (await getRuntimeMode(new Request("http://localhost:3000/api/runtime-mode"))).json();expect(initial.data).toMatchObject({providerMode:"DEMO",modeRevision:0});const request=new Request("http://localhost:3000/api/runtime-mode",{method:"PUT",headers:{origin:"http://localhost:3000","sec-fetch-site":"same-origin","content-type":"application/json"},body:JSON.stringify({mode:"LIVE"})});const changed=await putRuntimeMode(request),cookie=changed.headers.get("set-cookie");expect(changed.status).toBe(200);expect((await changed.json()).data).toMatchObject({providerMode:"LIVE",modeRevision:0});expect(cookie).toContain("jiyin_display_mode=LIVE");const unchanged=openDatabase(process.env.DATABASE_PATH!);expect(getSettings(unchanged)).toMatchObject({providerMode:"LIVE",modeRevision:1});unchanged.close();});
  it("reports unconfigured enterprise transport without exposing an origin",async()=>{useDatabase();const response=await getConnectionStatus(new Request("http://localhost:3000/api/connection-status")),body=await response.json();expect(body.data).toMatchObject({configured:false,tlsMode:null,authMode:null,displayMode:"DEMO"});expect(JSON.stringify(body)).not.toMatch(/192\.0\.2\.|ENTERPRISE_API_ORIGIN/);});
});
