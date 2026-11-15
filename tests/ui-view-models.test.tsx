import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComparisonRanking, CoverageStrip, OperationShareChart, StateShareChart, TrendChart, buildLineSegments } from "@/components/history-widgets";
import { alarmSourceLabel, formatHours } from "@/features/history/history-ui-model";
import { confirmPlan, removeSelectedUpload } from "@/features/imports/import-ui-model";

describe("Stage 5 UI truth-preserving view models",()=>{
  it("removes only the selected upload before preview and requires explicit replacement approval",()=>{
    const first={id:"one",file:new File(["1"],"one.xlsx")},second={id:"two",file:new File(["2"],"two.xlsx")};
    expect(removeSelectedUpload([first,second],"one")).toEqual([second]);
    const conflict={decision:"CONFLICT" as const,activeBatchId:12,errors:[]};
    expect(confirmPlan(conflict,false)).toMatchObject({allowed:false,reason:"REPLACE_CONFIRMATION_REQUIRED"});
    expect(confirmPlan(conflict,true)).toMatchObject({allowed:true,action:"REPLACE"});
    expect(confirmPlan({...conflict,decision:"DUPLICATE"},true)).toMatchObject({allowed:false,reason:"DUPLICATE"});
  });

  it("keeps valid zero, missing and not-applicable labels distinct",()=>{
    expect(formatHours(0)).toBe("0.000 小時");
    expect(formatHours(null,"MISSING_DATA")).toBe("無可用資料");
    expect(formatHours(null,"NOT_APPLICABLE")).toBe("不適用");
    expect(alarmSourceLabel("MISSING",null)).toContain("不可解讀為 0");
    expect(alarmSourceLabel("PROVIDED_EMPTY",0)).toContain("確認 0 筆");
  });

  it("breaks trend lines at missing positions instead of connecting or inserting zero",()=>{
    const geometry=buildLineSegments([1,null,0,2]);
    expect(geometry.segments.map((segment)=>segment.map((point)=>point.value))).toEqual([[1],[0,2]]);
  });

  it("renders backend coverage and six-state percentages without recalculation",()=>{
    const coverage=renderToStaticMarkup(<CoverageStrip coverage={{requestedDays:1,daysWithActiveBatch:1,expectedIntervals:960,importedIntervals:2,greenEligibleIntervals:1,sixStateEligibleIntervals:1,threeStateEligibleIntervals:1}}/>);
    expect(coverage).toContain("960");expect(coverage).toContain("1 / 1");
    const share=renderToStaticMarkup(<StateShareChart value={{denominatorSeconds:180,availability:"AVAILABLE",seconds:{green:90,red:90},percent:{none:0,red:.5,yellow:0,green:.5,blue:0,white:0}}}/>);
    expect(share).toContain("50.0%");
  });

  it("renders formal chart axes, machine legend and valid all-zero tooltips",()=>{
    const chart=renderToStaticMarkup(<TrendChart labels={["00:00-01:00","01:00-02:00"]} series={[{key:"A1",label:"A1",color:"#62d49a",values:[0,0]},{key:"B2",label:"B2",color:"#ef777b",values:[null,1]}]}/>);
    expect(chart).toContain("Green 工時（小時）");
    expect(chart).toContain("時間");
    expect(chart).toContain("A1");
    expect(chart).toContain("00:00-01:00：0.000 小時");
  });

  it("renders backend three-state shares and comparison deltas without deriving business values",()=>{
    const share=renderToStaticMarkup(<OperationShareChart label="A1" value={{denominatorSeconds:180,availability:"AVAILABLE",seconds:{green:90,yellow:60,red:30},percent:{green:.5,yellow:1/3,red:1/6}}} deltas={{green:12.5,yellow:-10,red:-2.5}}/>);
    expect(share).toContain("50.0%");
    expect(share).toContain("+12.5 pp");
    expect(share).toContain("有效分母 180 秒");
    const ranking=renderToStaticMarkup(<ComparisonRanking rows={[{machineId:"A1",periods:{A:{greenHours:0,availability:"AVAILABLE"},B:{greenHours:2,availability:"AVAILABLE"}},difference:2,relativeChange:null}]}/>);
    expect(ranking).toContain("Δ +2.000");
    expect(ranking).toContain("基期 0／缺資料");
  });
});
