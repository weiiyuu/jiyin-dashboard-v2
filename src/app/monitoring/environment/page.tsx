"use client";

import { useCallback, useMemo, useState } from "react";
import { LiveEnvironmentChart, type LiveChartSeries } from "@/components/live-environment-chart";
import { LiveProviderBanner } from "@/components/live-provider-banner";
import { PageHeader } from "@/components/page-header";
import { ErrorNotice, LoadingState, Panel, StatusChip } from "@/components/ui-states";
import { useLocalRefresh } from "@/components/use-local-refresh";
import { defaultLiveTrendRangeMode, environmentStatusLabel, environmentVisualStatus, formatTaipeiDateTime, latestIso, LIVE_COLORS, recentLiveTrendRange, visibleEndMinutes, type EnvironmentLatest, type EnvironmentPayload, type LiveMeta, type LiveTrendRangeMode } from "@/features/live/live-ui-model";
import { fetchApiEnvelope } from "@/lib/api-client";

interface EnvironmentState { responses: Record<string, EnvironmentPayload>; meta: LiveMeta }
function latestKey(area: string, metric: string) { return `${area}-${metric}`; }

function SensorCard({ item }: { item: EnvironmentLatest }) {
  const status = environmentVisualStatus(item);
  const tone = status === "NORMAL" ? "success" : status === "ABOVE_LIMIT" || status === "UNREADABLE" ? "error" : "warning";
  const metricName = item.metric === "temperature" ? "溫度監測器" : "濕度監測器";
  return <article className={`environment-sensor-card status-${status.toLowerCase()}`}>
    <div><span>{metricName} {item.point}</span><StatusChip tone={tone}>{environmentStatusLabel(status)}</StatusChip></div>
    <strong>{item.value === null ? "—" : item.value.toFixed(1)} <small>{item.metric === "temperature" ? "°C" : "%RH"}</small></strong>
  </article>;
}

export default function EnvironmentPage() {
  const [state, setState] = useState<EnvironmentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rangeMode, setRangeMode] = useState<LiveTrendRangeMode | null>(null);
  const load = useCallback(async (signal: AbortSignal) => {
    setBusy(true);
    try {
      const keys = (["A", "B"] as const).flatMap((area) => (["temperature", "humidity"] as const).map((metric) => ({ area, metric, key: latestKey(area, metric) })));
      const responses = await Promise.all(keys.map(({ area, metric }) => fetchApiEnvelope<EnvironmentPayload, LiveMeta>(`/api/live/environment?area=${area}&metric=${metric}`, { signal })));
      setState({ responses: Object.fromEntries(keys.map((item, index) => [item.key, responses[index].data])), meta: responses[0].meta });
      setError(null);
    } catch (reason) {
      if ((reason as Error).name !== "AbortError") setError(reason instanceof Error ? reason.message : "無法讀取本機環境資料");
    } finally { setBusy(false); }
  }, []);
  useLocalRefresh(load);

  const chartSeries = useMemo(() => {
    if (!state) return { temperature: [], humidity: [] } as Record<"temperature" | "humidity", LiveChartSeries[]>;
    const build = (metric: "temperature" | "humidity") => (["A", "B"] as const).flatMap((area) => state.responses[latestKey(area, metric)].series.map((series, index) => ({ key: `${area}-${metric}-${series.point}`, label: `${area} 區${metric === "temperature" ? "溫度" : "濕度"} ${series.point}`, color: LIVE_COLORS[(area === "A" ? 0 : 2) + index], samples: series.samples })));
    return { temperature: build("temperature"), humidity: build("humidity") };
  }, [state]);
  const activeRangeMode=state?(rangeMode??defaultLiveTrendRangeMode(state.meta.providerMode)):"today";
  const trendRange=state?(activeRangeMode==="recent"?recentLiveTrendRange(state.meta.timeContext.now):{startMinute:540,endMinute:visibleEndMinutes(state.meta.timeContext.now)}):{startMinute:540,endMinute:570};

  return <main className="page live-page">
    <PageHeader eyebrow="LIVE ENVIRONMENT" title="環境監測" description="八個溫濕度測點獨立呈現；缺漏保留空白，不平均、不補零。" tag="09:00–17:00 台灣時間" />
    {error && <ErrorNotice message={error} onRetry={() => void load(new AbortController().signal)} />}
    {state && <LiveProviderBanner meta={state.meta} busy={busy} onRefresh={() => void load(new AbortController().signal)} />}
    {!state && !error && <LoadingState />}
    {state && <>
      <div className="environment-area-grid">{(["A", "B"] as const).map((area) => {
        const items = [...state.responses[latestKey(area, "temperature")].latest, ...state.responses[latestKey(area, "humidity")].latest];
        return <Panel key={area} title={`${area} 區環境資料`} actions={<div className="environment-area-times"><span>區域最近來源更新 {formatTaipeiDateTime(latestIso(items.map((item) => item.sensorUpdateAt)))}</span><span>平台最近取得 {formatTaipeiDateTime(latestIso(items.map((item) => item.fetchedAt)))}</span></div>}><div className="environment-sensor-grid">{items.map((item) => <SensorCard key={`${item.metric}-${item.point}`} item={item} />)}</div></Panel>;
      })}</div>
      <div className="environment-trend-range"><div><strong>趨勢時間範圍</strong><span>{activeRangeMode==="recent"?"最近 60 分鐘，保留少量右側時間留白":"今日 09:00 起至目前可見時段"}</span></div><div className="trend-range-switch" role="group" aria-label="趨勢時間範圍"><button type="button" className={activeRangeMode==="recent"?"active":""} aria-pressed={activeRangeMode==="recent"} onClick={()=>setRangeMode("recent")}>近期趨勢</button><button type="button" className={activeRangeMode==="today"?"active":""} aria-pressed={activeRangeMode==="today"} onClick={()=>setRangeMode("today")}>今日趨勢</button></div></div>
      <div className="live-chart-stack">
        <Panel title="溫度趨勢" className="live-environment-chart-panel"><LiveEnvironmentChart title="溫度趨勢" unit="°C" reference={26} series={chartSeries.temperature} startMinute={trendRange.startMinute} endMinute={trendRange.endMinute} date={state.meta.timeContext.dataDate} /><p className="live-chart-note">每 3 分鐘記錄一次；缺漏資料不連線。</p></Panel>
        <Panel title="濕度趨勢" className="live-environment-chart-panel"><LiveEnvironmentChart title="濕度趨勢" unit="%RH" reference={40} series={chartSeries.humidity} startMinute={trendRange.startMinute} endMinute={trendRange.endMinute} date={state.meta.timeContext.dataDate} /><p className="live-chart-note">每 3 分鐘記錄一次；缺漏資料不連線。</p></Panel>
      </div>
    </>}
  </main>;
}
