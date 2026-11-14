import { openAppDatabase } from "@/server/db/app-database";
import { apiError, ok, requestId } from "@/server/http/api";
import { assertLocalMutation, IMPORT_UPLOAD_LIMITS, importErrorResponse } from "@/server/http/local-mutation";
import { activateImportBatch } from "@/server/import/import-repository";

export const runtime = "nodejs";

export async function POST(request:Request,{params}:{params:Promise<{batchId:string}>}) {
  const id=requestId(); const batchId=Number((await params).batchId);
  if(!Number.isInteger(batchId)||batchId<1)return apiError(id,400,"BATCH_ID_INVALID","批次編號無效");
  const contentLength=Number(request.headers.get("content-length")??0);if(contentLength>IMPORT_UPLOAD_LIMITS.maxJsonBytes)return apiError(id,413,"REQUEST_TOO_LARGE","請求內容超過限制");
  try{assertLocalMutation(request);}catch(error){const safe=importErrorResponse(error);return apiError(id,safe.status,safe.code,safe.message);}
  const db=openAppDatabase();
  try {const body=await request.json() as {currentActiveBatchId?:unknown};const expected=Number(body.currentActiveBatchId);if(!Number.isInteger(expected)||expected<1)return apiError(id,400,"ACTIVE_BATCH_ID_INVALID","目前批次編號無效");activateImportBatch(db,batchId,expected); return ok({batchId,status:"ACTIVE"},id); }
  catch(error){const safe=importErrorResponse(error);return apiError(id,safe.status,safe.code,safe.message);}
  finally {db.close();}
}
