import { LOGICAL_SENSOR_MAPPINGS } from "@/server/enterprise/mapping";
import { decideLampState,determineFreshness } from "@/shared/contracts/status";

export const DEMO_MANIFEST={fixtureId:"synthetic-stage6-day",dataDate:"2026-01-15",demoClockAt:"2026-01-15T16:57:30+08:00",timezone:"Asia/Taipei" as const,source:"SYNTHETIC" as const};
const lampStates=["GREEN","YELLOW","GREEN","RED","YELLOW","GREEN","OFF","UNKNOWN"] as const;
const lampValues={GREEN:{blue:0,green:1,red:0,white:0,yellow:0},YELLOW:{blue:0,green:0,red:0,white:0,yellow:1},RED:{blue:0,green:0,red:1,white:0,yellow:0},BLUE:{blue:1,green:0,red:0,white:0,yellow:0},WHITE:{blue:0,green:0,red:0,white:1,yellow:0},OTHER:{blue:0,green:1,red:1,white:0,yellow:0},UNKNOWN:{blue:0,green:0,red:0,white:0,yellow:0}} as const;

export function demoMachines(staleAfterSeconds:number){
  const nowMs=Date.parse(DEMO_MANIFEST.demoClockAt),lamps=LOGICAL_SENSOR_MAPPINGS.filter((item)=>item.logicalRole==="MACHINE_LAMP");
  const completions=new Map(LOGICAL_SENSOR_MAPPINGS.filter((item)=>item.logicalRole==="MACHINE_COMPLETION").map((item)=>[item.machineId!,item]));
  const machines=lamps.map((mapping,index)=>{const state=lampStates[index],values=state==="OFF"?lampValues.UNKNOWN:lampValues[state],updateAt=index===7?nowMs-600_000:nowMs-index*10_000,decision=state==="OFF"?{state:"OFF" as const,activeColors:[]}:decideLampState(values),completion=completions.get(mapping.machineId!);return {machineId:mapping.machineId!,sensorId:mapping.sensorId,lampState:decision.state,activeColors:decision.activeColors,freshness:determineFreshness(updateAt,nowMs,staleAfterSeconds),sensorUpdateAt:new Date(updateAt).toISOString(),fetchedAt:DEMO_MANIFEST.demoClockAt,rawStatus:state==="OFF"?0:1,rawStatusMeaning:state==="OFF"?"SYNTHETIC_EXPLICIT_OFF":"UNCONFIRMED",parseStatus:"VALID" as const,lampStateSource:state==="OFF"?"SYNTHETIC_EXPLICIT" as const:"ENTERPRISE_LAMP_FIELDS" as const,completionDetector:{sensorId:completion!.sensorId,sourceState:"OFF" as const,rawValue:0,freshness:determineFreshness(updateAt,nowMs,staleAfterSeconds),sensorUpdateAt:new Date(updateAt).toISOString(),parseStatus:"VALID",meaning:"UNCONFIRMED_COMPLETION_SIGNAL"}};});
  return machinePayload(machines);
}

function machinePayload<T extends {machineId:string;lampState:string;freshness:string}>(machines:T[]){
  const summary={freshKnown:0,green:0,yellow:0,red:0,off:0,other:0,unknown:0,stale:0,noData:0};
  for(const machine of machines){if(machine.freshness==="NO_DATA"){summary.noData++;continue;}if(machine.freshness==="STALE"){summary.stale++;continue;}if(["GREEN","YELLOW","RED"].includes(machine.lampState)){summary.freshKnown++;summary[machine.lampState.toLowerCase() as "green"|"yellow"|"red"]++;}else if(machine.lampState==="OFF")summary.off++;else if(["OTHER","BLUE","WHITE"].includes(machine.lampState))summary.other++;else summary.unknown++;}
  const userSummary={monitored:8,processing:summary.green,standbyOrComplete:summary.yellow,redAbnormal:summary.red,off:summary.off,otherLamp:summary.other,unavailable:summary.other+summary.unknown+summary.stale+summary.noData};
  return {summary,userSummary,connection:"DEMO",areas:["A","B"].map((area)=>({area,machines:machines.filter((machine)=>machine.machineId.startsWith(area))}))};
}

export function demoEnvironment(area:"A"|"B",metric:"temperature"|"humidity",staleAfterSeconds:number){
  const role=metric==="temperature"?"ENV_TEMPERATURE":"ENV_HUMIDITY",unit=metric==="temperature"?"度":"%RH",base=metric==="temperature"?24:48;
  const sensors=LOGICAL_SENSOR_MAPPINGS.filter((item)=>item.logicalRole===role&&item.area===area),nowMs=Date.parse(DEMO_MANIFEST.demoClockAt);
  const slots=Array.from({length:160},(_,slot)=>{const minutes=9*60+slot*3;return `${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`;});
  const latestAt=Date.parse(`${DEMO_MANIFEST.dataDate}T16:54:00+08:00`);
  return {axis:{date:DEMO_MANIFEST.dataDate,start:"09:00",end:"17:00",stepMinutes:3},latest:sensors.map((sensor,index)=>{const wave=Math.sin((158+index*7)/18);return {area,metric,point:sensor.pointNumber!,sensorId:sensor.sensorId,value:Number((base+index*.8+(area==="B"?.6:0)+wave).toFixed(1)),unit,freshness:determineFreshness(latestAt,nowMs,staleAfterSeconds),sensorUpdateAt:new Date(latestAt).toISOString(),fetchedAt:DEMO_MANIFEST.demoClockAt};}),series:sensors.map((sensor,index)=>({point:sensor.pointNumber!,sensorId:sensor.sensorId,samples:slots.map((time,slot)=>{const sourceAt=Date.parse(`${DEMO_MANIFEST.dataDate}T${time}:00+08:00`),gap=(area==="A"&&index===1&&slot>=68&&slot<=72)||(area==="B"&&index===0&&slot===112);return gap?{time,sampleSlot:`${DEMO_MANIFEST.dataDate}T${time}:00+08:00`,value:null,observed:false,gapReason:"SYNTHETIC_GAP",sensorUpdateAt:null,fetchedAt:null,freshness:"NO_DATA" as const}:{time,sampleSlot:`${DEMO_MANIFEST.dataDate}T${time}:00+08:00`,value:Number((base+index*.8+(area==="B"?.6:0)+Math.sin((slot+index*7)/18)+(slot/159)*.7).toFixed(1)),observed:true,sensorUpdateAt:new Date(sourceAt).toISOString(),fetchedAt:new Date(sourceAt+1_000).toISOString(),freshness:determineFreshness(sourceAt,nowMs,staleAfterSeconds)};} )}))};
}
