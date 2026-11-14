import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { zipSync, strToU8 } from "fflate";
import { openDatabase, type AppDatabase } from "@/server/db/connection";
import { applyMigrations } from "@/server/db/migrations";
import { activateImportBatch, confirmImport, inspectImportDecision } from "@/server/import/import-repository";
import { parseWorkbookSheets } from "@/server/import/workbook-parser";
import { preflightXlsx } from "@/server/import/xlsx-preflight";
import { standardizedWorkbook as workbook } from "./fixtures/standardized-workbook";

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
    sheets[5].data.find((row)=>row[0]==="Alarm來源狀態")![1]="未提供";
    const preview=parseWorkbookSheets(sheets,Buffer.from("missing-alarm"));
    expect(preview.alarmSourceStatus).toBe("MISSING");
    expect(preview.issues.some((issue)=>issue.ruleCode==="ALARM_SOURCE_MISSING")).toBe(true);
  });

  it("blocks mismatched source interval text and invalid machine identity",()=>{
    const sheets=workbook();
    sheets[0].data[1][2]="2025-06-01 23:54:00";
    sheets[0].data[1][4]="C1";
    sheets[0].data[1][5]="C";
    const preview=parseWorkbookSheets(sheets,Buffer.from("bad-identity-time"));
    expect(preview.canConfirm).toBe(false);
    expect(preview.issues.map((issue)=>issue.ruleCode)).toEqual(expect.arrayContaining(["TIME_INTERVAL_MISMATCH","MACHINE_IDENTITY_INVALID"]));
  });

  it("warns when a source-derived formula disagrees without rewriting the source",()=>{
    const sheets=workbook();
    sheets[0].data[1][13]=99;
    const preview=parseWorkbookSheets(sheets,Buffer.from("derived-mismatch"));
    expect(preview.canConfirm).toBe(true);
    expect(preview.machineRows[0].sourceProcessingHours).toBe(99);
    expect(preview.issues.some((issue)=>issue.ruleCode==="DERIVED_VALUE_MISMATCH"&&issue.columnName==="加工小時")).toBe(true);
  });

  it("turns missing identity and invalid dates into blocking preview issues rather than parser crashes",()=>{
    const sheets=workbook();sheets[0].data[1][0]="2025-02-30";sheets[0].data[1][4]=null;
    const preview=parseWorkbookSheets(sheets,Buffer.from("missing-identity"));
    expect(preview.canConfirm).toBe(false);
    expect(preview.issues.map((issue)=>issue.ruleCode)).toEqual(expect.arrayContaining(["TIME_INVALID_LABEL","MACHINE_IDENTITY_INVALID","DATE_README_MISMATCH"]));
  });

  it("preserves negative source values and applies metric-specific quality eligibility",()=>{
    const sheets=workbook();const row=sheets[0].data[1];row[7]=-1;row[9]=0;row[12]=-1;row[13]=0;row[15]=-1/3600;row[17]=0;row[18]=null;
    const preview=parseWorkbookSheets(sheets,Buffer.from("negative"));
    expect(preview.canConfirm).toBe(true);
    expect(preview.machineRows[0]).toMatchObject({redSeconds:-1,greenSeconds:0,greenHoursEligible:1,sixStateShareEligible:0,transitionEligible:0});
    expect(preview.issues.some((issue)=>issue.ruleCode==="VALUE_NEGATIVE"&&issue.columnName==="Red秒")).toBe(true);
  });

  it("blocks a dictionary semantic change but only warns on a compatible version name",()=>{
    const compatible=workbook();compatible[4].data[1][1]="compatible v4";
    expect(parseWorkbookSheets(compatible,Buffer.from("version")).issues.some((issue)=>issue.ruleCode==="DICTIONARY_VERSION_DIFFERENT"&&issue.severity==="WARNING")).toBe(true);
    const changed=workbook();changed[4].data=changed[4].data.filter((row)=>row[0]!=="24:00");
    const preview=parseWorkbookSheets(changed,Buffer.from("semantic"));
    expect(preview.canConfirm).toBe(false);
    expect(preview.issues.some((issue)=>issue.ruleCode==="DICTIONARY_SEMANTIC_CHANGE")).toBe(true);
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

  it("reports preview duplicate/conflict and active batch without writing",()=>{
    const db=setup(),first=parseWorkbookSheets(workbook(),Buffer.from("preview-first"));
    expect(inspectImportDecision(db,first)).toEqual({decision:"INSERT",activeBatchId:null,duplicateBatchId:null});
    const imported=confirmImport(db,first,{nowMs:1}) as {batchId:number};
    expect(inspectImportDecision(db,first)).toEqual({decision:"DUPLICATE",activeBatchId:imported.batchId,duplicateBatchId:imported.batchId});
    const revision=structuredClone(first);revision.fileSha256="preview-revision";revision.canonicalFingerprint="preview-revision";
    expect(inspectImportDecision(db,revision)).toEqual({decision:"CONFLICT",activeBatchId:imported.batchId,duplicateBatchId:null});
    expect(db.prepare("SELECT COUNT(*) count FROM import_batches").get()).toEqual({count:1});
  });

  it("requires explicit replacement, preserves versions, and can roll back",()=>{
    const db=setup(); const first=parseWorkbookSheets(workbook(),Buffer.from("first"));
    const firstResult=confirmImport(db,first,{nowMs:1});
    const second=structuredClone(first); second.fileSha256="different-sha";second.canonicalFingerprint="different-fingerprint";second.originalFileName="revision.xlsx";
    expect(confirmImport(db,second,{nowMs:2})).toMatchObject({outcome:"CONFLICT"});
    const replaced=confirmImport(db,second,{replace:true,nowMs:3});
    expect(replaced.outcome).toBe("REPLACED");
    activateImportBatch(db,(firstResult as {batchId:number}).batchId,(replaced as {batchId:number}).batchId,4);
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

  it("rolls back every replacement write stage and keeps the old active graph unchanged",()=>{
    const stages=["metadata","machine","environment","alarm","quality","old-active","new-active","event"] as const;
    for(const stage of stages){
      const db=setup(),sheets=workbook();
      sheets[2].data.push(["2025-06-01 12:00:00","sensor","sensor-1","analog","A","rule","value>1",2,null,"synthetic","initial"]);
      sheets[3].data.push(["2025-06-01","12:00","A1","synthetic issue",180]);
      sheets[5].data.find((row)=>row[0]==="可取得警報筆數")![1]=1;
      const first=parseWorkbookSheets(sheets,Buffer.from(`first-${stage}`));
      const imported=confirmImport(db,first,{nowMs:1});
      const replacement=structuredClone(first);replacement.fileSha256=`sha-${stage}`;replacement.canonicalFingerprint=`fp-${stage}`;
      const snapshot=()=>({batches:db.prepare("SELECT batch_id,status FROM import_batches ORDER BY batch_id").all(),events:db.prepare("SELECT * FROM import_batch_events ORDER BY event_id").all(),metadata:db.prepare("SELECT batch_id,sheet_name,item_key,value_text FROM import_metadata_entries ORDER BY metadata_id").all(),issues:db.prepare("SELECT batch_id,rule_code,severity FROM validation_issues ORDER BY issue_id").all(),machine:db.prepare("SELECT batch_id,machine_id,green_seconds FROM history_machine_intervals").all(),environment:db.prepare("SELECT batch_id,area,average_value FROM history_environment_intervals").all(),alarms:db.prepare("SELECT batch_id,sensor_id,current_value_numeric FROM history_alarm_events").all(),quality:db.prepare("SELECT batch_id,subject_text,interval_total_seconds FROM history_quality_issues").all()});
      const before=snapshot();
      expect(()=>confirmImport(db,replacement,{replace:true,expectedActiveBatchId:(imported as {batchId:number}).batchId,injectFailureAfter:stage})).toThrow("INJECTED_IMPORT_FAILURE");
      expect(snapshot()).toEqual(before);
    }
  });

  it("rejects confirm and activate when the previewed active version changed",()=>{
    const db=setup();const first=parseWorkbookSheets(workbook(),Buffer.from("cas-first"));
    const one=confirmImport(db,first,{nowMs:1}) as {batchId:number};
    const second=structuredClone(first);second.fileSha256="cas-second";second.canonicalFingerprint="cas-second";
    expect(()=>confirmImport(db,second,{replace:true,expectedActiveBatchId:999,nowMs:2})).toThrow("ACTIVE_VERSION_CHANGED");
    const two=confirmImport(db,second,{replace:true,expectedActiveBatchId:one.batchId,nowMs:3}) as {batchId:number};
    expect(()=>activateImportBatch(db,one.batchId,999,4)).toThrow("ACTIVE_VERSION_CHANGED");
    activateImportBatch(db,one.batchId,two.batchId,5);
  });
});
