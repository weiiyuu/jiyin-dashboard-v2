import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { POST } from "@/app/api/imports/preview/route";
import { openDatabase } from "@/server/db/connection";
import { fullDayStandardizedWorkbook } from "./fixtures/full-day-workbook";
import { createSyntheticXlsx } from "./helpers/xlsx-writer";

const enabled=process.env.RUN_STAGE52_PERF==="1";
const suite=enabled?describe:describe.skip;
const root=enabled?mkdtempSync(join(tmpdir(),"jiyin-stage52-performance-")):"";
const previousPath=process.env.DATABASE_PATH;

suite("Stage 5.2 full-day Preview performance",()=>{
  beforeAll(()=>{process.env.DATABASE_PATH=join(root,"preview.sqlite");});
  afterAll(()=>{process.env.DATABASE_PATH=previousPath;rmSync(root,{recursive:true,force:true});});

  it("measures 1, 2, 4, and 8 complete synthetic workbooks without Preview writes",async()=>{
    const files=Array.from({length:8},(_,index)=>{const sourceDate=`2025-08-${String(index+1).padStart(2,"0")}`;return{sourceDate,bytes:createSyntheticXlsx(fullDayStandardizedWorkbook(sourceDate))};});
    const measurements=[];
    for(const count of [1,2,4,8]){
      const form=new FormData();
      for(const file of files.slice(0,count)){
        form.append("files",new File([Uint8Array.from(file.bytes)],`${file.sourceDate}.xlsx`,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
        form.append("clientFileId",file.sourceDate);
      }
      const rssBefore=process.memoryUsage().rss;let peakRss=rssBefore;
      const sampler=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);},5);
      const started=performance.now();const response=await POST(new Request("http://localhost:3000/api/imports/preview",{method:"POST",body:form,headers:{origin:"http://localhost:3000","sec-fetch-site":"same-origin"}}));const elapsedMs=performance.now()-started;clearInterval(sampler);peakRss=Math.max(peakRss,process.memoryUsage().rss);
      const body=await response.json() as {data:{files:Array<{decision:string;counts:{machine:number;environment:number}}>}};
      const db=openDatabase(process.env.DATABASE_PATH!);const writes=(db.prepare("SELECT COUNT(*) count FROM import_batches").get() as {count:number}).count;db.close();
      expect(response.status).toBe(200);expect(body.data.files).toHaveLength(count);expect(body.data.files.every((file)=>file.decision==="INSERT"&&file.counts.machine===3840&&file.counts.environment===3840)).toBe(true);expect(writes).toBe(0);
      measurements.push({files:count,compressedBytes:files.slice(0,count).reduce((sum,file)=>sum+file.bytes.byteLength,0),httpStatus:response.status,elapsedMs:Number(elapsedMs.toFixed(1)),rssBeforeMiB:Number((rssBefore/1024/1024).toFixed(1)),peakRssMiB:Number((peakRss/1024/1024).toFixed(1)),previewDatabaseWrites:writes});
    }
    console.log("STAGE52_PERFORMANCE "+JSON.stringify({environment:{node:process.version,platform:`${process.platform}/${process.arch}`,mode:"in-process Next Route Handler; 3840 machine + 3840 environment rows per XLSX"},singleFileCompressedBytes:files[0].bytes.byteLength,measurements}));
  },120_000);
});
