import { openAppDatabase } from "@/server/db/app-database";
import { getSettings } from "@/server/db/settings-repository";
import { EnterpriseApiClient } from "@/server/enterprise/client";
import { loadEnterpriseClientConfig } from "@/server/enterprise/config";
import { runManualConnectionTest } from "@/server/collector/service";
import { isInsideServiceWindow } from "@/server/collector/schedule";
import { apiError,ok,requestId } from "@/server/http/api";
import { assertLocalMutation } from "@/server/http/local-mutation";
export const runtime="nodejs";
export async function POST(request:Request){const id=requestId();try{assertLocalMutation(request);const body=await request.json() as {confirmOutsideWindow?:unknown};if(!isInsideServiceWindow(Date.now())&&body.confirmOutsideWindow!==true)return apiError(id,409,"OUTSIDE_WINDOW_CONFIRM_REQUIRED","非服務時段測試需要再次確認");const db=openAppDatabase();let client:EnterpriseApiClient|null=null;try{getSettings(db);client=new EnterpriseApiClient(loadEnterpriseClientConfig());const result=await runManualConnectionTest(db,client);return ok({result:result.status,endpoints:result.audits.map((audit)=>({endpoint:audit.endpoint,result:audit.result,errorCode:audit.errorCode}))},id);}finally{client?.close();db.close();}}catch(error){const code=error instanceof Error?error.message:"";if(["LOCALHOST_REQUIRED","ORIGIN_REQUIRED","ORIGIN_NOT_ALLOWED","FETCH_SITE_NOT_ALLOWED"].includes(code))return apiError(id,403,code,"只允許本機同源操作");return apiError(id,500,"CONNECTION_TEST_FAILED","連線測試無法執行，請檢查本機 server 設定");}}
