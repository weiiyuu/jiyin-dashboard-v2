import type { ApiMeta, ProviderMode } from "@/shared/contracts/api-response";

export type Freshness="FRESH"|"STALE"|"NO_DATA";
export type LampState="GREEN"|"YELLOW"|"RED"|"BLUE"|"WHITE"|"OTHER"|"UNKNOWN";
export interface CompletionDetector {sensorId:string;sourceState:"ON"|"OFF"|"UNKNOWN";rawValue:number|null;freshness:Freshness;sensorUpdateAt:string|null;parseStatus:string;meaning:string}
export interface LiveMachine {machineId:string;sensorId:string;lampState:LampState;activeColors:string[];freshness:Freshness;sensorUpdateAt:string|null;fetchedAt:string|null;rawStatus:number|null;rawStatusMeaning:string;parseStatus:string;completionDetector:CompletionDetector;warnings?:string[]}
export interface MachinePayload {userSummary:{monitored:number;processing:number;standbyOrComplete:number;redAbnormal:number;otherLamp:number;unavailable:number};connection:string;areas:Array<{area:string;machines:LiveMachine[]}>}
export interface EnvironmentSample {time:string;sampleSlot:string;value:number|null;observed:boolean;gapReason?:string;sensorUpdateAt?:string|null;fetchedAt?:string|null;freshness?:Freshness}
export interface EnvironmentSeries {point:number;sensorId:string;samples:EnvironmentSample[]}
export interface EnvironmentLatest {area:"A"|"B";metric:"temperature"|"humidity";point:number;sensorId:string;value:number|null;unit:string;freshness:Freshness;sensorUpdateAt:string|null;fetchedAt?:string|null;parseStatus?:string}
export interface EnvironmentPayload {axis:{date:string;start:string;end:string;stepMinutes:number};latest:EnvironmentLatest[];series:EnvironmentSeries[]}
export type LiveMeta=ApiMeta&{providerMode:ProviderMode;timeContext:NonNullable<ApiMeta["timeContext"]>};

export const ENVIRONMENT_REFERENCES={temperature:26,humidity:40} as const;
export const LIVE_COLORS=["#5fd59a","#74b8ef","#f0bd69","#e87f87"] as const;
export const MACHINE_NAMES:Record<string,string>={A1:"A 區設備 1",A2:"A 區設備 2",A3:"A 區設備 3",A4:"A 區設備 4",B1:"B 區設備 1",B2:"B 區設備 2",B3:"B 區設備 3",B4:"B 區設備 4"};

export function formatTaipeiDateTime(value:string|null|undefined){if(!value)return "尚無資料";return new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(value));}
export function lampLabel(state:LampState){return ({GREEN:"綠燈・加工中",YELLOW:"黃燈・待機／完成",RED:"紅燈・異常狀態",BLUE:"藍燈",WHITE:"白燈",OTHER:"多色／其他燈號",UNKNOWN:"無法判讀"} as const)[state];}
export function freshnessLabel(value:Freshness){return value==="FRESH"?"資料新鮮":value==="STALE"?"資料已過期":"尚無資料";}
export function effectiveLampTone(machine:LiveMachine){return machine.freshness==="FRESH"?machine.lampState.toLowerCase():"unavailable";}
export function timeToMinutes(value:string){const [hours,minutes]=value.split(":").map(Number);return hours*60+minutes;}
export function visibleEndMinutes(nowIso:string){const date=new Date(nowIso);const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hour12:false});const parts=formatter.formatToParts(date);const hour=Number(parts.find((part)=>part.type==="hour")?.value??9);const minute=Number(parts.find((part)=>part.type==="minute")?.value??0);const now=hour*60+minute;return Math.min(17*60,Math.max(9*60+30,Math.ceil(now/30)*30));}
export function formatClock(minutes:number){return `${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`;}
export function chartSegments(samples:EnvironmentSample[],visibleEnd:number){const segments:Array<Array<EnvironmentSample&{minute:number}>>=[];let current:Array<EnvironmentSample&{minute:number}>=[];let previous:number|null=null;for(const sample of samples){const minute=timeToMinutes(sample.time);const valid=minute<=visibleEnd&&sample.observed&&sample.value!==null;if(!valid||(previous!==null&&minute-previous!==3)){if(current.length)segments.push(current);current=[];}if(valid){current.push({...sample,minute});previous=minute;}else previous=null;}if(current.length)segments.push(current);return segments;}
export function niceLiveScale(values:number[],reference:number,previous?:{min:number;max:number}){const all=[...values.filter(Number.isFinite),reference];let min=Math.min(...all),max=Math.max(...all);const minimumSpan=reference===26?6:20;if(max-min<minimumSpan){const middle=(max+min)/2;min=middle-minimumSpan/2;max=middle+minimumSpan/2;}const padding=(max-min)*.12;min-=padding;max+=padding;if(previous){min=Math.min(min,previous.min);max=Math.max(max,previous.max);}const rough=(max-min)/4;const magnitude=10**Math.floor(Math.log10(Math.max(rough,.01)));const normalized=rough/magnitude;const step=(normalized<=1?1:normalized<=2?2:normalized<=5?5:10)*magnitude;const niceMin=Math.floor(min/step)*step,niceMax=Math.ceil(max/step)*step;const ticks:number[]=[];for(let value=niceMin;value<=niceMax+step/2;value+=step)ticks.push(Number(value.toFixed(4)));return {min:niceMin,max:niceMax,step,ticks};}
export function regionEnvironmentStatus(values:Array<EnvironmentLatest>){const missing=values.filter((item)=>item.value===null||item.freshness!=="FRESH").length;const high=values.filter((item)=>item.value!==null&&item.freshness==="FRESH"&&item.value>ENVIRONMENT_REFERENCES[item.metric]).length;if(high&&missing)return `${high} 個測點高於暫定上限，${missing} 個資料不足`;if(high)return `${high} 個測點高於暫定參考上限`;if(missing)return `${missing} 個測點資料不足`;return "目前讀值未高於暫定參考上限";}
