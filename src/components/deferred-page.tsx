import { PageHeader } from "./page-header";
import { EmptyState, Panel } from "./ui-states";
export function DeferredPage({title,description,stage}:{title:string;description:string;stage:string}){return <main className="page"><PageHeader eyebrow="即時監控" title={title} description={description} tag={`${stage} · 尚未啟用`}/><Panel title="功能狀態" subtitle="不顯示虛構或過期資料"><EmptyState icon="◌" title={`${title}將於 ${stage} 實作`} description="目前尚未連接正式 Collector 與即時感測器查詢，因此本頁不產生模擬狀態、假圖表或成功訊息。"/></Panel></main>}
