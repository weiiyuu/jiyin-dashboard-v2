import { XLSX_LIMITS } from "@/server/import/xlsx-preflight";

export const IMPORT_UPLOAD_LIMITS={maxFilesPerPreview:10,maxTotalPreviewBytes:50*1024*1024,maxJsonBytes:4096} as const;

const LOCAL_HOSTS=new Set(["localhost","127.0.0.1","[::1]"]);
const INTERNAL_BIND_HOSTS=new Set([...LOCAL_HOSTS,"0.0.0.0"]);

export function assertLocalMutation(request:Request):void{
  const internalTarget=new URL(request.url),host=request.headers.get("host")??internalTarget.host;
  if(!INTERNAL_BIND_HOSTS.has(internalTarget.hostname))throw new Error("LOCALHOST_REQUIRED");
  if(!/^(?:\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+)(?::\d{1,5})?$/.test(host))throw new Error("LOCALHOST_REQUIRED");
  let target:URL;try{target=new URL(`${internalTarget.protocol}//${host}`);}catch{throw new Error("LOCALHOST_REQUIRED");}
  if(!LOCAL_HOSTS.has(target.hostname))throw new Error("LOCALHOST_REQUIRED");
  const origin=request.headers.get("origin");
  if(!origin)throw new Error("ORIGIN_REQUIRED");
  let parsed:URL;try{parsed=new URL(origin);}catch{throw new Error("ORIGIN_NOT_ALLOWED");}
  if(parsed.origin!==target.origin||!LOCAL_HOSTS.has(parsed.hostname))throw new Error("ORIGIN_NOT_ALLOWED");
  const fetchSite=request.headers.get("sec-fetch-site");
  if(fetchSite&&fetchSite!=="same-origin")throw new Error("FETCH_SITE_NOT_ALLOWED");
}

export function validateXlsxFile(file:File):void{
  if(!file.name.toLowerCase().endsWith(".xlsx"))throw new Error("IMPORT_FILE_REQUIRED");
  if(file.size===0||file.size>XLSX_LIMITS.maxCompressedBytes)throw new Error("XLSX_FILE_SIZE_LIMIT");
}

export interface SafeError {status:number;code:string;message:string}
const ERRORS:Record<string,SafeError>={
  LOCALHOST_REQUIRED:{status:403,code:"LOCALHOST_REQUIRED",message:"寫入操作只允許從本機服務執行"},
  ORIGIN_REQUIRED:{status:403,code:"ORIGIN_REQUIRED",message:"缺少同源請求資訊"},
  ORIGIN_NOT_ALLOWED:{status:403,code:"ORIGIN_NOT_ALLOWED",message:"拒絕非同源寫入請求"},
  FETCH_SITE_NOT_ALLOWED:{status:403,code:"FETCH_SITE_NOT_ALLOWED",message:"拒絕跨站寫入請求"},
  IMPORT_FILE_REQUIRED:{status:400,code:"IMPORT_FILE_REQUIRED",message:"請提供 .xlsx 檔案"},
  XLSX_FILE_SIZE_LIMIT:{status:413,code:"XLSX_FILE_SIZE_LIMIT",message:"檔案大小超過限制"},
  XLSX_EXPANDED_SIZE_LIMIT:{status:413,code:"XLSX_EXPANDED_SIZE_LIMIT",message:"檔案解壓後大小超過限制"},
  XLSX_CELL_COUNT_LIMIT:{status:413,code:"XLSX_CELL_COUNT_LIMIT",message:"工作表儲存格數量超過限制"},
  XLSX_UNSAFE_CONTENT:{status:422,code:"XLSX_UNSAFE_CONTENT",message:"檔案含不允許的外部內容或巨集"},
  XLSX_FORMULA_NOT_ALLOWED:{status:422,code:"XLSX_FORMULA_NOT_ALLOWED",message:"標準化匯入檔不可包含公式"},
  IMPORT_VALIDATION_FAILED:{status:422,code:"IMPORT_VALIDATION_FAILED",message:"檔案未通過資料契約驗證"},
  ACTIVE_VERSION_CHANGED:{status:409,code:"ACTIVE_VERSION_CHANGED",message:"目前啟用版本已變更，請重新預覽"},
  ALARM_REPLACEMENT_REGRESSION:{status:409,code:"ALARM_REPLACEMENT_REGRESSION",message:"修正版缺少原版本已有的 Alarm 來源"},
  PREVIEW_FINGERPRINT_CHANGED:{status:409,code:"PREVIEW_FINGERPRINT_CHANGED",message:"檔案內容與預覽時不同，請重新預覽"},
  ROLLBACK_TARGET_INVALID:{status:409,code:"ROLLBACK_TARGET_INVALID",message:"指定版本目前無法啟用"},
  ACTIVE_BATCH_MISSING:{status:409,code:"ACTIVE_BATCH_MISSING",message:"找不到目前啟用版本，請重新整理"},
};
export function importErrorResponse(error:unknown):SafeError{
  const code=error instanceof Error?error.message:"";
  return ERRORS[code]??{status:500,code:"IMPORT_INTERNAL_ERROR",message:"匯入處理失敗，請使用 request ID 查詢紀錄"};
}
