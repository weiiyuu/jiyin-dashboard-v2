import type { LiveMeta } from "@/features/live/live-ui-model";
import { formatTaipeiDateTime } from "@/features/live/live-ui-model";

export function LiveProviderBanner({meta,onRefresh,busy=false}:{meta:LiveMeta;onRefresh?:()=>void;busy?:boolean}){
  const demo=meta.providerMode==="DEMO";
  return <div className={`live-provider-banner ${demo?"demo":"live"}`} role="status">
    <div><strong>{demo?"模擬資料":"Live 本機資料"}</strong><span>{demo?`合成資料日期 ${meta.timeContext.dataDate}，模擬時間 ${formatTaipeiDateTime(meta.timeContext.now)}`:`資料日期 ${meta.timeContext.dataDate}，頁面讀取時間 ${formatTaipeiDateTime(meta.generatedAt)}`}</span></div>
    <div className="live-provider-actions"><span className={`status-chip ${demo?"warning":"success"}`}>{demo?"DEMO":"LIVE"}</span>{onRefresh&&<button type="button" className="button ghost" onClick={onRefresh} disabled={busy}>{busy?"讀取中…":"重新讀取本機資料"}</button>}</div>
  </div>;
}
