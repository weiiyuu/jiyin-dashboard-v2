import type { ProviderMode } from "@/shared/contracts/api-response";

export const DISPLAY_MODE_COOKIE="jiyin_display_mode";
export function displayModeFromRequest(request?:Request):ProviderMode{
  const header=request?.headers.get("cookie")??"";
  for(const part of header.split(";")){const [name,...rest]=part.trim().split("=");if(name===DISPLAY_MODE_COOKIE){const value=rest.join("=");if(value==="LIVE"||value==="DEMO")return value;}}
  return "DEMO";
}
