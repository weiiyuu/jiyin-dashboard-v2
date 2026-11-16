import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface CollectorLock { path: string; release(): void }

function processExists(pid:number){if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code==="EPERM";}}

export function acquireCollectorLock(databasePath:string,pid=process.pid):CollectorLock{
  const path=`${databasePath}.collector.pid`;mkdirSync(dirname(path),{recursive:true});
  function create(){const descriptor=openSync(path,"wx");try{writeFileSync(descriptor,String(pid),"utf8");}finally{closeSync(descriptor);}}
  try{create();}catch(error){
    if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;
    let existing=0;try{existing=Number(readFileSync(path,"utf8").trim());}catch{}
    if(processExists(existing))throw new Error(`Collector already running for this database (PID ${existing})`);
    try{unlinkSync(path);}catch{}
    create();
  }
  let released=false;return {path,release(){if(released)return;released=true;try{if(Number(readFileSync(path,"utf8").trim())===pid)unlinkSync(path);}catch{}}};
}
