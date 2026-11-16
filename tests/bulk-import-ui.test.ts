import { describe, expect, it } from "vitest";
import { buildUploadBatches, BULK_IMPORT_LIMITS, confirmablePreviewIds, mergeByClientId, paginationItems, parsePageInput, repeatedConfirmableSourceDates, summarizeBulkQueue } from "@/features/imports/bulk-import";
import type { SelectedUpload } from "@/features/imports/import-ui-model";

function uploads(count:number,size=1024):SelectedUpload[]{
  return Array.from({length:count},(_,index)=>({id:`file-${index+1}`,file:{name:`file-${index+1}.xlsx`,size,lastModified:index} as File}));
}

describe("bulk Excel import UI helpers",()=>{
  it.each([[9,[8,1]],[20,[8,8,4]],[30,[8,8,8,6]]] as const)("splits %i selected files into safe sequential batches",(count,expected)=>{
    const batches=buildUploadBatches(uploads(count));
    expect(batches.map((batch)=>batch.length)).toEqual(expected);
    expect(batches.flat().map((item)=>item.id)).toEqual(uploads(count).map((item)=>item.id));
  });

  it("keeps conservative multipart headroom below the server request limit",()=>{
    const files=uploads(3,24*1024*1024);
    const batches=buildUploadBatches(files);
    expect(BULK_IMPORT_LIMITS.clientMaxBatchFileBytes).toBeLessThan(BULK_IMPORT_LIMITS.serverMaxBatchFileBytes);
    expect(batches.map((batch)=>batch.length)).toEqual([2,1]);
    expect(batches.every((batch)=>batch.reduce((sum,item)=>sum+item.file.size,0)<=BULK_IMPORT_LIMITS.clientMaxBatchFileBytes)).toBe(true);
  });

  it("merges completed Preview batches in the original selection order",()=>{
    const order=["a","b","c"];
    expect(mergeByClientId([{clientFileId:"a",value:1}],[{clientFileId:"c",value:3},{clientFileId:"b",value:2}],order)).toEqual([
      {clientFileId:"a",value:1},{clientFileId:"b",value:2},{clientFileId:"c",value:3},
    ]);
  });

  it("blocks every confirmable candidate when the same source date appears more than once",()=>{
    const duplicates=repeatedConfirmableSourceDates([
      {clientFileId:"a",sourceDate:"2025-06-01",decision:"INSERT",errors:[]},
      {clientFileId:"b",sourceDate:"2025-06-01",decision:"INSERT",errors:[]},
      {clientFileId:"c",sourceDate:"2025-06-02",decision:"INVALID",errors:[{}]},
    ]);
    expect(duplicates).toEqual(new Map([["2025-06-01",["a","b"]]]));
  });

  it("allows only ready files from a partial Preview to be confirmed",()=>{
    const previews=Array.from({length:8},(_,index)=>({
      clientFileId:`file-${index+1}`,
      decision:index<3?"INSERT" as const:"DUPLICATE" as const,
      activeBatchId:index<3?null:index+1,
      errors:[],
    }));
    const statuses=Object.fromEntries(previews.map((preview)=>[
      preview.clientFileId,
      preview.decision==="INSERT"?"READY":"DUPLICATE",
    ]));

    expect(confirmablePreviewIds(previews,new Set(),{},statuses)).toEqual(["file-1","file-2","file-3"]);
    expect(confirmablePreviewIds(previews,new Set(),{},Object.fromEntries(previews.map((preview)=>[preview.clientFileId,"CANCELLED"])))).toEqual([]);
    expect(summarizeBulkQueue(
      uploads(15).map((item)=>item.id),
      new Set(previews.map((preview)=>preview.clientFileId)),
      {...statuses,...Object.fromEntries(uploads(7).map((_,index)=>[`file-${index+9}`,"CANCELLED"]))},
    )).toEqual({unchecked:7,failed:0,recheck:0});
    expect(summarizeBulkQueue(
      ["unchecked","failed","recheck"],
      new Set(),
      {unchecked:"CANCELLED",failed:"FAILED",recheck:"RECHECK_REQUIRED"},
    )).toEqual({unchecked:1,failed:1,recheck:1});
  });

  it("still requires replacement approval and excludes same-date candidates",()=>{
    const previews=[
      {clientFileId:"replacement",decision:"CONFLICT" as const,activeBatchId:9,errors:[]},
      {clientFileId:"same-date",decision:"INSERT" as const,activeBatchId:null,errors:[]},
    ];
    const statuses={replacement:"READY", "same-date":"READY"};

    expect(confirmablePreviewIds(previews,new Set(),{},statuses)).toEqual(["same-date"]);
    expect(confirmablePreviewIds(previews,new Set(["same-date"]),{replacement:true},statuses)).toEqual(["replacement"]);
  });

  it("shows all short pagination ranges and contracts long ranges around the current page",()=>{
    expect(paginationItems(1,1)).toEqual([]);
    expect(paginationItems(2,5)).toEqual([1,2,3,4,5]);
    expect(paginationItems(1,20)).toEqual([1,2,3,4,"ellipsis",20]);
    expect(paginationItems(10,20)).toEqual([1,"ellipsis",9,10,11,"ellipsis",20]);
    expect(paginationItems(20,20)).toEqual([1,"ellipsis",17,18,19,20]);
  });

  it("accepts only a positive page within the current filtered result",()=>{
    expect(parsePageInput("15",200)).toEqual({page:15,error:null});
    expect(parsePageInput("0",200)).toEqual({page:null,error:"頁碼須介於 1 至 200"});
    expect(parsePageInput("1.5",200)).toEqual({page:null,error:"請輸入有效頁碼"});
    expect(parsePageInput("201",200)).toEqual({page:null,error:"頁碼須介於 1 至 200"});
  });
});
