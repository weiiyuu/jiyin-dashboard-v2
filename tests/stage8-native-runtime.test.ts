import { afterEach,describe,expect,it } from "vitest";
import { mkdtempSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeRuntimeDatabase,nativeChildSpecs,resolveDatabasePath } from "../scripts/run-all";
import { openDatabase,type AppDatabase } from "@/server/db/connection";
import { currentSchemaVersion,migrations } from "@/server/db/migrations";
import { acquireCollectorLock } from "@/server/runtime/collector-lock";
import { ensureCollectorLiveMode,getSettings } from "@/server/db/settings-repository";
import { collectOnce,type EnterpriseGetter } from "@/server/collector/service";
import { GET as getMachines } from "@/app/api/live/machines/route";
import { PUT as putRuntimeMode } from "@/app/api/runtime-mode/route";
import { endpointSuccess } from "./fixtures/stage6-enterprise";
import type { EnterpriseEndpoint } from "@/server/enterprise/types";

const roots:string[]=[],dbs:AppDatabase[]=[];
const previousDatabasePath=process.env.DATABASE_PATH;
function root(){const value=mkdtempSync(join(tmpdir(),"jiyin stage8 中文 "));roots.push(value);return value;}
afterEach(()=>{if(previousDatabasePath===undefined)delete process.env.DATABASE_PATH;else process.env.DATABASE_PATH=previousDatabasePath;while(dbs.length)dbs.pop()!.close();while(roots.length)rmSync(roots.pop()!,{recursive:true,force:true});});

describe("Stage 8A native npm runtime",()=>{
  it("resolves one absolute SQLite path for dev/start children and migrates Unicode paths",()=>{const cwd=root(),relative=join("資料 目錄","platform.sqlite"),path=resolveDatabasePath(relative,cwd);initializeRuntimeDatabase(path);const db=openDatabase(path);dbs.push(db);expect(currentSchemaVersion(db)).toBe(migrations.at(-1)!.version);for(const mode of ["dev","start"] as const){const specs=nativeChildSpecs(mode,{cwd:process.cwd(),env:{DATABASE_PATH:path,PORT:"3199"}});expect(specs.databasePath).toBe(path);expect(specs.env.DATABASE_PATH).toBe(path);expect(specs.web.args).toContain(mode);expect(specs.web.args).toContain("3199");expect(specs.collector.args.at(-1)).toMatch(/collector[/\\]main\.ts$/);}});

  it("prevents duplicate collectors for the same database and releases the lock",()=>{const path=join(root(),"data","runtime.sqlite"),first=acquireCollectorLock(path);expect(()=>acquireCollectorLock(path)).toThrow(/already running/);first.release();const second=acquireCollectorLock(path);second.release();});

  it("keeps per-browser Demo/Live views separate while Mock collection continues",async()=>{const path=join(root(),"shared.sqlite");initializeRuntimeDatabase(path);const db=openDatabase(path);dbs.push(db);ensureCollectorLiveMode(db,Date.parse("2026-11-15T10:00:00+08:00"));process.env.DATABASE_PATH=path;const before=(db.prepare("SELECT COUNT(*) count FROM live_sensor_readings").get() as {count:number}).count;const demoSwitch=await putRuntimeMode(new Request("http://localhost:3000/api/runtime-mode",{method:"PUT",headers:{origin:"http://localhost:3000","sec-fetch-site":"same-origin","content-type":"application/json"},body:JSON.stringify({mode:"DEMO"})}));expect(demoSwitch.headers.get("set-cookie")).toContain("jiyin_display_mode=DEMO");expect(getSettings(db)).toMatchObject({providerMode:"LIVE",modeRevision:1});const calls:EnterpriseEndpoint[]=[];const client:EnterpriseGetter={async get(endpoint){calls.push(endpoint);return endpointSuccess(endpoint);}};const collected=await collectOnce(db,client,{trigger:"STARTUP",nowMs:Date.parse("2026-11-15T10:01:00+08:00"),sleep:async()=>{}});expect(collected).toMatchObject({status:"SUCCESS",readingCount:48});expect(calls).toEqual(["values","configs","groups"]);expect((db.prepare("SELECT COUNT(*) count FROM live_sensor_readings").get() as {count:number}).count).toBe(before+48);const demo=await (await getMachines(new Request("http://localhost:3000/api/live/machines",{headers:{cookie:"jiyin_display_mode=DEMO"}}))).json(),live=await (await getMachines(new Request("http://localhost:3000/api/live/machines",{headers:{cookie:"jiyin_display_mode=LIVE"}}))).json();expect(demo.meta).toMatchObject({providerMode:"DEMO",timeContext:{source:"SYNTHETIC"}});expect(live.meta).toMatchObject({providerMode:"LIVE",timeContext:{source:"LIVE"}});expect((db.prepare("SELECT COUNT(*) count FROM live_sensor_readings").get() as {count:number}).count).toBe(before+48);});
});
