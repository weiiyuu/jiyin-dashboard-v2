import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { zipSync, strToU8 } from "fflate";
import type { Sheet } from "read-excel-file/node";
import { openDatabase, type AppDatabase } from "@/server/db/connection";
import { applyMigrations } from "@/server/db/migrations";
import { activateImportBatch, confirmImport } from "@/server/import/import-repository";
import { parseWorkbookSheets } from "@/server/import/workbook-parser";
import { preflightXlsx } from "@/server/import/xlsx-preflight";

const MACHINE_HEADERS=["日期","時間","區間開始","區間結束","機台","區域","None秒","Red秒","Yellow秒","Green秒","Blue秒","White秒","四態合計秒","加工小時","待機小時(黃燈)","異常小時","未開機小時","區間加工比例","開機加工比例","品質狀態","品質備註"];
const ENV_HEADERS=["日期","時間","區間開始","區間結束","區域","感測器編號","類別","平均","最大","中位數","最小","參考門檻","最大值判斷","品質狀態","備註"];
const ALARM_HEADERS=["事件時間","感測器","感測器ID","類型","群組","規則名稱","規則條件","當前值","持續時間原文","初步事件分類","分類狀態"];
const QUALITY_HEADERS=["日期","時間","對象","問題","區間合計秒"];

function workbook(): Sheet[] {
  return [
    {sheet:"machine_3min",data:[MACHINE_HEADERS,["2025-06-01","24:00","2025-06-01 23:57:00","2025-06-02 00:00:00","A1","A",0,"Await",0,180,0,0,180,0.05,0,null,0,1,1,"警告","Red Await"]]},
    {sheet:"environment_3min",data:[ENV_HEADERS,["2025-06-01","24:00","2025-06-01 23:57:00","2025-06-02 00:00:00","A",1,"溫度",0,0,null,0,26,"未超過","正常",null]]},
    {sheet:"alarm_events",data:[ALARM_HEADERS]},
    {sheet:"quality_issues",data:[QUALITY_HEADERS]},
    {sheet:"data_dictionary",data:[["項目","定義/規則","說明"],["版本","v3",null]]},
    {sheet:"README",data:[["統計項目","數量"],["Alarm來源狀態","已提供",null]]},
  ];
}

const roots:string[]=[]; const dbs:AppDatabase[]=[];
function setup(){const root=mkdtempSync(join(tmpdir(),"jiyin-import-test-"));roots.push(root);const db=openDatabase(join(root,"test.sqlite"));dbs.push(db);applyMigrations(db);return db;}
afterEach(()=>{while(dbs.length)dbs.pop()!.close();while(roots.length)rmSync(roots.pop()!,{recursive:true,force:true});});

describe("standardized workbook parser",()=>{
  it("preserves zero, nonnumeric tokens, empty quality issues, and 24:00",()=>{
    const preview=parseWorkbookSheets(workbook(),Buffer.from("fixture"));
    expect(preview.canConfirm).toBe(true);
    expect(preview.alarmSourceStatus).toBe("PROVIDED_EMPTY");
    expect(preview.qualityIssueRows).toHaveLength(0);
    expect(preview.machineRows[0]).toMatchObject({noneSeconds:0,redSeconds:null,greenSeconds:180,greenHoursEligible:1,sixStateShareEligible:0});
    expect(preview.machineRows[0].sourceExceptionJson).toContain("Await");
    expect(new Date(preview.machineRows[0].intervalEndMs).toISOString()).toBe("2025-06-01T16:00:00.000Z");
    expect(preview.environmentRows[0]).toMatchObject({averageValue:0,medianValue:null});
  });

  it("blocks duplicate business keys",()=>{
    const sheets=workbook();
    sheets[0].data.push([...sheets[0].data[1]]);
    const preview=parseWorkbookSheets(sheets,Buffer.from("duplicate"));
    expect(preview.canConfirm).toBe(false);
    expect(preview.issues.some((issue)=>issue.ruleCode==="TIME_DUPLICATE_BUSINESS_KEY")).toBe(true);
  });

  it("distinguishes a missing Alarm source from an empty provided sheet",()=>{
    const sheets=workbook();
    sheets[5].data[1][1]="未提供";
    const preview=parseWorkbookSheets(sheets,Buffer.from("missing-alarm"));
    expect(preview.alarmSourceStatus).toBe("MISSING");
    expect(preview.issues.some((issue)=>issue.ruleCode==="ALARM_SOURCE_MISSING")).toBe(true);
  });
});

describe("XLSX preflight",()=>{
  it("rejects formulas, external links, and excessive cells",()=>{
    const formula=zipSync({"xl/worksheets/sheet1.xml":strToU8("<worksheet><c><f>A1+1</f></c></worksheet>")});
    expect(()=>preflightXlsx(formula)).toThrow("XLSX_FORMULA_NOT_ALLOWED");
    const external=zipSync({"xl/externalLinks/externalLink1.xml":strToU8("<x/>")});
    expect(()=>preflightXlsx(external)).toThrow("XLSX_UNSAFE_CONTENT");
    const tooMany=zipSync({"xl/worksheets/sheet1.xml":strToU8(`<worksheet>${"<c r='A1'/>".repeat(250_001)}</worksheet>`)});
    expect(()=>preflightXlsx(tooMany)).toThrow("XLSX_CELL_COUNT_LIMIT");
  });
});

describe("confirm, replace, and rollback transactions",()=>{
  it("imports once and treats a second confirm as zero-write duplicate",()=>{
    const db=setup(); const preview=parseWorkbookSheets(workbook(),Buffer.from("same"));
    expect(confirmImport(db,preview,{nowMs:1}).outcome).toBe("IMPORTED");
    expect(confirmImport(db,preview,{nowMs:2}).outcome).toBe("DUPLICATE");
    expect(db.prepare("SELECT COUNT(*) count FROM import_batches").get()).toEqual({count:1});
    expect(db.prepare("SELECT COUNT(*) count FROM history_machine_intervals").get()).toEqual({count:1});
  });

  it("requires explicit replacement, preserves versions, and can roll back",()=>{
    const db=setup(); const first=parseWorkbookSheets(workbook(),Buffer.from("first"));
    const firstResult=confirmImport(db,first,{nowMs:1});
    const second=structuredClone(first); second.fileSha256="different-sha";second.canonicalFingerprint="different-fingerprint";second.originalFileName="revision.xlsx";
    expect(confirmImport(db,second,{nowMs:2})).toMatchObject({outcome:"CONFLICT"});
    const replaced=confirmImport(db,second,{replace:true,nowMs:3});
    expect(replaced.outcome).toBe("REPLACED");
    activateImportBatch(db,(firstResult as {batchId:number}).batchId,4);
    expect(db.prepare("SELECT batch_id FROM import_batches WHERE status='ACTIVE'").get()).toEqual({batch_id:(firstResult as {batchId:number}).batchId});
    expect(db.prepare("SELECT COUNT(*) count FROM import_batch_events").get()).toEqual({count:3});
  });

  it("blocks Alarm regression and rolls back injected mid-import failure",()=>{
    const db=setup(); const first=parseWorkbookSheets(workbook(),Buffer.from("first"));
    confirmImport(db,first,{nowMs:1});
    const regression=structuredClone(first);regression.fileSha256="r";regression.canonicalFingerprint="r";regression.alarmSourceStatus="MISSING";
    expect(()=>confirmImport(db,regression,{replace:true,nowMs:2})).toThrow("ALARM_REPLACEMENT_REGRESSION");
    expect(db.prepare("SELECT COUNT(*) count FROM import_batches").get()).toEqual({count:1});

    const freshDb=setup();
    expect(()=>confirmImport(freshDb,first,{injectFailureAfter:"machine"})).toThrow("INJECTED_IMPORT_FAILURE");
    expect(freshDb.prepare("SELECT COUNT(*) count FROM import_batches").get()).toEqual({count:0});
    expect(freshDb.prepare("SELECT COUNT(*) count FROM history_machine_intervals").get()).toEqual({count:0});
  });
});
