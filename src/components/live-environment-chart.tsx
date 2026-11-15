"use client";
import { useState,type KeyboardEvent } from "react";
import { chartSegments,formatClock,niceLiveScale,timeToMinutes,type EnvironmentSample } from "@/features/live/live-ui-model";

export interface LiveChartSeries {key:string;label:string;color:string;samples:EnvironmentSample[]}
interface HoverPoint {series:LiveChartSeries;sample:EnvironmentSample;x:number;y:number}
function pathFor(segment:Array<EnvironmentSample&{minute:number}>,x:(minute:number)=>number,y:(value:number)=>number){return segment.map((point,index)=>`${index?"L":"M"}${x(point.minute).toFixed(2)},${y(point.value!).toFixed(2)}`).join(" ");}

export function LiveEnvironmentChart({title,unit,reference,series,startMinute=540,endMinute,date}:{title:string;unit:string;reference:number;series:LiveChartSeries[];startMinute?:number;endMinute:number;date:string}){
  const [hidden,setHidden]=useState<Set<string>>(()=>new Set());
  const [focused,setFocused]=useState<string|null>(null);
  const [hover,setHover]=useState<HoverPoint|null>(null);
  const visible=series.filter((item)=>!hidden.has(item.key));
  const values=series.flatMap((item)=>item.samples.filter((sample)=>sample.observed&&sample.value!==null&&timeToMinutes(sample.time)<=endMinute).map((sample)=>sample.value!));
  const scale=niceLiveScale(values,reference);
  const width=1000,height=360,left=82,right=28,top=34,bottom=58,plotWidth=width-left-right,plotHeight=height-top-bottom;
  const x=(minute:number)=>left+(minute-startMinute)/(endMinute-startMinute)*plotWidth;
  const y=(value:number)=>top+(scale.max-value)/(scale.max-scale.min)*plotHeight;
  const xStep=endMinute-startMinute<=120?30:endMinute-startMinute<=300?60:120;
  const xTicks=[];for(let minute=startMinute;minute<=endMinute;minute+=xStep)xTicks.push(minute);if(xTicks.at(-1)!==endMinute)xTicks.push(endMinute);
  const pointCount=visible.reduce((count,item)=>count+item.samples.filter((sample)=>sample.observed&&sample.value!==null&&timeToMinutes(sample.time)<=endMinute).length,0);
  function toggle(key:string){setHidden((current)=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next;});setHover(null);}
  function legendKey(event:KeyboardEvent<HTMLButtonElement>,key:string){if(event.key==="Enter"||event.key===" "){event.preventDefault();toggle(key);}}
  return <div className="live-chart" data-live-chart={title}>
    <div className="live-chart-toolbar"><div><strong>{title}</strong><span>{date} · 09:00–{formatClock(endMinute)}</span></div><div className="live-chart-legend" aria-label={`${title}圖例`}>{series.map((item)=><button type="button" key={item.key} className={`${hidden.has(item.key)?"is-hidden":""} ${focused===item.key?"is-focused":""}`} onClick={()=>toggle(item.key)} onKeyDown={(event)=>legendKey(event,item.key)} onMouseEnter={()=>setFocused(item.key)} onMouseLeave={()=>setFocused(null)} onFocus={()=>setFocused(item.key)} onBlur={()=>setFocused(null)} aria-pressed={!hidden.has(item.key)}><i style={{background:item.color}}/>{item.label}</button>)}</div></div>
    {pointCount===0?<div className="live-chart-empty"><strong>目前時段尚無有效資料</strong><span>時間格會保留；未收集資料不會補成 0。</span></div>:<div className="live-chart-canvas">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}，${series.length} 個獨立感測點`}>
        {scale.ticks.map((tick)=><g key={tick}><line className="live-chart-grid" x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text className="live-chart-tick" x={left-13} y={y(tick)+5} textAnchor="end">{tick.toFixed(scale.step<1?1:0)}</text></g>)}
        {xTicks.map((tick)=><g key={tick}><line className="live-chart-grid vertical" x1={x(tick)} x2={x(tick)} y1={top} y2={height-bottom}/><text className="live-chart-tick" x={x(tick)} y={height-bottom+27} textAnchor="middle">{formatClock(tick)}</text></g>)}
        <line className="live-reference-line" x1={left} x2={width-right} y1={y(reference)} y2={y(reference)}/><text className="live-reference-label" x={width-right-4} y={Math.max(top+14,y(reference)-8)} textAnchor="end">暫定參考上限 {reference}{unit}</text>
        <text className="live-axis-title" transform={`translate(22 ${top+plotHeight/2}) rotate(-90)`} textAnchor="middle">{unit}</text><text className="live-axis-title" x={left+plotWidth/2} y={height-8} textAnchor="middle">台灣時間</text>
        {visible.map((item)=>{const dimmed=focused&&focused!==item.key;const segments=chartSegments(item.samples,endMinute);return <g key={item.key} className={dimmed?"is-dimmed":""}>{segments.map((segment,index)=><g key={index}>{segment.length>=2&&<path d={pathFor(segment,x,y)} fill="none" stroke={item.color} strokeWidth={focused===item.key?4:2.6}/>} {segment.map((sample)=><circle key={sample.sampleSlot} cx={x(sample.minute)} cy={y(sample.value!)} r={focused===item.key?4.7:3.2} fill={item.color} tabIndex={0} onMouseEnter={()=>setHover({series:item,sample,x:x(sample.minute),y:y(sample.value!)})} onMouseLeave={()=>setHover(null)} onFocus={()=>{setFocused(item.key);setHover({series:item,sample,x:x(sample.minute),y:y(sample.value!)})}} onBlur={()=>{setFocused(null);setHover(null)}} aria-label={`${item.label} ${sample.time} ${sample.value}${unit}`}/>)}</g>)}</g>})}
      </svg>
      {hover&&<div className="live-chart-tooltip" role="tooltip" style={{left:`${Math.min(86,Math.max(10,hover.x/width*100))}%`,top:`${Math.min(72,Math.max(8,hover.y/height*100))}%`}}><strong>{hover.sample.time} · {hover.series.label}</strong><span>{hover.sample.value?.toFixed(1)} {unit}</span><span>來源時間 {hover.sample.sensorUpdateAt?new Date(hover.sample.sensorUpdateAt).toLocaleTimeString("zh-TW",{timeZone:"Asia/Taipei",hour12:false}):"未提供"}</span></div>}
    </div>}
  </div>;
}
