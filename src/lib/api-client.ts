export class ApiClientError extends Error { constructor(public code:string,message:string,public status:number){super(message);} }
export interface ApiEnvelope<T, M = unknown> { data:T; meta:M }
export async function fetchApiEnvelope<T, M = unknown>(input:RequestInfo|URL,init?:RequestInit):Promise<ApiEnvelope<T,M>>{
  const response=await fetch(input,{...init,headers:{accept:"application/json",...init?.headers}});
  const body=await response.json().catch(()=>null) as (ApiEnvelope<T,M>&{error?:{code?:string;message?:string}})|null;
  if(!response.ok||body?.data===undefined)throw new ApiClientError(body?.error?.code??"REQUEST_FAILED",body?.error?.message??"本機服務未回傳可用資料",response.status);
  return {data:body.data,meta:body.meta};
}
export async function fetchApi<T>(input:RequestInfo|URL,init?:RequestInit):Promise<T>{
  return (await fetchApiEnvelope<T>(input,init)).data;
}
export function formatBytes(bytes:number){if(bytes<1024)return`${bytes} B`;if(bytes<1024*1024)return`${(bytes/1024).toFixed(1)} KB`;return`${(bytes/1024/1024).toFixed(1)} MB`;}
