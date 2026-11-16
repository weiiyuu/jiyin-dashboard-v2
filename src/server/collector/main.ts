import { existsSync } from "node:fs";
import { openDatabase } from "@/server/db/connection";
import { abortRunningPolls } from "@/server/db/poll-repository";
import { currentSchemaVersion,migrations } from "@/server/db/migrations";
import { EnterpriseApiClient } from "@/server/enterprise/client";
import { loadEnterpriseClientConfig } from "@/server/enterprise/config";
import { EnterpriseClientError } from "@/server/enterprise/types";
import { ensureCollectorLiveMode } from "@/server/db/settings-repository";
import { acquireCollectorLock } from "@/server/runtime/collector-lock";
import { CollectorScheduler } from "./scheduler";

const databasePath=process.env.DATABASE_PATH??"data/jiyin-dashboard.sqlite";
if(!existsSync(databasePath))throw new Error("Collector database does not exist; start web migration owner first");
const lock=acquireCollectorLock(databasePath);
const db=openDatabase(databasePath);
let client:EnterpriseApiClient|null=null,scheduler:CollectorScheduler|null=null,idleTimer:NodeJS.Timeout|null=null,stopping=false,resolveStopped:()=>void=()=>{};
const stopped=new Promise<void>((resolve)=>{resolveStopped=resolve;});
async function shutdown(){if(stopping)return;stopping=true;if(idleTimer)clearInterval(idleTimer);await scheduler?.stop();client?.close();db.close();lock.release();resolveStopped();}
process.once("SIGTERM",()=>{void shutdown();});process.once("SIGINT",()=>{void shutdown();});
try{
  if(currentSchemaVersion(db)!==migrations.at(-1)!.version)throw new Error("Collector database schema is not current");
  abortRunningPolls(db);
  try{const config=loadEnterpriseClientConfig();ensureCollectorLiveMode(db);client=new EnterpriseApiClient(config);scheduler=new CollectorScheduler(db,client);await scheduler.start();console.log("[collector] Live collection scheduler started");}
  catch(error){if(!(error instanceof EnterpriseClientError)||error.code!=="CONFIG")throw error;idleTimer=setInterval(()=>{},60_000);console.log("[collector] Enterprise API is not configured; Demo remains available and collection is idle");}
  await stopped;
}catch(error){await shutdown();throw error;}
