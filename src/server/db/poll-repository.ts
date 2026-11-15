import type { AppDatabase } from "./connection";
import { transaction } from "./connection";
import type { EnterpriseEndpoint } from "@/server/enterprise/types";

export interface PollStart { batchTimeText:string;batchTimeMs:number;sampleSlotMs:number|null;scheduledForMs:number|null;startedAtMs:number;providerMode:"LIVE"|"DEMO";modeRevision:number;withinServiceWindow:boolean;triggerType:"STARTUP"|"SCHEDULED"|"MODE_RESUME"|"MANUAL_TEST" }
export interface EndpointAuditInput { endpoint:EnterpriseEndpoint;attempted:boolean;attemptCount:number;httpStatus:number|null;apiResponseCode:string|null;apiResponseMessage:string|null;responseTimeText:string|null;responseTimeMs:number|null;fetchedAtMs:number|null;completedAtMs:number;durationMs:number|null;payloadHash:string|null;result:"NOT_DUE"|"SUCCESS"|"FAILED"|"SCHEMA_ERROR";errorCode:string|null;errorMessageSafe:string|null }
export interface ReadingInput { sensorId:string;sensorUpdateTimeText:string|null;sensorUpdateAtMs:number|null;fetchedAtMs:number;rawStatus:number|null;rawValues:Record<string,unknown>;valueText:string|null;numericValue:number|null;lampBlue:number|null;lampGreen:number|null;lampRed:number|null;lampWhite:number|null;lampYellow:number|null;parseStatus:"VALID"|"PARTIAL"|"INVALID"|"UNKNOWN_TYPE";mappingStatus:"MAPPED"|"STALE_MAPPING"|"UNMAPPED" }
export interface CatalogInput { sensorId:string;displayName:string|null;sensorType:string|null;unit:string|null;groupId:string|null;groupAlias:string|null;groupSortingId:number|null;logicalRole:string|null;machineId:string|null;area:"A"|"B"|null;pointNumber:number|null;mappingStatus:"MAPPED"|"UNMAPPED"|"OUT_OF_SCOPE"|"CONFLICT";configHash:string|null;groupHash:string|null;seenAtMs:number;verifiedAtMs:number|null }
export interface MetadataSnapshotInput { endpoint:"configs"|"groups";payloadHash:string;canonicalJson:string;responseTimeText:string|null;responseTimeMs:number|null;fetchedAtMs:number }

export function createPollRun(db:AppDatabase,input:PollStart):number{
  if(input.triggerType==="MANUAL_TEST"&&input.sampleSlotMs!==null)throw new Error("MANUAL_TEST cannot have sample slot");
  const result=db.prepare(`INSERT INTO api_poll_runs(batch_time_text,batch_time_ms,sample_slot_ms,scheduled_for_ms,started_at_ms,provider_mode_at_start,mode_revision_at_start,within_service_window,trigger_type,status) VALUES(?,?,?,?,?,?,?,?,?,'RUNNING')`).run(input.batchTimeText,input.batchTimeMs,input.sampleSlotMs,input.scheduledForMs,input.startedAtMs,input.providerMode,input.modeRevision,input.withinServiceWindow?1:0,input.triggerType);
  return Number(result.lastInsertRowid);
}

function insertAudits(db:AppDatabase,pollRunId:number,audits:EndpointAuditInput[]){
  const statement=db.prepare(`INSERT INTO api_endpoint_runs(poll_run_id,endpoint,attempted,attempt_count,http_status,api_response_code,api_response_message,response_time_text,response_time_ms,fetched_at_ms,completed_at_ms,duration_ms,payload_hash,result,error_code,error_message_safe) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for(const a of audits)statement.run(pollRunId,a.endpoint,a.attempted?1:0,a.attemptCount,a.httpStatus,a.apiResponseCode,a.apiResponseMessage,a.responseTimeText,a.responseTimeMs,a.fetchedAtMs,a.completedAtMs,a.durationMs,a.payloadHash,a.result,a.errorCode,a.errorMessageSafe);
}

function upsertMetadata(db:AppDatabase,snapshots:MetadataSnapshotInput[],catalog:CatalogInput[]){
  const snapshot=db.prepare(`INSERT INTO sensor_metadata_snapshots(endpoint,payload_hash,canonical_json,response_time_text,response_time_ms,fetched_at_ms,first_seen_at_ms,last_seen_at_ms) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(endpoint,payload_hash) DO UPDATE SET last_seen_at_ms=excluded.last_seen_at_ms,fetched_at_ms=excluded.fetched_at_ms`);
  for(const s of snapshots)snapshot.run(s.endpoint,s.payloadHash,s.canonicalJson,s.responseTimeText,s.responseTimeMs,s.fetchedAtMs,s.fetchedAtMs,s.fetchedAtMs);
  const upsert=db.prepare(`INSERT INTO sensor_catalog(sensor_id,display_name,sensor_type,unit,group_id,group_alias,group_sorting_id,logical_role,machine_id,area,point_number,mapping_status,config_hash,group_hash,first_seen_at_ms,last_seen_at_ms,last_verified_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sensor_id) DO UPDATE SET display_name=excluded.display_name,sensor_type=excluded.sensor_type,unit=excluded.unit,group_id=excluded.group_id,group_alias=excluded.group_alias,group_sorting_id=excluded.group_sorting_id,logical_role=excluded.logical_role,machine_id=excluded.machine_id,area=excluded.area,point_number=excluded.point_number,mapping_status=excluded.mapping_status,config_hash=excluded.config_hash,group_hash=excluded.group_hash,last_seen_at_ms=excluded.last_seen_at_ms,last_verified_at_ms=excluded.last_verified_at_ms`);
  for(const c of catalog)upsert.run(c.sensorId,c.displayName,c.sensorType,c.unit,c.groupId,c.groupAlias,c.groupSortingId,c.logicalRole,c.machineId,c.area,c.pointNumber,c.mappingStatus,c.configHash,c.groupHash,c.seenAtMs,c.seenAtMs,c.verifiedAtMs);
}

export function persistCollection(db:AppDatabase,input:{pollRunId:number;providerModeAtStart:"LIVE"|"DEMO";modeRevisionAtStart:number;finishedAtMs:number;audits:EndpointAuditInput[];readings:ReadingInput[];snapshots?:MetadataSnapshotInput[];catalog?:CatalogInput[]}):"SUCCESS"|"PARTIAL"|"DISCARDED_MODE_CHANGED"|"FAILED_NO_READINGS"{
  return transaction(db,()=>{
    const settings=db.prepare("SELECT provider_mode,mode_revision FROM app_settings WHERE singleton_id=1").get() as {provider_mode:string;mode_revision:number};
    if(input.providerModeAtStart!=="LIVE"||settings.provider_mode!=="LIVE"||settings.mode_revision!==input.modeRevisionAtStart){db.prepare("UPDATE api_poll_runs SET status='DISCARDED_MODE_CHANGED',finished_at_ms=?,persisted_reading_count=0 WHERE poll_run_id=? AND status='RUNNING'").run(input.finishedAtMs,input.pollRunId);return "DISCARDED_MODE_CHANGED";}
    const poll=db.prepare("SELECT trigger_type FROM api_poll_runs WHERE poll_run_id=? AND status='RUNNING'").get(input.pollRunId) as {trigger_type:string}|undefined;
    if(!poll)throw new Error("Poll is not running");if(poll.trigger_type==="MANUAL_TEST")throw new Error("MANUAL_TEST cannot persist readings");
    insertAudits(db,input.pollRunId,input.audits);upsertMetadata(db,input.snapshots??[],input.catalog??[]);
    if(input.readings.length===0){db.prepare("UPDATE api_poll_runs SET status='FAILED',finished_at_ms=?,persisted_reading_count=0,error_summary='NO_READINGS_PERSISTED' WHERE poll_run_id=?").run(input.finishedAtMs,input.pollRunId);return "FAILED_NO_READINGS";}
    const insert=db.prepare(`INSERT INTO live_sensor_readings(poll_run_id,sensor_id,sensor_update_time_text,sensor_update_at_ms,fetched_at_ms,raw_status,raw_values_json,value_text,numeric_value,lamp_blue,lamp_green,lamp_red,lamp_white,lamp_yellow,parse_status,mapping_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for(const r of input.readings)insert.run(input.pollRunId,r.sensorId,r.sensorUpdateTimeText,r.sensorUpdateAtMs,r.fetchedAtMs,r.rawStatus,JSON.stringify(r.rawValues),r.valueText,r.numericValue,r.lampBlue,r.lampGreen,r.lampRed,r.lampWhite,r.lampYellow,r.parseStatus,r.mappingStatus);
    const partial=input.audits.some((a)=>a.attempted&&a.result!=="SUCCESS"),status=partial?"PARTIAL":"SUCCESS";
    db.prepare("UPDATE api_poll_runs SET status=?,finished_at_ms=?,persisted_reading_count=?,error_summary=? WHERE poll_run_id=?").run(status,input.finishedAtMs,input.readings.length,partial?"ONE_OR_MORE_ENDPOINTS_FAILED":null,input.pollRunId);return status;
  });
}

export function persistManualTest(db:AppDatabase,input:{pollRunId:number;finishedAtMs:number;audits:EndpointAuditInput[]}):"SUCCESS"|"PARTIAL"|"FAILED"{
  return transaction(db,()=>{const poll=db.prepare("SELECT trigger_type FROM api_poll_runs WHERE poll_run_id=? AND status='RUNNING'").get(input.pollRunId) as {trigger_type:string}|undefined;if(!poll||poll.trigger_type!=="MANUAL_TEST")throw new Error("Manual poll is not running");insertAudits(db,input.pollRunId,input.audits);const successes=input.audits.filter((a)=>a.result==="SUCCESS").length,status=successes===input.audits.length?"SUCCESS":successes>0?"PARTIAL":"FAILED";db.prepare("UPDATE api_poll_runs SET status=?,finished_at_ms=?,persisted_reading_count=0,error_summary=? WHERE poll_run_id=?").run(status,input.finishedAtMs,status==="SUCCESS"?null:"MANUAL_ENDPOINT_FAILURE",input.pollRunId);return status;});
}

// Backward-compatible Stage 3.1 primitive. Stage 6 calls persistCollection directly.
export function persistSuccessfulValues(db:AppDatabase,input:{pollRunId:number;providerModeAtStart:"LIVE"|"DEMO";modeRevisionAtStart:number;finishedAtMs:number;readings:Array<{sensorId:string;sensorUpdateAtMs:number|null;fetchedAtMs:number;rawValues:Record<string,unknown>;numericValue?:number|null}>}){
  const readings:ReadingInput[]=input.readings.map((r)=>({...r,sensorUpdateTimeText:null,rawStatus:null,valueText:null,numericValue:r.numericValue??null,lampBlue:null,lampGreen:null,lampRed:null,lampWhite:null,lampYellow:null,parseStatus:"VALID",mappingStatus:"UNMAPPED"}));
  const audits:EndpointAuditInput[]=[{endpoint:"values",attempted:true,attemptCount:1,httpStatus:200,apiResponseCode:"00",apiResponseMessage:null,responseTimeText:null,responseTimeMs:null,fetchedAtMs:input.finishedAtMs,completedAtMs:input.finishedAtMs,durationMs:0,payloadHash:null,result:"SUCCESS",errorCode:null,errorMessageSafe:null}];
  const result=persistCollection(db,{...input,readings,audits});return result==="PARTIAL"?"SUCCESS":result;
}

export function markPollFinished(db:AppDatabase,pollRunId:number,status:"SKIPPED_OUTSIDE_WINDOW"|"SKIPPED_OVERLAP"|"ABORTED"|"FAILED",finishedAtMs:number,errorSummary:string|null=null){db.prepare("UPDATE api_poll_runs SET status=?,finished_at_ms=?,error_summary=? WHERE poll_run_id=? AND status='RUNNING'").run(status,finishedAtMs,errorSummary,pollRunId);}
export function abortRunningPolls(db:AppDatabase,nowMs=Date.now()){return db.prepare("UPDATE api_poll_runs SET status='ABORTED',finished_at_ms=?,error_summary='PROCESS_RESTART' WHERE status='RUNNING'").run(nowMs).changes;}
export function cleanupLiveRetention(db:AppDatabase,cutoffMs:number){return transaction(db,()=>db.prepare("DELETE FROM api_poll_runs WHERE batch_time_ms < ?").run(cutoffMs).changes);}
export function latestCollectionSuccessMs(db:AppDatabase):number|null{const row=db.prepare(`SELECT MAX(finished_at_ms) value FROM api_poll_runs WHERE trigger_type IN ('STARTUP','SCHEDULED','MODE_RESUME') AND status IN ('SUCCESS','PARTIAL') AND persisted_reading_count>0`).get() as {value:number|null};return row.value;}
