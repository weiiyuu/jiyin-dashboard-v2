import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "@/server/db/connection";
import { POST as previewPost } from "@/app/api/imports/preview/route";
import { POST as confirmPost } from "@/app/api/imports/confirm/route";
import { POST as activatePost } from "@/app/api/imports/[batchId]/activate/route";
import { GET as processingGet } from "@/app/api/history/processing/route";
import { GET as eventsGet } from "@/app/api/history/events/route";
import { standardizedWorkbook } from "./fixtures/standardized-workbook";
import { createSyntheticXlsx } from "./helpers/xlsx-writer";

const roots:string[]=[];const previousPath=process.env.DATABASE_PATH;
afterEach(()=>{process.env.DATABASE_PATH=previousPath;while(roots.length)rmSync(roots.pop()!,{recursive:true,force:true});});
function request(path:string,init?:RequestInit){return new Request(`http://localhost:3000${path}`,{...init,headers:{origin:"http://localhost:3000","sec-fetch-site":"same-origin",...init?.headers}});}
function upload(bytes:Buffer,name:string){return new File([Uint8Array.from(bytes)],name,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});}
async function preview(bytes:Buffer,name:string){const form=new FormData();form.append("files",upload(bytes,name));form.append("clientFileId",name);const response=await previewPost(request("/api/imports/preview",{method:"POST",body:form}));return await response.json() as {data:{files:Array<{sha256:string;canonicalFingerprint:string;decision:string;activeBatchId:number|null;errors:unknown[]}>}};}
async function confirm(bytes:Buffer,name:string,p:{sha256:string;canonicalFingerprint:string;activeBatchId:number|null},action:"INSERT"|"REPLACE"){const form=new FormData();form.append("file",upload(bytes,name));form.append("expectedSha256",p.sha256);form.append("expectedCanonicalFingerprint",p.canonicalFingerprint);form.append("expectedActiveBatchId",p.activeBatchId?.toString()??"");form.append("action",action);const response=await confirmPost(request("/api/imports/confirm",{method:"POST",body:form}));return{status:response.status,body:await response.json() as {data:{batchId:number;result:string}}};}

describe("Stage 5 route-level user flow",()=>{
  it("previews without writes, imports, replaces, refreshes analysis, and rolls back the active version",async()=>{
    const root=mkdtempSync(join(tmpdir(),"jiyin-stage5-flow-"));roots.push(root);const path=join(root,"flow.sqlite");process.env.DATABASE_PATH=path;
    const oldSheets=standardizedWorkbook("2025-06-01"),oldBytes=createSyntheticXlsx(oldSheets),oldPreview=(await preview(oldBytes,"old.xlsx")).data.files[0];
    expect(oldPreview).toMatchObject({decision:"INSERT",activeBatchId:null,errors:[]});
    const before=openDatabase(path);expect(before.prepare("SELECT COUNT(*) count FROM import_batches").get()).toEqual({count:0});before.close();
    const oldConfirm=await confirm(oldBytes,"old.xlsx",oldPreview,"INSERT");expect(oldConfirm.status).toBe(200);const oldBatchId=oldConfirm.body.data.batchId;
    const initial=await (await processingGet(request("/api/history/processing?mode=range&startDate=2025-06-01&endDate=2025-06-01&bucket=30m&machineIds=A1"))).json() as {data:{ranking:Array<{greenHours:number|null}>}};
    expect(initial.data.ranking[0].greenHours).toBe(.05);

    const newSheets=standardizedWorkbook("2025-06-01"),machine=newSheets[0].data[1];machine[9]=90;machine[12]=90;machine[13]=.025;
    const newBytes=createSyntheticXlsx(newSheets),newPreview=(await preview(newBytes,"revision.xlsx")).data.files[0];expect(newPreview).toMatchObject({decision:"CONFLICT",activeBatchId:oldBatchId});
    const replacement=await confirm(newBytes,"revision.xlsx",newPreview,"REPLACE");expect(replacement.body.data.result).toBe("REPLACED");
    const replaced=await (await processingGet(request("/api/history/processing?mode=range&startDate=2025-06-01&endDate=2025-06-01&bucket=30m&machineIds=A1"))).json() as {data:{ranking:Array<{greenHours:number|null}>}};
    expect(replaced.data.ranking[0].greenHours).toBe(.025);

    const activate=await activatePost(request(`/api/imports/${oldBatchId}/activate`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({currentActiveBatchId:replacement.body.data.batchId})}),{params:Promise.resolve({batchId:String(oldBatchId)})});expect(activate.status).toBe(200);
    const rolledBack=await (await processingGet(request("/api/history/processing?mode=range&startDate=2025-06-01&endDate=2025-06-01&bucket=30m&machineIds=A1"))).json() as {data:{ranking:Array<{greenHours:number|null}>}};
    expect(rolledBack.data.ranking[0].greenHours).toBe(.05);
  });

  it("keeps Alarm MISSING distinct from a provided empty source through the UI API",async()=>{
    const root=mkdtempSync(join(tmpdir(),"jiyin-stage5-alarm-"));roots.push(root);process.env.DATABASE_PATH=join(root,"alarm.sqlite");
    for(const [date,status] of [["2025-06-01","已提供"],["2025-06-02","未提供"]] as const){const sheets=standardizedWorkbook(date);sheets[5].data.find((row)=>row[0]==="Alarm來源狀態")![1]=status;const bytes=createSyntheticXlsx(sheets),p=(await preview(bytes,`${date}.xlsx`)).data.files[0];expect((await confirm(bytes,`${date}.xlsx`,p,"INSERT")).status).toBe(200);}
    const body=await (await eventsGet(request("/api/history/events?startDate=2025-06-01&endDate=2025-06-02&machineIds=A1&page=1&pageSize=20"))).json() as {data:{alarmCoverage:Array<{sourceStatus:string;rowCount:number|null}>}};
    expect(body.data.alarmCoverage).toEqual([{sourceDate:"2025-06-01",sourceStatus:"PROVIDED_EMPTY",rowCount:0},{sourceDate:"2025-06-02",sourceStatus:"MISSING",rowCount:null}]);
  });
});
