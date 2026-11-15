"use client";

import { useCallback, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ErrorNotice, LoadingState, Panel, StatusChip } from "@/components/ui-states";
import { useLocalRefresh } from "@/components/use-local-refresh";
import { formatTaipeiDateTime } from "@/features/live/live-ui-model";
import { ApiClientError, fetchApiEnvelope } from "@/lib/api-client";

interface EndpointStatus { endpoint: string; transport: string; apiResult: string; schemaResult: string; collectionLastAttemptAt: string | null; collectionLastSuccessAt: string | null; latestDataAt: string | null; stale: boolean | null; error: { code: string; message: string } | null }
interface ConnectionStatus { runtimeMode: "LIVE" | "DEMO"; modeRevision: number; insideServiceWindow: boolean; configured: boolean; tlsMode: string | null; authMode: string | null; collector: { lastAttemptAt: string | null; lastSuccessAt: string | null; latestSensorDataAt: string | null; lastResult: string }; manualTest: { lastAttemptAt: string | null; result: string; endpoints: Array<{ endpoint: string; result: string; error_code?: string }> }; endpoints: EndpointStatus[] }
interface RuntimeSettings { providerMode: "LIVE" | "DEMO"; modeRevision: number }

function statusTone(value: string): "success" | "warning" | "error" | "info" {
  if (value === "SUCCESS") return "success";
  if (["NEVER_POLLED", "NEVER_TESTED", "NOT_EVALUATED"].includes(value)) return "info";
  if (["PARTIAL", "STALE", "SKIPPED_OUTSIDE_WINDOW"].includes(value)) return "warning";
  return "error";
}
function statusLabel(value: string) {
  return ({ SUCCESS: "正常", FAILED: "無法連線", STALE: "資料已逾時", NEVER_POLLED: "尚未取得", NEVER_TESTED: "尚未測試", NOT_EVALUATED: "尚未檢查", PARTIAL: "部分資料可用", FAILED_NO_READINGS: "未取得可用資料", SKIPPED_OUTSIDE_WINDOW: "非服務時段", DISCARDED_MODE_CHANGED: "模式已變更" } as Record<string, string>)[value] ?? value;
}
function endpointName(endpoint: string) {
  return ({ values: "設備數值（values）", configs: "設備設定（configs）", groups: "區域群組（groups）" } as Record<string, string>)[endpoint] ?? endpoint;
}
function endpointResult(endpoint: EndpointStatus) {
  if ([endpoint.transport, endpoint.apiResult, endpoint.schemaResult].includes("FAILED")) return "FAILED";
  if ([endpoint.transport, endpoint.apiResult, endpoint.schemaResult].every((value) => value === "SUCCESS")) return endpoint.stale ? "STALE" : "SUCCESS";
  return "NOT_EVALUATED";
}
function endpointMessage(endpoint: EndpointStatus) {
  if (endpoint.stale) return "連線曾成功，但最新資料已超過更新時間";
  if (!endpoint.error) return endpointResult(endpoint) === "SUCCESS" ? "服務回應正常" : "尚無檢查紀錄";
  const code = endpoint.error.code.toUpperCase();
  if (code.includes("TIMEOUT")) return "連線逾時，請稍後再試";
  if (code.includes("401") || code.includes("403") || code.includes("AUTH")) return "可能為網路白名單或權限限制，請確認目前使用允許的網路";
  if (code.includes("TLS") || code.includes("CERT")) return "安全連線設定無法使用";
  if (code.includes("SCHEMA") || code.includes("PARSE")) return "收到的資料格式不符合預期";
  return "目前無法取得服務資料";
}

export default function ApiSettingsPage() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "mode" | "test" | null>(null);
  const load = useCallback(async (signal: AbortSignal) => {
    setBusy((value) => value ?? "load");
    try { const response = await fetchApiEnvelope<ConnectionStatus>("/api/connection-status", { signal }); setStatus(response.data); setError(null); }
    catch (reason) { if ((reason as Error).name !== "AbortError") setError(reason instanceof Error ? reason.message : "無法讀取本機連線狀態"); }
    finally { setBusy((value) => value === "load" ? null : value); }
  }, []);
  useLocalRefresh(load);

  async function switchMode(mode: "LIVE" | "DEMO") {
    if (!status || mode === status.runtimeMode) return;
    const warning = mode === "DEMO" ? "切換至 Demo 後將停止自動收集，並改為顯示合成示範資料。確定切換？" : "切回 Live 後只會顯示本機已收集的真實資料，不會自動補資料。確定切換？";
    if (!window.confirm(warning)) return;
    setBusy("mode");
    try {
      await fetchApiEnvelope<RuntimeSettings>("/api/runtime-mode", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, expectedMode: status.runtimeMode, expectedRevision: status.modeRevision }) });
      await load(new AbortController().signal);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "模式切換失敗"); }
    finally { setBusy(null); }
  }

  async function manualTest() {
    if (!status || !status.configured) return;
    const warning = `這會對三項企業資料服務各執行一次連線測試，不會保存監測資料。${status.runtimeMode === "DEMO" ? "目前是 Demo 模式，但此操作仍會連線企業服務。" : ""}${!status.insideServiceWindow ? "目前不在服務時段。" : ""}確定繼續？`;
    if (!window.confirm(warning)) return;
    setBusy("test");
    try { await fetchApiEnvelope<{ result: string }>("/api/connection-status/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmOutsideWindow: !status.insideServiceWindow }) }); await load(new AbortController().signal); }
    catch (reason) { if (reason instanceof ApiClientError && reason.code === "OUTSIDE_WINDOW_CONFIRM_REQUIRED") setError("目前不在服務時段，需要再次確認後才能測試。"); else setError(reason instanceof Error ? reason.message : "手動測試失敗"); }
    finally { setBusy(null); }
  }

  return <main className="page live-page">
    <PageHeader eyebrow="LOCAL CONNECTION" title="API 連線設定" description="切換資料來源、查看自動收集狀況，或由使用者主動測試三項資料服務。" tag="本機安全控制" />
    {error && <ErrorNotice message={error} onRetry={() => void load(new AbortController().signal)} />}
    {!status && !error && <LoadingState />}
    {status && <>
      <div className={`connection-mode-banner ${status.runtimeMode.toLowerCase()}`}><div><span>目前資料來源</span><strong>{status.runtimeMode === "DEMO" ? "Demo 示範資料" : "Live 現場資料"}</strong><small>{status.runtimeMode === "DEMO" ? "使用合成資料展示畫面，不會寫入現場監測資料。" : "顯示本機已成功收集的現場資料；連線失敗時不會自動切換 Demo。"}</small></div><div className="mode-switch" role="group" aria-label="資料來源"><button type="button" className={status.runtimeMode === "LIVE" ? "active" : ""} onClick={() => void switchMode("LIVE")} disabled={busy !== null}>Live</button><button type="button" className={status.runtimeMode === "DEMO" ? "active" : ""} onClick={() => void switchMode("DEMO")} disabled={busy !== null}>Demo</button></div></div>
      <div className="connection-grid">
        <Panel title="自動資料收集" subtitle="只有資料成功保存後，才會顯示為收集成功。"><dl className="connection-facts"><div><dt>目前狀態</dt><dd><StatusChip tone={statusTone(status.collector.lastResult)}>{statusLabel(status.collector.lastResult)}</StatusChip></dd></div><div><dt>最近成功收集</dt><dd>{formatTaipeiDateTime(status.collector.lastSuccessAt)}</dd></div><div><dt>最新現場資料</dt><dd>{formatTaipeiDateTime(status.collector.latestSensorDataAt)}</dd></div></dl></Panel>
        <Panel title="手動連線測試" subtitle="只測試服務是否可用，不會保存監測資料。" actions={<button className="button primary" type="button" onClick={() => void manualTest()} disabled={!status.configured || busy !== null}>{busy === "test" ? "測試中…" : "測試連線"}</button>}><dl className="connection-facts"><div><dt>最近結果</dt><dd><StatusChip tone={statusTone(status.manualTest.result)}>{statusLabel(status.manualTest.result)}</StatusChip></dd></div><div><dt>最近測試</dt><dd>{formatTaipeiDateTime(status.manualTest.lastAttemptAt)}</dd></div><div><dt>本機連線設定</dt><dd>{status.configured ? "已完成" : "尚未設定（按鈕已停用）"}</dd></div></dl></Panel>
      </div>
      {!status.insideServiceWindow && <div className="notice warning"><span>i</span><div><strong>目前不在企業資料服務時段</strong><div>這不代表服務故障；現有頁面仍可顯示本機已保存的資料。</div></div></div>}
      <Panel title="資料服務狀態" subtitle="三項固定資料服務的最近一次檢查結果。"><div className="table-wrap"><table className="data-table connection-table"><thead><tr><th>資料來源</th><th>目前狀態</th><th>最近檢查</th><th>訊息</th></tr></thead><tbody>{status.endpoints.map((endpoint) => { const result = endpointResult(endpoint); return <tr key={endpoint.endpoint}><td><strong>{endpointName(endpoint.endpoint)}</strong></td><td><StatusChip tone={statusTone(result)}>{statusLabel(result)}</StatusChip></td><td>{formatTaipeiDateTime(endpoint.collectionLastAttemptAt)}</td><td>{endpointMessage(endpoint)}</td></tr>; })}</tbody></table></div></Panel>
    </>}
  </main>;
}
