import { existsSync } from "node:fs";
import { openDatabase } from "@/server/db/connection";
import { abortRunningPolls } from "@/server/db/poll-repository";
import { currentSchemaVersion,migrations } from "@/server/db/migrations";
import { EnterpriseApiClient } from "@/server/enterprise/client";
import { loadEnterpriseClientConfig } from "@/server/enterprise/config";
import type { EnterpriseEndpoint } from "@/server/enterprise/types";
import { CollectorScheduler } from "./scheduler";

const databasePath=process.env.DATABASE_PATH??"data/jiyin-dashboard.sqlite";
if(!existsSync(databasePath))throw new Error("Collector database does not exist; start web migration owner first");
const db=openDatabase(databasePath);
if(currentSchemaVersion(db)!==migrations.at(-1)!.version){db.close();throw new Error("Collector database schema is not current");}
abortRunningPolls(db);
let client:EnterpriseApiClient|null=null;
const getter={get(endpoint:EnterpriseEndpoint,attemptCount?:number){client??=new EnterpriseApiClient(loadEnterpriseClientConfig());return client.get(endpoint,attemptCount);}};
const scheduler=new CollectorScheduler(db,getter);
let stopping=false;
async function shutdown(){if(stopping)return;stopping=true;await scheduler.stop();client?.close();db.close();}
process.once("SIGTERM",()=>{void shutdown().finally(()=>process.exit(0));});
process.once("SIGINT",()=>{void shutdown().finally(()=>process.exit(0));});
await scheduler.start();
