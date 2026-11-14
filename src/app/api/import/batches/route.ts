import { openAppDatabase } from "@/server/db/app-database";
import { ok, requestId } from "@/server/http/api";
import { listImportBatches, listImportBatchesPage, type ImportBatchPageQuery } from "@/server/import/import-repository";

export const runtime = "nodejs";

export function GET(request:Request) {
  const id=requestId(); const db=openAppDatabase();
  try {
    if(!new URL(request.url).search)return ok(listImportBatches(db),id);
    const parameters=new URL(request.url).searchParams;
    const requestedSize=Number(parameters.get("pageSize")??10);
    const pageSize=(requestedSize===20||requestedSize===50?requestedSize:10) as ImportBatchPageQuery["pageSize"];
    const query:ImportBatchPageQuery={
      page:Math.max(1,Number(parameters.get("page")??1)||1),pageSize,
      sortBy:parameters.get("sortBy")==="importedAt"?"importedAt":"sourceDate",
      sortDirection:parameters.get("sortDirection")==="asc"?"asc":"desc",
      sourceDate:parameters.get("sourceDate")?.slice(0,10)||undefined,
      fileQuery:parameters.get("fileQuery")?.trim().slice(0,120)||undefined,
    };
    return ok(listImportBatchesPage(db,query),id);
  } finally { db.close(); }
}
