import { openAppDatabase } from "@/server/db/app-database";
import { apiError, ok, requestId } from "@/server/http/api";
import { confirmImport } from "@/server/import/import-repository";
import { previewWorkbook } from "@/server/import/workbook-parser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const id = requestId();
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return apiError(id, 400, "IMPORT_FILE_REQUIRED", "請重新提供 .xlsx 檔案");
    const preview = await previewWorkbook(Buffer.from(await file.arrayBuffer()), file.name);
    if (!preview.canConfirm) return apiError(id, 422, "IMPORT_VALIDATION_FAILED", "檔案未通過契約驗證");
    const db = openAppDatabase();
    try {
      const result = confirmImport(db, preview, { replace: form.get("replace") === "true" });
      const status = result.outcome === "CONFLICT" ? 409 : 200;
      return ok(result, id, { status });
    } finally { db.close(); }
  } catch (error) {
    const message = error instanceof Error ? error.message : "匯入失敗";
    return apiError(id, message === "ALARM_REPLACEMENT_REGRESSION" ? 409 : 400, message, message);
  }
}
