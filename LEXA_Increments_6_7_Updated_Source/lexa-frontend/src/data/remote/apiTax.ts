import { apiClient } from './apiClient';
const enc=(v:string)=>encodeURIComponent(v);
export interface TaxReference { id:string; title:string; issuingAuthority:string; jurisdiction:string; documentType:string; publicationDate?:string|null; effectiveFrom?:string|null; effectiveTo?:string|null; sourceUrl?:string|null; documentSha256:string; version:number; status:string; uploadedByUserId:string; reviewerUserId?:string|null; approverUserId?:string|null; approvedAt?:string|null; }
export interface TaxCodeRow { id:string; code:string; name:string; rateBasisPoints:number; calculation:string; latestRuleVersionId?:string; version?:number; treatment?:string; ruleStatus?:string; }
function base(w:string,b:string){return `/workspaces/${enc(w)}/branches/${enc(b)}/tax`;}
export const apiTax={
 async references(w:string,b:string){return apiClient.get<TaxReference[]>(`${base(w,b)}/references`);},
 async codes(w:string,b:string){return apiClient.get<TaxCodeRow[]>(`${base(w,b)}/codes`);},
 async uploadReferenceFile(w:string,b:string,file:File){if(file.size<1||file.size>25*1024*1024)throw new Error('Tax reference files must be 1 byte to 25 MB.');const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());const sha256=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');const signed=await apiClient.post<{attachmentId:string;uploadUrl:string;requiredHeaders:Record<string,string>}>(`${base(w,b).replace('/tax','/platform')}/attachments/upload-url`,{fileName:file.name,mimeType:file.type,sizeBytes:file.size,sha256},crypto.randomUUID());const put=await fetch(signed.uploadUrl,{method:'PUT',headers:signed.requiredHeaders,body:file});if(!put.ok)throw new Error(`Private upload failed (${put.status}).`);await apiClient.post(`${base(w,b).replace('/tax','/platform')}/attachments/${enc(signed.attachmentId)}/complete`,{},crypto.randomUUID());return signed.attachmentId;},
 async createReference(w:string,b:string,input:Record<string,unknown>){return apiClient.post<{id:string;status:string}>(`${base(w,b)}/references`,input,crypto.randomUUID());},
 async submitReference(w:string,b:string,id:string){return apiClient.post(`${base(w,b)}/references/${enc(id)}/submit`,{},crypto.randomUUID());},
 async approveReference(w:string,b:string,id:string,reviewNotes:string){return apiClient.post(`${base(w,b)}/references/${enc(id)}/approve`,{reviewNotes},crypto.randomUUID());},
 async createRuleVersion(w:string,b:string,codeId:string,input:Record<string,unknown>){return apiClient.post(`${base(w,b)}/codes/${enc(codeId)}/versions`,input,crypto.randomUUID());},
 async submitRule(w:string,b:string,codeId:string,id:string){return apiClient.post(`${base(w,b)}/codes/${enc(codeId)}/versions/${enc(id)}/submit`,{},crypto.randomUUID());},
 async approveRule(w:string,b:string,codeId:string,id:string){return apiClient.post(`${base(w,b)}/codes/${enc(codeId)}/versions/${enc(id)}/approve`,{},crypto.randomUUID());},
 async preview(w:string,b:string,input:Record<string,unknown>){return apiClient.post<{taxableMinor:number;taxMinor:number;totalMinor:number;assurance:string}>(`${base(w,b)}/preview`,input);},
 async summary(w:string,b:string){return apiClient.get<Array<{taxCode:string;description:string;lineCount:number;taxMinor:number;taxableMinor:number}>>(`${base(w,b)}/summary`);},
};
