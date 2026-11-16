import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperationShareChart, RankingChart, TrendChart, comparisonRelativeChangeLabel } from "@/components/history-widgets";
import { buildTrendAxisLabels, capacityHourScale, comparisonInputRange, formatDurationHours, niceHourScale, niceIntegerScale, rangeGrainControl, regularTickIndexes } from "@/features/history/chart-ui-model";

describe("Stage 5.3 UAT visual V2 models",()=>{
  it("formats display durations to minutes without changing source precision",()=>{
    expect(formatDurationHours(23.098)).toBe("23 小時 6 分");
    expect(formatDurationHours(8.4167)).toBe("8 小時 25 分");
    expect(formatDurationHours(.75)).toBe("45 分");
    expect(formatDurationHours(0)).toBe("0 分");
    expect(formatDurationHours(10/3600)).toBe("不足 1 分");
    expect(formatDurationHours(59/3600)).toBe("不足 1 分");
    expect(formatDurationHours(1.5,"HOURS_PER_DAY")).toBe("1 小時 30 分／日");
  });

  it("creates zero-based rounded dynamic scales with readable tick counts",()=>{
    expect(niceHourScale(.36)).toEqual({max:.4,step:.1,ticks:[0,.1,.2,.3,.4]});
    expect(niceHourScale(17.467)).toEqual({max:20,step:5,ticks:[0,5,10,15,20]});
    const zero=niceHourScale(0,.5);
    expect(zero.max).toBeGreaterThan(0);
    expect(zero.ticks).toHaveLength(6);
  });

  it("uses exact single- and multi-day physical capacity unless anomalous data requires a larger scale",()=>{expect(capacityHourScale(40,48)).toMatchObject({max:48,exceeded:false});expect(capacityHourScale(300,336)).toMatchObject({max:336,exceeded:false});expect(capacityHourScale(130,168)).toMatchObject({max:168,exceeded:false});expect(capacityHourScale(20,24).ticks.at(-1)).toBe(24);expect(capacityHourScale(25,24)).toMatchObject({max:25,exceeded:true});});

  it("keeps all buckets while exposing only the approved time/date tick labels",()=>{
    const thirty=buildTrendAxisLabels("RANGE_DAY_30",Array.from({length:48},(_,index)=>String(index)));
    expect(thirty.ticks.map((tick)=>tick.label)).toEqual(["00:00","03:00","06:00","09:00","12:00","15:00","18:00","21:00"]);
    expect(thirty.endLabel).toBe("24:00");
    const week=buildTrendAxisLabels("COMPARE_WEEK",["1","2","3","4","5","6","7"]);
    expect(week.ticks.map((tick)=>tick.label)).toEqual(["第1天","第2天","第3天","第4天","第5天","第6天","第7天"]);
    const month=buildTrendAxisLabels("COMPARE_MONTH",Array.from({length:31},(_,index)=>String(index+1)));
    expect(month.ticks.map((tick)=>tick.label)).toEqual(["1日","5日","10日","15日","20日","25日","31日"]);
  });

  it("uses regular major ticks without forcing a nearby final label",()=>{
    const dates=Array.from({length:14},(_,index)=>`2025-06-${String(index+1).padStart(2,"0")}`);
    expect(regularTickIndexes(dates.length)).toEqual([0,2,4,6,8,10,12]);
    expect(buildTrendAxisLabels("RANGE_MULTI",dates).ticks.map((tick)=>tick.label)).toEqual(["06/01","06/03","06/05","06/07","06/09","06/11","06/13"]);
    expect(regularTickIndexes(9)).toEqual([0,2,4,6,8]);
  });

  it("creates non-negative integer scales for event counts",()=>{
    expect(niceIntegerScale(17)).toEqual({max:20,step:5,ticks:[0,5,10,15,20]});
    const small=niceIntegerScale(3);
    expect(small.ticks.every(Number.isInteger)).toBe(true);
    expect(small.ticks.at(-1)).toBeGreaterThanOrEqual(3);
  });

  it("renders R1 as solid shared-scale bars with human durations",()=>{
    const html=renderToStaticMarkup(<RankingChart dateLabel="2025/06/01" capacityHours={24} expectedIntervalsPerMachine={480} rows={[
      {machineId:"A2",greenHours:23.999,availability:"AVAILABLE"},
      {machineId:"A1",greenHours:0,availability:"AVAILABLE"},
      {machineId:"A4",greenHours:null,availability:"MISSING_DATA"},
    ]}/>);
    expect(html).toContain("累積時數");
    expect(html).toContain("24 小時");
    expect(html).toContain("資料不足");
    expect(html).not.toContain("100.0%");
    expect(html).toContain("ranking-solid-bar");
    expect(html).toContain("可統計");
  });

  it("renders R3 in one full-width chart with one legend and multiple 100 percent rows",()=>{
    const rows=[
      {id:"A2",label:"A2",value:{denominatorSeconds:180,availability:"AVAILABLE" as const,seconds:{green:180,yellow:0,red:0},percent:{green:1,yellow:0,red:0}}},
      {id:"A1",label:"A1",value:{denominatorSeconds:180,availability:"AVAILABLE" as const,seconds:{green:0,yellow:180,red:0},percent:{green:0,yellow:1,red:0}}},
    ];
    const html=renderToStaticMarkup(<OperationShareChart dateLabel="2025/06/01" rows={rows}/>);
    expect((html.match(/operation-share-legend/g)??[])).toHaveLength(1);
    expect((html.match(/data-share-row=/g)??[])).toHaveLength(2);
    expect(html).toContain("加工");
    expect(html).toContain("待機／完成");
    expect(html).toContain("異常／故障");
  });

  it("exposes a shared operable overlap readout instead of relying on SVG title",()=>{
    const html=renderToStaticMarkup(<TrendChart
      axisMode="RANGE_DAY_60"
      labels={["00:00-01:00","01:00-02:00"]}
      series={[
        {key:"A1",label:"A1",color:"#62d49a",values:[0,0],partial:[false,true],details:[{timeLabel:"2025/06/01 00:00–01:00",availability:"AVAILABLE",completeness:"COMPLETE"},{timeLabel:"2025/06/01 01:00–02:00",availability:"AVAILABLE",completeness:"PARTIAL"}]},
        {key:"A4",label:"A4",color:"#e8898b",values:[0,0],details:[{timeLabel:"2025/06/01 00:00–01:00",availability:"AVAILABLE",completeness:"COMPLETE"},{timeLabel:"2025/06/01 01:00–02:00",availability:"AVAILABLE",completeness:"COMPLETE"}]},
      ]}
    />);
    expect(html).toContain("data-tooltip-zone");
    expect(html).toContain("A1 0 分");
    expect(html).toContain("A4 0 分");
    expect(html).not.toContain("Green 工時");
    expect(html).not.toContain("stroke-dasharray");
    expect(html).toContain('transform="translate(20');
    expect(html).toContain('x1="108"');
    expect(html).toContain('class="trend-point partial-point"');
    expect(html).not.toContain('r="4.8"');
  });

  it("explains adaptive range grain and complete comparison periods",()=>{
    expect(rangeGrainControl("2025-06-01","2025-06-01","30m")).toEqual({value:"30m",disabled:false,label:"30 分鐘"});
    expect(rangeGrainControl("2025-06-01","2025-06-05","60m")).toEqual({value:"daily",disabled:true,label:"每日統計（跨日固定）"});
    expect(comparisonInputRange("day","2025-06-01")).toBe("2025/06/01");
    expect(comparisonInputRange("week","2025-06-01")).toBe("2025/06/01 – 2025/06/07");
    expect(comparisonInputRange("month","2025-02")).toBe("2025/02/01 – 2025/02/28");
  });

  it("distinguishes a true zero baseline while retaining raw-ratio precision",()=>{expect(comparisonRelativeChangeLabel(0,null)).toBe("無法計算（前期為 0）");expect(comparisonRelativeChangeLabel(10/3600,1)).toBe("+100.0%");expect(formatDurationHours(10/3600)).toBe("不足 1 分");});
});
