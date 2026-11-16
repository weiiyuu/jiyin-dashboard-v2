import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openDatabase } from "../src/server/db/connection";
import { applyMigrations } from "../src/server/db/migrations";

export type NativeRunMode="dev"|"start";
export function resolveDatabasePath(raw:string|undefined,cwd=process.cwd()){const value=raw?.trim()||"data/jiyin-dashboard.sqlite";return isAbsolute(value)?value:resolve(cwd,value);}
export function initializeRuntimeDatabase(path:string){mkdirSync(dirname(path),{recursive:true});const db=openDatabase(path);try{applyMigrations(db);}finally{db.close();}}
export function nativeChildSpecs(mode:NativeRunMode,input:{cwd?:string;env?:Record<string,string|undefined>}={}){
  const cwd=input.cwd??process.cwd(),databasePath=resolveDatabasePath(input.env?.DATABASE_PATH??process.env.DATABASE_PATH,cwd),env:NodeJS.ProcessEnv={...process.env,...input.env,DATABASE_PATH:databasePath},nextBin=resolve(cwd,"node_modules","next","dist","bin","next"),collector=resolve(cwd,"src","server","collector","main.ts"),port=env.PORT?.trim();
  return {databasePath,env,web:{command:process.execPath,args:[nextBin,mode,"--hostname","127.0.0.1",...(port?["--port",port]:[])]},collector:{command:process.execPath,args:["--import","tsx",collector]}};
}

function terminate(child:ChildProcess,signal:NodeJS.Signals){if(child.exitCode===null&&!child.killed)child.kill(signal);}

export async function runAll(mode:NativeRunMode){
  const specs=nativeChildSpecs(mode);initializeRuntimeDatabase(specs.databasePath);
  console.log(`[launcher] ${mode} using SQLite: ${specs.databasePath}`);
  const children=[spawn(specs.web.command,specs.web.args,{cwd:process.cwd(),env:specs.env,stdio:"inherit",windowsHide:false}),spawn(specs.collector.command,specs.collector.args,{cwd:process.cwd(),env:specs.env,stdio:"inherit",windowsHide:false})];
  let stopping=false,exitCode=0;
  const stop=(code=0)=>{if(stopping)return;stopping=true;exitCode=code;for(const child of children)terminate(child,"SIGTERM");setTimeout(()=>{for(const child of children)terminate(child,"SIGKILL");},15_000).unref();};
  process.once("SIGINT",()=>stop(0));process.once("SIGTERM",()=>stop(0));
  for(const child of children){child.once("error",(error)=>{console.error("[launcher] child process failed",error);stop(1);});child.once("exit",(code,signal)=>{if(!stopping){console.error(`[launcher] child exited unexpectedly (${code??signal??"unknown"})`);stop(code??1);}});}
  await Promise.all(children.map((child)=>new Promise<void>((resolveExit)=>child.once("exit",()=>resolveExit()))));process.exitCode=exitCode;
}

const requested=process.argv[2];if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(requested!=="dev"&&requested!=="start")throw new Error("Usage: run-all.ts <dev|start>");await runAll(requested);}
