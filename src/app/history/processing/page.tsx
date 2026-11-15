"use client";

import { useEffect, useState } from "react";
import {
  ComparisonRanking,
  CoverageStrip,
  OperationShareChart,
  RankingChart,
  TrendChart,
  type CompareRankRow,
  type Coverage,
  type LineSeries,
  type OperationShare,
  type RankRow,
} from "@/components/history-widgets";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState, Panel } from "@/components/ui-states";
import type { Availability } from "@/features/history/history-ui-model";
import { fetchApi } from "@/lib/api-client";

const ALL = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
const COLORS = ["#62d49a", "#e8898b", "#e2bd5b", "#69a9de", "#c79be8", "#f1a85b", "#8ed5d0", "#d7d0c9"];

interface PointCoverage {
  completeness: "COMPLETE" | "PARTIAL" | "MISSING";
}

interface TrendPoint {
  position: string;
  sourceLabel: string;
  greenHours: number | null;
  availability: Availability;
  coverage: PointCoverage;
}

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

interface CompareResult {
  mode: "compare";
  compareKind: "day" | "week" | "month";
  periods: {
    A: { label: string; partial: boolean; elapsedCalendarDays: number; days: number };
    B: { label: string; partial: boolean; elapsedCalendarDays: number; days: number };
  };
  ranking: CompareRankRow[];
  trend: ComparisonTrendPoint[];
  seriesByMachine: Array<{ machineId: string; trend: ComparisonTrendPoint[] }>;
  threeStateShare: {
    periods: { A: OperationShare; B: OperationShare };
    deltaPercentagePoints: Record<"green" | "yellow" | "red", number | null>;
  };
  threeStateShareByMachine: Array<{
    machineId: string;
    periods: { A: OperationShare; B: OperationShare };
    deltaPercentagePoints: Record<"green" | "yellow" | "red", number | null>;
  }>;
  coverage: { A: Coverage; B: Coverage };
}

interface Batch { source_date: string; status: string }
type Result = RangeResult | CompareResult;

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
  const [compareTrendMachine, setCompareTrendMachine] = useState<string>("");
  const [compareShareMode, setCompareShareMode] = useState<"overall" | "machine">("overall");

  useEffect(() => {
    let active = true;
    fetchApi<Batch[]>("/api/imports").then((rows) => {
      if (active) setRecentDate(rows.find((row) => row.status === "ACTIVE")?.source_date ?? null);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const crossDay = Boolean(startDate && endDate && startDate !== endDate);
  const canQuery = machines.length > 0 && (mode === "range" ? Boolean(startDate && endDate) : Boolean(periodA && periodB));

  function invalidate() {
    setResult(null);
    setError(null);
    setHighlightedMachine(null);
    setHiddenSeries([]);
  }

  function switchMode(next: "range" | "compare") {
    if (next === mode) return;
    setMode(next);
    setMachines([]);
    setCompareTrendMachine("");
    setCompareTrendMode("overall");
    setRangeShareMode("machine");
    setCompareShareMode("overall");
    invalidate();
  }

  function toggleMachine(machine: string) {
    setMachines((current) => current.includes(machine) ? current.filter((item) => item !== machine) : [...current, machine]);
    invalidate();
  }

  function useRecent() {
    if (!recentDate) return;
    setStartDate(recentDate);
    setEndDate(recentDate);
    if (mode !== "range") switchMode("range");
    else invalidate();
  }

  async function query() {
    if (!canQuery) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ mode, machineIds: machines.join(",") });
      if (mode === "range") {
        params.set("bucket", bucket);
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      } else {
        params.set("compareKind", kind);
        params.set("periodA", periodA);
        params.set("periodB", periodB);
      }
      const next = await fetchApi<Result>(`/api/history/processing?${params}`);
      setResult(next);
      if (next.mode === "compare") setCompareTrendMachine(next.seriesByMachine[0]?.machineId ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "歷史資料查詢失敗");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const empty = result && (result.mode === "range"
    ? result.coverage.importedIntervals === 0
    : result.coverage.A.importedIntervals + result.coverage.B.importedIntervals === 0);

  return <main className="page operation-analysis-page">
    <PageHeader eyebrow="歷史分析 / 機台狀態" title="機台運轉分析" description="以啟用版本計算加工工時、逐機台趨勢與 Green／Yellow／Red 三態占比；缺資料不補成零。" tag="ACTIVE HISTORY"/>
    <div className="operation-analysis-sections">
      <Panel title="分析條件" subtitle="區間分析支援同日 30／60 分鐘；同期比較依日、週、月固定對齊" actions={<div className="segmented"><button className={`segment ${mode === "range" ? "active" : ""}`} onClick={() => switchMode("range")}>區間分析</button><button className={`segment ${mode === "compare" ? "active" : ""}`} onClick={() => switchMode("compare")}>同期比較</button></div>}>
        <div className="panel-body stack">
          {mode === "range" ? <div className="filters">
            <div className="field"><label>開始日期</label><input aria-label="開始日期" className="control" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); invalidate(); }}/></div>
            <div className="field"><label>結束日期</label><input aria-label="結束日期" className="control" type="date" min={startDate} value={endDate} onChange={(event) => { setEndDate(event.target.value); invalidate(); }}/></div>
            <div className="field"><label>同日資料粒度</label><select aria-label="同日資料粒度" className="control" value={bucket} disabled={crossDay} onChange={(event) => { setBucket(event.target.value as "30m" | "60m"); invalidate(); }}><option value="30m">30 分鐘</option><option value="60m">60 分鐘</option></select></div>
            <div className="field"><label>快速日期</label><button className="button" disabled={!recentDate} onClick={useRecent}>{recentDate ? `最近匯入 ${recentDate}` : "尚無匯入日期"}</button></div>
          </div> : <div className="filters compare-filters">
            <div className="field"><label>比較類型</label><select aria-label="比較類型" className="control" value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setPeriodA(""); setPeriodB(""); invalidate(); }}><option value="day">日對日（每小時）</option><option value="week">週對週（7 個曆日）</option><option value="month">月對月（完整曆日平均）</option></select></div>
            <div className="field"><label>期間 A</label><input aria-label="期間 A" className="control" type={kind === "month" ? "month" : "date"} value={periodA} onChange={(event) => { setPeriodA(event.target.value); invalidate(); }}/></div>
            <div className="field"><label>期間 B</label><input aria-label="期間 B" className="control" type={kind === "month" ? "month" : "date"} value={periodB} onChange={(event) => { setPeriodB(event.target.value); invalidate(); }}/></div>
          </div>}
          <div className="machine-filter"><div className="machine-filter-head"><span className="field-label">機台篩選（已選 {machines.length} 台）</span><div className="filter-actions"><button className="button ghost" onClick={() => { setMachines(ALL); invalidate(); }}>全選</button><button className="button ghost" onClick={() => { setMachines([]); invalidate(); }}>清除</button></div></div><div className="machine-pills">{ALL.map((machine) => <label className="check-pill" key={machine}><input type="checkbox" checked={machines.includes(machine)} onChange={() => toggleMachine(machine)}/><span>{machine}</span></label>)}</div></div>
          <div className="filter-actions"><button className="button primary" disabled={!canQuery || loading} onClick={query}>{mode === "range" ? "套用分析條件" : "比較兩個期間"}</button>{machines.length === 0 && <span className="metric-note">請至少選擇一台機台；不會自動查詢全部機台。</span>}</div>
          {crossDay && <div className="notice"><span>i</span><div>跨日查詢固定使用每日分桶；未匯入日期維持缺資料。</div></div>}
        </div>
      </Panel>

      {loading ? <Panel title="正在建立機台運轉分析"><LoadingState label="正在讀取啟用版本並計算統計…"/></Panel>
        : error ? <Panel title="查詢失敗"><div className="panel-body"><ErrorNotice message={error} onRetry={query}/></div></Panel>
        : empty ? <EmptyChartSet title="所選期間沒有已匯入資料" description="請確認日期是否已有啟用版本；無資料不會被繪製成 0 工時。"/>
        : result?.mode === "range" ? <RangeView value={result} highlightedMachine={highlightedMachine} onHighlight={(machine) => setHighlightedMachine((current) => current === machine ? null : machine)} hiddenSeries={hiddenSeries} onToggleSeries={(key) => setHiddenSeries((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} shareMode={rangeShareMode} onShareMode={setRangeShareMode}/>
        : result?.mode === "compare" ? <CompareView value={result} highlightedMachine={highlightedMachine} onHighlight={(machine) => setHighlightedMachine((current) => current === machine ? null : machine)} trendMode={compareTrendMode} onTrendMode={setCompareTrendMode} trendMachine={compareTrendMachine} onTrendMachine={setCompareTrendMachine} shareMode={compareShareMode} onShareMode={setCompareShareMode}/>
        : <EmptyChartSet title="請先選擇分析條件" description="選擇日期與至少一台機台後執行查詢；前端不會產生預設假資料。"/>}
    </div>
  </main>;
}

function EmptyChartSet({ title, description }: { title: string; description: string }) {
  return <>
    <Panel title="1. 累積加工時數排行"><EmptyState icon="▤" title={title} description={description}/></Panel>
    <Panel title="2. 機台運轉趨勢圖"><EmptyState icon="⌁" title={title} description={description}/></Panel>
    <Panel title="3. 燈號時間占比"><EmptyState icon="◫" title={title} description={description}/></Panel>
  </>;
}

function QualityWarnings({ coverage }: { coverage: Coverage }) {
  const reasons = Object.entries(coverage.excludedByRule ?? {});
  return reasons.length ? <div className="notice warning"><span>!</span><div><strong>品質排除不會補零</strong><div>{reasons.map(([key, count]) => `${key} ${count}`).join("、")}</div></div></div> : null;
}

function RangeView({ value, highlightedMachine, onHighlight, hiddenSeries, onToggleSeries, shareMode, onShareMode }: {
  value: RangeResult;
  highlightedMachine: string | null;
  onHighlight: (machine: string) => void;
  hiddenSeries: string[];
  onToggleSeries: (key: string) => void;
  shareMode: "machine" | "total";
  onShareMode: (mode: "machine" | "total") => void;
}) {
  const labels = value.seriesByMachine[0]?.points.map((item) => item.sourceLabel) ?? value.trend.map((item) => item.sourceLabel);
  const series: LineSeries[] = value.seriesByMachine.map((item, index) => ({
    key: item.machineId,
    label: item.machineId,
    color: COLORS[index % COLORS.length],
    values: item.points.map((point) => point.greenHours),
    partial: item.points.map((point) => point.coverage.completeness === "PARTIAL"),
  }));
  return <>
    <Panel title="1. 累積加工時數排行" subtitle="依 Green 有效秒數累積；點選機台只高亮此圖，不改變全頁篩選。">
      <div className="panel-body stack"><CoverageStrip coverage={value.coverage}/><QualityWarnings coverage={value.coverage}/><RankingChart rows={value.ranking} highlightedMachine={highlightedMachine} onHighlight={onHighlight}/></div>
    </Panel>
    <Panel title="2. 機台運轉趨勢圖" subtitle={`${value.period.days === 1 ? value.period.grain.replace("_MINUTES", " 分鐘") : "每日"}分桶；點圖例可局部顯示或隱藏機台。`}>
      <TrendChart labels={labels} series={series} hiddenKeys={hiddenSeries} onToggleSeries={onToggleSeries} ariaLabel="逐機台 Green 加工工時趨勢"/>
    </Panel>
    <Panel title="3. 燈號時間占比" subtitle="只使用符合品質條件的 Green／Yellow／Red 秒數；None／Blue／White 不進入分母。" actions={<div className="segmented"><button className={`segment ${shareMode === "machine" ? "active" : ""}`} onClick={() => onShareMode("machine")}>分機台</button><button className={`segment ${shareMode === "total" ? "active" : ""}`} onClick={() => onShareMode("total")}>合計</button></div>}>
      <div className="panel-body operation-share-grid">{shareMode === "total" ? <OperationShareChart value={value.threeStateShare} label="所選機台合計"/> : value.threeStateShareByMachine.map((item) => <OperationShareChart key={item.machineId} value={item.share} label={item.machineId}/>)}</div>
    </Panel>
  </>;
}

function comparisonSeries(points: ComparisonTrendPoint[], labels: { A: string; B: string }): LineSeries[] {
  return [
    { key: "A", label: `期間 A · ${labels.A}`, color: "#62d49a", values: points.map((item) => item.periods.A.greenHours), partial: points.map((item) => item.periods.A.coverage.completeness === "PARTIAL") },
    { key: "B", label: `期間 B · ${labels.B}`, color: "#dc8b88", values: points.map((item) => item.periods.B.greenHours), partial: points.map((item) => item.periods.B.coverage.completeness === "PARTIAL") },
  ];
}

function CompareView({ value, highlightedMachine, onHighlight, trendMode, onTrendMode, trendMachine, onTrendMachine, shareMode, onShareMode }: {
  value: CompareResult;
  highlightedMachine: string | null;
  onHighlight: (machine: string) => void;
  trendMode: "overall" | "single";
  onTrendMode: (mode: "overall" | "single") => void;
  trendMachine: string;
  onTrendMachine: (machine: string) => void;
  shareMode: "overall" | "machine";
  onShareMode: (mode: "overall" | "machine") => void;
}) {
  const machineSeries = value.seriesByMachine.find((item) => item.machineId === trendMachine);
  const trend = trendMode === "single" && machineSeries ? machineSeries.trend : value.trend;
  const labels = trend.map((item) => String(item.position));
  const periodLabels = { A: value.periods.A.label, B: value.periods.B.label };
  const partial = value.compareKind === "month" && (value.periods.A.partial || value.periods.B.partial);
  return <>
    <Panel title="1. 累積加工時數排行" subtitle={value.compareKind === "month" ? "月比較採完整曆日平均每日 Green 小時，依期間 B 排序。" : "A／B 並列，依期間 B 排序；點選只高亮本圖。"}>
      <div className="panel-body stack">
        {partial && <div className="notice warning"><span>!</span><div><strong>包含尚未完整結束的月份</strong><div>平均值仍除以完整曆日；A 已經過 {value.periods.A.elapsedCalendarDays}/{value.periods.A.days} 日，B 已經過 {value.periods.B.elapsedCalendarDays}/{value.periods.B.days} 日。</div></div></div>}
        <div className="coverage-pair"><div className="coverage-period"><strong>期間 A · {value.periods.A.label}</strong><CoverageStrip coverage={value.coverage.A}/></div><div className="coverage-period"><strong>期間 B · {value.periods.B.label}</strong><CoverageStrip coverage={value.coverage.B}/></div></div>
        <ComparisonRanking rows={value.ranking} highlightedMachine={highlightedMachine} onHighlight={onHighlight}/>
      </div>
    </Panel>
    <Panel title="2. 機台運轉趨勢圖" subtitle="日比較固定 24 小時；週比較 7 個曆日；月比較對齊第 1–31 日。" actions={<div className="chart-actions"><div className="segmented"><button className={`segment ${trendMode === "overall" ? "active" : ""}`} onClick={() => onTrendMode("overall")}>合計</button><button className={`segment ${trendMode === "single" ? "active" : ""}`} onClick={() => onTrendMode("single")}>單一機台</button></div>{trendMode === "single" && <select aria-label="趨勢機台" className="control compact" value={trendMachine} onChange={(event) => onTrendMachine(event.target.value)}>{value.seriesByMachine.map((item) => <option key={item.machineId} value={item.machineId}>{item.machineId}</option>)}</select>}</div>}>
      <TrendChart labels={labels} series={comparisonSeries(trend, periodLabels)} ariaLabel={`${trendMode === "single" ? trendMachine : "所選機台合計"} A／B Green 工時趨勢`}/>
    </Panel>
    <Panel title="3. 燈號時間占比" subtitle="A／B 各自先加總有效三態秒數再計算占比；Δ 使用百分點（pp）。" actions={<div className="segmented"><button className={`segment ${shareMode === "overall" ? "active" : ""}`} onClick={() => onShareMode("overall")}>合計比較</button><button className={`segment ${shareMode === "machine" ? "active" : ""}`} onClick={() => onShareMode("machine")}>分機台</button></div>}>
      <div className="panel-body operation-share-compare">{shareMode === "overall" ? <div className="share-comparison-pair"><OperationShareChart value={value.threeStateShare.periods.A} label={`期間 A · ${value.periods.A.label}`} deltas={value.threeStateShare.deltaPercentagePoints}/><OperationShareChart value={value.threeStateShare.periods.B} label={`期間 B · ${value.periods.B.label}`} deltas={value.threeStateShare.deltaPercentagePoints}/></div> : value.threeStateShareByMachine.map((item) => <div className="machine-share-comparison" key={item.machineId}><h3>{item.machineId}</h3><div className="share-comparison-pair"><OperationShareChart value={item.periods.A} label="期間 A" deltas={item.deltaPercentagePoints}/><OperationShareChart value={item.periods.B} label="期間 B" deltas={item.deltaPercentagePoints}/></div></div>)}</div>
    </Panel>
  </>;
}
