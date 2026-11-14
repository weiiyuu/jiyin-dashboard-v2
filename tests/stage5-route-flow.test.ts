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
interface PreviewFile {sha256:string;canonicalFingerprint:string;decision:string;acceptance:string;activeBatchId:number|null;errors:Array<{ruleCode:string}>;warnings:Array<{ruleCode:string}>}
async function preview(bytes:Buffer,name:string){const form=new FormData();form.append("files",upload(bytes,name));form.append("clientFileId",name);const response=await previewPost(request("/api/imports/preview",{method:"POST",body:form}));return await response.json() as {data:{files:PreviewFile[]}};}
async function confirm(bytes:Buffer,name:string,p:{sha256:string;canonicalFingerprint:string;activeBatchId:number|null},action:"INSERT"|"REPLACE"){const form=new FormData();form.append("file",upload(bytes,name));form.append("expectedSha256",p.sha256);form.append("expectedCanonicalFingerprint",p.canonicalFingerprint);form.append("expectedActiveBatchId",p.activeBatchId?.toString()??"");form.append("action",action);const response=await confirmPost(request("/api/imports/confirm",{method:"POST",body:form}));return{status:response.status,body:await response.json() as {data:{batchId:number;result:string}}};}

describe("Stage 5 route-level user flow",()=>{
  it("returns contract errors per file instead of turning one invalid workbook into HTTP 500",async()=>{
    const root=mkdtempSync(join(tmpdir(),"jiyin-stage5-invalid-"));roots.push(root);process.env.DATABASE_PATH=join(root,"invalid.sqlite");
    const validSheets=standardizedWorkbook("2025-06-03"),invalidSheets=standardizedWorkbook("2025-06-04");
    invalidSheets[2].data.push(["2025-06-04 01:00:00",null,null,"analog","A","rule","value>1",2,null,"synthetic","initial"]);
    invalidSheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=1;
    const form=new FormData();
    for(const [id,sheets] of [["valid",validSheets],["invalid",invalidSheets]] as const){form.append("files",upload(createSyntheticXlsx(sheets),`${id}.xlsx`));form.append("clientFileId",id);}
    const response=await previewPost(request("/api/imports/preview",{method:"POST",body:form}));
    expect(response.status).toBe(200);
    const body=await response.json() as {data:{files:Array<{clientFileId:string;decision:string;errors:Array<{ruleCode:string}>}>}};
    expect(body.data.files).toHaveLength(2);
    expect(body.data.files[0]).toMatchObject({clientFileId:"valid",decision:"INSERT",errors:[]});
    expect(body.data.files[1]).toMatchObject({clientFileId:"invalid",decision:"INVALID"});
    expect(body.data.files[1].errors.map((item)=>item.ruleCode)).toContain("STRUCT_MISSING_VALUE");
    const db=openDatabase(process.env.DATABASE_PATH);expect(db.prepare("SELECT COUNT(*) count FROM import_batches").get()).toEqual({count:0});db.close();
  });

  it("previews and confirms a 6/3-shaped workbook with missing Alarm descriptions",async()=>{
    const root=mkdtempSync(join(tmpdir(),"jiyin-stage52-alarm-null-"));roots.push(root);process.env.DATABASE_PATH=join(root,"alarm-null.sqlite");
    const sheets=standardizedWorkbook("2025-06-03");
    for(const row of [16,18,19])sheets[2].data.push([`2025-06-03 01:${row}:00`,null,`sensor-${row}`,null,null,null,null,null,null,null,null]);
    sheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=3;
    const bytes=createSyntheticXlsx(sheets),result=(await preview(bytes,"2025-06-03.xlsx")).data.files[0];
    expect(result).toMatchObject({decision:"INSERT",acceptance:"ACCEPT_WITH_WARNINGS",errors:[]});
    expect(result.warnings.filter((item)=>item.ruleCode==="SOURCE_DESCRIPTION_MISSING")).toHaveLength(15);
    expect((await confirm(bytes,"2025-06-03.xlsx",result,"INSERT")).status).toBe(200);
    const db=openDatabase(process.env.DATABASE_PATH);
    expect(db.prepare("SELECT COUNT(*) count FROM history_alarm_events WHERE rule_name IS NULL").get()).toEqual({count:3});
    db.close();
  });

  it("previews eight real files in one request and preserves every client identity",async()=>{
    const root=mkdtempSync(join(tmpdir(),"jiyin-stage5-eight-"));roots.push(root);process.env.DATABASE_PATH=join(root,"eight.sqlite");
    const form=new FormData();
    for(let index=0;index<8;index++){const date=`2025-06-${String(index+1).padStart(2,"0")}`;form.append("files",upload(createSyntheticXlsx(standardizedWorkbook(date)),`${date}.xlsx`));form.append("clientFileId",`client-${index}`);}
    const response=await previewPost(request("/api/imports/preview",{method:"POST",body:form}));
    expect(response.status).toBe(200);
    const body=await response.json() as {data:{files:Array<{clientFileId:string;decision:string}>}};
    expect(body.data.files.map((item)=>item.clientFileId)).toEqual(Array.from({length:8},(_,index)=>`client-${index}`));
    expect(body.data.files.every((item)=>item.decision==="INSERT")).toBe(true);
  });

  it("keeps duplicate, nullable warning, valid, and blocking files independent in one Preview",async()=>{
    const root=mkdtempSync(join(tmpdir(),"jiyin-stage52-mixed-"));roots.push(root);process.env.DATABASE_PATH=join(root,"mixed.sqlite");
    const duplicateBytes=createSyntheticXlsx(standardizedWorkbook("2025-06-01")),duplicatePreview=(await preview(duplicateBytes,"duplicate.xlsx")).data.files[0];
    expect((await confirm(duplicateBytes,"duplicate.xlsx",duplicatePreview,"INSERT")).status).toBe(200);
    const nullable=standardizedWorkbook("2025-06-03");nullable[2].data.push(["2025-06-03 01:00:00",null,"sensor-null",null,null,null,null,null,null,null,null]);nullable[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=1;
    const valid=standardizedWorkbook("2025-06-07"),invalid=standardizedWorkbook("2025-06-08");invalid[0].data[0]=invalid[0].data[0].filter((name)=>name!=="機台");
    const entries=[{id:"duplicate",bytes:duplicateBytes,sheets:null},{id:"nullable",bytes:createSyntheticXlsx(nullable),sheets:null},{id:"valid",bytes:createSyntheticXlsx(valid),sheets:null},{id:"invalid",bytes:createSyntheticXlsx(invalid),sheets:null}];
    const form=new FormData();for(const entry of entries){form.append("files",upload(entry.bytes,`${entry.id}.xlsx`));form.append("clientFileId",entry.id);}
    const response=await previewPost(request("/api/imports/preview",{method:"POST",body:form}));expect(response.status).toBe(200);
    const body=await response.json() as {data:{files:Array<{clientFileId:string;decision:string;acceptance:string}>}};
    expect(body.data.files).toEqual([
      expect.objectContaining({clientFileId:"duplicate",decision:"DUPLICATE"}),
      expect.objectContaining({clientFileId:"nullable",decision:"INSERT",acceptance:"ACCEPT_WITH_WARNINGS"}),
      expect.objectContaining({clientFileId:"valid",decision:"INSERT",acceptance:"ACCEPT_WITH_WARNINGS"}),
      expect.objectContaining({clientFileId:"invalid",decision:"INVALID",acceptance:"INVALID"}),
    ]);
    const db=openDatabase(process.env.DATABASE_PATH);expect(db.prepare("SELECT COUNT(*) count FROM import_batches").get()).toEqual({count:1});db.close();
  });

  it.each([1,2,4,8])("previews and confirms %i files with independent transactions",async(count)=>{
    const root=mkdtempSync(join(tmpdir(),`jiyin-stage5-${count}-`));roots.push(root);process.env.DATABASE_PATH=join(root,"multi.sqlite");
    const entries:Array<{name:string;bytes:Buffer;preview:PreviewFile}>=[];
    for(let index=0;index<count;index++){
      const date=`2025-07-${String(index+1).padStart(2,"0")}`,name=`${date}.xlsx`,bytes=createSyntheticXlsx(standardizedWorkbook(date));
      entries.push({name,bytes,preview:(await preview(bytes,name)).data.files[0]});
    }
    for(const entry of entries)expect((await confirm(entry.bytes,entry.name,entry.preview,"INSERT")).status).toBe(200);
    const db=openDatabase(process.env.DATABASE_PATH);expect(db.prepare("SELECT COUNT(*) count FROM import_batches WHERE status='ACTIVE'").get()).toEqual({count});db.close();
  });

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
