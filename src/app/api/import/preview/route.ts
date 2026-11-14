import { openAppDatabase } from "@/server/db/app-database";
import { createHash } from "node:crypto";
import { apiError, ok, reportUnexpectedError, requestId } from "@/server/http/api";
import { assertLocalMutation, IMPORT_UPLOAD_LIMITS, importErrorResponse, isKnownImportError, validateXlsxFile } from "@/server/http/local-mutation";
import { inspectImportDecision } from "@/server/import/import-repository";
import { previewWorkbook } from "@/server/import/workbook-parser";
import { buildImportQualitySummary } from "@/server/import/quality-summary";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const id = requestId();
  try {
    assertLocalMutation(request);
    const form = await request.formData();
    const entries=form.getAll("files");if(!entries.length){const single=form.get("file");if(single!==null)entries.push(single);}
    const files=entries.filter((entry):entry is File=>entry instanceof File);
    if(files.length!==entries.length||files.length===0)throw new Error("IMPORT_FILE_REQUIRED");
    if(files.length>IMPORT_UPLOAD_LIMITS.maxFilesPerPreview)throw new Error("IMPORT_FILE_COUNT_LIMIT");
    if(files.reduce((sum,file)=>sum+file.size,0)>IMPORT_UPLOAD_LIMITS.maxTotalPreviewBytes)throw new Error("XLSX_FILE_SIZE_LIMIT");
    const db=openAppDatabase();
    try{
      const results=[];
      for(const [index,file] of files.entries()){
        const clientFileId=String(form.getAll("clientFileId")[index]??`file-${index+1}`);
        try{
          validateXlsxFile(file);
          const preview=await previewWorkbook(Buffer.from(await file.arrayBuffer()),file.name);
          const decision=preview.canConfirm?inspectImportDecision(db,preview):{decision:"INVALID",activeBatchId:null,duplicateBatchId:null};
          const qualitySummary=buildImportQualitySummary(preview);
          results.push({clientFileId,fileName:preview.originalFileName,sha256:preview.fileSha256,canonicalFingerprint:preview.canonicalFingerprint,sourceDate:preview.sourceDate,...decision,
            counts:{machine:preview.machineRows.length,environment:preview.environmentRows.length,alarm:preview.alarmRows.length,qualityIssues:preview.qualityIssueRows.length},alarmSourceStatus:preview.alarmSourceStatus,
            acceptance:qualitySummary.acceptance,qualitySummary,
            errors:preview.issues.filter((issue)=>issue.severity==="ERROR"),warnings:preview.issues.filter((issue)=>issue.severity!=="ERROR")});
        }catch(error){
          if(!isKnownImportError(error))throw error;
          const safe=importErrorResponse(error),bytes=Buffer.from(await file.arrayBuffer());
          results.push({clientFileId,fileName:file.name,sha256:createHash("sha256").update(bytes).digest("hex"),canonicalFingerprint:"",sourceDate:"",decision:"INVALID",activeBatchId:null,duplicateBatchId:null,
            counts:{machine:0,environment:0,alarm:0,qualityIssues:0},alarmSourceStatus:"UNKNOWN",acceptance:"INVALID",qualitySummary:null,errors:[{ruleCode:safe.code,severity:"ERROR",messageSafe:safe.message}],warnings:[]});
        }
      }
      return ok({files:results},id);
    }finally{db.close();}
  } catch (error) {
    const safe=importErrorResponse(error);if(safe.status===500)reportUnexpectedError(id,"import-preview",error);return apiError(id,safe.status,safe.code,safe.message);
  }
}
