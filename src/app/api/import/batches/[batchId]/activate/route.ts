import { openAppDatabase } from "@/server/db/app-database";
import { apiError, ok, requestId } from "@/server/http/api";
import { activateImportBatch } from "@/server/import/import-repository";

export const runtime = "nodejs";

export async function POST(_request:Request,{params}:{params:Promise<{batchId:string}>}) {
  const id=requestId(); const batchId=Number((await params).batchId);
  if(!Number.isInteger(batchId)||batchId<1)return apiError(id,400,"BATCH_ID_INVALID","批次編號無效");
  const db=openAppDatabase();
  try { activateImportBatch(db,batchId); return ok({batchId,status:"ACTIVE"},id); }
  catch(error){return apiError(id,409,"BATCH_ACTIVATE_FAILED",error instanceof Error?error.message:"無法啟用批次");}
  finally {db.close();}
}
