import { openAppDatabase } from "@/server/db/app-database";
import { apiError, ok, requestId } from "@/server/http/api";
import { assertLocalMutation, IMPORT_UPLOAD_LIMITS, importErrorResponse, validateXlsxFile } from "@/server/http/local-mutation";
import { inspectImportDecision } from "@/server/import/import-repository";
import { previewWorkbook } from "@/server/import/workbook-parser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const id = requestId();
  try {
    assertLocalMutation(request);
    const form = await request.formData();
    const entries=form.getAll("files");if(!entries.length){const single=form.get("file");if(single!==null)entries.push(single);}
    const files=entries.filter((entry):entry is File=>entry instanceof File);
    if(files.length!==entries.length||files.length===0)throw new Error("IMPORT_FILE_REQUIRED");
    if(files.length>IMPORT_UPLOAD_LIMITS.maxFilesPerPreview||files.reduce((sum,file)=>sum+file.size,0)>IMPORT_UPLOAD_LIMITS.maxTotalPreviewBytes)throw new Error("XLSX_FILE_SIZE_LIMIT");
    for(const file of files)validateXlsxFile(file);
    const db=openAppDatabase();
    try{
      const results=[];
      for(const [index,file] of files.entries()){
        const preview=await previewWorkbook(Buffer.from(await file.arrayBuffer()),file.name);
        const decision=preview.canConfirm?inspectImportDecision(db,preview):{decision:"INVALID",activeBatchId:null,duplicateBatchId:null};
        results.push({clientFileId:String(form.getAll("clientFileId")[index]??`file-${index+1}`),fileName:preview.originalFileName,sha256:preview.fileSha256,canonicalFingerprint:preview.canonicalFingerprint,sourceDate:preview.sourceDate,...decision,
          counts:{machine:preview.machineRows.length,environment:preview.environmentRows.length,alarm:preview.alarmRows.length,qualityIssues:preview.qualityIssueRows.length},alarmSourceStatus:preview.alarmSourceStatus,
          errors:preview.issues.filter((issue)=>issue.severity==="ERROR"),warnings:preview.issues.filter((issue)=>issue.severity==="WARNING")});
      }
      return ok({files:results},id);
    }finally{db.close();}
  } catch (error) {
    const safe=importErrorResponse(error);return apiError(id,safe.status,safe.code,safe.message);
  }
}
