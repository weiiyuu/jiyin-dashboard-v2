import { afterEach,describe,expect,it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtempSync,rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import MachinesPage from "@/app/monitoring/machines/page";
import EnvironmentPage from "@/app/monitoring/environment/page";
import ApiSettingsPage from "@/app/settings/api/page";
import Home from "@/app/page";
import { GET as getOverview } from "@/app/api/overview/route";
import { LiveEnvironmentChart } from "@/components/live-environment-chart";
import { chartSegments,niceLiveScale,regionEnvironmentStatus,visibleEndMinutes,type EnvironmentSample } from "@/features/live/live-ui-model";
import { demoEnvironment } from "@/server/live/demo-fixture";

let root:string|undefined;const original=process.env.DATABASE_PATH;
afterEach(()=>{process.env.DATABASE_PATH=original;if(root)rmSync(root,{recursive:true,force:true});root=undefined;});

describe("Stage 7 live display rules",()=>{
  it("uses provider time for a 30-minute-stepped 09:00–17:00 visible range",()=>{expect(visibleEndMinutes("2026-01-15T09:02:00+08:00")).toBe(570);expect(visibleEndMinutes("2026-01-15T12:13:00+08:00")).toBe(750);expect(visibleEndMinutes("2026-01-15T18:00:00+08:00")).toBe(1020);});
  it("breaks lines at NULL and non-contiguous three-minute slots without inserting zero",()=>{const samples:EnvironmentSample[]=[{time:"09:00",sampleSlot:"1",value:0,observed:true},{time:"09:03",sampleSlot:"2",value:null,observed:false},{time:"09:06",sampleSlot:"3",value:25,observed:true},{time:"09:12",sampleSlot:"4",value:26,observed:true}];expect(chartSegments(samples,600).map((segment)=>segment.map((point)=>point.value))).toEqual([[0],[25],[26]]);});
  it("builds independent non-zero temperature and humidity axes around data and reference lines",()=>{const temperature=niceLiveScale([24.1,25.2],26),humidity=niceLiveScale([43,49],40);expect(temperature.min).toBeGreaterThan(0);expect(temperature.min).toBeLessThanOrEqual(24.1);expect(temperature.max).toBeGreaterThanOrEqual(26);expect(humidity.min).toBeGreaterThan(0);expect(humidity.max).toBeGreaterThanOrEqual(49);});
  it("keeps missing environment points separate from provisional reference exceedances",()=>{expect(regionEnvironmentStatus([{area:"A",metric:"temperature",point:1,sensorId:"x",value:27,unit:"度",freshness:"FRESH",sensorUpdateAt:null},{area:"A",metric:"humidity",point:1,sensorId:"y",value:null,unit:"%RH",freshness:"NO_DATA",sensorUpdateAt:null}])).toContain("高於暫定上限");expect(regionEnvironmentStatus([{area:"A",metric:"temperature",point:1,sensorId:"x",value:27,unit:"度",freshness:"FRESH",sensorUpdateAt:null},{area:"A",metric:"humidity",point:1,sensorId:"y",value:null,unit:"%RH",freshness:"NO_DATA",sensorUpdateAt:null}])).toContain("資料不足");});
  it("provides a full synthetic workday with deliberate gaps and no database dependency",()=>{const fixture=demoEnvironment("A","temperature",420);expect(fixture.series).toHaveLength(2);expect(fixture.series[0].samples).toHaveLength(160);expect(fixture.series[1].samples.some((sample)=>!sample.observed&&sample.value===null)).toBe(true);expect(fixture.series[1].samples.some((sample)=>sample.value===0)).toBe(false);});
  it("renders solid chart paths, four legend controls, reference line and accessible points",()=>{const sample=(value:number):EnvironmentSample=>({time:"09:00",sampleSlot:`slot-${value}`,value,observed:true,sensorUpdateAt:"2026-01-15T09:00:00+08:00"});const html=renderToStaticMarkup(<LiveEnvironmentChart title="溫度趨勢" unit="°C" reference={26} date="2026-01-15" endMinute={570} series={[1,2,3,4].map((value)=>({key:`s${value}`,label:`感測點 ${value}`,color:"#fff",samples:[sample(20+value)]}))}/>);expect(html.match(/aria-pressed="true"/g)).toHaveLength(4);expect(html).toContain("暫定參考上限 26°C");expect(html).toContain("<circle");expect(html).not.toContain("stroke-dasharray=\"8 7\"></path>");});
});

describe("Stage 7 page and overview contracts",()=>{
  it("keeps all four authorized pages named and avoids fake homepage KPI labels",()=>{expect(renderToStaticMarkup(<MachinesPage/>)).toContain("機台監控");expect(renderToStaticMarkup(<EnvironmentPage/>)).toContain("環境監測");expect(renderToStaticMarkup(<ApiSettingsPage/>)).toContain("API 連線設定");const home=renderToStaticMarkup(<Home/>);expect(home).toContain("目前來源");expect(home).not.toMatch(/OEE|產量 KPI|健康 KPI/);});
  it("reports Demo readiness and empty history on a fresh isolated database",async()=>{root=mkdtempSync(join(tmpdir(),"jiyin-stage7-"));process.env.DATABASE_PATH=join(root,"stage7.sqlite");const response=await getOverview(),body=await response.json();expect(body.data).toMatchObject({runtimeMode:"DEMO",live:{status:"DEMO_READY",dataDate:"2026-01-15"},history:{activeDateFrom:null,activeDateTo:null,activeDayCount:0}});});
});
