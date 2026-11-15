import { taipeiDateAt } from "@/shared/time/taipei";

const SLOT_MS=180_000,OFFSET_MS=8*60*60*1000;
function localMidnightMs(epochMs:number){return Date.parse(`${taipeiDateAt(epochMs)}T00:00:00+08:00`);}
export function serviceBounds(epochMs:number){const midnight=localMidnightMs(epochMs);return {startMs:midnight+9*3_600_000,endMs:midnight+17*3_600_000};}
export function isInsideServiceWindow(epochMs:number){const {startMs,endMs}=serviceBounds(epochMs);return epochMs>=startMs&&epochMs<endMs;}
export function floorSampleSlot(epochMs:number){const {startMs}=serviceBounds(epochMs);if(epochMs<startMs)return startMs;return startMs+Math.floor((epochMs-startMs)/SLOT_MS)*SLOT_MS;}
export function scheduledSampleSlot(scheduledForMs:number){return scheduledForMs-15_000;}
export function nextScheduledAt(epochMs:number){
  const {startMs,endMs}=serviceBounds(epochMs),first=startMs+15_000,last=endMs-SLOT_MS+15_000;
  if(epochMs<first)return first;
  if(epochMs>=last)return localMidnightMs(epochMs)+86_400_000+9*3_600_000+15_000;
  const elapsed=epochMs-first;return first+(Math.floor(elapsed/SLOT_MS)+1)*SLOT_MS;
}
export function taipeiIso(epochMs:number){return new Date(epochMs+OFFSET_MS).toISOString().replace("Z","+08:00");}
