"use client";

import { useEffect, useState } from "react";
import {
  ComparisonRanking,
  OperationShareChart,
  RankingChart,
  TrendChart,
  type CompareRankRow,
  type Coverage,
  type LineSeries,
  type OperationShare,
  type OperationShareRow,
  type RankRow,
} from "@/components/history-widgets";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState, Panel } from "@/components/ui-states";
import { comparisonInputRange, formatDateDisplay, rangeGrainControl, type ComparisonKind, type TrendAxisMode } from "@/features/history/chart-ui-model";
import type { Availability } from "@/features/history/history-ui-model";
import { fetchApi } from "@/lib/api-client";

const ALL = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
const COLORS = ["#62d49a", "#e8898b", "#e2bd5b", "#69a9de", "#c79be8", "#f1a85b", "#8ed5d0", "#d7d0c9"];

interface PointCoverage { completeness: "COMPLETE" | "PARTIAL" | "MISSING" }
interface TrendPoint { position: string; sourceLabel: string; greenHours: number | null; availability: Availability; coverage: PointCoverage }
interface RangeResult {
  mode: "range";
  period: { startDate: string; endDate: string; days: number; grain: string };
  ranking: RankRow[];
  trend: TrendPoint[];
  seriesByMachine: Array<{ machineId: string; points: TrendPoint[] }>;
  threeStateShare: OperationShare;
  threeStateShareByMachine: Array<{ machineId: string; share: OperationShare }>;
  coverage: Coverage;
}
interface ComparisonTrendPoint {
  position: string | number;
  periods: {
    A: { sourceDate: string | null; greenHours: number | null; availability: Availability; coverage: PointCoverage };
    B: { sourceDate: string | null; greenHours: number | null; availability: Availability; coverage: PointCoverage };
  };
}
interface ComparePeriod { label: string; startDate: string; endDate: string; partial: boolean; elapsedCalendarDays: number; days: number }
interface CompareResult {
  mode: "compare";
  compareKind: "day" | "week" | "month";
  periods: { A: ComparePeriod; B: ComparePeriod };
  ranking: CompareRankRow[];
  trend: ComparisonTrendPoint[];
  seriesByMachine: Array<{ machineId: string; trend: ComparisonTrendPoint[] }>;
  threeStateShare: { periods: { A: OperationShare; B: OperationShare }; deltaPercentagePoints: Record<"green" | "yellow" | "red", number | null> };
  threeStateShareByMachine: Array<{ machineId: string; periods: { A: OperationShare; B: OperationShare }; deltaPercentagePoints: Record<"green" | "yellow" | "red", number | null> }>;
  coverage: { A: Coverage; B: Coverage };
}
interface Batch { source_date: string; status: string }
type Result = RangeResult | CompareResult;

function dateRange(start: string, end: string) {
  return start === end ? formatDateDisplay(start) : `${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
}
function machinesLabel(rows: string[]) { return rows.join("、"); }
function compareKindLabel(kind: CompareResult["compareKind"]) { return kind === "day" ? "日對日" : kind === "week" ? "週對週" : "月對月"; }
function comparisonHelp(kind: ComparisonKind) {
  if (kind === "day") return "選擇兩個日期，系統以各日 00:00–24:00 的 24 個小時位置對齊比較。";
  if (kind === "week") return "期間 A 與 B 都選擇起始日期；系統會自動納入起始日及後續 6 天，形成連續 7 天。";
  return "選擇兩個曆月，排行使用完整曆日的平均每日加工時數，趨勢依月日對齊。";
}
function comparisonFieldLabel(kind: ComparisonKind, period: "A" | "B") {
  return kind === "week" ? `期間 ${period} 起始日` : kind === "month" ? `期間 ${period} 月份` : `期間 ${period} 日期`;
}
function periodLabel(period: ComparePeriod) { return dateRange(period.startDate, period.endDate); }
function coverageNeedsAttention(coverage: Coverage) {
  return coverage.importedIntervals < coverage.expectedIntervals
    || coverage.greenEligibleIntervals < coverage.importedIntervals
    || (coverage.threeStateEligibleIntervals ?? 0) < coverage.importedIntervals;
}
function sourceTimeLabel(point: TrendPoint) { return `${formatDateDisplay(point.sourceLabel.replace(" ", " · ").replace(/-(?=\d{2}:\d{2}$)/, "–"))}`; }
function comparisonTimeLabel(kind: CompareResult["compareKind"], sourceDate: string | null, position: string | number) {
  if (!sourceDate) return kind === "month" ? `第 ${position} 日（不適用）` : `第 ${position} 日（無資料）`;
  if (kind === "day") return `${formatDateDisplay(sourceDate)} · ${String(position).replace("-", "–")}`;
  return `${formatDateDisplay(sourceDate)} · 第 ${position} 日`;
}

export default function ProcessingPage() {
  const [mode, setMode] = useState<"range" | "compare">("range");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bucket, setBucket] = useState<"30m" | "60m">("30m");
  const [kind, setKind] = useState<"day" | "week" | "month">("day");
  const [periodA, setPeriodA] = useState("");
  const [periodB, setPeriodB] = useState("");
  const [machines, setMachines] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentDate, setRecentDate] = useState<string | null>(null);
  const [highlightedMachine, setHighlightedMachine] = useState<string | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<string[]>([]);
  const [rangeShareMode, setRangeShareMode] = useState<"machine" | "total">("machine");
  const [compareTrendMode, setCompareTrendMode] = useState<"overall" | "single">("overall");
  const [compareTrendMachine, setCompareTrendMachine] = useState("");
  const [compareShareMode, setCompareShareMode] = useState<"overall" | "machine">("overall");

  useEffect(() => {
    let active = true;
    fetchApi<Batch[]>("/api/imports").then((rows) => { if (active) setRecentDate(rows.find((row) => row.status === "ACTIVE")?.source_date ?? null); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const crossDay = Boolean(startDate && endDate && startDate !== endDate);
  const grainControl = rangeGrainControl(startDate, endDate, bucket);
  const previewA = comparisonInputRange(kind, periodA);
  const previewB = comparisonInputRange(kind, periodB);
  const canQuery = machines.length > 0 && (mode === "range" ? Boolean(startDate && endDate) : Boolean(periodA && periodB));
  function invalidate() { setResult(null); setError(null); setHighlightedMachine(null); setHiddenSeries([]); }
  function switchMode(next: "range" | "compare") {
    if (next === mode) return;
    setMode(next); setMachines([]); setCompareTrendMachine(""); setCompareTrendMode("overall"); setRangeShareMode("machine"); setCompareShareMode("overall"); invalidate();
  }
  function toggleMachine(machine: string) { setMachines((current) => current.includes(machine) ? current.filter((item) => item !== machine) : [...current, machine]); invalidate(); }
  function useRecent() { if (!recentDate) return; setStartDate(recentDate); setEndDate(recentDate); if (mode !== "range") switchMode("range"); else invalidate(); }
  async function query() {
    if (!canQuery) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ mode, machineIds: machines.join(",") });
      if (mode === "range") { params.set("bucket", bucket); params.set("startDate", startDate); params.set("endDate", endDate); }
      else { params.set("compareKind", kind); params.set("periodA", periodA); params.set("periodB", periodB); }
      const next = await fetchApi<Result>(`/api/history/processing?${params}`);
      setResult(next);
      if (next.mode === "compare") setCompareTrendMachine(next.seriesByMachine[0]?.machineId ?? "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "歷史資料查詢失敗"); setResult(null); }
    finally { setLoading(false); }
  }
  const empty = result && (result.mode === "range" ? result.coverage.importedIntervals === 0 : result.coverage.A.importedIntervals + result.coverage.B.importedIntervals === 0);

  return <main className="page operation-analysis-page">
    <PageHeader eyebrow="歷史分析 / 機台狀態" title="機台運轉分析" description="以啟用版本計算加工時數、逐機台趨勢與 Green／Yellow／Red 三態占比；缺資料不補成零。" tag="ACTIVE HISTORY"/>
    <div className="operation-analysis-sections">
      <Panel title="分析條件" subtitle="單日可選 30／60 分鐘；跨日區間固定使用每日粒度。同期比較依日、連續七日或完整曆月對齊。" actions={<div className="segmented"><button className={`segment ${mode === "range" ? "active" : ""}`} onClick={() => switchMode("range")}>區間分析</button><button className={`segment ${mode === "compare" ? "active" : ""}`} onClick={() => switchMode("compare")}>同期比較</button></div>}>
        <div className="panel-body stack">
          {mode === "range" ? <div className="filters range-filters">
            <div className="field range-filter-field"><label>開始日期</label><input aria-label="開始日期" className="control" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); invalidate(); }}/><span className="field-help field-help-placeholder" aria-hidden="true">&nbsp;</span></div>
            <div className="field range-filter-field"><label>結束日期</label><input aria-label="結束日期" className="control" type="date" min={startDate} value={endDate} onChange={(event) => { setEndDate(event.target.value); invalidate(); }}/><span className="field-help field-help-placeholder" aria-hidden="true">&nbsp;</span></div>
            <div className="field range-filter-field"><label>資料粒度</label><select aria-label="資料粒度" className="control" value={grainControl.value} disabled={grainControl.disabled} onChange={(event) => { setBucket(event.target.value as "30m" | "60m"); invalidate(); }}>{crossDay && <option value="daily">每日（跨日固定）</option>}<option value="30m">30 分鐘</option><option value="60m">60 分鐘</option></select><span className="field-help">{crossDay ? "跨日查詢一律每日一點。" : "單日可切換 30 或 60 分鐘。"}</span></div>
            <div className="field range-filter-field"><label>快速日期</label><button className="button" disabled={!recentDate} onClick={useRecent}>{recentDate ? `最近匯入 ${recentDate}` : "尚無匯入日期"}</button><span className="field-help field-help-placeholder" aria-hidden="true">&nbsp;</span></div>
          </div> : <div className="filters compare-filters">
            <div className="field"><label>比較類型</label><select aria-label="比較類型" className="control" value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setPeriodA(""); setPeriodB(""); invalidate(); }}><option value="day">日對日｜依小時對齊</option><option value="week">週對週｜各起始日起連續 7 天</option><option value="month">月對月｜完整曆月平均</option></select></div>
            <div className="field"><label>{comparisonFieldLabel(kind, "A")}</label><input aria-label="期間 A" className="control" type={kind === "month" ? "month" : "date"} value={periodA} onChange={(event) => { setPeriodA(event.target.value); invalidate(); }}/></div>
            <div className="field"><label>{comparisonFieldLabel(kind, "B")}</label><input aria-label="期間 B" className="control" type={kind === "month" ? "month" : "date"} value={periodB} onChange={(event) => { setPeriodB(event.target.value); invalidate(); }}/></div>
          </div>}
          {mode === "compare" && <div className="comparison-guidance"><div><strong>{compareKindLabel(kind)}如何比較</strong><p>{comparisonHelp(kind)}</p></div><div className="comparison-range-preview"><span><b>期間 A</b>{previewA ?? "尚未選擇"}</span><span><b>期間 B</b>{previewB ?? "尚未選擇"}</span></div></div>}
          <div className="machine-filter"><div className="machine-filter-head"><span className="field-label">機台篩選（已選 {machines.length} 台）</span><div className="filter-actions"><button className="button ghost" onClick={() => { setMachines(ALL); invalidate(); }}>全選</button><button className="button ghost" onClick={() => { setMachines([]); invalidate(); }}>清除</button></div></div><div className="machine-pills">{ALL.map((machine) => <label className="check-pill" key={machine}><input type="checkbox" checked={machines.includes(machine)} onChange={() => toggleMachine(machine)}/><span>{machine}</span></label>)}</div></div>
          <div className="filter-actions"><button className="button primary" disabled={!canQuery || loading} onClick={query}>{mode === "range" ? "套用分析條件" : "比較兩個期間"}</button>{machines.length === 0 && <span className="metric-note">請至少選擇一台機台；不會自動查詢全部機台。</span>}</div>
          {crossDay && <div className="notice"><span>i</span><div><strong>已切換為每日粒度</strong><div>跨日區間每天只顯示一個趨勢點；未匯入日期維持缺資料，不補 0。</div></div></div>}
        </div>
      </Panel>
      {loading ? <Panel title="正在建立機台運轉分析"><LoadingState label="正在讀取啟用版本並計算統計…"/></Panel>
        : error ? <Panel title="查詢失敗"><div className="panel-body"><ErrorNotice message={error} onRetry={query}/></div></Panel>
        : empty ? <EmptyChartSet title="所選期間沒有已匯入資料" description="請確認日期是否已有啟用版本；無資料不會被繪製成 0 工時。" mode={mode}/>
        : result?.mode === "range" ? <RangeView value={result} highlightedMachine={highlightedMachine} onHighlight={(machine) => setHighlightedMachine((current) => current === machine ? null : machine)} hiddenSeries={hiddenSeries} onToggleSeries={(key) => setHiddenSeries((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} shareMode={rangeShareMode} onShareMode={setRangeShareMode}/>
        : result?.mode === "compare" ? <CompareView value={result} highlightedMachine={highlightedMachine} onHighlight={(machine) => setHighlightedMachine((current) => current === machine ? null : machine)} trendMode={compareTrendMode} onTrendMode={setCompareTrendMode} trendMachine={compareTrendMachine} onTrendMachine={setCompareTrendMachine} shareMode={compareShareMode} onShareMode={setCompareShareMode}/>
        : <EmptyChartSet title="請先選擇分析條件" description="選擇日期與至少一台機台後執行查詢；前端不會產生預設假資料。" mode={mode}/>
      }
    </div>
  </main>;
}

function EmptyChartSet({ title, description, mode }: { title: string; description: string; mode: "range" | "compare" }) {
  const titles = mode === "range" ? ["累積加工時數排行", "機台運轉趨勢圖", "各機台燈號時間占比"] : ["同期加工時數比較", "機台運轉趨勢比較", "燈號時間占比比較"];
  return <>{titles.map((panelTitle, index) => <Panel key={panelTitle} title={panelTitle}><EmptyState icon={["▤", "⌁", "◫"][index]} title={title} description={description}/></Panel>)}</>;
}

function modeChip(label: string) { return <span className="chart-mode-chip">{label}</span>; }

function RangeView({ value, highlightedMachine, onHighlight, hiddenSeries, onToggleSeries, shareMode, onShareMode }: {
  value: RangeResult; highlightedMachine: string | null; onHighlight: (machine: string) => void; hiddenSeries: string[]; onToggleSeries: (key: string) => void; shareMode: "machine" | "total"; onShareMode: (mode: "machine" | "total") => void;
}) {
  const dateText = dateRange(value.period.startDate, value.period.endDate);
  const machineText = machinesLabel(value.ranking.map((row) => row.machineId));
  const labels = value.seriesByMachine[0]?.points.map((item) => item.sourceLabel) ?? value.trend.map((item) => item.sourceLabel);
  const axisMode: TrendAxisMode = value.period.days > 1 ? "RANGE_MULTI" : value.period.grain === "30_MINUTES" ? "RANGE_DAY_30" : "RANGE_DAY_60";
  const series: LineSeries[] = value.seriesByMachine.map((item, index) => ({
    key: item.machineId, label: item.machineId, color: COLORS[index % COLORS.length], values: item.points.map((point) => point.greenHours), partial: item.points.map((point) => point.coverage.completeness === "PARTIAL"),
    details: item.points.map((point) => ({ timeLabel: sourceTimeLabel(point), availability: point.availability, completeness: point.coverage.completeness })),
  }));
  const machineRows: OperationShareRow[] = [...value.threeStateShareByMachine]
    .sort((left, right) => (right.share.percent.green ?? -1) - (left.share.percent.green ?? -1) || left.machineId.localeCompare(right.machineId))
    .map((item) => ({ id: item.machineId, label: item.machineId, value: item.share }));
  const shareRows: OperationShareRow[] = shareMode === "total" ? [{ id: "total", label: "所選機台合計", value: value.threeStateShare }] : machineRows;
  const coverageNote = coverageNeedsAttention(value.coverage) ? " · 部分資料缺漏或不符合品質條件，未補 0" : "";
  return <>
    <Panel title="累積加工時數排行" subtitle={`${dateText} · ${machineText}${coverageNote}`} actions={modeChip("區間分析")}><div className="panel-body"><RankingChart dateLabel={dateText} rows={value.ranking} highlightedMachine={highlightedMachine} onHighlight={onHighlight}/></div></Panel>
    <Panel title="機台運轉趨勢圖" subtitle={`${dateText} · ${value.period.days === 1 ? value.period.grain.replace("_MINUTES", " 分鐘粒度") : "每日粒度"} · ${machineText}${coverageNote}`} actions={modeChip("區間分析")}><TrendChart labels={labels} series={series} hiddenKeys={hiddenSeries} onToggleSeries={onToggleSeries} axisMode={axisMode} ariaLabel="逐機台加工時間趨勢"/></Panel>
    <Panel title={shareMode === "machine" ? "各機台燈號時間占比" : "整體燈號時間占比"} subtitle={`${dateText} · 只納入品質合格的三態時間${coverageNote}`} actions={<div className="chart-header-actions">{modeChip("區間分析")}<div className="segmented"><button className={`segment ${shareMode === "machine" ? "active" : ""}`} onClick={() => onShareMode("machine")}>各機台占比</button><button className={`segment ${shareMode === "total" ? "active" : ""}`} onClick={() => onShareMode("total")}>整體占比</button></div></div>}><div className="panel-body"><OperationShareChart rows={shareRows} dateLabel={dateText}/></div></Panel>
  </>;
}

function comparisonSeries(points: ComparisonTrendPoint[], periods: CompareResult["periods"], kind: CompareResult["compareKind"]): LineSeries[] {
  return (["A", "B"] as const).map((key, index) => ({
    key, label: periodLabel(periods[key]), color: index === 0 ? "#62d49a" : "#dc8b88",
    values: points.map((item) => item.periods[key].greenHours), partial: points.map((item) => item.periods[key].coverage.completeness === "PARTIAL"),
    details: points.map((item) => ({ timeLabel: comparisonTimeLabel(kind, item.periods[key].sourceDate, item.position), availability: item.periods[key].availability, completeness: item.periods[key].coverage.completeness })),
  }));
}

function CompareView({ value, highlightedMachine, onHighlight, trendMode, onTrendMode, trendMachine, onTrendMachine, shareMode, onShareMode }: {
  value: CompareResult; highlightedMachine: string | null; onHighlight: (machine: string) => void; trendMode: "overall" | "single"; onTrendMode: (mode: "overall" | "single") => void; trendMachine: string; onTrendMachine: (machine: string) => void; shareMode: "overall" | "machine"; onShareMode: (mode: "overall" | "machine") => void;
}) {
  const periodLabels = { A: periodLabel(value.periods.A), B: periodLabel(value.periods.B) };
  const subtitle = `${compareKindLabel(value.compareKind)}：${periodLabels.A} v.s. ${periodLabels.B}`;
  const machineSeries = value.seriesByMachine.find((item) => item.machineId === trendMachine);
  const trend = trendMode === "single" && machineSeries ? machineSeries.trend : value.trend;
  const labels = trend.map((item) => String(item.position));
  const axisMode: TrendAxisMode = value.compareKind === "day" ? "COMPARE_DAY" : value.compareKind === "week" ? "COMPARE_WEEK" : "COMPARE_MONTH";
  const partial = value.compareKind === "month" && (value.periods.A.partial || value.periods.B.partial);
  const coverageNote = coverageNeedsAttention(value.coverage.A) || coverageNeedsAttention(value.coverage.B) ? " · 部分資料缺漏或不符合品質條件，未補 0" : "";
  const shareRows: OperationShareRow[] = shareMode === "overall" ? [
    { id: "overall-a", label: periodLabels.A, value: value.threeStateShare.periods.A, deltaPercentagePoints: value.threeStateShare.deltaPercentagePoints },
    { id: "overall-b", label: periodLabels.B, value: value.threeStateShare.periods.B, deltaPercentagePoints: value.threeStateShare.deltaPercentagePoints },
  ] : value.threeStateShareByMachine.flatMap((item) => ([
    { id: `${item.machineId}-a`, groupLabel: item.machineId, label: periodLabels.A, value: item.periods.A, deltaPercentagePoints: item.deltaPercentagePoints },
    { id: `${item.machineId}-b`, groupLabel: item.machineId, label: periodLabels.B, value: item.periods.B, deltaPercentagePoints: item.deltaPercentagePoints },
  ]));
  return <>
    <Panel title="同期加工時數比較" subtitle={`${subtitle}${coverageNote}`} actions={modeChip("同期比較")}><div className="panel-body stack">
      {partial && <div className="notice warning"><span>!</span><div><strong>包含尚未完整結束的月份</strong><div>平均值仍除以完整曆日；{periodLabels.A} 已經過 {value.periods.A.elapsedCalendarDays}/{value.periods.A.days} 日，{periodLabels.B} 已經過 {value.periods.B.elapsedCalendarDays}/{value.periods.B.days} 日。</div></div></div>}
      <ComparisonRanking rows={value.ranking} highlightedMachine={highlightedMachine} onHighlight={onHighlight} periodLabels={periodLabels}/>
    </div></Panel>
    <Panel title="機台運轉趨勢比較" subtitle={`${subtitle} · ${trendMode === "single" ? `${trendMachine} 單機` : "所選機台合計"}${coverageNote}`} actions={modeChip("同期比較")}><div className="panel-body stack">
      <div className="comparison-local-toolbar"><div className="segmented"><button className={`segment ${trendMode === "overall" ? "active" : ""}`} onClick={() => onTrendMode("overall")}>整體趨勢</button><button className={`segment ${trendMode === "single" ? "active" : ""}`} onClick={() => onTrendMode("single")}>單機趨勢</button></div>{trendMode === "single" && <label><span>檢視機台</span><select aria-label="檢視機台" className="control compact" value={trendMachine} onChange={(event) => onTrendMachine(event.target.value)}>{value.seriesByMachine.map((item) => <option key={item.machineId} value={item.machineId}>{item.machineId}</option>)}</select></label>}</div>
      <TrendChart labels={labels} series={comparisonSeries(trend, value.periods, value.compareKind)} axisMode={axisMode} ariaLabel={`${trendMode === "single" ? trendMachine : "所選機台合計"} ${periodLabels.A} 與 ${periodLabels.B} 加工時間趨勢`}/>
    </div></Panel>
    <Panel title="燈號時間占比比較" subtitle={`${subtitle} · 兩個期間各自使用品質合格的三態時間${coverageNote}`} actions={<div className="chart-header-actions">{modeChip("同期比較")}<div className="segmented"><button className={`segment ${shareMode === "overall" ? "active" : ""}`} onClick={() => onShareMode("overall")}>整體占比</button><button className={`segment ${shareMode === "machine" ? "active" : ""}`} onClick={() => onShareMode("machine")}>各機台占比</button></div></div>}><div className="panel-body"><OperationShareChart rows={shareRows} dateLabel={`${periodLabels.A} v.s. ${periodLabels.B}`} comparisonSummary={{ label: shareMode === "overall" ? "所選機台整體" : "各機台逐列比較兩個日期", greenDelta: value.threeStateShare.deltaPercentagePoints.green }}/></div></Panel>
  </>;
}
