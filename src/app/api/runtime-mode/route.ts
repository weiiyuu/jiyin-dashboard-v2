import { apiError,ok,requestId } from "@/server/http/api";
import { assertLocalMutation } from "@/server/http/local-mutation";
import { DISPLAY_MODE_COOKIE,displayModeFromRequest } from "@/server/live/display-mode";
export const runtime="nodejs";export const dynamic="force-dynamic";
export function GET(request:Request){const id=requestId();return ok({providerMode:displayModeFromRequest(request),modeRevision:0},id);}
export async function PUT(request:Request){const id=requestId();try{assertLocalMutation(request);const body=await request.json() as {mode?:unknown};if(body.mode!=="LIVE"&&body.mode!=="DEMO")return apiError(id,400,"RUNTIME_MODE_INVALID","模式切換參數無效");const response=ok({providerMode:body.mode,modeRevision:0},id);response.cookies.set(DISPLAY_MODE_COOKIE,body.mode,{httpOnly:true,sameSite:"lax",path:"/",maxAge:31_536_000});return response;}catch(error){const code=error instanceof Error?error.message:"";if(["LOCALHOST_REQUIRED","ORIGIN_REQUIRED","ORIGIN_NOT_ALLOWED","FETCH_SITE_NOT_ALLOWED"].includes(code))return apiError(id,403,code,"只允許本機同源操作");return apiError(id,500,"RUNTIME_MODE_FAILED","無法切換此瀏覽器的顯示模式");}}
