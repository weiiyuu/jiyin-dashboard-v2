import { LOGICAL_SENSOR_MAPPINGS } from "@/server/enterprise/mapping";
import type { EndpointSuccess,EnterpriseEndpoint,EnterpriseEnvelope } from "@/server/enterprise/types";

const auxiliary=Array.from({length:24},(_,index)=>`aux${String(index+1).padStart(2,"0")}`);
export const syntheticSensorIds=[...LOGICAL_SENSOR_MAPPINGS.map((item)=>item.sensorId),...auxiliary];
function envelope(data:unknown):EnterpriseEnvelope{return {apiType:"sensor",apiVersion:"1",data,localTime:"2026-11-15 10:01:00",responseCode:"00",responseMsg:"success",responseTime:"2026-11-15T02:01:00.000Z",thingAlias:"synthetic",thingName:"synthetic"};}
const mapping=new Map(LOGICAL_SENSOR_MAPPINGS.map((item)=>[item.sensorId,item]));
export function stage6Payloads(updateTime="2026-11-15T02:00:00.000Z"){
  const values=Object.fromEntries(syntheticSensorIds.map((id,index)=>{const role=mapping.get(id)?.logicalRole;const sensorValues=role==="MACHINE_LAMP"?{blue:0,green:index%3===0?1:0,red:index%3===1?1:0,white:0,yellow:index%3===2?1:0}:{value:role==="MACHINE_COMPLETION"?(index%2===0?"ON":"OFF"):role?.startsWith("ENV_")?String(20+index/10):String(index)};return [id,{id,status:index%2+1,updateTime,values:sensorValues}];}));
  const configs=Object.fromEntries(syntheticSensorIds.map((id)=>{const role=mapping.get(id)?.logicalRole,type=role==="MACHINE_LAMP"?"lamp":role==="MACHINE_COMPLETION"?"detector":role?.startsWith("ENV_")?"analog":"string",unit=role==="ENV_TEMPERATURE"?"度":role==="ENV_HUMIDITY"?"%RH":"";return [id,{config:{id,displayname:`合成 ${id}`,type,unit}}];}));
  const grouped=syntheticSensorIds.slice(0,-1),groups=Array.from({length:5},(_,groupIndex)=>{const ids=grouped.filter((_,index)=>index%5===groupIndex);return {groupId:`g${groupIndex+1}`,groupAlias:`合成群組 ${groupIndex+1}`,sensors:Object.fromEntries(ids.map((id,index)=>[id,{id,sortingId:index+1}]))};});
  return {values:envelope(values),configs:envelope(configs),groups:envelope(groups)};
}
export function endpointSuccess(endpoint:EnterpriseEndpoint,updateTime?:string):EndpointSuccess{const payload=stage6Payloads(updateTime)[endpoint];return {endpoint,envelope:payload,httpStatus:200,fetchedAtMs:Date.parse("2026-11-15T02:01:00.000Z"),durationMs:5,responseBytes:1000,attemptCount:1};}
