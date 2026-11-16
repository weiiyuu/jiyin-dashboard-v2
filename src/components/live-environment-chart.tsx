"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { chartSegments, formatClock, nearestObservedMinute, niceLiveScale, timeToMinutes, type EnvironmentSample } from "@/features/live/live-ui-model";

export interface LiveChartSeries { key: string; label: string; color: string; samples: EnvironmentSample[] }
interface SelectedPoint { series: LiveChartSeries; sample: EnvironmentSample; x: number; y: number }
interface ChartSelection { minute: number; x: number; y: number; points: SelectedPoint[] }

function pathFor(segment: Array<EnvironmentSample & { minute: number }>, x: (minute: number) => number, y: (value: number) => number) {
  return segment.map((point, index) => `${index ? "L" : "M"}${x(point.minute).toFixed(2)},${y(point.value!).toFixed(2)}`).join(" ");
}
function sourceTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "未提供";
}

export function LiveEnvironmentChart({ title, unit, reference, series, startMinute = 540, endMinute, date }: { title: string; unit: string; reference: number; series: LiveChartSeries[]; startMinute?: number; endMinute: number; date: string }) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [selection, setSelection] = useState<ChartSelection | null>(null);
  const visible = series.filter((item) => !hidden.has(item.key));
  const values = visible.flatMap((item) => item.samples.filter((sample) => sample.observed && sample.value !== null && timeToMinutes(sample.time) <= endMinute).map((sample) => sample.value!));
  const scale = niceLiveScale(values, reference);
  const width = 1000, height = 360, left = 82, right = 100, top = 34, bottom = 58;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (minute: number) => left + ((minute - startMinute) / Math.max(1, endMinute - startMinute)) * plotWidth;
  const y = (value: number) => top + ((scale.max - value) / (scale.max - scale.min)) * plotHeight;
  const xStep = endMinute - startMinute <= 120 ? 30 : endMinute - startMinute <= 300 ? 60 : 120;
  const xTicks: number[] = [];
  for (let minute = startMinute; minute <= endMinute; minute += xStep) xTicks.push(minute);
  if (xTicks.at(-1) !== endMinute) xTicks.push(endMinute);
  const observed = visible.flatMap((item) => item.samples.filter((sample) => sample.observed && sample.value !== null && timeToMinutes(sample.time) <= endMinute));

  function selectionAt(minute: number) {
    const points = visible.flatMap((item) => {
      const sample = item.samples.find((candidate) => candidate.observed && candidate.value !== null && timeToMinutes(candidate.time) === minute);
      return sample ? [{ series: item, sample, x: x(minute), y: y(sample.value!) }] : [];
    });
    return points.length ? { minute, x: x(minute), y: Math.min(...points.map((point) => point.y)), points } : null;
  }
  function moveSelection(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    const minute = nearestObservedMinute(observed, startMinute + ratio * (endMinute - startMinute), endMinute);
    setSelection(minute === null ? null : selectionAt(minute));
  }
  function toggle(key: string) {
    setHidden((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    setSelection(null);
  }
  function legendKey(event: KeyboardEvent<HTMLButtonElement>, key: string) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(key); }
  }

  return <div className="live-chart" data-live-chart={title}>
    <div className="live-chart-toolbar"><span className="live-chart-range">{date} · 09:00–{formatClock(endMinute)}</span><div className="live-chart-legend" aria-label={`${title}圖例`}>{series.map((item) => <button type="button" key={item.key} className={`${hidden.has(item.key) ? "is-hidden" : ""} ${focused === item.key ? "is-focused" : ""}`} onClick={() => toggle(item.key)} onKeyDown={(event) => legendKey(event, item.key)} onMouseEnter={() => setFocused(item.key)} onMouseLeave={() => setFocused(null)} onFocus={() => setFocused(item.key)} onBlur={() => setFocused(null)} aria-pressed={!hidden.has(item.key)}><i style={{ background: item.color }} />{item.label}</button>)}</div></div>
    {observed.length === 0 ? <div className="live-chart-empty"><strong>目前時段尚無有效資料</strong><span>時間格會保留；未收集資料不會補成 0。</span></div> : <div className="live-chart-canvas">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}，${series.length} 個獨立感測點`}>
        {scale.ticks.map((tick) => <g key={tick}><line className="live-chart-grid" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} /><text className="live-chart-tick" x={left - 13} y={y(tick) + 5} textAnchor="end">{tick.toFixed(scale.step < 1 ? 1 : 0)}</text></g>)}
        {xTicks.map((tick) => <g key={tick}><line className="live-chart-grid vertical" x1={x(tick)} x2={x(tick)} y1={top} y2={height - bottom} /><text className="live-chart-tick" x={x(tick)} y={height - bottom + 27} textAnchor="middle">{formatClock(tick)}</text></g>)}
        <line className="live-reference-line" x1={left} x2={width - right} y1={y(reference)} y2={y(reference)} /><text className="live-reference-label" x={width - right + 12} y={y(reference) + 5} textAnchor="start">{reference}{unit}</text>
        <text className="live-axis-title" transform={`translate(22 ${top + plotHeight / 2}) rotate(-90)`} textAnchor="middle">{unit}</text><text className="live-axis-title" x={left + plotWidth / 2} y={height - 8} textAnchor="middle">台灣時間</text>
        {visible.map((item) => { const dimmed = focused && focused !== item.key; const segments = chartSegments(item.samples, endMinute); return <g key={item.key} className={dimmed ? "is-dimmed" : ""}>{segments.map((segment, index) => <g key={index}>{segment.length >= 2 && <path className="live-series-line" d={pathFor(segment, x, y)} fill="none" stroke={item.color} strokeWidth={focused === item.key ? 4 : 3.2} strokeLinecap="round" strokeLinejoin="round" />}{segment.length === 1 && <circle className="live-single-point" cx={x(segment[0].minute)} cy={y(segment[0].value!)} r={4.5} fill={item.color} />}</g>)}</g>; })}
        <rect className="live-chart-hit-area" x={left} y={top} width={plotWidth} height={plotHeight} fill="transparent" onPointerMove={moveSelection} onPointerLeave={() => setSelection(null)} />
        {visible.flatMap((item) => item.samples.filter((sample) => sample.observed && sample.value !== null && timeToMinutes(sample.time) <= endMinute).map((sample) => <circle key={`${item.key}-${sample.sampleSlot}`} className="live-keyboard-point" cx={x(timeToMinutes(sample.time))} cy={y(sample.value!)} r={8} fill="transparent" tabIndex={0} onFocus={() => { setFocused(item.key); setSelection(selectionAt(timeToMinutes(sample.time))); }} onBlur={() => { setFocused(null); setSelection(null); }} aria-label={`${item.label} ${sample.time} ${sample.value}${unit}`} />))}
        {selection?.points.map((point) => <circle key={`hover-${point.series.key}`} className="live-hover-marker" cx={point.x} cy={point.y} r={5.5} fill={point.series.color} />)}
      </svg>
      {selection && <div className="live-chart-tooltip" role="tooltip" style={{ left: `${Math.min(82, Math.max(13, (selection.x / width) * 100))}%`, top: `${Math.min(70, Math.max(10, (selection.y / height) * 100))}%` }}><strong>{formatClock(selection.minute)}</strong>{selection.points.map((point) => <div className="live-tooltip-row" key={point.series.key}><span><i style={{ background: point.series.color }} />{point.series.label}</span><b>{point.sample.value?.toFixed(1)} {unit}</b><small>來源 {sourceTime(point.sample.sensorUpdateAt)}</small></div>)}</div>}
    </div>}
  </div>;
}
