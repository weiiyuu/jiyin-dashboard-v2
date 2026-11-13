import { openAppDatabase } from "@/server/db/app-database";
import { ok, requestId } from "@/server/http/api";
import { listImportBatches } from "@/server/import/import-repository";

export const runtime = "nodejs";

export function GET() {
  const id=requestId(); const db=openAppDatabase();
  try { return ok(listImportBatches(db),id); } finally { db.close(); }
}
