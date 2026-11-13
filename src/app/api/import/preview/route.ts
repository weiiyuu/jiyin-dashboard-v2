import { apiError, ok, requestId } from "@/server/http/api";
import { previewWorkbook } from "@/server/import/workbook-parser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const id = requestId();
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return apiError(id, 400, "IMPORT_FILE_REQUIRED", "請提供 .xlsx 檔案");
    const preview = await previewWorkbook(Buffer.from(await file.arrayBuffer()), file.name);
    return ok({
      originalFileName: preview.originalFileName, fileSha256: preview.fileSha256,
      canonicalFingerprint: preview.canonicalFingerprint, sourceDate: preview.sourceDate,
      alarmSourceStatus: preview.alarmSourceStatus, canConfirm: preview.canConfirm,
      counts: { machine: preview.machineRows.length, environment: preview.environmentRows.length, alarm: preview.alarmRows.length, qualityIssues: preview.qualityIssueRows.length },
      issues: preview.issues,
    }, id);
  } catch (error) {
    return apiError(id, 400, "IMPORT_PREVIEW_FAILED", error instanceof Error ? error.message : "無法解析檔案");
  }
}
