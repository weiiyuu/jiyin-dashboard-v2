import { availabilityLabel, formatHours, type Availability } from "@/features/history/history-ui-model";

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

export interface RankRow {
  machineId: string;
  greenHours: number | null;
  availability: Availability;
  selectedGreenShare?: number | null;
}

function Axis({ max, unit = "小時" }: { max: number; unit?: string }) {
  return <div className="bar-axis" aria-hidden><span>0</span><span>{(max / 2).toFixed(2)}</span><span>{max.toFixed(2)} {unit}</span></div>;
}

export function RankingChart({ rows, highlightedMachine, onHighlight, unit = "小時" }: {
  rows: RankRow[];
  highlightedMachine?: string | null;
  onHighlight?: (machineId: string) => void;
  unit?: string;
}) {
  const max = Math.max(0, ...rows.map((row) => row.greenHours ?? 0));
  const scale = max || 1;
  return <div className="chart-box operation-ranking" data-chart="operation-ranking">
    <Axis max={max} unit={unit}/>
    <div className="ranking-list">{rows.map((row, index) => <button
      type="button"
      className={`rank-row rank-button ${highlightedMachine === row.machineId ? "is-highlighted" : ""}`}
      key={row.machineId}
      onClick={() => onHighlight?.(row.machineId)}
      aria-pressed={highlightedMachine === row.machineId}
      title={`${row.machineId}：${formatHours(row.greenHours, row.availability)}`}
    >
      <span className="rank-label"><b>{index + 1}</b><strong>{row.machineId}</strong></span>
      <span className="rank-track"><span className="rank-bar" style={{ width: row.greenHours === null ? "0%" : `${row.greenHours / scale * 100}%` }}/></span>
      <span className="rank-value">{row.greenHours === null ? availabilityLabel(row.availability) : row.greenHours.toFixed(3)}</span>
      <span className="rank-share">{row.selectedGreenShare === null || row.selectedGreenShare === undefined ? "—" : `${(row.selectedGreenShare * 100).toFixed(1)}%`}</span>
    </button>)}</div>
  </div>;
}

export interface CompareRankRow {
  machineId: string;
  periods: {
    A: { greenHours: number | null; availability: Availability; unit?: "HOURS" | "HOURS_PER_DAY" };
    B: { greenHours: number | null; availability: Availability; unit?: "HOURS" | "HOURS_PER_DAY" };
  };
  difference?: number | null;
  relativeChange?: number | null;
}

export function ComparisonRanking({ rows, highlightedMachine, onHighlight }: {
  rows: CompareRankRow[];
  highlightedMachine?: string | null;
  onHighlight?: (machineId: string) => void;
}) {
  const max = Math.max(0, ...rows.flatMap((row) => [row.periods.A.greenHours ?? 0, row.periods.B.greenHours ?? 0]));
  const scale = max || 1;
  const unit = rows[0]?.periods.A.unit === "HOURS_PER_DAY" ? "小時／日" : "小時";
  return <div className="chart-box comparison-ranking" data-chart="comparison-ranking">
    <div className="chart-legend"><span><i className="legend-dot" style={{ background: "#62d49a" }}/>期間 A</span><span><i className="legend-dot" style={{ background: "#dc8b88" }}/>期間 B</span><span>排序依期間 B</span></div>
    <Axis max={max} unit={unit}/>
    <div className="ranking-list">{rows.map((row) => {
      const a = row.periods.A.greenHours;
      const b = row.periods.B.greenHours;
      return <button
        type="button"
        className={`compare-rank compare-rank-button ${highlightedMachine === row.machineId ? "is-highlighted" : ""}`}
        key={row.machineId}
        onClick={() => onHighlight?.(row.machineId)}
        aria-pressed={highlightedMachine === row.machineId}
      >
        <span className="compare-machine">{row.machineId}</span>
        <span className="compare-bars">
          <span className="rank-row"><span>A</span><span className="rank-track"><span className="rank-bar" style={{ width: a === null ? 0 : `${a / scale * 100}%` }}/></span><span className="rank-value">{a?.toFixed(3) ?? "—"}</span></span>
          <span className="rank-row"><span>B</span><span className="rank-track"><span className="rank-bar period-b" style={{ width: b === null ? 0 : `${b / scale * 100}%` }}/></span><span className="rank-value">{b?.toFixed(3) ?? "—"}</span></span>
        </span>
        <span className="rank-delta">Δ {row.difference === null || row.difference === undefined ? "—" : `${row.difference >= 0 ? "+" : ""}${row.difference.toFixed(3)}`}<small>{row.relativeChange === null || row.relativeChange === undefined ? "基期 0／缺資料" : `${row.relativeChange >= 0 ? "+" : ""}${(row.relativeChange * 100).toFixed(1)}%`}</small></span>
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
  return <div className="chart-box">{label && <div className="chart-legend"><strong>{label}</strong><span>有效分母 {value.denominatorSeconds.toLocaleString()} 秒</span></div>}<div className="share-bar" aria-label={`${label ?? "期間"}六態時間占比`}>{sixStateConfig.map(([key, name, color]) => <div key={key} className="share-part" title={`${name} ${((value.percent[key] ?? 0) * 100).toFixed(1)}% · ${(value.seconds[key] ?? 0).toLocaleString()} 秒`} style={{ width: `${(value.percent[key] ?? 0) * 100}%`, background: color }}/>)}</div><div className="share-values">{sixStateConfig.map(([key, name, color]) => <div className="share-value" key={key}><span><i className="legend-dot" style={{ background: color }}/>{name}</span><strong>{((value.percent[key] ?? 0) * 100).toFixed(1)}%</strong></div>)}</div></div>;
}

const operationStateConfig = [
  ["green", "綠燈／加工", "#4fc98a"],
  ["yellow", "黃燈", "#e2bd5b"],
  ["red", "紅燈", "#ef777b"],
] as const;

export interface OperationShare {
  percent: Record<"green" | "yellow" | "red", number | null>;
  seconds: Record<"green" | "yellow" | "red", number>;
  denominatorSeconds: number;
  availability: Availability;
  importedIntervals?: number;
  eligibleIntervals?: number;
}

export function OperationShareChart({ value, label, deltas }: {
  value: OperationShare;
  label: string;
  deltas?: Record<"green" | "yellow" | "red", number | null>;
}) {
  if (!value.denominatorSeconds) return <div className="operation-share-card is-empty"><div><strong>{label}</strong><span>無符合三態品質條件的資料</span></div></div>;
  return <div className="operation-share-card" data-share-label={label}>
    <div className="operation-share-head"><strong>{label}</strong><span>有效分母 {value.denominatorSeconds.toLocaleString()} 秒</span></div>
    <div className="operation-share-bar" aria-label={`${label}燈號時間占比`}>{operationStateConfig.map(([key, name, color]) => <span key={key} title={`${name} ${((value.percent[key] ?? 0) * 100).toFixed(1)}%`} style={{ width: `${(value.percent[key] ?? 0) * 100}%`, background: color }}/>)}</div>
    <div className="operation-share-values">{operationStateConfig.map(([key, name, color]) => <div key={key}><span><i className="legend-dot" style={{ background: color }}/>{name}</span><strong>{value.percent[key] === null ? "—" : `${(value.percent[key]! * 100).toFixed(1)}%`}</strong>{deltas && <small>{deltas[key] === null ? "Δ —" : `Δ ${deltas[key]! >= 0 ? "+" : ""}${deltas[key]!.toFixed(1)} pp`}</small>}</div>)}</div>
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

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
  partial?: boolean[];
}

export function TrendChart({ labels, series, hiddenKeys = [], onToggleSeries, ariaLabel = "Green 加工工時趨勢" }: {
  labels: string[];
  series: LineSeries[];
  hiddenKeys?: string[];
  onToggleSeries?: (key: string) => void;
  ariaLabel?: string;
}) {
  const visibleSeries = series.filter((item) => !hiddenKeys.includes(item.key));
  const all = visibleSeries.flatMap((item) => item.values);
  const hasValue = all.some((value) => value !== null);
  const width = 920, height = 340, left = 64, right = 24, top = 24, bottom = 54;
  const maxValue = Math.max(0, ...all.map((value) => value ?? 0));
  const yMax = maxValue || 1;
  const usableW = width - left - right, usableH = height - top - bottom;
  const x = (index: number) => left + (labels.length <= 1 ? 0 : index / (labels.length - 1) * usableW);
  const y = (value: number) => top + usableH - value / yMax * usableH;
  const segments = (values: Array<number | null>) => {
    const result: Array<Array<{ x: number; y: number; value: number; index: number }>> = [];
    let current: Array<{ x: number; y: number; value: number; index: number }> = [];
    values.forEach((value, index) => { if (value === null) { if (current.length) result.push(current); current = []; } else current.push({ x: x(index), y: y(value), value, index }); });
    if (current.length) result.push(current);
    return result;
  };
  const xTickIndexes = [...new Set(Array.from({ length: Math.min(9, labels.length) }, (_, index) => Math.round(index * (labels.length - 1) / Math.max(1, Math.min(8, labels.length - 1)))))];
  return <div className="chart-box operation-trend" data-chart="operation-trend">
    <div className="chart-legend interactive-legend">{series.map((item) => <button type="button" key={item.key} className={hiddenKeys.includes(item.key) ? "is-muted" : ""} aria-pressed={!hiddenKeys.includes(item.key)} onClick={() => onToggleSeries?.(item.key)}><i className="legend-dot" style={{ background: item.color }}/>{item.label}</button>)}<span>斷線＝缺資料／不適用；虛線點＝覆蓋不完整</span></div>
    {!hasValue ? <div className="empty-state"><div><div className="empty-icon">⌁</div><strong>所選期間沒有可用趨勢</strong><p>缺少資料的時間位置會維持空白，不會補成 0 或連線跨過。</p></div></div> : <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      {Array.from({ length: 5 }, (_, index) => { const value = yMax * (4 - index) / 4, position = top + usableH * index / 4; return <g key={`y-${index}`}><line className="chart-grid" x1={left} x2={width - right} y1={position} y2={position}/><text className="chart-axis-label" x={left - 10} y={position + 4} textAnchor="end">{value.toFixed(maxValue < 1 ? 2 : 1)}</text></g>; })}
      <line className="chart-axis" x1={left} x2={left} y1={top} y2={height - bottom}/><line className="chart-axis" x1={left} x2={width - right} y1={height - bottom} y2={height - bottom}/>
      <text className="chart-axis-title" transform={`translate(15 ${top + usableH / 2}) rotate(-90)`} textAnchor="middle">Green 工時（小時）</text>
      {xTickIndexes.map((index) => <g key={`x-${index}`}><line className="chart-tick" x1={x(index)} x2={x(index)} y1={height - bottom} y2={height - bottom + 5}/><text className="chart-axis-label" x={x(index)} y={height - 30} textAnchor="middle">{labels[index]?.replace(/^\d{4}-/, "")}</text></g>)}
      <text className="chart-axis-title" x={left + usableW / 2} y={height - 6} textAnchor="middle">時間</text>
      {visibleSeries.map((item) => { const parts = segments(item.values); return <g key={item.key}>{parts.map((part, index) => <polyline key={index} fill="none" stroke={item.color} strokeWidth="2.4" points={part.map((point) => `${point.x},${point.y}`).join(" ")}/>)}{parts.flat().map((point) => <circle key={point.index} className={item.partial?.[point.index] ? "partial-point" : ""} cx={point.x} cy={point.y} r={item.partial?.[point.index] ? 4.5 : 3.2} fill={item.color} tabIndex={0}><title>{`${item.label} · ${labels[point.index]}：${point.value.toFixed(3)} 小時${item.partial?.[point.index] ? "（覆蓋不完整）" : ""}`}</title></circle>)}</g>; })}
    </svg>}
  </div>;
}
