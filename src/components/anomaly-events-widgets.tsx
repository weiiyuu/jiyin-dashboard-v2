"use client";
import { useState } from "react";

export interface AnomalyPoint { label:string; value:number|null }

export function AnomalyTrendChart({points,unit,formatValue}:{points:AnomalyPoint[];unit:string;formatValue:(value:number)=>string}){
  const[active,setActive]=useState<number|null>(null);
  const values=points.flatMap((point)=>point.value===null?[]:[point.value]);
  if(!values.length)return <div className="anomaly-chart-empty">所選範圍沒有可繪製的有效資料</div>;
  const width=900,height=300,left=62,right=24,top=22,bottom=54,max=Math.max(...values,1),plotW=width-left-right,plotH=height-top-bottom;
  const x=(index:number)=>left+(points.length===1?plotW/2:index*plotW/(points.length-1));
  const y=(value:number)=>top+plotH-(value/max)*plotH;
  const paths:string[]=[];let current="";
  points.forEach((point,index)=>{if(point.value===null){if(current)paths.push(current);current="";return;}current+=`${current?" L":"M"} ${x(index)} ${y(point.value)}`;});if(current)paths.push(current);
  const ticks=Array.from({length:5},(_,index)=>max*index/4);
  const labelStep=Math.max(1,Math.ceil(points.length/8));
  return <div className="anomaly-trend-wrap" onMouseLeave={()=>setActive(null)}>
    <svg className="anomaly-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`異常趨勢，單位 ${unit}`}>
      {ticks.map((tick)=>{const yy=y(tick);return <g key={tick}><line className="chart-grid" x1={left} y1={yy} x2={width-right} y2={yy}/><text className="chart-axis-label" x={left-10} y={yy+5} textAnchor="end">{Number.isInteger(tick)?tick:tick.toFixed(1)}</text></g>;})}
      <text className="chart-axis-title" transform={`translate(18 ${top+plotH/2}) rotate(-90)`}>{unit}</text>
      {paths.map((path,index)=><path className="anomaly-trend-line" d={path} key={index}/>) }
      {points.map((point,index)=><g key={`${point.label}-${index}`}><rect className="anomaly-hover-zone" x={Math.max(left,x(index)-plotW/points.length/2)} y={top} width={Math.max(12,plotW/points.length)} height={plotH} tabIndex={point.value===null?-1:0} onMouseEnter={()=>setActive(index)} onFocus={()=>setActive(index)} onBlur={()=>setActive(null)}/>{point.value!==null&&<circle className={active===index?"anomaly-point active":"anomaly-point"} cx={x(index)} cy={y(point.value)} r={active===index?5:3}/>} {(index%labelStep===0||index===points.length-1)&&<text className="chart-axis-label" x={x(index)} y={height-24} textAnchor="middle">{point.label.length>8?point.label.slice(5):point.label}</text>}</g>)}
    </svg>
    {active!==null&&points[active]?.value!==null&&<div className={`chart-tooltip anomaly-tooltip ${active>points.length/2?"align-right":""}`} style={{left:`${(x(active)/width)*100}%`}}><strong>{points[active].label}</strong><span>統計值 <em>{formatValue(points[active].value!)}</em></span></div>}
  </div>;
}

export function AnomalyRanking({items,formatValue}:{items:Array<{key:string;label:string;value:number|null}>;formatValue:(value:number)=>string}){
  const max=Math.max(...items.flatMap((item)=>item.value===null?[]:[item.value]),1);
  if(!items.length)return <div className="anomaly-chart-empty">所選條件下沒有排行資料</div>;
  return <div className="anomaly-ranking-list">{items.map((item,index)=><div className="anomaly-ranking-row" key={item.key}><b>{index+1}</b><span title={item.label}>{item.label}</span><div className="anomaly-rank-track"><i style={{width:`${((item.value??0)/max)*100}%`}}/></div><strong>{item.value===null?"無資料":formatValue(item.value)}</strong></div>)}</div>;
}
