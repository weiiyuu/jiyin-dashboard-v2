import { confirmPlan, type PreviewDecision, type SelectedUpload } from "./import-ui-model";

const MIB = 1024 * 1024;

export const BULK_IMPORT_LIMITS = {
  maxFilesPerBatch: 8,
  maxFileBytes: 25 * MIB,
  serverMaxBatchFileBytes: 50 * MIB,
  clientMaxBatchFileBytes: 49 * MIB,
} as const;

export type PaginationItem = number | "ellipsis";
export type PageInputResult = { page: number; error: null } | { page: null; error: string };
export interface BulkQueueBreakdown { unchecked: number; failed: number; recheck: number }

export function buildUploadBatches(files: SelectedUpload[]): SelectedUpload[][] {
  const batches: SelectedUpload[][] = [];
  let current: SelectedUpload[] = [];
  let currentBytes = 0;
  for (const item of files) {
    if (item.file.size > BULK_IMPORT_LIMITS.maxFileBytes) continue;
    const mustStartNext = current.length >= BULK_IMPORT_LIMITS.maxFilesPerBatch
      || currentBytes + item.file.size > BULK_IMPORT_LIMITS.clientMaxBatchFileBytes;
    if (mustStartNext && current.length) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += item.file.size;
  }
  if (current.length) batches.push(current);
  return batches;
}

export function mergeByClientId<T extends { clientFileId: string }>(
  current: T[],
  incoming: T[],
  order: string[],
): T[] {
  const byId = new Map(current.map((item) => [item.clientFileId, item]));
  for (const item of incoming) byId.set(item.clientFileId, item);
  return order.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

export function repeatedConfirmableSourceDates(
  previews: Array<{ clientFileId: string; sourceDate: string; decision: string; errors: unknown[] }>,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const preview of previews) {
    if (!preview.sourceDate || preview.errors.length || !["INSERT", "CONFLICT"].includes(preview.decision)) continue;
    grouped.set(preview.sourceDate, [...(grouped.get(preview.sourceDate) ?? []), preview.clientFileId]);
  }
  return new Map([...grouped].filter(([, ids]) => ids.length > 1));
}

export function confirmablePreviewIds(
  previews: Array<PreviewDecision & { clientFileId: string }>,
  repeatedIds: ReadonlySet<string>,
  approved: Readonly<Record<string, boolean>>,
  statusById: Readonly<Record<string, string | undefined>>,
): string[] {
  return previews.flatMap((preview) => {
    if (repeatedIds.has(preview.clientFileId) || statusById[preview.clientFileId] !== "READY") return [];
    return confirmPlan(preview, Boolean(approved[preview.clientFileId])).allowed ? [preview.clientFileId] : [];
  });
}

export function summarizeBulkQueue(
  selectedIds: string[],
  previewIds: ReadonlySet<string>,
  statusById: Readonly<Record<string, string | undefined>>,
): BulkQueueBreakdown {
  return selectedIds.reduce<BulkQueueBreakdown>((summary, id) => {
    const status = statusById[id];
    if (!previewIds.has(id) && status !== "FAILED" && status !== "RECHECK_REQUIRED") summary.unchecked++;
    if (status === "FAILED") summary.failed++;
    if (status === "RECHECK_REQUIRED") summary.recheck++;
    return summary;
  }, { unchecked: 0, failed: 0, recheck: 0 });
}

export function paginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 1) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 3) [2, 3, 4].forEach((page) => pages.add(page));
  if (currentPage >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) => pages.add(page));
  const ordered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const result: PaginationItem[] = [];
  ordered.forEach((page, index) => {
    if (index && page - ordered[index - 1] > 1) result.push("ellipsis");
    result.push(page);
  });
  return result;
}

export function parsePageInput(input:string,totalPages:number):PageInputResult{
  if(!/^\d+$/.test(input))return{page:null,error:"請輸入有效頁碼"};
  const page=Number(input);
  if(!Number.isInteger(page)||page<1||page>totalPages)return{page:null,error:`頁碼須介於 1 至 ${totalPages}`};
  return{page,error:null};
}
