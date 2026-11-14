export interface SelectedUpload {id:string;file:File}
export interface PreviewDecision {decision:"INSERT"|"DUPLICATE"|"CONFLICT"|"INVALID";activeBatchId:number|null;errors:unknown[]}
export function removeSelectedUpload(files:SelectedUpload[],id:string){return files.filter((item)=>item.id!==id);}
export function confirmPlan(preview:PreviewDecision,replaceApproved:boolean){
  if(preview.errors.length||preview.decision==="INVALID")return{allowed:false,action:null,reason:"INVALID" as const};
  if(preview.decision==="DUPLICATE")return{allowed:false,action:null,reason:"DUPLICATE" as const};
  if(preview.decision==="CONFLICT"&&!replaceApproved)return{allowed:false,action:null,reason:"REPLACE_CONFIRMATION_REQUIRED" as const};
  return{allowed:true,action:preview.decision==="CONFLICT"?"REPLACE" as const:"INSERT" as const,reason:null};
}
