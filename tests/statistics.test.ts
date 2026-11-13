import { describe, expect, it } from "vitest";
import {
  alignComparisonPositions, bucketGreenSeconds, buildCoverage, calculateGreenHours, calculateSixStateShare, calculateStateHours,
  expectedIntervals, expectedIntervalsForMonth, findCompletionCandidates, groupContinuousStateRuns,
  type StatisticInterval,
} from "@/server/statistics/history-statistics";

const RULE="jiyin-quality-v1";
function row(overrides:Partial<StatisticInterval>={}):StatisticInterval{return {
  machineId:"A1",sourceDate:"2025-06-01",timeLabel:"10:03",intervalStartMs:Date.parse("2025-06-01T10:00:00+08:00"),
  intervalEndMs:Date.parse("2025-06-01T10:03:00+08:00"),noneSeconds:0,redSeconds:0,yellowSeconds:0,greenSeconds:180,
  blueSeconds:0,whiteSeconds:0,greenHoursEligible:true,sixStateShareEligible:true,transitionEligible:true,qualityRuleVersion:RULE,...overrides};}

describe("historical aggregate truth",()=>{
  it("sums Green seconds before converting to hours and preserves coverage",()=>{
    const result=calculateGreenHours([row(),row({greenSeconds:90})],RULE,480);
    expect(result).toMatchObject({seconds:270,hours:0.075});
    expect(result.coverage).toMatchObject({expectedIntervals:480,importedIntervals:2,metricEligibleIntervals:2});
  });

  it("keeps valid Green when another state is NULL but excludes six-state share",()=>{
    const input=row({redSeconds:null,sixStateShareEligible:false});
    expect(calculateGreenHours([input],RULE,1).hours).toBe(0.05);
    expect(calculateSixStateShare([input],RULE,1)).toMatchObject({denominatorSeconds:0,shares:{green:null},coverage:{metricEligibleIntervals:0}});
  });

  it("sums all six states before division and handles a zero denominator",()=>{
    const share=calculateSixStateShare([row({greenSeconds:90,blueSeconds:45,whiteSeconds:45})],RULE,1);
    expect(share.shares).toMatchObject({green:0.5,blue:0.25,white:0.25});
    const zero=calculateSixStateShare([row({greenSeconds:0})],RULE,1);
    expect(zero.denominatorSeconds).toBe(0);
    expect(zero.shares.green).toBeNull();
  });

  it("excludes stale quality-rule flags with an explicit reason",()=>{
    const result=calculateGreenHours([row({qualityRuleVersion:"old"})],RULE,1);
    expect(result.hours).toBe(0);
    expect(result.coverage.excludedByReason).toEqual({QUALITY_RULE_VERSION_MISMATCH:1});
  });

  it("calculates Red and Yellow hours without renaming them as proven faults or idle",()=>{
    expect(calculateStateHours([row({redSeconds:90,yellowSeconds:45})],"red",RULE)).toMatchObject({seconds:90,hours:0.025});
    expect(calculateStateHours([row({redSeconds:90,yellowSeconds:45})],"yellow",RULE)).toMatchObject({seconds:45,hours:0.0125});
  });
});

describe("buckets, coverage, and comparison alignment",()=>{
  it("builds 30-minute, 60-minute, and daily Green buckets in Taipei time",()=>{
    const rows=[row(),row({intervalStartMs:Date.parse("2025-06-01T10:33:00+08:00"),intervalEndMs:Date.parse("2025-06-01T10:36:00+08:00"),timeLabel:"10:36",greenSeconds:90})];
    expect(bucketGreenSeconds(rows,30,RULE).map((b)=>b.key)).toEqual(["2025-06-01 10:00","2025-06-01 10:30"]);
    expect(bucketGreenSeconds(rows,60,RULE)).toMatchObject([{key:"2025-06-01 10:00",greenSeconds:270}]);
    expect(bucketGreenSeconds(rows,"DAY",RULE)).toMatchObject([{key:"2025-06-01",greenSeconds:270}]);
  });

  it("uses selected machine count for monthly expected intervals",()=>{
    expect(expectedIntervals(1,2)).toBe(960);
    expect(expectedIntervalsForMonth(2025,2,2)).toBe(26_880);
    expect(expectedIntervalsForMonth(2025,3,2)).toBe(29_760);
    expect(buildCoverage(2,1,2,960,900)).toEqual({requestedDays:2,daysWithActiveBatch:1,expectedIntervals:1920,importedIntervals:960,metricEligibleIntervals:900});
  });

  it("keeps period A and B Green totals and coverage independent",()=>{
    const periodA=calculateGreenHours([row({greenSeconds:180})],RULE,1);
    const periodB=calculateGreenHours([row({greenSeconds:90})],RULE,1);
    expect([periodA.hours,periodB.hours]).toEqual([0.05,0.025]);
    expect([periodA.coverage.metricEligibleIntervals,periodB.coverage.metricEligibleIntervals]).toEqual([1,1]);
  });

  it("distinguishes missing data from non-applicable month positions",()=>{
    const aligned=alignComparisonPositions(new Map([[28,1]]),new Map([[29,2],[31,3]]),28,31,31);
    expect(aligned[27].periodA).toMatchObject({availability:"AVAILABLE",value:1});
    expect(aligned[28].periodA).toMatchObject({availability:"NOT_APPLICABLE",value:null});
    expect(aligned[29].periodB).toMatchObject({availability:"MISSING_DATA",value:null});
    expect(aligned[30].periodB).toMatchObject({availability:"AVAILABLE",value:3});
  });
});

describe("continuous Red/Yellow and completion candidates",()=>{
  it("groups only eligible adjacent state intervals, including across midnight",()=>{
    const start=Date.parse("2025-06-01T23:57:00+08:00");
    const rows=[row({intervalStartMs:start,intervalEndMs:start+180_000,redSeconds:30,greenSeconds:150}),
      row({sourceDate:"2025-06-02",timeLabel:"00:03",intervalStartMs:start+180_000,intervalEndMs:start+360_000,redSeconds:10,greenSeconds:170}),
      row({intervalStartMs:start+540_000,intervalEndMs:start+720_000,redSeconds:5,greenSeconds:175})];
    const runs=groupContinuousStateRuns(rows,"red",RULE);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({intervalCount:2,stateSeconds:40});
  });

  it("finds pure Green to pure Yellow boundaries but not across a missing interval",()=>{
    const first=row();
    const yellow=row({timeLabel:"10:06",intervalStartMs:first.intervalEndMs,intervalEndMs:first.intervalEndMs+180_000,greenSeconds:0,yellowSeconds:180});
    expect(findCompletionCandidates([first,yellow],RULE).boundaries).toEqual([{machineId:"A1",atMs:first.intervalEndMs}]);
    const gap={...yellow,intervalStartMs:yellow.intervalStartMs+180_000,intervalEndMs:yellow.intervalEndMs+180_000};
    expect(findCompletionCandidates([first,gap],RULE).boundaries).toHaveLength(0);
    expect(findCompletionCandidates([row({greenSeconds:90,yellowSeconds:90})],RULE).mixed).toHaveLength(1);
  });
});
