import type { AppDatabase } from "@/server/db/connection";
import { transaction } from "@/server/db/connection";
import type { ImportPreview } from "./types";
import { CURRENT_QUALITY_RULE_VERSION } from "./workbook-parser";

export type ConfirmResult =
  | { outcome: "IMPORTED" | "REPLACED"; batchId: number; replacedBatchId: number | null }
  | { outcome: "DUPLICATE"; batchId: number }
  | { outcome: "CONFLICT"; activeBatchId: number };

export interface ImportDecision {
  decision: "INSERT" | "DUPLICATE" | "CONFLICT";
  activeBatchId: number | null;
  duplicateBatchId: number | null;
}

export type ImportFailureStage = "batch" | "metadata" | "machine" | "environment" | "alarm" | "quality" | "old-active" | "new-active" | "event";

export function inspectImportDecision(db: AppDatabase, preview: ImportPreview): ImportDecision {
  const duplicate = db.prepare(`SELECT batch_id FROM import_batches
    WHERE source_date=? AND (file_sha256=? OR canonical_fingerprint=?)
    ORDER BY batch_id DESC LIMIT 1`).get(preview.sourceDate, preview.fileSha256, preview.canonicalFingerprint) as { batch_id: number } | undefined;
  const active = db.prepare("SELECT batch_id FROM import_batches WHERE source_date=? AND status='ACTIVE'").get(preview.sourceDate) as { batch_id: number } | undefined;
  return {
    decision: duplicate ? "DUPLICATE" : active ? "CONFLICT" : "INSERT",
    activeBatchId: active?.batch_id ?? null,
    duplicateBatchId: duplicate?.batch_id ?? null,
  };
}

export function confirmImport(
  db: AppDatabase,
  preview: ImportPreview,
  options: { replace?: boolean; expectedActiveBatchId?: number | null; nowMs?: number; injectFailureAfter?: ImportFailureStage } = {},
): ConfirmResult {
  if (!preview.canConfirm) throw new Error("IMPORT_VALIDATION_FAILED");
  const nowMs = options.nowMs ?? Date.now();
  return transaction(db, () => {
    const duplicate = db.prepare(`SELECT batch_id FROM import_batches
      WHERE source_date=? AND (file_sha256=? OR canonical_fingerprint=?)
      ORDER BY batch_id DESC LIMIT 1`).get(preview.sourceDate, preview.fileSha256, preview.canonicalFingerprint) as { batch_id: number } | undefined;
    if (duplicate) return { outcome: "DUPLICATE", batchId: duplicate.batch_id };
    const active = db.prepare(`SELECT batch_id, alarm_source_status FROM import_batches
      WHERE source_date=? AND status='ACTIVE'`).get(preview.sourceDate) as { batch_id: number; alarm_source_status: string } | undefined;
    if (options.expectedActiveBatchId !== undefined && (active?.batch_id ?? null) !== options.expectedActiveBatchId) {
      throw new Error("ACTIVE_VERSION_CHANGED");
    }
    if (active && !options.replace) return { outcome: "CONFLICT", activeBatchId: active.batch_id };
    if (active && ["PROVIDED_NONEMPTY","PROVIDED_EMPTY"].includes(active.alarm_source_status)
      && ["MISSING","UNKNOWN"].includes(preview.alarmSourceStatus)) throw new Error("ALARM_REPLACEMENT_REGRESSION");

    const batchResult = db.prepare(`INSERT INTO import_batches(
      source_date,original_file_name,file_size_bytes,file_sha256,canonical_fingerprint,contract_version,dictionary_version,
      alarm_source_status,status,replaces_batch_id,machine_row_count,environment_row_count,alarm_row_count,
      quality_issue_row_count,error_count,warning_count,confirmed_at_ms,created_at_ms
    ) VALUES(?,?,?,?,?,?,?,?,'REPLACED',?,?,?,?,?,?,?,?,?)`).run(
      preview.sourceDate, sanitizeFileName(preview.originalFileName), preview.fileSizeBytes, preview.fileSha256,
      preview.canonicalFingerprint, preview.contractVersion, preview.dictionaryVersion, preview.alarmSourceStatus,
      active?.batch_id ?? null, preview.machineRows.length, preview.environmentRows.length, preview.alarmRows.length,
      preview.qualityIssueRows.length, preview.issues.filter((issue)=>issue.severity==="ERROR").length,
      preview.issues.filter((issue) => issue.severity !== "ERROR").length, nowMs, nowMs,
    );
    const batchId = Number(batchResult.lastInsertRowid);
    if (options.injectFailureAfter === "batch") throw new Error("INJECTED_IMPORT_FAILURE");

    const insertMetadata = db.prepare(`INSERT INTO import_metadata_entries(
      batch_id,sheet_name,source_row_number,item_key,value_text,note_text) VALUES(?,?,?,?,?,?)`);
    for (const row of preview.metadataRows) insertMetadata.run(batchId,row.sheetName,row.sourceRowNumber,row.itemKey,row.valueText,row.noteText);
    const insertIssue = db.prepare(`INSERT INTO validation_issues(
      batch_id,rule_code,quality_rule_version,severity,sheet_name,source_row_number,column_name,metric_scope,message_safe,created_at_ms
    ) VALUES(?,?,?,?,?,?,?,?,?,?)`);
    for (const issue of preview.issues) insertIssue.run(batchId,issue.ruleCode,CURRENT_QUALITY_RULE_VERSION,issue.severity,
      issue.sheetName??null,issue.sourceRowNumber??null,issue.columnName??null,issue.metricScope??null,issue.messageSafe,nowMs);
    if (options.injectFailureAfter === "metadata") throw new Error("INJECTED_IMPORT_FAILURE");

    const insertMachine = db.prepare(`INSERT INTO history_machine_intervals(
      batch_id,source_row_number,source_date,time_label,interval_start_text,interval_end_text,interval_start_ms,interval_end_ms,machine_id,area,
      none_seconds,red_seconds,yellow_seconds,green_seconds,blue_seconds,white_seconds,source_four_state_total_seconds,source_processing_hours,
      source_yellow_hours,source_red_hours,source_none_hours,source_interval_processing_ratio,source_powered_processing_ratio,
      source_quality_status,source_quality_note,source_exception_json,green_hours_eligible,four_state_ratio_eligible,six_state_share_eligible,
      transition_eligible,quality_rule_version,issue_codes_json
    ) VALUES(${Array(32).fill("?").join(",")})`);
    for (const r of preview.machineRows) insertMachine.run(batchId,r.sourceRowNumber,r.sourceDate,r.timeLabel,r.intervalStartText,r.intervalEndText,
      r.intervalStartMs,r.intervalEndMs,r.machineId,r.area,r.noneSeconds,r.redSeconds,r.yellowSeconds,r.greenSeconds,r.blueSeconds,r.whiteSeconds,
      r.sourceFourStateTotalSeconds,r.sourceProcessingHours,r.sourceYellowHours,r.sourceRedHours,r.sourceNoneHours,r.sourceIntervalProcessingRatio,
      r.sourcePoweredProcessingRatio,r.sourceQualityStatus,r.sourceQualityNote,r.sourceExceptionJson,r.greenHoursEligible,r.fourStateRatioEligible,
      r.sixStateShareEligible,r.transitionEligible,r.qualityRuleVersion,r.issueCodesJson);
    if (options.injectFailureAfter === "machine") throw new Error("INJECTED_IMPORT_FAILURE");

    const insertEnvironment = db.prepare(`INSERT INTO history_environment_intervals(
      batch_id,source_row_number,source_date,time_label,interval_start_text,interval_end_text,interval_start_ms,interval_end_ms,area,sensor_number,
      category,average_value,maximum_value,median_value,minimum_value,reference_threshold,source_max_judgement,source_quality_status,source_note,
      source_exception_json,average_eligible,maximum_eligible,median_eligible,minimum_eligible,quality_rule_version,issue_codes_json
    ) VALUES(${Array(26).fill("?").join(",")})`);
    for (const r of preview.environmentRows) insertEnvironment.run(batchId,r.sourceRowNumber,r.sourceDate,r.timeLabel,r.intervalStartText,r.intervalEndText,
      r.intervalStartMs,r.intervalEndMs,r.area,r.sensorNumber,r.category,r.averageValue,r.maximumValue,r.medianValue,r.minimumValue,r.referenceThreshold,
      r.sourceMaxJudgement,r.sourceQualityStatus,r.sourceNote,r.sourceExceptionJson,r.averageEligible,r.maximumEligible,r.medianEligible,r.minimumEligible,
      r.qualityRuleVersion,r.issueCodesJson);
    if (options.injectFailureAfter === "environment") throw new Error("INJECTED_IMPORT_FAILURE");

    const insertAlarm = db.prepare(`INSERT INTO history_alarm_events(
      batch_id,source_row_number,source_date,event_time_text,event_at_ms,sensor_name,sensor_id,sensor_type,group_text,rule_name,rule_condition_text,
      current_value_text,current_value_numeric,duration_original,initial_classification,classification_status,event_fingerprint,duplicate_within_batch,issue_codes_json
    ) VALUES(${Array(19).fill("?").join(",")})`);
    for (const r of preview.alarmRows) insertAlarm.run(batchId,r.sourceRowNumber,r.sourceDate,r.eventTimeText,r.eventAtMs,r.sensorName,r.sensorId,
      r.sensorType,r.groupText,r.ruleName,r.ruleConditionText,r.currentValueText,r.currentValueNumeric,r.durationOriginal,r.initialClassification,
      r.classificationStatus,r.eventFingerprint,r.duplicateWithinBatch,r.issueCodesJson);
    if (options.injectFailureAfter === "alarm") throw new Error("INJECTED_IMPORT_FAILURE");
    const insertQuality = db.prepare(`INSERT INTO history_quality_issues(
      batch_id,source_row_number,source_date,time_label,subject_text,problem_text,interval_total_seconds,source_exception_json
    ) VALUES(?,?,?,?,?,?,?,?)`);
    for (const r of preview.qualityIssueRows) insertQuality.run(batchId,r.sourceRowNumber,r.sourceDate,r.timeLabel,r.subjectText,r.problemText,
      r.intervalTotalSeconds,r.sourceExceptionJson);
    if (options.injectFailureAfter === "quality") throw new Error("INJECTED_IMPORT_FAILURE");

    const counts = db.prepare(`SELECT
      (SELECT COUNT(*) FROM history_machine_intervals WHERE batch_id=?) machine_count,
      (SELECT COUNT(*) FROM history_environment_intervals WHERE batch_id=?) environment_count,
      (SELECT COUNT(*) FROM history_alarm_events WHERE batch_id=?) alarm_count,
      (SELECT COUNT(*) FROM history_quality_issues WHERE batch_id=?) quality_count`).get(batchId,batchId,batchId,batchId) as Record<string,number>;
    if (counts.machine_count!==preview.machineRows.length || counts.environment_count!==preview.environmentRows.length
      || counts.alarm_count!==preview.alarmRows.length || counts.quality_count!==preview.qualityIssueRows.length) throw new Error("IMPORT_ROW_COUNT_MISMATCH");
    if (active) db.prepare("UPDATE import_batches SET status='REPLACED', replaced_at_ms=? WHERE batch_id=?").run(nowMs,active.batch_id);
    if (options.injectFailureAfter === "old-active") throw new Error("INJECTED_IMPORT_FAILURE");
    db.prepare("UPDATE import_batches SET status='ACTIVE', activated_at_ms=? WHERE batch_id=?").run(nowMs,batchId);
    if (options.injectFailureAfter === "new-active") throw new Error("INJECTED_IMPORT_FAILURE");
    db.prepare(`INSERT INTO import_batch_events(source_date,event_type,from_batch_id,to_batch_id,created_at_ms)
      VALUES(?,?,?,?,?)`).run(preview.sourceDate,active?"REPLACE":"ACTIVATE",active?.batch_id??null,batchId,nowMs);
    if (options.injectFailureAfter === "event") throw new Error("INJECTED_IMPORT_FAILURE");
    return {outcome:active?"REPLACED":"IMPORTED",batchId,replacedBatchId:active?.batch_id??null};
  });
}

export function activateImportBatch(db: AppDatabase, targetBatchId: number, expectedActiveBatchId: number, nowMs = Date.now()): void {
  transaction(db, () => {
    const target=db.prepare("SELECT batch_id,source_date,status FROM import_batches WHERE batch_id=?").get(targetBatchId) as {batch_id:number;source_date:string;status:string}|undefined;
    if(!target||target.status!=="REPLACED") throw new Error("ROLLBACK_TARGET_INVALID");
    const active=db.prepare("SELECT batch_id FROM import_batches WHERE source_date=? AND status='ACTIVE'").get(target.source_date) as {batch_id:number}|undefined;
    if(!active) throw new Error("ACTIVE_BATCH_MISSING");
    if(active.batch_id!==expectedActiveBatchId) throw new Error("ACTIVE_VERSION_CHANGED");
    db.prepare("UPDATE import_batches SET status='REPLACED',replaced_at_ms=? WHERE batch_id=?").run(nowMs,active.batch_id);
    db.prepare("UPDATE import_batches SET status='ACTIVE',activated_at_ms=?,replaced_at_ms=NULL WHERE batch_id=?").run(nowMs,targetBatchId);
    db.prepare(`INSERT INTO import_batch_events(source_date,event_type,from_batch_id,to_batch_id,created_at_ms)
      VALUES(?,'ROLLBACK',?,?,?)`).run(target.source_date,active.batch_id,targetBatchId,nowMs);
  });
}

export function listImportBatches(db: AppDatabase) {
  return db.prepare(`SELECT batch_id,source_date,original_file_name,status,alarm_source_status,
    machine_row_count,environment_row_count,alarm_row_count,quality_issue_row_count,error_count,warning_count,created_at_ms,
    ROW_NUMBER() OVER(PARTITION BY source_date ORDER BY created_at_ms ASC,batch_id ASC) AS source_version,
    MAX(CASE WHEN status='ACTIVE' THEN batch_id END) OVER(PARTITION BY source_date) AS active_batch_id
    FROM import_batches ORDER BY source_date DESC,created_at_ms DESC,batch_id DESC`).all();
}

export type ImportBatchSort = "sourceDate" | "importedAt";
export type ImportBatchSortDirection = "asc" | "desc";
export interface ImportBatchPageQuery {
  page:number;
  pageSize:10|20|50;
  sortBy:ImportBatchSort;
  sortDirection:ImportBatchSortDirection;
  sourceDate?:string;
  fileQuery?:string;
}

function escapeLike(value:string){return value.replace(/[\\%_]/g,(character)=>`\\${character}`);}

export function listImportBatchesPage(db:AppDatabase,query:ImportBatchPageQuery){
  const where:string[]=[],parameters:Array<string>=[];
  if(query.sourceDate){where.push("source_date = ?");parameters.push(query.sourceDate);}
  if(query.fileQuery){where.push("original_file_name LIKE ? ESCAPE '\\'");parameters.push(`%${escapeLike(query.fileQuery)}%`);}
  const whereSql=where.length?`WHERE ${where.join(" AND ")}`:"";
  const total=Number((db.prepare(`SELECT COUNT(*) AS count FROM import_batches ${whereSql}`).get(...parameters) as {count:number}).count);
  const totalPages=Math.max(1,Math.ceil(total/query.pageSize));
  const page=Math.min(Math.max(1,query.page),totalPages),offset=(page-1)*query.pageSize;
  const sortColumn=query.sortBy==="importedAt"?"created_at_ms":"source_date",direction=query.sortDirection==="asc"?"ASC":"DESC";
  const items=db.prepare(`WITH versioned AS (
      SELECT batch_id,source_date,original_file_name,status,alarm_source_status,
        machine_row_count,environment_row_count,alarm_row_count,quality_issue_row_count,error_count,warning_count,created_at_ms,
        ROW_NUMBER() OVER(PARTITION BY source_date ORDER BY created_at_ms ASC,batch_id ASC) AS source_version,
        MAX(CASE WHEN status='ACTIVE' THEN batch_id END) OVER(PARTITION BY source_date) AS active_batch_id
      FROM import_batches
    )
    SELECT * FROM versioned ${whereSql}
    ORDER BY ${sortColumn} ${direction},created_at_ms ${direction},batch_id ${direction}
    LIMIT ? OFFSET ?`).all(...parameters,query.pageSize,offset);
  const overview=db.prepare(`SELECT COUNT(*) AS version_count,
      COUNT(DISTINCT CASE WHEN status='ACTIVE' THEN source_date END) AS active_date_count,
      MIN(CASE WHEN status='ACTIVE' THEN source_date END) AS earliest_active_date,
      MAX(CASE WHEN status='ACTIVE' THEN source_date END) AS latest_active_date
    FROM import_batches`).get() as {version_count:number;active_date_count:number;earliest_active_date:string|null;latest_active_date:string|null};
  return{items,total,page,pageSize:query.pageSize,totalPages,sortBy:query.sortBy,sortDirection:query.sortDirection,overview:{versionCount:Number(overview.version_count),activeDateCount:Number(overview.active_date_count),earliestActiveDate:overview.earliest_active_date,latestActiveDate:overview.latest_active_date}};
}

function sanitizeFileName(name:string):string {
  return name.replace(/[\\/\0\r\n]/g,"_").slice(0,255)||"upload.xlsx";
}
