"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImportIssueSummary, type ImportIssue } from "@/components/import-issue-summary";
import { ImportPagination } from "@/components/import-pagination";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorNotice, LoadingState, Panel, StatusChip } from "@/components/ui-states";
import { buildUploadBatches, BULK_IMPORT_LIMITS, confirmablePreviewIds, mergeByClientId, repeatedConfirmableSourceDates, summarizeBulkQueue } from "@/features/imports/bulk-import";
import { confirmPlan, importAlarmSourceLabel, removeSelectedUpload, type SelectedUpload } from "@/features/imports/import-ui-model";
import { ApiClientError, fetchApi, formatBytes } from "@/lib/api-client";

interface QualitySummary {
  acceptance: "ACCEPT" | "ACCEPT_WITH_WARNINGS" | "INVALID" | "REVIEW_REQUIRED";
  arrival: { machineRows: number; environmentRows: number; alarmRows: number; qualityIssueRows: number; quarantinedRows: number };
  eligibility: { greenHours: number; sixStateShare: number; transition: number; environmentAverage: number; environmentMaximum: number; environmentMedian: number; environmentMinimum: number };
  issueLevels: { blocking: number; severe: number; warning: number; info: number };
}
interface Preview {
  clientFileId: string;
  fileName: string;
  sha256: string;
  canonicalFingerprint: string;
  sourceDate: string;
  decision: "INSERT" | "DUPLICATE" | "CONFLICT" | "INVALID";
  acceptance: "ACCEPT" | "ACCEPT_WITH_WARNINGS" | "INVALID" | "REVIEW_REQUIRED";
  qualitySummary: QualitySummary | null;
  activeBatchId: number | null;
  duplicateBatchId: number | null;
  counts: { machine: number; environment: number; alarm: number; qualityIssues: number };
  alarmSourceStatus: string;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}
interface Batch {
  batch_id: number;
  source_date: string;
  original_file_name: string;
  status: "ACTIVE" | "REPLACED" | "FAILED";
  alarm_source_status: string;
  machine_row_count: number;
  environment_row_count: number;
  alarm_row_count: number;
  quality_issue_row_count: number;
  error_count: number;
  warning_count: number;
  created_at_ms: number;
  source_version: number;
  active_batch_id: number | null;
}
interface BatchPage {
  items: Batch[];
  total: number;
  page: number;
  pageSize: 10 | 20 | 50;
  totalPages: number;
  sortBy: "sourceDate" | "importedAt";
  sortDirection: "asc" | "desc";
  overview: { versionCount: number; activeDateCount: number; earliestActiveDate: string | null; latestActiveDate: string | null };
}
type QueueStatus = "SELECTED" | "PREVIEWING" | "READY" | "DUPLICATE" | "BLOCKED" | "CONFIRMING" | "IMPORTED" | "FAILED" | "RECHECK_REQUIRED" | "CANCELLED";
interface QueueEntry { status: QueueStatus; message?: string }
interface OperationProgress { mode: "PREVIEW" | "CONFIRM"; completed: number; total: number; batch: number; batches: number }
interface RejectedSelection { id:string; name:string; size:number; reason:string }

const decisionTone = { INSERT: "success", DUPLICATE: "info", CONFLICT: "warning", INVALID: "error" } as const;
const alarmLabel = importAlarmSourceLabel;
const retryableStatuses = new Set<QueueStatus>(["SELECTED", "FAILED", "RECHECK_REQUIRED", "CANCELLED"]);

function previewLabel(preview: Preview) {
  if (preview.acceptance === "REVIEW_REQUIRED") return "需審閱";
  if (preview.decision === "INVALID") return "驗證失敗，不能匯入";
  if (preview.decision === "DUPLICATE") return "完全重複，略過";
  if (preview.decision === "CONFLICT") return "同日不同版本，需確認替換";
  return preview.acceptance === "ACCEPT_WITH_WARNINGS" ? "可匯入（有提醒）" : "可匯入";
}
function queueLabel(entry: QueueEntry | undefined) {
  if (!entry) return "待檢查";
  return ({ SELECTED: "尚未檢查", PREVIEWING: "檢查中", READY: "待確認", DUPLICATE: "重複略過", BLOCKED: "不能匯入", CONFIRMING: "匯入中", IMPORTED: "匯入成功", FAILED: "檢查失敗", RECHECK_REQUIRED: "需重新檢查", CANCELLED: "尚未檢查" } as const)[entry.status];
}

function queueStatusForPreview(preview: Preview): QueueStatus {
  if (preview.decision === "INVALID" || preview.acceptance === "REVIEW_REQUIRED") return "BLOCKED";
  return preview.decision === "DUPLICATE" ? "DUPLICATE" : "READY";
}
function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
function formatImportedAt(value: number) {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
}

export default function ImportsPage() {
  const [selected, setSelected] = useState<SelectedUpload[]>([]);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [queue, setQueue] = useState<Record<string, QueueEntry>>({});
  const [rejected, setRejected] = useState<RejectedSelection[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<OperationProgress | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchLoading, setBatchLoading] = useState(true);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchDateFilter, setBatchDateFilter] = useState("");
  const [batchFileFilter, setBatchFileFilter] = useState("");
  const [batchPage, setBatchPage] = useState(1);
  const [batchPageSize, setBatchPageSize] = useState<10 | 20 | 50>(10);
  const [batchSortBy, setBatchSortBy] = useState<"sourceDate" | "importedAt">("sourceDate");
  const [batchSortDirection, setBatchSortDirection] = useState<"asc" | "desc">("desc");
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchPages, setBatchPages] = useState(1);
  const [batchOverview, setBatchOverview] = useState<BatchPage["overview"]>({ versionCount: 0, activeDateCount: 0, earliestActiveDate: null, latestActiveDate: null });
  const [expandedBatchId, setExpandedBatchId] = useState<number | null>(null);

  const loadBatches = useCallback(async () => {
    setBatchLoading(true);
    setBatchError(null);
    const parameters = new URLSearchParams({ page: String(batchPage), pageSize: String(batchPageSize), sortBy: batchSortBy, sortDirection: batchSortDirection });
    if (batchDateFilter) parameters.set("sourceDate", batchDateFilter);
    if (batchFileFilter.trim()) parameters.set("fileQuery", batchFileFilter.trim());
    try {
      const data = await fetchApi<BatchPage>(`/api/imports?${parameters}`);
      setBatches(data.items);
      setBatchTotal(data.total);
      setBatchPages(data.totalPages);
      setBatchOverview(data.overview);
      if (data.page !== batchPage) setBatchPage(data.page);
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : "無法讀取版本記錄");
    } finally {
      setBatchLoading(false);
    }
  }, [batchDateFilter, batchFileFilter, batchPage, batchPageSize, batchSortBy, batchSortDirection, setBatchPage]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadBatches(), 200);
    return () => window.clearTimeout(timeout);
  }, [loadBatches]);

  const previewById = useMemo(() => new Map(previews.map((item) => [item.clientFileId, item])), [previews]);
  const totalBytes = selected.reduce((sum, item) => sum + item.file.size, 0);
  const uploadBatches = useMemo(() => buildUploadBatches(selected), [selected]);
  const repeatedDates = useMemo(() => repeatedConfirmableSourceDates(previews), [previews]);
  const repeatedIds = useMemo(() => new Set([...repeatedDates.values()].flat()), [repeatedDates]);
  const retryCandidates = selected.filter((item) => retryableStatuses.has(queue[item.id]?.status ?? "SELECTED"));

  function resetPreview(nextSelected: SelectedUpload[]) {
    setPreviews([]);
    setApproved({});
    setQueue(Object.fromEntries(nextSelected.map((item) => [item.id, { status: "SELECTED" } satisfies QueueEntry])));
    setProgress(null);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const keys = new Set(selected.map((item) => `${item.file.name}|${item.file.size}|${item.file.lastModified}`));
    const accepted: SelectedUpload[] = [];
    const rejectedNow:RejectedSelection[]=[];
    const ignored: string[] = [];
    for (const file of Array.from(list)) {
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (keys.has(key)) { ignored.push(`${file.name} 已在清單中`); rejectedNow.push({id:crypto.randomUUID(),name:file.name,size:file.size,reason:"重複選取，未加入處理佇列"}); continue; }
      if (!file.name.toLowerCase().endsWith(".xlsx")) { ignored.push(`${file.name} 不是 .xlsx`); rejectedNow.push({id:crypto.randomUUID(),name:file.name,size:file.size,reason:"不是標準化 .xlsx 檔案"}); continue; }
      if (file.size === 0 || file.size > BULK_IMPORT_LIMITS.maxFileBytes) { ignored.push(`${file.name} 超過單檔 25 MiB 上限或是空檔`); rejectedNow.push({id:crypto.randomUUID(),name:file.name,size:file.size,reason:file.size===0?"空檔案，不能處理":"超過單檔 25 MiB 上限"}); continue; }
      accepted.push({ id: crypto.randomUUID(), file });
      keys.add(key);
    }
    const next = [...selected, ...accepted];
    setSelected(next);
    setRejected((current)=>[...current,...rejectedNow]);
    resetPreview(next);
    setMessage(ignored.length ? { tone: "warning", text: `已加入 ${accepted.length} 份；另有 ${ignored.length} 份未加入。${ignored.slice(0, 2).join("；")}${ignored.length > 2 ? "。" : ""}` } : null);
  }

  function removeFile(id: string) {
    setSelected((current) => removeSelectedUpload(current, id));
    setPreviews((current) => current.filter((preview) => preview.clientFileId !== id));
    setApproved((current) => { const next = { ...current }; delete next[id]; return next; });
    setQueue((current) => { const next = { ...current }; delete next[id]; return next; });
  }

  function updateQueue(ids: string[], value: QueueEntry | ((current: QueueEntry | undefined) => QueueEntry)) {
    setQueue((current) => {
      const next = { ...current };
      ids.forEach((id) => { next[id] = typeof value === "function" ? value(current[id]) : value; });
      return next;
    });
  }

  async function previewFiles(targets: SelectedUpload[], keepExisting: boolean) {
    if (!targets.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setMessage(null);
    const targetIds = new Set(targets.map((item) => item.id));
    const order = selected.map((item) => item.id);
    let merged = keepExisting ? previews.filter((item) => !targetIds.has(item.clientFileId)) : [];
    const groups = buildUploadBatches(targets);
    let completed = 0;
    let failed = 0;
    let cancelled = false;
    const processedIds = new Set<string>();
    updateQueue(targets.map((item) => item.id), { status: "SELECTED" });
    try {
      for (const [batchIndex, group] of groups.entries()) {
        if (controller.signal.aborted) { cancelled = true; break; }
        const ids = group.map((item) => item.id);
        updateQueue(ids, { status: "PREVIEWING" });
        setProgress({ mode: "PREVIEW", completed, total: targets.length, batch: batchIndex + 1, batches: groups.length });
        const form = new FormData();
        group.forEach((item) => { form.append("files", item.file); form.append("clientFileId", item.id); });
        try {
          const data = await fetchApi<{ files: Preview[] }>("/api/imports/preview", { method: "POST", body: form, signal: controller.signal });
          merged = mergeByClientId(merged, data.files, order);
          setPreviews(merged);
          setQueue((current) => {
            const next = { ...current };
            data.files.forEach((item) => {
              next[item.clientFileId] = { status: queueStatusForPreview(item) };
            });
            return next;
          });
        } catch (error) {
          if (isAbortError(error)) {
            updateQueue(ids, { status: "CANCELLED", message: "操作已取消，尚未確認結果" });
            ids.forEach((id) => processedIds.add(id));
            cancelled = true;
            break;
          }
          failed += group.length;
          updateQueue(ids, { status: "FAILED", message: error instanceof Error ? error.message : "批次檢查失敗" });
        }
        ids.forEach((id) => processedIds.add(id));
        completed += group.length;
        setProgress({ mode: "PREVIEW", completed, total: targets.length, batch: batchIndex + 1, batches: groups.length });
      }
      if (cancelled) {
        const untouched = targets.filter((item) => !processedIds.has(item.id)).map((item) => item.id);
        updateQueue(untouched, { status: "CANCELLED", message: "操作已取消" });
        const partialRepeatedIds = new Set([...repeatedConfirmableSourceDates(merged).values()].flat());
        const partialStatuses = Object.fromEntries(merged.map((item) => [item.clientFileId, queueStatusForPreview(item)]));
        const partialConfirmable = confirmablePreviewIds(merged, partialRepeatedIds, approved, partialStatuses).length;
        const unchecked = selected.length - merged.length;
        setMessage({ tone: "warning", text: `已完成 ${merged.length} 份檢查${partialConfirmable ? `，可先匯入 ${partialConfirmable} 份已檢查檔案` : ""}；另外 ${unchecked} 份尚未檢查，不會在本次匯入。` });
      } else if (failed) {
        setMessage({ tone: "warning", text: `已完成部分檢查，${failed} 份因批次請求失敗尚未取得結果；請重新檢查未完成檔案。` });
      } else {
        setMessage({ tone: merged.some((item) => item.errors.length) ? "warning" : "success", text: `已完成 ${targets.length} 份匯入前檢查，尚未寫入平台資料庫。` });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  }

  async function confirmOne(item: SelectedUpload, preview: Preview, signal: AbortSignal) {
    const plan = confirmPlan(preview, Boolean(approved[item.id]));
    if (!plan.allowed || !plan.action) return null;
    const form = new FormData();
    form.append("file", item.file);
    form.append("expectedSha256", preview.sha256);
    form.append("expectedCanonicalFingerprint", preview.canonicalFingerprint);
    form.append("action", plan.action);
    form.append("expectedActiveBatchId", preview.activeBatchId?.toString() ?? "");
    return fetchApi<{ result: "IMPORTED" | "REPLACED" | "DUPLICATE" }>("/api/imports/confirm", { method: "POST", body: form, signal });
  }

  async function confirmAll() {
    const targets = selected.filter((item) => confirmCandidateIds.has(item.id));
    if (!targets.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setMessage(null);
    const groups = buildUploadBatches(targets);
    let completed = 0;
    let success = 0;
    let duplicates = 0;
    let failed = 0;
    let cancelled = false;
    const processedIds = new Set<string>();
    outer: for (const [batchIndex, group] of groups.entries()) {
      for (const item of group) {
        if (controller.signal.aborted) { cancelled = true; break outer; }
        const preview = previewById.get(item.id)!;
        updateQueue([item.id], { status: "CONFIRMING" });
        setProgress({ mode: "CONFIRM", completed, total: targets.length, batch: batchIndex + 1, batches: groups.length });
        try {
          const result = await confirmOne(item, preview, controller.signal);
          if (result?.result === "DUPLICATE") {
            duplicates++;
            updateQueue([item.id], { status: "DUPLICATE", message: "資料庫已有相同內容，未重複寫入" });
          } else {
            success++;
            updateQueue([item.id], { status: "IMPORTED" });
          }
        } catch (error) {
          if (isAbortError(error)) {
            updateQueue([item.id], { status: "RECHECK_REQUIRED", message: "回應中斷，請重新檢查資料庫狀態" });
            processedIds.add(item.id);
            cancelled = true;
            break outer;
          }
          failed++;
          const recheck = error instanceof ApiClientError && ["ACTIVE_VERSION_CHANGED", "PREVIEW_FINGERPRINT_CHANGED"].includes(error.code);
          updateQueue([item.id], { status: recheck ? "RECHECK_REQUIRED" : "FAILED", message: error instanceof Error ? error.message : "匯入失敗" });
        }
        processedIds.add(item.id);
        completed++;
        setProgress({ mode: "CONFIRM", completed, total: targets.length, batch: batchIndex + 1, batches: groups.length });
      }
    }
    if (cancelled) {
      const pending = targets.filter((item) => !processedIds.has(item.id)).map((item) => item.id);
      updateQueue(pending, { status: "CANCELLED", message: "尚未執行；重試前會重新檢查" });
    }
    if (success || duplicates) await loadBatches();
    setMessage({
      tone: failed || cancelled ? "warning" : "success",
      text: cancelled
        ? `已停止後續匯入；成功 ${success} 份、重複略過 ${duplicates} 份。回應中斷或未完成項目請重新檢查後再匯入。`
        : failed
          ? `部分完成：成功 ${success} 份、重複略過 ${duplicates} 份、失敗 ${failed} 份；已完成資料會保留。`
          : `匯入完成：成功 ${success} 份、重複略過 ${duplicates} 份。`,
    });
    abortRef.current = null;
    setBusy(false);
    setProgress(null);
  }

  async function activate(batch: Batch) {
    if (!batch.active_batch_id || !window.confirm(`確定將 ${batch.original_file_name} 回復為 ${batch.source_date} 的啟用版本？`)) return;
    setBusy(true);
    try {
      await fetchApi(`/api/imports/${batch.batch_id}/activate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentActiveBatchId: batch.active_batch_id }) });
      setMessage({ tone: "success", text: "版本已回復，歷史頁面下次查詢會使用新的啟用版本。" });
      await loadBatches();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof ApiClientError && error.code === "ACTIVE_VERSION_CHANGED" ? "啟用版本已變更，已重新載入版本清單。" : error instanceof Error ? error.message : "版本回復失敗" });
      await loadBatches();
    } finally {
      setBusy(false);
    }
  }

  function toggleBatchSort(column: "sourceDate" | "importedAt") {
    setBatchPage(1);
    if (batchSortBy === column) setBatchSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else { setBatchSortBy(column); setBatchSortDirection("desc"); }
  }

  const confirmCandidateIds = new Set(confirmablePreviewIds(previews, repeatedIds, approved, Object.fromEntries(Object.entries(queue).map(([id, entry]) => [id, entry.status]))));
  const confirmable = confirmCandidateIds.size > 0;
  const confirmCandidatePreviews = previews.filter((item) => confirmCandidateIds.has(item.clientFileId));
  const queueBreakdown = summarizeBulkQueue(selected.map((item) => item.id), new Set(previews.map((item) => item.clientFileId)), Object.fromEntries(Object.entries(queue).map(([id, entry]) => [id, entry.status])));
  const batchSummary = {
    files: selected.length,
    checked: previews.length,
    inserts: previews.filter((item) => item.decision === "INSERT").length,
    duplicates: previews.filter((item) => item.decision === "DUPLICATE").length,
    conflicts: previews.filter((item) => item.decision === "CONFLICT").length,
    warnings: previews.filter((item) => item.acceptance === "ACCEPT_WITH_WARNINGS").length,
    blocked: previews.filter((item) => item.decision === "INVALID" || item.acceptance === "REVIEW_REQUIRED").length,
    unchecked: queueBreakdown.unchecked,
    failed: queueBreakdown.failed,
    recheck: queueBreakdown.recheck,
    imported: Object.values(queue).filter((item) => item.status === "IMPORTED").length,
  };
  const confirmationSummary = `本次將新增 ${confirmCandidatePreviews.filter((item) => item.decision === "INSERT").length} 份、略過 ${batchSummary.duplicates} 份、替換 ${confirmCandidatePreviews.filter((item) => item.decision === "CONFLICT").length} 份；${batchSummary.unchecked ? `另有 ${batchSummary.unchecked} 份尚未檢查，不納入本次匯入。` : "其餘不能匯入、尚未確認或需重新檢查。"}`;
  const confirmButtonLabel = batchSummary.unchecked > 0 && confirmCandidateIds.size > 0 ? `先匯入 ${confirmCandidateIds.size} 份已檢查檔案` : "匯入已確認檔案";

  return <main className="page">
    <PageHeader eyebrow="資料管理 / 歷史資料" title="Excel 資料匯入" description="一次選取大量標準化工作簿；系統會自動分批檢查，再以每檔獨立交易循序匯入。" tag="標準化 .XLSX"/>
    {message && <div className={`notice ${message.tone} import-page-message`}><span>{message.tone === "success" ? "✓" : "!"}</span><div>{message.text}</div></div>}
    <div className="import-sections">
      <section className="import-section" data-import-section="selection">
        <Panel title="Excel 匯入操作" subtitle="可一次選取多份；單次請求最多 8 份、單檔 25 MiB，系統以 49 MiB 檔案合計自動分批">
          <div className="panel-body import-operation-body">
            <details className="import-rules"><summary><span>查看匯入規則</span><span>保存、分批與版本切換原則</span></summary><div className="import-rule-grid"><div className="notice"><span>01</span><div><strong>檢查不會寫入</strong><div>系統循序檢查各批；空值與資料提醒會保留。</div></div></div><div className="notice"><span>02</span><div><strong>不同批次各自提交</strong><div>已成功資料會保留；後續失敗不會回滾先前批次。</div></div></div><div className="notice"><span>03</span><div><strong>安全版本切換</strong><div>同日不同版本須逐檔確認；啟用版本變動時會要求重新檢查。</div></div></div></div></details>
            <div className="drop-zone import-drop-zone"><input aria-label="選擇標準化 Excel" type="file" accept=".xlsx" multiple disabled={busy} onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }}/><div><div className="empty-icon">⇧</div><strong>一次選擇所有 Excel 檔案</strong><p>系統自動分批；選取後仍可逐檔移除，不會改寫來源工作簿。</p></div></div>
            {selected.length + rejected.length > 0 && <><div className="selection-summary"><span>已選 {selected.length + rejected.length} 份 · 可處理 {selected.length} 份（{formatBytes(totalBytes)}）· 自動分為 {uploadBatches.length} 批{rejected.length?` · ${rejected.length} 份未加入處理`:""}</span><button className="button ghost" disabled={busy} onClick={() => { setSelected([]); setRejected([]); resetPreview([]); setMessage(null); }}>全部清除</button></div><div className="file-list import-file-list">{selected.map((item) => <div className="file-item" key={item.id}><div className="file-item-copy"><div className="file-name" title={item.file.name}>{item.file.name}</div><div className="file-meta">{formatBytes(item.file.size)} · {queueLabel(queue[item.id])}{queue[item.id]?.message ? ` · ${queue[item.id].message}` : ""}</div></div><button className="button danger" disabled={busy || queue[item.id]?.status === "IMPORTED"} onClick={() => removeFile(item.id)}>移除</button></div>)}{rejected.map((item)=><div className="file-item file-item-rejected" key={item.id}><div className="file-item-copy"><div className="file-name" title={item.name}>{item.name}</div><div className="file-meta">{formatBytes(item.size)} · 不能處理 · {item.reason}</div></div><button className="button danger" disabled={busy} onClick={()=>setRejected((current)=>current.filter((entry)=>entry.id!==item.id))}>移除</button></div>)}</div></>}
            {progress && <div className="import-operation-progress" role="status"><div><strong>{progress.mode === "PREVIEW" ? "正在分批檢查" : "正在循序匯入"}</strong><span>第 {progress.batch} / {progress.batches} 批 · 已處理 {progress.completed} / {progress.total} 份</span></div><progress value={progress.completed} max={progress.total}/></div>}
            <div className="import-primary-actions"><button className="button primary" disabled={!selected.length || busy} onClick={() => void previewFiles(selected, false)}>{busy ? "處理中…" : "檢查全部檔案"}</button>{retryCandidates.length > 0 && previews.length > 0 && <button className="button" disabled={busy} onClick={() => void previewFiles(retryCandidates, true)}>重新檢查未完成（{retryCandidates.length}）</button>}{busy && <button className="button danger" onClick={() => abortRef.current?.abort()}>停止後續處理</button>}<span className="metric-note">Preview 不寫入資料庫；各批依序處理，不會同時占用 SQLite。</span></div>
          </div>
        </Panel>
      </section>

      {previews.length > 0 && <section className="import-section" data-import-section="preview"><Panel title="匯入前檢查" subtitle="先確認整體結果，再循序匯入；不同批次不是同一個大型交易" actions={<button className="button primary" disabled={!confirmable || busy} onClick={() => void confirmAll()}>{busy ? "匯入處理中…" : confirmButtonLabel}</button>}>
        <div className="preview-batch-summary bulk-preview-summary"><div><span>已選檔案</span><strong>{batchSummary.files}</strong></div><div><span>已完成檢查</span><strong>{batchSummary.checked}</strong></div><div><span>可新增</span><strong>{batchSummary.inserts}</strong></div><div><span>完全重複</span><strong>{batchSummary.duplicates}</strong></div><div><span>需確認替換</span><strong>{batchSummary.conflicts}</strong></div><div><span>有資料提醒</span><strong>{batchSummary.warnings}</strong></div><div><span>不能匯入</span><strong>{batchSummary.blocked}</strong></div><div><span>尚未檢查</span><strong>{batchSummary.unchecked}</strong></div></div>
        <div className="preview-confirm-summary">{confirmationSummary}</div>
        <div className="import-result-progress"><span>匯入成功 <strong>{batchSummary.imported}</strong></span><span>重複略過 <strong>{Object.values(queue).filter((item) => item.status === "DUPLICATE").length}</strong></span><span>檢查失敗 <strong>{batchSummary.failed}</strong></span><span>需重新檢查 <strong>{batchSummary.recheck}</strong></span></div>
        {repeatedDates.size > 0 && <div className="notice warning import-selection-conflict"><span>!</span><div><strong>同一批選取中有重複來源日期</strong><p>{[...repeatedDates.entries()].map(([date, ids]) => `${date}（${ids.length} 份）`).join("、")}。請每個日期只保留一份後再匯入，系統不會依檔案順序自動覆寫。</p></div></div>}
        <div className="preview-compact-list">{selected.map((file) => { const p = previewById.get(file.id); if (!p) return null; const quality = p.qualitySummary; const repeated = repeatedIds.has(file.id); return <details className={`preview-row ${p.decision.toLowerCase()}`} key={file.id} open={p.decision === "INVALID" || repeated}><summary><div className="preview-row-identity"><strong>{p.sourceDate || "來源日期無效"}</strong><span title={p.fileName}>{p.fileName}</span></div><StatusChip tone={repeated ? "error" : decisionTone[p.decision]}>{repeated ? "同日多檔，暫停匯入" : queue[file.id]?.status === "IMPORTED" ? "匯入成功" : previewLabel(p)}</StatusChip><div className="preview-row-problems"><strong>{p.errors.length} 錯誤 · {p.warnings.length} 提醒</strong><span>資料筆數：機台 {p.counts.machine.toLocaleString()}、環境 {p.counts.environment.toLocaleString()}、警示 {p.counts.alarm.toLocaleString()}</span></div><span className="preview-detail-link">展開詳情</span></summary><div className="preview-row-detail"><div className="preview-facts"><span>警示資料：{alarmLabel(p.alarmSourceStatus)}</span><span>不可匯入：{p.errors.length}</span><span>資料提醒：{p.warnings.length} 項</span><span>原始資料異常列：{p.counts.qualityIssues}</span></div>{quality && <div className="eligibility-summary"><div><span>已讀取資料</span><strong>機台 {quality.arrival.machineRows} 筆 / 環境 {quality.arrival.environmentRows} 筆</strong></div><div><span>可用於加工分析</span><strong>{quality.eligibility.greenHours} / {quality.arrival.machineRows}</strong></div><div><span>可用於燈號分析</span><strong>{quality.eligibility.sixStateShare} / {quality.arrival.machineRows}</strong></div><div><span>可用於環境平均</span><strong>{quality.eligibility.environmentAverage} / {quality.arrival.environmentRows}</strong></div></div>}{repeated && <div className="notice warning">相同來源日期出現多份候選檔案；請移除多餘檔案，不會自動選擇或覆寫。</div>}{p.activeBatchId && <div className="notice warning">目前已有啟用版本；勾選後才會整日替換。後端批次編號保留供追溯。</div>}<ImportIssueSummary title="不可匯入" items={p.errors}/><ImportIssueSummary title="資料提醒" items={p.warnings}/><div className="preview-confirm">{repeated ? "同日多檔尚未排除，不能匯入" : p.decision === "CONFLICT" ? <label className="replace-check"><input type="checkbox" checked={Boolean(approved[file.id])} disabled={queue[file.id]?.status === "IMPORTED"} onChange={(event) => setApproved((old) => ({ ...old, [file.id]: event.target.checked }))}/>確認以此檔整日替換目前啟用版本</label> : p.decision === "DUPLICATE" ? "完全重複，匯入時會略過且不重複寫入" : p.errors.length ? "此檔不可匯入；請依上方錯誤修正後重新檢查" : queue[file.id]?.status === "IMPORTED" ? "已完成匯入；此檔不會再次提交" : "可匯入；來源缺值會保留空值，不自動補 0"}</div></div></details>; })}</div>
      </Panel></section>}

      <section className="import-section" data-import-section="history"><Panel title="匯入版本記錄" subtitle="同一來源日只會有一個啟用版本；Batch ID 保留在版本詳情中供追溯">
        {batchError ? <div className="panel-body"><ErrorNotice message={batchError} onRetry={loadBatches}/></div> : <><div className="version-overview"><div><span>已匯入日數</span><strong>{batchOverview.activeDateCount}</strong></div><div><span>最早日期</span><strong>{batchOverview.earliestActiveDate ?? "—"}</strong></div><div><span>最近日期</span><strong>{batchOverview.latestActiveDate ?? "—"}</strong></div><div><span>版本總數</span><strong>{batchOverview.versionCount}</strong></div></div><div className="version-toolbar"><label className="version-filter"><span>來源日期</span><input aria-label="查詢來源日期" className="control" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" maxLength={10} value={batchDateFilter} onChange={(event) => { setBatchDateFilter(event.target.value.replace(/[^0-9-]/g, "").slice(0, 10)); setBatchPage(1); }}/></label><label className="version-filter version-file-filter"><span>來源檔名</span><input aria-label="搜尋來源檔名" className="control" placeholder="輸入部分檔名" value={batchFileFilter} onChange={(event) => { setBatchFileFilter(event.target.value); setBatchPage(1); }}/></label><label className="version-filter version-page-size"><span>每頁筆數</span><select aria-label="每頁筆數" className="control" value={batchPageSize} onChange={(event) => { setBatchPageSize(Number(event.target.value) as 10 | 20 | 50); setBatchPage(1); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><div className="version-result-count">{batchLoading ? "讀取中…" : `共 ${batchTotal} 筆結果`}</div></div>{batchLoading ? <LoadingState/> : batches.length === 0 ? <EmptyState icon="▤" title={batchOverview.versionCount ? "查無符合的版本" : "尚無匯入記錄"} description={batchOverview.versionCount ? "請調整來源日期或檔名條件。" : "完成第一份標準化 Excel 匯入後，版本與啟用狀態會顯示在這裡。"}/> : <><div className="table-wrap version-table-wrap"><table className="data-table version-table"><thead><tr><th aria-sort={batchSortBy === "sourceDate" ? (batchSortDirection === "asc" ? "ascending" : "descending") : "none"}><button className="sort-button" onClick={() => toggleBatchSort("sourceDate")}>來源日期 <span>{batchSortBy === "sourceDate" ? (batchSortDirection === "asc" ? "↑" : "↓") : "↕"}</span></button></th><th aria-sort={batchSortBy === "importedAt" ? (batchSortDirection === "asc" ? "ascending" : "descending") : "none"}><button className="sort-button" onClick={() => toggleBatchSort("importedAt")}>匯入時間 <span>{batchSortBy === "importedAt" ? (batchSortDirection === "asc" ? "↑" : "↓") : "↕"}</span></button></th><th>來源檔案</th><th>機台 / 環境 / 警示</th><th>品質</th><th>操作</th></tr></thead><tbody>{batches.map((batch) => <Fragment key={batch.batch_id}><tr><td className="version-source-date">{batch.source_date}</td><td className="version-time">{formatImportedAt(batch.created_at_ms)}</td><td><span className="version-file-name" title={batch.original_file_name}>{batch.original_file_name}</span></td><td>{batch.machine_row_count.toLocaleString()} / {batch.environment_row_count.toLocaleString()} / {batch.alarm_row_count.toLocaleString()}</td><td>{batch.warning_count ? `${batch.warning_count.toLocaleString()} 項資料提醒` : "無資料提醒"}</td><td><button className="button ghost" aria-expanded={expandedBatchId === batch.batch_id} onClick={() => setExpandedBatchId((current) => current === batch.batch_id ? null : batch.batch_id)}>{expandedBatchId === batch.batch_id ? "收合詳情" : "查看詳情"}</button></td></tr>{expandedBatchId === batch.batch_id && <tr className="version-detail-row"><td colSpan={6}><div className="version-detail-panel"><dl><div><dt>Batch ID</dt><dd>#{batch.batch_id}</dd></div><div><dt>同日版本</dt><dd>v{batch.source_version}</dd></div><div><dt>版本狀態</dt><dd><StatusChip tone={batch.status === "ACTIVE" ? "success" : "info"}>{batch.status === "ACTIVE" ? "啟用版本" : batch.status === "REPLACED" ? "已取代版本" : "未啟用"}</StatusChip></dd></div><div><dt>完整來源檔名</dt><dd>{batch.original_file_name}</dd></div><div><dt>匯入時間</dt><dd>{formatImportedAt(batch.created_at_ms)}</dd></div><div><dt>警示資料狀況</dt><dd>{alarmLabel(batch.alarm_source_status)}</dd></div></dl>{batch.status === "REPLACED" && <button className="button version-action" disabled={busy} onClick={() => void activate(batch)}>回復此版本</button>}</div></td></tr>}</Fragment>)}</tbody></table></div><ImportPagination key={`${batchPage}-${batchPages}`} page={batchPage} totalPages={batchPages} total={batchTotal} loading={batchLoading} onPageChange={setBatchPage}/></>}
        </>}
      </Panel></section>
    </div>
  </main>;
}
