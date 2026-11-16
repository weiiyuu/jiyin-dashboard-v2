"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { availabilityLabel, type Availability } from "@/features/history/history-ui-model";
import {
  buildTrendAxisLabels,
  capacityHourScale,
  formatAxisHours,
  formatDurationHours,
  formatSignedDurationHours,
  niceHourScale,
  type TrendAxisMode,
} from "@/features/history/chart-ui-model";

export interface Coverage {
  requestedDays: number;
  daysWithActiveBatch: number;
  expectedIntervals: number;
  importedIntervals: number;
  greenEligibleIntervals: number;
  sixStateEligibleIntervals: number;
  threeStateEligibleIntervals?: number;
  excludedByRule?: Record<string, number>;
}

export function CoverageStrip({ coverage }: { coverage: Coverage }) {
  return <div className="coverage" aria-label="資料覆蓋率">
    <div className="coverage-item"><span>查詢日數</span><strong>{coverage.requestedDays}</strong></div>
    <div className="coverage-item"><span>有啟用版本</span><strong>{coverage.daysWithActiveBatch}</strong></div>
    <div className="coverage-item"><span>理論區間</span><strong>{coverage.expectedIntervals.toLocaleString()}</strong></div>
    <div className="coverage-item"><span>實際匯入</span><strong>{coverage.importedIntervals.toLocaleString()}</strong></div>
    <div className="coverage-item"><span>Green / 三態有效</span><strong>{coverage.greenEligibleIntervals.toLocaleString()} / {(coverage.threeStateEligibleIntervals ?? 0).toLocaleString()}</strong></div>
  </div>;
}

export function CoverageStatus({ coverage, label = "資料覆蓋" }: { coverage: Coverage; label?: string }) {
  const reasons = Object.entries(coverage.excludedByRule ?? {});
  return <details className="coverage-status">
    <summary><strong>{label}</strong><span>匯入 {coverage.importedIntervals.toLocaleString()} / 理論 {coverage.expectedIntervals.toLocaleString()} · 加工有效 {coverage.greenEligibleIntervals.toLocaleString()} · 三態有效 {(coverage.threeStateEligibleIntervals ?? 0).toLocaleString()}</span></summary>
    <div className="coverage-status-detail"><span>查詢 {coverage.requestedDays} 日</span><span>有啟用版本 {coverage.daysWithActiveBatch} 日</span>{reasons.length > 0 && <span>排除：{reasons.map(([key, count]) => `${key} ${count}`).join("、")}</span>}</div>
  </details>;
}

export interface RankRow {
  machineId: string;
  greenHours: number | null;
  availability: Availability;
  eligibleIntervals?: number;
}

type HourScale = { max: number; step: number; ticks: number[]; exceeded?: boolean };

function ScaleAxis({ scale, unit = "HOURS", title }: { scale: HourScale; unit?: "HOURS" | "HOURS_PER_DAY"; title: string }) {
  return <div className="value-axis" aria-hidden="true"><span className="value-axis-title">{title}</span><div className="value-axis-ticks">{scale.ticks.map((tick) => <span key={tick} style={{ left: `${tick / scale.max * 100}%` }}>{formatAxisHours(tick, scale.step, unit)}</span>)}</div></div>;
}

function GridLines({ scale }: { scale: HourScale }) {
  return <>{scale.ticks.map((tick) => <i className="value-grid-line" key={tick} style={{ left: `${tick / scale.max * 100}%` }}/>)}</>;
}

export function RankingChart({ rows, highlightedMachine, onHighlight, unit = "HOURS", dateLabel, capacityHours, expectedIntervalsPerMachine }: {
  rows: RankRow[];
  highlightedMachine?: string | null;
  onHighlight?: (machineId: string) => void;
  unit?: "HOURS" | "HOURS_PER_DAY";
  dateLabel: string;
  capacityHours?: number;
  expectedIntervalsPerMachine?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const maxValue = Math.max(0, ...rows.map((row) => row.greenHours ?? 0));
  const scale:HourScale = capacityHours ? capacityHourScale(maxValue, capacityHours) : niceHourScale(maxValue, unit === "HOURS_PER_DAY" ? 1 : 1);
  return <div className="chart-box ranking-chart-v2" data-chart="operation-ranking">
    <ScaleAxis scale={scale} unit={unit} title={unit === "HOURS_PER_DAY" ? "平均每日加工時數" : "累積時數"}/>
    {scale.exceeded&&<div className="chart-data-warning" role="note">資料超過所選期間的理論時間容量，已保留原值並擴展刻度。</div>}
    <div className="ranking-v2-list">{rows.map((row) => {
      const isMissing = row.greenHours === null;
      const label = isMissing ? "資料不足" : formatDurationHours(row.greenHours!, unit);
      const tooltipId = `ranking-tooltip-${row.machineId}`;
      return <button
        type="button"
        className={`ranking-v2-row ${highlightedMachine === row.machineId ? "is-highlighted" : ""} ${highlightedMachine && highlightedMachine !== row.machineId ? "is-dimmed" : ""}`}
        key={row.machineId}
        onClick={() => onHighlight?.(row.machineId)}
        onMouseEnter={() => setHovered(row.machineId)}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered(row.machineId)}
        onBlur={() => setHovered(null)}
        aria-pressed={highlightedMachine === row.machineId}
        aria-describedby={hovered === row.machineId ? tooltipId : undefined}
        aria-label={`${row.machineId}，累積加工時間 ${label}，${isMissing?availabilityLabel(row.availability):expectedIntervalsPerMachine?`可統計資料 ${row.eligibleIntervals??0} / ${expectedIntervalsPerMachine} 筆`:`可統計紀錄 ${row.eligibleIntervals??0} 筆`}`}
      >
        <strong className="ranking-machine">{row.machineId}</strong>
        <span className="ranking-v2-plot"><GridLines scale={scale}/>{!isMissing && row.greenHours! > 0 && <span className="ranking-solid-bar" style={{ width: `${Math.min(100,row.greenHours! / scale.max * 100)}%` }}/>} {!isMissing && row.greenHours === 0 && <span className="ranking-zero-mark"/>}</span>
        <span className={`ranking-duration ${isMissing ? "is-missing" : ""}`}>{label}</span>
        {hovered === row.machineId && <span className="chart-tooltip ranking-tooltip" id={tooltipId} role="tooltip"><strong>{row.machineId} · {dateLabel}</strong><span>累積加工時間：{label}</span><span>{isMissing ? availabilityLabel(row.availability) : expectedIntervalsPerMachine ? `可統計資料：${row.eligibleIntervals?.toLocaleString() ?? "—"} / ${expectedIntervalsPerMachine.toLocaleString()} 筆（三分鐘記錄）` : `可統計紀錄：${row.eligibleIntervals?.toLocaleString() ?? "—"} 筆`}</span></span>}
      </button>;
    })}</div>
  </div>;
}

export interface CompareRankRow {
  machineId: string;
  periods: {
    A: { greenHours: number | null; availability: Availability; unit?: "HOURS" | "HOURS_PER_DAY"; eligibleIntervals?: number };
    B: { greenHours: number | null; availability: Availability; unit?: "HOURS" | "HOURS_PER_DAY"; eligibleIntervals?: number };
  };
  difference?: number | null;
  relativeChange?: number | null;
}

export function comparisonRelativeChangeLabel(a:number|null,relativeChange:number|null|undefined){if(a===0)return "無法計算（前期為 0）";if(relativeChange===null||relativeChange===undefined)return "無法計算（資料不足）";return `${relativeChange>=0?"+":""}${(relativeChange*100).toFixed(1)}%`;}

export function ComparisonRanking({ rows, highlightedMachine, onHighlight, periodLabels, capacityHours, expectedIntervals }: {
  rows: CompareRankRow[];
  highlightedMachine?: string | null;
  onHighlight?: (machineId: string) => void;
  periodLabels: { A: string; B: string };
  capacityHours?: number;
  expectedIntervals?: { A: number; B: number };
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const maxValue = Math.max(0, ...rows.flatMap((row) => [row.periods.A.greenHours ?? 0, row.periods.B.greenHours ?? 0]));
  const unit = rows[0]?.periods.A.unit ?? "HOURS";
  const scale:HourScale = capacityHours ? capacityHourScale(maxValue, capacityHours) : niceHourScale(maxValue);
  return <div className="chart-box comparison-ranking-v2" data-chart="comparison-ranking">
    <div className="chart-legend comparison-legend"><span><i className="legend-dot period-a-dot"/>{periodLabels.A}</span><span><i className="legend-dot period-b-dot"/>{periodLabels.B}</span><span>依 {periodLabels.B} 排序</span></div>
    <ScaleAxis scale={scale} unit={unit} title={unit === "HOURS_PER_DAY" ? "平均每日加工時數" : "累積時數"}/>
    {scale.exceeded&&<div className="chart-data-warning" role="note">資料超過所選期間的理論時間容量，已保留原值並擴展刻度。</div>}
    <div className="comparison-v2-list">{rows.map((row) => {
      const a = row.periods.A.greenHours;
      const b = row.periods.B.greenHours;
      const tooltipId = `compare-ranking-tooltip-${row.machineId}`;
      return <button
        type="button"
        className={`comparison-v2-row ${highlightedMachine === row.machineId ? "is-highlighted" : ""} ${highlightedMachine && highlightedMachine !== row.machineId ? "is-dimmed" : ""}`}
        key={row.machineId}
        onClick={() => onHighlight?.(row.machineId)}
        onMouseEnter={() => setHovered(row.machineId)}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered(row.machineId)}
        onBlur={() => setHovered(null)}
        aria-pressed={highlightedMachine === row.machineId}
        aria-describedby={hovered === row.machineId ? tooltipId : undefined}
      >
        <strong className="comparison-machine">{row.machineId}</strong>
        <span className="comparison-bars-v2"><span className="comparison-bar-line"><b>{periodLabels.A}</b><span className="comparison-bar-plot"><GridLines scale={scale}/>{a !== null && a > 0 && <span className="comparison-solid-bar period-a" style={{ width: `${Math.min(100,a / scale.max * 100)}%` }}/>} {a === 0 && <span className="ranking-zero-mark"/>}</span></span><span className="comparison-bar-line"><b>{periodLabels.B}</b><span className="comparison-bar-plot"><GridLines scale={scale}/>{b !== null && b > 0 && <span className="comparison-solid-bar period-b" style={{ width: `${Math.min(100,b / scale.max * 100)}%` }}/>} {b === 0 && <span className="ranking-zero-mark"/>}</span></span></span>
        <span className="comparison-duration">{a === null ? "資料不足" : formatDurationHours(a, unit)}<b aria-hidden="true">→</b>{b === null ? "資料不足" : formatDurationHours(b, unit)}</span>
        {hovered === row.machineId && <span className="chart-tooltip ranking-tooltip comparison-ranking-tooltip" id={tooltipId} role="tooltip"><strong>{row.machineId}</strong><span className="comparison-tooltip-period"><b>{periodLabels.A}：{a === null ? "資料不足" : formatDurationHours(a, unit)}</b>{expectedIntervals&&<small>（可統計資料 {row.periods.A.eligibleIntervals?.toLocaleString()??"—"} / {expectedIntervals.A.toLocaleString()} 筆）</small>}</span><span className="comparison-tooltip-period"><b>{periodLabels.B}：{b === null ? "資料不足" : formatDurationHours(b, unit)}</b>{expectedIntervals&&<small>（可統計資料 {row.periods.B.eligibleIntervals?.toLocaleString()??"—"} / {expectedIntervals.B.toLocaleString()} 筆）</small>}</span><span>差異：{formatSignedDurationHours(row.difference ?? null, unit)}</span><span>相對變化：{comparisonRelativeChangeLabel(a,row.relativeChange)}</span></span>}
      </button>;
    })}</div>
  </div>;
}

const sixStateConfig = [
  ["none", "未開機", "#7d8794"], ["red", "紅燈", "#ef777b"], ["yellow", "黃燈", "#e2bd5b"],
  ["green", "加工中", "#4fc98a"], ["blue", "藍燈", "#69a9de"], ["white", "白燈", "#e8e0dc"],
] as const;

export interface StateShare {
  percent: Record<string, number | null>;
  seconds: Record<string, number>;
  denominatorSeconds: number;
  availability: Availability;
}

export function StateShareChart({ value, label }: { value: StateShare; label?: string }) {
  if (!value.denominatorSeconds) return <div className="empty-state"><div><div className="empty-icon">◫</div><strong>{label ? `${label} 無可用六態資料` : "無可用六態資料"}</strong><p>沒有符合六態品質條件的區間，因此不顯示假比例。</p></div></div>;
  return <div className="chart-box">{label && <div className="chart-legend"><strong>{label}</strong><span>有效分母 {formatDurationHours(value.denominatorSeconds / 3600)}</span></div>}<div className="share-bar" aria-label={`${label ?? "期間"}六態時間占比`}>{sixStateConfig.map(([key, name, color]) => <div key={key} className="share-part" title={`${name} ${((value.percent[key] ?? 0) * 100).toFixed(1)}% · ${formatDurationHours((value.seconds[key] ?? 0) / 3600)}`} style={{ width: `${(value.percent[key] ?? 0) * 100}%`, background: color }}/>)}</div><div className="share-values">{sixStateConfig.map(([key, name, color]) => <div className="share-value" key={key}><span><i className="legend-dot" style={{ background: color }}/>{name}</span><strong>{((value.percent[key] ?? 0) * 100).toFixed(1)}%</strong></div>)}</div></div>;
}

const operationStateConfig = [
  ["green", "加工", "#4fc98a"],
  ["yellow", "待機／完成", "#e2bd5b"],
  ["red", "異常／故障", "#ef777b"],
] as const;

export interface OperationShare {
  percent: Record<"green" | "yellow" | "red", number | null>;
  seconds: Record<"green" | "yellow" | "red", number>;
  denominatorSeconds: number;
  availability: Availability;
  importedIntervals?: number;
  eligibleIntervals?: number;
}

export interface OperationShareRow {
  id: string;
  label: string;
  groupLabel?: string;
  value: OperationShare;
  deltaPercentagePoints?: Record<"green" | "yellow" | "red", number | null>;
}

function shareTooltipText(row: OperationShareRow, dateLabel: string) {
  const parts = operationStateConfig.map(([key, name]) => {
    const percent = row.value.percent[key];
    const hours = row.value.seconds[key] / 3600;
    return `${name}：${percent === null ? "不可計算" : `${(percent * 100).toFixed(1)}%`}（${formatDurationHours(hours)}）`;
  });
  return `${row.groupLabel ? `${row.groupLabel} ` : ""}${row.label}；${dateLabel}；${parts.join("；")}；有效分母 ${formatDurationHours(row.value.denominatorSeconds / 3600)}`;
}

function FloatingTooltip({ anchorRef, className, id, children }: {
  anchorRef: RefObject<HTMLElement | null>;
  className: string;
  id: string;
  children: ReactNode;
}) {
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ left: 16, top: 16, visibility: "hidden" });
  useEffect(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;
    const update = () => {
      const anchorBox = anchor.getBoundingClientRect();
      const tooltipBox = tooltip.getBoundingClientRect();
      const edge = 16;
      const gap = 10;
      const left = Math.min(Math.max(edge, anchorBox.left), Math.max(edge, window.innerWidth - tooltipBox.width - edge));
      const below = anchorBox.bottom + gap;
      const top = below + tooltipBox.height <= window.innerHeight - edge
        ? below
        : Math.max(edge, anchorBox.top - tooltipBox.height - gap);
      setStyle({ left, top, visibility: "visible" });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef]);
  return <span className={`chart-tooltip floating-chart-tooltip ${className}`} id={id} ref={tooltipRef} role="tooltip" style={style}>{children}</span>;
}

function OperationShareRowView({ row, showGroup, dateLabel }: { row: OperationShareRow; showGroup: boolean; dateLabel: string }) {
  const [hovered, setHovered] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const unavailable = !row.value.denominatorSeconds;
  return <div className="operation-share-row-wrap">{showGroup && <h3>{row.groupLabel}</h3>}<button
    type="button"
    ref={anchorRef}
    className={`operation-share-row-v2 ${unavailable ? "is-empty" : ""}`}
    data-share-row={row.id}
    onMouseEnter={() => setHovered(true)}
    onMouseLeave={() => setHovered(false)}
    onFocus={() => setHovered(true)}
    onBlur={() => setHovered(false)}
    aria-describedby={hovered ? tooltipId : undefined}
    aria-label={shareTooltipText(row, dateLabel)}
  >
    <strong className="operation-share-label">{row.label}</strong>
    {unavailable ? <span className="operation-share-unavailable">無可計算的開機時間</span> : <span className="operation-share-stack">{operationStateConfig.map(([key, name, color]) => {
      const percent = row.value.percent[key] ?? 0;
      return <span key={key} className={`operation-share-segment state-${key}`} style={{ width: `${percent * 100}%`, background: color }}>{percent >= .12 && <b>{Math.round(percent * 100)}%</b>}<span className="sr-only">{name} {(percent * 100).toFixed(1)}%</span></span>;
    })}</span>}
    {hovered && <FloatingTooltip anchorRef={anchorRef} className="share-tooltip" id={tooltipId}>
      <span className="share-tooltip-head"><strong>{row.groupLabel ? `${row.groupLabel} · ` : ""}{row.label}</strong><span>{dateLabel}</span></span>
      <span className="share-tooltip-states">{operationStateConfig.map(([key, name, color]) => <span className="share-tooltip-state" key={key}>
        <span className="share-tooltip-state-name"><i className="legend-dot" style={{ background: color }}/><b>{name}</b></span>
        <strong>{row.value.percent[key] === null ? "不可計算" : `${(row.value.percent[key]! * 100).toFixed(1)}%`}</strong>
        <span>{formatDurationHours(row.value.seconds[key] / 3600)}</span>
      </span>)}</span>
      <span className="share-tooltip-denominator"><span>有效分母</span><strong>{formatDurationHours(row.value.denominatorSeconds / 3600)}</strong></span>
    </FloatingTooltip>}
  </button></div>;
}

export function OperationShareChart({ rows, dateLabel, comparisonSummary }: {
  rows: OperationShareRow[];
  dateLabel: string;
  comparisonSummary?: { label: string; greenDelta: number | null };
}) {
  return <div className="chart-box operation-share-chart-v2" data-chart="operation-share">
    <div className="operation-share-legend" aria-label="燈號圖例">{operationStateConfig.map(([key, name, color]) => <span key={key}><i className="legend-dot" style={{ background: color }}/>{name}</span>)}</div>
    <div className="operation-share-rows">{rows.map((row, index) => {
      const showGroup = row.groupLabel && row.groupLabel !== rows[index - 1]?.groupLabel;
      return <OperationShareRowView key={row.id} row={row} showGroup={Boolean(showGroup)} dateLabel={dateLabel}/>;
    })}</div>
    {comparisonSummary && <div className="share-comparison-summary"><span>{comparisonSummary.label}</span><strong>{comparisonSummary.greenDelta === null ? "加工占比變化無法計算" : `加工占比變化 ${comparisonSummary.greenDelta >= 0 ? "+" : ""}${comparisonSummary.greenDelta.toFixed(1)} 百分點`}</strong></div>}
  </div>;
}

export function buildLineSegments(values: Array<number | null>, width = 760, height = 300, padding = 58) {
  const available = values.filter((value): value is number => value !== null);
  const max = Math.max(1, ...available);
  const right = 18, top = 22, bottom = 48, usableW = width - padding - right, usableH = height - top - bottom;
  const point = (value: number, index: number) => ({ x: padding + (values.length <= 1 ? 0 : index / (values.length - 1) * usableW), y: top + usableH - value / max * usableH, value, index });
  const segments: Array<Array<ReturnType<typeof point>>> = [];
  let current: Array<ReturnType<typeof point>> = [];
  values.forEach((value, index) => { if (value === null) { if (current.length) segments.push(current); current = []; } else current.push(point(value, index)); });
  if (current.length) segments.push(current);
  return { segments, max, width, height, padding };
}

export interface LinePointDetail {
  timeLabel: string;
  availability: Availability;
  completeness?: "COMPLETE" | "PARTIAL" | "MISSING";
  eligibleIntervals?: number;
  expectedIntervals?: number;
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
  partial?: boolean[];
  details?: LinePointDetail[];
}

function trendTooltipHeading(axisMode: TrendAxisMode, index: number, fallback: string) {
  if (axisMode === "COMPARE_DAY") return `第 ${index + 1} 小時`;
  if (axisMode === "COMPARE_WEEK") return `第 ${index + 1} 日`;
  if (axisMode === "COMPARE_MONTH") return `${index + 1} 日`;
  return fallback;
}

export function TrendChart({ labels, series, hiddenKeys = [], onToggleSeries, ariaLabel = "機台運轉趨勢", axisMode = "RANGE_MULTI", capacityHours }: {
  labels: string[];
  series: LineSeries[];
  hiddenKeys?: string[];
  onToggleSeries?: (key: string) => void;
  ariaLabel?: string;
  axisMode?: TrendAxisMode;
  capacityHours?: number;
}) {
  const tooltipId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [focusedSeries, setFocusedSeries] = useState<string | null>(null);
  const visibleSeries = series.filter((item) => !hiddenKeys.includes(item.key));
  const all = visibleSeries.flatMap((item) => item.values);
  const hasValue = all.some((value) => value !== null);
  const width = 960, height = 360, left = 108, right = 28, top = 24, bottom = 56;
  const maxValue = Math.max(0, ...all.map((value) => value ?? 0));
  const scale:HourScale = capacityHours ? capacityHourScale(maxValue, capacityHours, axisMode === "RANGE_DAY_30" ? .5 : 1) : niceHourScale(maxValue, axisMode === "RANGE_DAY_30" ? .5 : 1);
  const usableW = width - left - right, usableH = height - top - bottom;
  const x = (index: number) => left + (labels.length <= 1 ? 0 : index / (labels.length - 1) * usableW);
  const y = (value: number) => top + usableH - value / scale.max * usableH;
  const segments = (values: Array<number | null>) => {
    const result: Array<Array<{ x: number; y: number; value: number; index: number }>> = [];
    let current: Array<{ x: number; y: number; value: number; index: number }> = [];
    values.forEach((value, index) => { if (value === null) { if (current.length) result.push(current); current = []; } else current.push({ x: x(index), y: y(value), value, index }); });
    if (current.length) result.push(current);
    return result;
  };
  const axis = buildTrendAxisLabels(axisMode, labels);
  const status = (detail: LinePointDetail | undefined, value: number | null) => value === null ? availabilityLabel(detail?.availability ?? "MISSING_DATA") : detail?.completeness === "PARTIAL" ? "部分資料缺漏" : "資料完整";
  const tooltipText = (index: number) => visibleSeries.map((item) => `${item.label} ${item.values[index] === null ? status(item.details?.[index], null) : formatDurationHours(item.values[index]!)} ${item.details?.[index]?.timeLabel ?? labels[index]}`).join("；");
  return <div className="chart-box operation-trend-v2" data-chart="operation-trend">
    {!hasValue ? <div className="empty-state"><div><div className="empty-icon">⌁</div><strong>所選期間沒有可用趨勢</strong><p>缺少資料的時間位置會維持空白，不會補成 0 或連線跨過。</p></div></div> : <div className="trend-plot-wrap">
      {scale.exceeded&&<div className="chart-data-warning" role="note">資料超過此時間單位的理論容量，已保留原值並擴展刻度。</div>}
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        {scale.ticks.map((tick) => { const position = y(tick); return <g key={`y-${tick}`}><line className="chart-grid" x1={left} x2={width - right} y1={position} y2={position}/><text className="chart-axis-label" x={left - 10} y={position + 4} textAnchor="end">{formatAxisHours(tick, scale.step)}</text></g>; })}
        <line className="chart-axis" x1={left} x2={left} y1={top} y2={height - bottom}/><line className="chart-axis" x1={left} x2={width - right} y1={height - bottom} y2={height - bottom}/>
        <text className="chart-axis-title" transform={`translate(20 ${top + usableH / 2}) rotate(-90)`} textAnchor="middle">加工時間</text>
        {axis.ticks.map((tick) => <g key={`x-${tick.index}`}><line className="chart-tick" x1={x(tick.index)} x2={x(tick.index)} y1={height - bottom} y2={height - bottom + 5}/><text className="chart-axis-label" x={x(tick.index)} y={height - 31} textAnchor="middle">{tick.label}</text></g>)}
        {axis.endLabel && <text className="chart-axis-label" x={width - right} y={height - 31} textAnchor="end">{axis.endLabel}</text>}
        <text className="chart-axis-title" x={left + usableW / 2} y={height - 7} textAnchor="middle">時間</text>
        {visibleSeries.map((item) => {
          const parts = segments(item.values);
          const dimmed = focusedSeries && focusedSeries !== item.key;
          return <g key={item.key} className={dimmed ? "trend-series is-dimmed" : "trend-series"}>{parts.map((part, index) => <polyline key={index} fill="none" stroke={item.color} strokeWidth="2.5" points={part.map((point) => `${point.x},${point.y}`).join(" ")}/>)}{parts.flat().map((point) => <circle key={point.index} className={`trend-point ${item.partial?.[point.index] ? "partial-point" : ""}`} cx={point.x} cy={point.y} r="3.8" fill={item.color} stroke="var(--bg)" strokeWidth="1.5"/>)}</g>;
        })}
        {activeIndex !== null && <line className="trend-crosshair" x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={height - bottom}/>}
        {labels.map((_, index) => {
          const zoneWidth = Math.max(12, usableW / Math.max(1, labels.length));
          return <rect className="trend-tooltip-zone" key={`zone-${index}`} data-tooltip-zone x={Math.max(left, x(index) - zoneWidth / 2)} y={top} width={zoneWidth} height={usableH} fill="transparent" tabIndex={0} role="button" aria-label={tooltipText(index)} aria-describedby={activeIndex === index ? tooltipId : undefined} onMouseEnter={() => setActiveIndex(index)} onMouseLeave={() => setActiveIndex(null)} onFocus={() => setActiveIndex(index)} onBlur={() => setActiveIndex(null)}/>;
        })}
      </svg>
      {activeIndex !== null && <div className={`chart-tooltip trend-tooltip ${activeIndex >= (labels.length - 1) / 2 ? "align-right" : ""}`} id={tooltipId} role="tooltip" style={{ left: `${x(activeIndex) / width * 100}%` }}>
        <span className="trend-tooltip-head"><strong>{trendTooltipHeading(axisMode, activeIndex, visibleSeries[0]?.details?.[activeIndex]?.timeLabel ?? labels[activeIndex])}</strong>{axisMode.startsWith("COMPARE") && <span>相對比較位置</span>}</span>
        <span className="trend-tooltip-list">{visibleSeries.map((item) => {
          const detail = item.details?.[activeIndex];
          const value = item.values[activeIndex];
          return <span className="trend-tooltip-row" key={item.key}>
            <span className="trend-tooltip-series"><i className="legend-dot" style={{ background: item.color }}/><b>{item.label}</b></span>
            {detail?.timeLabel && <span className="trend-tooltip-date">{detail.timeLabel}</span>}
            <span className="trend-tooltip-reading"><strong>{value === null ? availabilityLabel(detail?.availability ?? "MISSING_DATA") : formatDurationHours(value)}</strong><span>{value === null ? "無可用數值" : status(detail, value)}</span>{detail?.expectedIntervals!==undefined&&<span>可統計資料：{(detail.eligibleIntervals??0).toLocaleString()} / {detail.expectedIntervals.toLocaleString()} 筆</span>}</span>
          </span>;
        })}</span>
      </div>}
    </div>}
    <div className="chart-legend interactive-legend trend-legend">{series.map((item) => <button type="button" key={item.key} className={hiddenKeys.includes(item.key) ? "is-muted" : ""} aria-pressed={!hiddenKeys.includes(item.key)} onClick={() => onToggleSeries?.(item.key)} onMouseEnter={() => setFocusedSeries(item.key)} onMouseLeave={() => setFocusedSeries(null)} onFocus={() => setFocusedSeries(item.key)} onBlur={() => setFocusedSeries(null)}><i className="legend-line" style={{ borderColor: item.color }}/>{item.label}</button>)}<span>斷線表示缺資料／不適用；空心圓表示部分資料缺漏</span></div>
  </div>;
}
