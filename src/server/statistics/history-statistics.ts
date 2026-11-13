export const HISTORICAL_STATES = ["none", "red", "yellow", "green", "blue", "white"] as const;
export type HistoricalState = (typeof HISTORICAL_STATES)[number];

export interface StatisticInterval {
  machineId: string;
  sourceDate: string;
  timeLabel: string;
  intervalStartMs: number;
  intervalEndMs: number;
  noneSeconds: number | null;
  redSeconds: number | null;
  yellowSeconds: number | null;
  greenSeconds: number | null;
  blueSeconds: number | null;
  whiteSeconds: number | null;
  greenHoursEligible: boolean;
  sixStateShareEligible: boolean;
  transitionEligible: boolean;
  qualityRuleVersion: string;
}

export interface MetricCoverage {
  expectedIntervals: number;
  importedIntervals: number;
  metricEligibleIntervals: number;
  excludedByReason: Record<string, number>;
}

export function expectedIntervals(days: number, selectedMachineCount: number, intervalsPerDay = 480): number {
  if (![days, selectedMachineCount, intervalsPerDay].every(Number.isInteger) || days < 0 || selectedMachineCount < 0 || intervalsPerDay < 1) {
    throw new Error("Invalid coverage dimensions");
  }
  return days * selectedMachineCount * intervalsPerDay;
}

export function expectedIntervalsForMonth(year: number, month: number, selectedMachineCount: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("Invalid month");
  return expectedIntervals(new Date(Date.UTC(year, month, 0)).getUTCDate(), selectedMachineCount);
}

export function buildCoverage(
  requestedDays: number, daysWithActiveBatch: number, selectedMachineCount: number,
  importedIntervals: number, metricEligibleIntervals: number,
) {
  if (daysWithActiveBatch > requestedDays || importedIntervals < metricEligibleIntervals) throw new Error("Invalid coverage counts");
  return {
    requestedDays,
    daysWithActiveBatch,
    expectedIntervals: expectedIntervals(requestedDays, selectedMachineCount),
    importedIntervals,
    metricEligibleIntervals,
  };
}

export function calculateStateHours(rows: StatisticInterval[], state: "red" | "yellow", currentRuleVersion: string) {
  let seconds=0; let eligibleIntervals=0;
  for(const row of rows){const value=row[`${state}Seconds`];if(isCurrent(row,currentRuleVersion)&&value!==null&&value>=0){seconds+=value;eligibleIntervals+=1;}}
  return {seconds,hours:seconds/3600,eligibleIntervals};
}

function isCurrent(row: StatisticInterval, currentRuleVersion: string) {
  return row.qualityRuleVersion === currentRuleVersion;
}

export function calculateGreenHours(rows: StatisticInterval[], currentRuleVersion: string, expected: number) {
  let seconds = 0;
  let eligible = 0;
  const excludedByReason: Record<string, number> = {};
  for (const row of rows) {
    if (!isCurrent(row, currentRuleVersion)) {
      excludedByReason.QUALITY_RULE_VERSION_MISMATCH = (excludedByReason.QUALITY_RULE_VERSION_MISMATCH ?? 0) + 1;
    } else if (!row.greenHoursEligible || row.greenSeconds === null || row.greenSeconds < 0) {
      excludedByReason.GREEN_INELIGIBLE = (excludedByReason.GREEN_INELIGIBLE ?? 0) + 1;
    } else {
      seconds += row.greenSeconds;
      eligible += 1;
    }
  }
  return {
    seconds,
    hours: seconds / 3600,
    coverage: { expectedIntervals: expected, importedIntervals: rows.length, metricEligibleIntervals: eligible, excludedByReason } satisfies MetricCoverage,
  };
}

export function calculateSixStateShare(rows: StatisticInterval[], currentRuleVersion: string, expected: number) {
  const seconds = Object.fromEntries(HISTORICAL_STATES.map((state) => [state, 0])) as Record<HistoricalState, number>;
  let eligible = 0;
  const excludedByReason: Record<string, number> = {};
  for (const row of rows) {
    if (!isCurrent(row, currentRuleVersion)) {
      excludedByReason.QUALITY_RULE_VERSION_MISMATCH = (excludedByReason.QUALITY_RULE_VERSION_MISMATCH ?? 0) + 1;
      continue;
    }
    const values = HISTORICAL_STATES.map((state) => row[`${state}Seconds` as keyof StatisticInterval] as number | null);
    if (!row.sixStateShareEligible || values.some((value) => value === null || value < 0)) {
      excludedByReason.SIX_STATE_INELIGIBLE = (excludedByReason.SIX_STATE_INELIGIBLE ?? 0) + 1;
      continue;
    }
    HISTORICAL_STATES.forEach((state, index) => { seconds[state] += values[index]!; });
    eligible += 1;
  }
  const denominatorSeconds = HISTORICAL_STATES.reduce((sum, state) => sum + seconds[state], 0);
  const shares = Object.fromEntries(HISTORICAL_STATES.map((state) => [state, denominatorSeconds > 0 ? seconds[state] / denominatorSeconds : null])) as Record<HistoricalState, number | null>;
  return {
    seconds, shares, denominatorSeconds,
    coverage: { expectedIntervals: expected, importedIntervals: rows.length, metricEligibleIntervals: eligible, excludedByReason } satisfies MetricCoverage,
  };
}

const taipeiParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function localParts(epochMs: number) {
  return Object.fromEntries(taipeiParts.formatToParts(new Date(epochMs)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function bucketGreenSeconds(rows: StatisticInterval[], grain: 30 | 60 | "DAY", currentRuleVersion: string) {
  const buckets = new Map<string, { greenSeconds: number; importedIntervals: number; eligibleIntervals: number }>();
  for (const row of rows) {
    const parts = localParts(row.intervalStartMs);
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const minute = Number(parts.minute);
    const bucketMinute = grain === "DAY" ? 0 : Math.floor((Number(parts.hour) * 60 + minute) / grain) * grain;
    const key = grain === "DAY" ? date : `${date} ${String(Math.floor(bucketMinute / 60)).padStart(2,"0")}:${String(bucketMinute % 60).padStart(2,"0")}`;
    const bucket = buckets.get(key) ?? { greenSeconds: 0, importedIntervals: 0, eligibleIntervals: 0 };
    bucket.importedIntervals += 1;
    if (isCurrent(row,currentRuleVersion) && row.greenHoursEligible && row.greenSeconds !== null && row.greenSeconds >= 0) {
      bucket.greenSeconds += row.greenSeconds;
      bucket.eligibleIntervals += 1;
    }
    buckets.set(key,bucket);
  }
  return [...buckets.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>({key,...value,greenHours:value.greenSeconds/3600}));
}

export type Availability = "AVAILABLE" | "MISSING_DATA" | "NOT_APPLICABLE";
export interface PositionValue { position: number; value: number | null; availability: Availability }

export function alignComparisonPositions(
  periodA: Map<number, number>, periodB: Map<number, number>,
  applicablePositionsA: number, applicablePositionsB: number, maxPositions: number,
): Array<{ position: number; periodA: PositionValue; periodB: PositionValue }> {
  const point = (map: Map<number,number>, position: number, applicable: number): PositionValue => {
    if (position > applicable) return {position,value:null,availability:"NOT_APPLICABLE"};
    if (!map.has(position)) return {position,value:null,availability:"MISSING_DATA"};
    return {position,value:map.get(position)!,availability:"AVAILABLE"};
  };
  return Array.from({length:maxPositions},(_,index)=>{const position=index+1;return {position,periodA:point(periodA,position,applicablePositionsA),periodB:point(periodB,position,applicablePositionsB)};});
}

export interface ContinuousStateRun {
  machineId: string; state: "red" | "yellow"; startMs: number; endMs: number;
  intervalCount: number; stateSeconds: number;
}

export function groupContinuousStateRuns(rows: StatisticInterval[], state: "red" | "yellow", currentRuleVersion: string): ContinuousStateRun[] {
  const sorted=[...rows].sort((a,b)=>a.machineId.localeCompare(b.machineId)||a.intervalStartMs-b.intervalStartMs);
  const result:ContinuousStateRun[]=[];
  let active:ContinuousStateRun|null=null;
  for(const row of sorted){
    const seconds=row[`${state}Seconds`] as number|null;
    const eligible=isCurrent(row,currentRuleVersion)&&row.transitionEligible&&seconds!==null&&seconds>0;
    const adjacent=active&&active.machineId===row.machineId&&active.endMs===row.intervalStartMs;
    if(!eligible){active=null;continue;}
    if(adjacent){active!.endMs=row.intervalEndMs;active!.intervalCount+=1;active!.stateSeconds+=seconds!;}
    else {active={machineId:row.machineId,state,startMs:row.intervalStartMs,endMs:row.intervalEndMs,intervalCount:1,stateSeconds:seconds!};result.push(active);}
  }
  return result;
}

function pureState(row:StatisticInterval,state:HistoricalState):boolean {
  return HISTORICAL_STATES.every((name)=>{const value=row[`${name}Seconds` as keyof StatisticInterval] as number|null;return name===state?(value??0)>0:(value??0)===0;});
}

export function findCompletionCandidates(rows:StatisticInterval[],currentRuleVersion:string){
  const sorted=[...rows].sort((a,b)=>a.machineId.localeCompare(b.machineId)||a.intervalStartMs-b.intervalStartMs);
  const boundaries:Array<{machineId:string;atMs:number}>=[];
  const mixed:Array<{machineId:string;startMs:number;endMs:number}>=[];
  for(const row of sorted)if(isCurrent(row,currentRuleVersion)&&row.transitionEligible&&(row.greenSeconds??0)>0&&(row.yellowSeconds??0)>0)mixed.push({machineId:row.machineId,startMs:row.intervalStartMs,endMs:row.intervalEndMs});
  for(let index=1;index<sorted.length;index++){const previous=sorted[index-1],current=sorted[index];
    if(previous.machineId===current.machineId&&previous.intervalEndMs===current.intervalStartMs&&isCurrent(previous,currentRuleVersion)&&isCurrent(current,currentRuleVersion)
      &&previous.transitionEligible&&current.transitionEligible&&pureState(previous,"green")&&pureState(current,"yellow"))boundaries.push({machineId:current.machineId,atMs:current.intervalStartMs});}
  return {boundaries,mixed};
}
