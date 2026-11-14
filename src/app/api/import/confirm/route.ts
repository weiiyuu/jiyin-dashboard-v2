import { openAppDatabase } from "@/server/db/app-database";
import { apiError, ok, reportUnexpectedError, requestId } from "@/server/http/api";
import { assertLocalMutation, importErrorResponse, validateXlsxFile } from "@/server/http/local-mutation";
import { confirmImport } from "@/server/import/import-repository";
import { previewWorkbook } from "@/server/import/workbook-parser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const id = requestId();
  try {
    assertLocalMutation(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("IMPORT_FILE_REQUIRED");
    validateXlsxFile(file);
    const preview = await previewWorkbook(Buffer.from(await file.arrayBuffer()), file.name);
    if (!preview.canConfirm) throw new Error("IMPORT_VALIDATION_FAILED");
    if(form.get("expectedSha256")!==preview.fileSha256||form.get("expectedCanonicalFingerprint")!==preview.canonicalFingerprint)throw new Error("PREVIEW_FINGERPRINT_CHANGED");
    const action=form.get("action");if(action!=="INSERT"&&action!=="REPLACE")throw new Error("IMPORT_VALIDATION_FAILED");
    const rawActive=form.get("expectedActiveBatchId");const expectedActiveBatchId=rawActive===null||rawActive===""?null:Number(rawActive);
    if(expectedActiveBatchId!==null&&(!Number.isInteger(expectedActiveBatchId)||expectedActiveBatchId<1))throw new Error("IMPORT_VALIDATION_FAILED");
    if(action==="REPLACE"&&expectedActiveBatchId===null)throw new Error("IMPORT_VALIDATION_FAILED");
    const db = openAppDatabase();
    try {
      const result = confirmImport(db, preview, { replace: action === "REPLACE", expectedActiveBatchId });
      const status = result.outcome === "CONFLICT" ? 409 : 200;
      return ok({result:result.outcome,...result,sourceDate:preview.sourceDate,counts:{machine:preview.machineRows.length,environment:preview.environmentRows.length,alarm:preview.alarmRows.length,qualityIssues:preview.qualityIssueRows.length}}, id, { status });
    } finally { db.close(); }
  } catch (error) {
    const safe=importErrorResponse(error);if(safe.status===500)reportUnexpectedError(id,"import-confirm",error);return apiError(id,safe.status,safe.code,safe.message);
  }
}
