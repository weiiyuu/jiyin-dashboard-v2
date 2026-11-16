import type { LiveMeta } from "@/features/live/live-ui-model";
import { formatTaipeiDateTime } from "@/features/live/live-ui-model";

export function LiveProviderBanner({meta,onRefresh,busy=false}:{meta:LiveMeta;onRefresh?:()=>void;busy?:boolean}){
  const demo=meta.providerMode==="DEMO";
  return <div className={`live-provider-banner ${demo?"demo":"live"}`} role="status">
    <div><strong>{demo?"模擬資料":"Live 本機資料"}</strong><span>{demo?`合成資料日期 ${meta.timeContext.dataDate}，模擬時間 ${formatTaipeiDateTime(meta.timeContext.now)}`:`資料日期 ${meta.timeContext.dataDate}，頁面讀取時間 ${formatTaipeiDateTime(meta.generatedAt)}`}</span></div>
    <div className="live-provider-actions"><span className={`status-chip ${demo?"warning":"success"}`}>{demo?"DEMO":"LIVE"}</span>{onRefresh&&<><span className="live-auto-refresh-note">每 30 秒自動更新</span><button type="button" className="live-refresh-button" onClick={onRefresh} disabled={busy} title="重新讀取已儲存資料，不會向企業 API 發送請求"><span aria-hidden>↻</span>{busy?"更新中…":"更新畫面"}</button></>}</div>
  </div>;
}
