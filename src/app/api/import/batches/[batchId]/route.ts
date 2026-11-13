import { openAppDatabase } from "@/server/db/app-database";
import { apiError, ok, requestId } from "@/server/http/api";

export const runtime = "nodejs";

export async function GET(_request:Request,{params}:{params:Promise<{batchId:string}>}) {
  const id=requestId(); const batchId=Number((await params).batchId);
  if(!Number.isInteger(batchId)||batchId<1)return apiError(id,400,"BATCH_ID_INVALID","批次編號無效");
  const db=openAppDatabase();
  try {
    const batch=db.prepare("SELECT * FROM import_batches WHERE batch_id=?").get(batchId);
    if(!batch)return apiError(id,404,"BATCH_NOT_FOUND","找不到匯入批次");
    const issues=db.prepare("SELECT rule_code,severity,sheet_name,source_row_number,column_name,metric_scope,message_safe FROM validation_issues WHERE batch_id=? ORDER BY issue_id").all(batchId);
    return ok({batch,issues},id);
  } finally {db.close();}
}
