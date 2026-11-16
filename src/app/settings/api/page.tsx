"use client";

import { useCallback, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { ErrorNotice, LoadingState, Panel, StatusChip } from "@/components/ui-states";
import { useLocalRefresh } from "@/components/use-local-refresh";
import { formatTaipeiDateTime } from "@/features/live/live-ui-model";
import { ApiClientError, fetchApiEnvelope } from "@/lib/api-client";

interface EndpointStatus { endpoint: string; attempted: boolean; result: string; checkSource: "MANUAL_TEST" | "COLLECTOR" | null; lastCheckedAt: string | null; lastRunAt: string | null; httpStatus: number | null; transport: string; apiResult: string; schemaResult: string; collectionLastAttemptAt: string | null; collectionLastSuccessAt: string | null; latestDataAt: string | null; stale: boolean | null; error: { code: string; message: string } | null }
interface ConnectionStatus { runtimeMode: "LIVE" | "DEMO"; modeRevision: number; insideServiceWindow: boolean; configured: boolean; tlsMode: string | null; authMode: string | null; collector: { lastAttemptAt: string | null; lastSuccessAt: string | null; latestSensorDataAt: string | null; lastResult: string }; manualTest: { lastAttemptAt: string | null; result: string; endpoints: Array<{ endpoint: string; result: string; error_code?: string }> }; endpoints: EndpointStatus[] }
interface RuntimeSettings { providerMode: "LIVE" | "DEMO"; modeRevision: number }

function statusTone(value: string): "success" | "warning" | "error" | "info" {
  if (value === "SUCCESS") return "success";
  if (["NEVER_POLLED", "NEVER_TESTED", "NOT_EVALUATED", "NOT_TESTED"].includes(value)) return "info";
  if (["PARTIAL", "STALE", "SKIPPED_OUTSIDE_WINDOW"].includes(value)) return "warning";
  return "error";
}
function statusLabel(value: string) {
  return ({ SUCCESS: "正常", FAILED: "無法連線", TIMEOUT: "連線逾時", HTTP_STATUS: "HTTP 錯誤", API_RESPONSE: "API 回應錯誤", SCHEMA: "格式不符", TLS_CERTIFICATE: "TLS 錯誤", NETWORK: "網路連線失敗", NOT_TESTED: "未測試", STALE: "資料已逾時", NEVER_POLLED: "尚未取得", NEVER_TESTED: "尚未測試", NOT_EVALUATED: "尚未檢查", PARTIAL: "部分資料可用", FAILED_NO_READINGS: "未取得可用資料", SKIPPED_OUTSIDE_WINDOW: "非服務時段", DISCARDED_MODE_CHANGED: "模式已變更" } as Record<string, string>)[value] ?? value;
}
function endpointName(endpoint: string) {
  return ({ values: "設備數值（values）", configs: "設備設定（configs）", groups: "區域群組（groups）" } as Record<string, string>)[endpoint] ?? endpoint;
}
function endpointResult(endpoint: EndpointStatus) {
  if (!endpoint.attempted) return "NOT_TESTED";
  if (endpoint.result === "SUCCESS") return "SUCCESS";
  const code = endpoint.error?.code ?? "FAILED";
  if (["TIMEOUT", "HTTP_STATUS", "API_RESPONSE", "SCHEMA", "TLS_CERTIFICATE", "NETWORK"].includes(code)) return code;
  if (code === "REDIRECT") return "HTTP_STATUS";
  if (["INVALID_JSON", "RESPONSE_TOO_LARGE"].includes(code)) return "SCHEMA";
  return endpoint.result === "SCHEMA_ERROR" ? "SCHEMA" : "FAILED";
}
function endpointMessage(endpoint: EndpointStatus) {
  if (!endpoint.attempted) return endpoint.error?.code === "PREVIOUS_ENDPOINT_FAILED" ? "本次因前一端點失敗而未繼續" : "尚無測試或收集紀錄";
  if (!endpoint.error) return endpoint.stale ? "服務回應正常；現場資料更新已逾時" : `${endpoint.checkSource === "MANUAL_TEST" ? "手動測試" : "自動收集"}成功`;
  const code = endpoint.error.code.toUpperCase();
  if (code.includes("TIMEOUT") || code.includes("NETWORK")) return "未取得伺服器 HTTP 回應；可能是網路、白名單或服務不可用";
  if (endpoint.httpStatus === 401 || endpoint.httpStatus === 403) return "可能為網路白名單或權限限制，請確認目前使用允許的網路";
  if (code.includes("HTTP")) return "伺服器回傳非成功的 HTTP 狀態";
  if (code.includes("API_RESPONSE")) return "HTTP 已回應，但 API 回報非成功狀態";
  if (code.includes("401") || code.includes("403") || code.includes("AUTH")) return "可能為網路白名單或權限限制，請確認目前使用允許的網路";
  if (code.includes("TLS") || code.includes("CERT")) return "安全連線設定無法使用";
  if (code.includes("SCHEMA") || code.includes("PARSE")) return "收到的資料格式不符合預期";
  return "目前無法取得服務資料";
}
function checkSourceLabel(endpoint: EndpointStatus) { return endpoint.checkSource === "MANUAL_TEST" ? "手動測試" : endpoint.checkSource === "COLLECTOR" ? "自動收集" : null; }

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
        <Panel title="手動連線測試" subtitle="只測試服務是否可用，不會保存監測資料。" actions={<button className="button primary" type="button" onClick={() => void manualTest()} disabled={!status.configured || busy !== null} aria-busy={busy === "test"}>{busy === "test" ? "正在測試…" : "測試連線"}</button>}><dl className="connection-facts" aria-live="polite"><div><dt>最近結果</dt><dd><StatusChip tone={statusTone(status.manualTest.result)}>{statusLabel(status.manualTest.result)}</StatusChip></dd></div><div><dt>最近測試</dt><dd>{formatTaipeiDateTime(status.manualTest.lastAttemptAt)}</dd></div><div><dt>本機連線設定</dt><dd>{status.configured ? "已完成" : "尚未設定（按鈕已停用）"}</dd></div></dl></Panel>
      </div>
      {!status.insideServiceWindow && <div className="notice warning"><span>i</span><div><strong>目前不在企業資料服務時段</strong><div>這不代表服務故障；現有頁面仍可顯示本機已保存的資料。</div></div></div>}
      <Panel title="資料服務狀態" subtitle="三項固定資料服務的最近一次實際檢查結果。"><div className="connection-frequency-note"><span><strong>values</strong>每 3 分鐘自動收集</span><span><strong>configs／groups</strong>啟動、必要時及約每 60 分鐘同步</span><span><strong>測試連線</strong>依序檢查三個端點，不寫入監測讀值</span></div><div className="table-wrap"><table className="data-table connection-table"><thead><tr><th>資料來源</th><th>目前狀態</th><th>最近檢查</th><th>訊息</th></tr></thead><tbody>{status.endpoints.map((endpoint) => { const result = endpointResult(endpoint); const source = checkSourceLabel(endpoint); return <tr key={endpoint.endpoint}><td><strong>{endpointName(endpoint.endpoint)}</strong></td><td><StatusChip tone={statusTone(result)}>{statusLabel(result)}</StatusChip></td><td><span>{formatTaipeiDateTime(endpoint.lastCheckedAt)}</span>{source && endpoint.attempted && <small className="endpoint-check-source">{source}</small>}</td><td>{endpointMessage(endpoint)}</td></tr>; })}</tbody></table></div></Panel>
    </>}
  </main>;
}
