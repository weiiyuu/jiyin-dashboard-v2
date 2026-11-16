import type { AppDatabase } from "@/server/db/connection";
import { getSettings } from "@/server/db/settings-repository";
import { cleanupLiveRetention,createPollRun,persistCollection,persistManualTest,markPollFinished,type EndpointAuditInput,type MetadataSnapshotInput } from "@/server/db/poll-repository";
import { buildCatalog,parseValues,payloadHash,stableJson,type CatalogLookup } from "@/server/enterprise/mapping";
import { EnterpriseClientError,isEndpointSuccess,type EndpointResult,type EnterpriseEndpoint } from "@/server/enterprise/types";
import { floorSampleSlot,isInsideServiceWindow,scheduledSampleSlot,taipeiIso } from "./schedule";

export interface EnterpriseGetter { get(endpoint:EnterpriseEndpoint,attemptCount?:number):Promise<Extract<EndpointResult,{envelope:unknown}>> }
export type CollectionTrigger="STARTUP"|"SCHEDULED"|"MODE_RESUME";
const ENDPOINTS:EnterpriseEndpoint[]=["values","configs","groups"];
const wait=(ms:number)=>new Promise<void>((resolve)=>setTimeout(resolve,ms));

async function fetchWithRetry(client:EnterpriseGetter,endpoint:EnterpriseEndpoint,sleep:(ms:number)=>Promise<void>):Promise<EndpointResult>{
  const started=Date.now();
  try{return await client.get(endpoint,1);}catch(error){
    const first=error instanceof EnterpriseClientError?error:new EnterpriseClientError("NETWORK","企業 API 網路連線失敗",null,true);
    if(first.retryable){await sleep(2_000);try{return await client.get(endpoint,2);}catch(second){const final=second instanceof EnterpriseClientError?second:new EnterpriseClientError("NETWORK","企業 API 網路連線失敗",null,true);return {endpoint,error:final,completedAtMs:Date.now(),durationMs:Date.now()-started,attemptCount:2};}}
    return {endpoint,error:first,completedAtMs:Date.now(),durationMs:Date.now()-started,attemptCount:1};
  }
}

async function fetchOnce(client:EnterpriseGetter,endpoint:EnterpriseEndpoint):Promise<EndpointResult>{
  const started=Date.now();
  try{return await client.get(endpoint,1);}catch(error){
    const failure=error instanceof EnterpriseClientError?error:new EnterpriseClientError("NETWORK","企業 API 網路連線失敗",null,true);
    return {endpoint,error:failure,completedAtMs:Date.now(),durationMs:Date.now()-started,attemptCount:1};
  }
}

function audit(result:EndpointResult):EndpointAuditInput{
  if(isEndpointSuccess(result)){const responseTimeMs=Date.parse(result.envelope.responseTime);return {endpoint:result.endpoint,attempted:true,attemptCount:result.attemptCount,httpStatus:result.httpStatus,apiResponseCode:result.envelope.responseCode,apiResponseMessage:result.envelope.responseMsg,responseTimeText:result.envelope.responseTime,responseTimeMs:Number.isFinite(responseTimeMs)?responseTimeMs:null,fetchedAtMs:result.fetchedAtMs,completedAtMs:result.fetchedAtMs+result.durationMs,durationMs:result.durationMs,payloadHash:payloadHash(result.envelope.data),result:"SUCCESS",errorCode:null,errorMessageSafe:null};}
  return {endpoint:result.endpoint,attempted:true,attemptCount:result.attemptCount,httpStatus:result.error.httpStatus,apiResponseCode:null,apiResponseMessage:null,responseTimeText:null,responseTimeMs:null,fetchedAtMs:null,completedAtMs:result.completedAtMs,durationMs:result.durationMs,payloadHash:null,result:result.error.code==="SCHEMA"?"SCHEMA_ERROR":"FAILED",errorCode:result.error.code,errorMessageSafe:result.error.message};
}
function notDue(endpoint:EnterpriseEndpoint,nowMs:number):EndpointAuditInput{return {endpoint,attempted:false,attemptCount:0,httpStatus:null,apiResponseCode:null,apiResponseMessage:null,responseTimeText:null,responseTimeMs:null,fetchedAtMs:null,completedAtMs:nowMs,durationMs:null,payloadHash:null,result:"NOT_DUE",errorCode:null,errorMessageSafe:null};}
function skippedAfterManualFailure(endpoint:EnterpriseEndpoint,nowMs:number):EndpointAuditInput{return {...notDue(endpoint,nowMs),errorCode:"PREVIOUS_ENDPOINT_FAILED",errorMessageSafe:"本次因前一端點失敗而未繼續"};}
function catalogLookup(db:AppDatabase,stale:boolean){const rows=db.prepare("SELECT sensor_id,sensor_type,unit,mapping_status FROM sensor_catalog").all() as Array<{sensor_id:string;sensor_type:string|null;unit:string|null;mapping_status:string}>;return new Map(rows.map((row)=>[row.sensor_id,{sensorType:row.sensor_type,unit:row.unit,mappingStatus:row.mapping_status==="MAPPED"?(stale?"STALE_MAPPING":"MAPPED"):"UNMAPPED"} satisfies CatalogLookup]));}
function metadataDue(db:AppDatabase,nowMs:number,refreshSeconds:number){const row=db.prepare("SELECT COUNT(*) count,MIN(last_verified_at_ms) oldest FROM sensor_catalog").get() as {count:number;oldest:number|null};return row.count===0||row.oldest===null||nowMs-row.oldest>=refreshSeconds*1000;}
function snapshot(result:Extract<EndpointResult,{envelope:unknown}>):MetadataSnapshotInput{return {endpoint:result.endpoint as "configs"|"groups",payloadHash:payloadHash(result.envelope.data),canonicalJson:stableJson(result.envelope.data),responseTimeText:result.envelope.responseTime,responseTimeMs:Number.isFinite(Date.parse(result.envelope.responseTime))?Date.parse(result.envelope.responseTime):null,fetchedAtMs:result.fetchedAtMs};}

export async function collectOnce(db:AppDatabase,client:EnterpriseGetter,input:{trigger:CollectionTrigger;scheduledForMs?:number;nowMs?:number;sleep?:typeof wait}){
  const nowMs=input.nowMs??Date.now(),settings=getSettings(db),inside=isInsideServiceWindow(nowMs);
  const sampleSlotMs=input.trigger==="SCHEDULED"&&input.scheduledForMs!==undefined?scheduledSampleSlot(input.scheduledForMs):floorSampleSlot(nowMs);
  const pollRunId=createPollRun(db,{batchTimeText:taipeiIso(nowMs),batchTimeMs:nowMs,sampleSlotMs,scheduledForMs:input.scheduledForMs??null,startedAtMs:nowMs,providerMode:settings.providerMode,modeRevision:settings.modeRevision,withinServiceWindow:inside,triggerType:input.trigger});
  if(!inside){markPollFinished(db,pollRunId,"SKIPPED_OUTSIDE_WINDOW",nowMs);return {pollRunId,status:"SKIPPED_OUTSIDE_WINDOW" as const};}
  if(settings.providerMode!=="LIVE"){markPollFinished(db,pollRunId,"FAILED",nowMs,"PROVIDER_NOT_LIVE");return {pollRunId,status:"PROVIDER_NOT_LIVE" as const};}
  const sleep=input.sleep??wait,due=metadataDue(db,nowMs,settings.metadataRefreshSeconds);
  const results=new Map<EnterpriseEndpoint,EndpointResult>();
  results.set("values",await fetchWithRetry(client,"values",sleep));
  let needsMetadata=due;
  const values=results.get("values")!;
  if(isEndpointSuccess(values)&&!due){const known=catalogLookup(db,false);needsMetadata=Object.keys(values.envelope.data as Record<string,unknown>).some((id)=>!known.has(id));}
  if(needsMetadata){results.set("configs",await fetchWithRetry(client,"configs",sleep));results.set("groups",await fetchWithRetry(client,"groups",sleep));}
  const configs=results.get("configs"),groups=results.get("groups"),metadataOk=configs&&groups&&isEndpointSuccess(configs)&&isEndpointSuccess(groups);
  const catalog=metadataOk?buildCatalog(configs,groups,nowMs):[],lookup=metadataOk?new Map(catalog.map((item)=>[item.sensorId,{sensorType:item.sensorType,unit:item.unit,mappingStatus:item.mappingStatus==="MAPPED"?"MAPPED":"UNMAPPED"} satisfies CatalogLookup])):catalogLookup(db,needsMetadata);
  const readings=isEndpointSuccess(values)?parseValues(values.envelope,values.fetchedAtMs,lookup):[];
  const audits=ENDPOINTS.map((endpoint)=>results.has(endpoint)?audit(results.get(endpoint)!):notDue(endpoint,nowMs));
  const snapshots=metadataOk?[snapshot(configs),snapshot(groups)]:[];
  const status=persistCollection(db,{pollRunId,providerModeAtStart:settings.providerMode,modeRevisionAtStart:settings.modeRevision,finishedAtMs:Date.now(),audits,readings,snapshots,catalog});
  cleanupLiveRetention(db,nowMs-settings.liveRetentionDays*86_400_000);
  return {pollRunId,status,readingCount:status==="DISCARDED_MODE_CHANGED"?0:readings.length};
}

export function recordSkippedOverlap(db:AppDatabase,input:{trigger:CollectionTrigger;scheduledForMs?:number;nowMs?:number}){
  const nowMs=input.nowMs??Date.now(),settings=getSettings(db),pollRunId=createPollRun(db,{batchTimeText:taipeiIso(nowMs),batchTimeMs:nowMs,sampleSlotMs:input.trigger==="SCHEDULED"&&input.scheduledForMs!==undefined?scheduledSampleSlot(input.scheduledForMs):floorSampleSlot(nowMs),scheduledForMs:input.scheduledForMs??null,startedAtMs:nowMs,providerMode:settings.providerMode,modeRevision:settings.modeRevision,withinServiceWindow:isInsideServiceWindow(nowMs),triggerType:input.trigger});
  markPollFinished(db,pollRunId,"SKIPPED_OVERLAP",nowMs,"PREVIOUS_COLLECTION_STILL_RUNNING");return pollRunId;
}

export async function runManualConnectionTest(db:AppDatabase,client:EnterpriseGetter,input:{nowMs?:number;sleep?:typeof wait}={}){
  const nowMs=input.nowMs??Date.now(),settings=getSettings(db),inside=isInsideServiceWindow(nowMs);
  const pollRunId=createPollRun(db,{batchTimeText:taipeiIso(nowMs),batchTimeMs:nowMs,sampleSlotMs:null,scheduledForMs:null,startedAtMs:nowMs,providerMode:settings.providerMode,modeRevision:settings.modeRevision,withinServiceWindow:inside,triggerType:"MANUAL_TEST"});
  const results=new Map<EnterpriseEndpoint,EndpointResult>();
  let failed=false;
  for(const endpoint of ENDPOINTS){
    if(failed)continue;
    const result=await fetchOnce(client,endpoint);
    results.set(endpoint,result);
    if(!isEndpointSuccess(result))failed=true;
  }
  const finishedAtMs=Date.now();
  const audits=ENDPOINTS.map((endpoint)=>results.has(endpoint)?audit(results.get(endpoint)!):skippedAfterManualFailure(endpoint,finishedAtMs));
  const status=persistManualTest(db,{pollRunId,finishedAtMs,audits});return {pollRunId,status,audits};
}
