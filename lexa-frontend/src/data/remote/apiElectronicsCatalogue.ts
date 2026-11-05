import {apiClient} from './apiClient';
import type {V2Family} from '../../domain/catalog/electronicsFamilyTypes';
export type {V2Family,V2Field} from '../../domain/catalog/electronicsFamilyTypes';
export type V2TaxonomyNode={code:string;parentCode:string|null;label:string;path:readonly string[];familyCode?:string;industryCodes:readonly string[];enabled:boolean;selectable:boolean;breadcrumb:string;aliases?:readonly string[]};

export type V2Brand={id:string;name:string;aliases:string[]};
export type V2Model={id:string;brandId:string;name:string;productType:string;familyCode:string|null;referenceVersion:number;reviewStatus:string;referenceSpecs:Record<string,string|number|boolean>;provenance:Record<string,string>;manufacturerCode:string|null};
const root=(w:string)=>`/workspaces/${encodeURIComponent(w)}/catalog/v2`;
const uri=(v:string)=>encodeURIComponent(v);
const idempotency=()=>typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():undefined;
export const apiElectronicsCatalogue={
 summary:(w:string)=>apiClient.get<{schemaVersion:number;policyVersion:number;contentHash:string;leaves:number;families:number;industryCodes:string[];enabledLeafCount:number}>(`${root(w)}/summary`),
 customCategories:(w:string,q='')=>apiClient.get<{nodes:Array<{categoryId:string;code:string;label:string;breadcrumb:string;path:string[];canonical:boolean;templateKey:string|null}>;total:number;readOnly:true}>(`${root(w)}/taxonomy/custom`,{q}),
  taxonomy:(w:string,q='',enabledOnly=false)=>apiClient.get<{version:number;contentHash:string;nodes:V2TaxonomyNode[]}>(`${root(w)}/taxonomy`,{q,enabledOnly}),
 category:(w:string,code:string)=>apiClient.get<V2TaxonomyNode&{family:V2Family|null}>(`${root(w)}/taxonomy/${uri(code)}`),
 families:(w:string)=>apiClient.get<{version:number;contentHash:string;families:V2Family[]}>(`${root(w)}/families`),
 preview:(w:string,code:string)=>apiClient.get<{code:string;breadcrumb:string;action:string;existingCategoryId:string|null;legacyCandidates:Array<{categoryId:string;path:string}>;doesNotChangeProducts:boolean}>(`${root(w)}/categories/preview`,{code}),
 adopt:(w:string,code:string)=>apiClient.post<{categoryId:string;code:string;createdCategoryIds:string[];existingProductsModified:number}>(`${root(w)}/categories/adopt`,{code},idempotency()),
 linkExisting:(w:string,categoryId:string,code:string)=>apiClient.post<{categoryId:string;code:string;historicalProductIdsPreserved:boolean}>(`${root(w)}/categories/link-existing`,{categoryId,code},idempotency()),
 brandSearch:(w:string,q='')=>apiClient.get<V2Brand[]>(`${root(w)}/brands/search`,{q}),
 addBrandAlias:(w:string,brandId:string,alias:string)=>apiClient.post(`${root(w)}/brands/${uri(brandId)}/aliases`,{alias},idempotency()),
 mergeProposals:(w:string)=>apiClient.get<Array<{id:string;sourceBrandId:string;targetBrandId:string;status:string;rationale:string|null}>>(`${root(w)}/brands/merge-proposals`),
 proposeMerge:(w:string,input:{sourceBrandId:string;targetBrandId:string;rationale?:string})=>apiClient.post(`${root(w)}/brands/merge-proposals`,input,idempotency()),
 models:(w:string,q='',familyCode='')=>apiClient.get<V2Model[]>(`${root(w)}/models`,{q,familyCode}),
 createModel:(w:string,input:{brandId:string;name:string;familyCode:string;productType?:string;manufacturerCode?:string;referenceSpecs?:Record<string,string|number|boolean>;provenance?:Record<string,string>})=>apiClient.post<V2Model>(`${root(w)}/models`,input,idempotency()),
 modelRevisions:(w:string,modelId:string)=>apiClient.get<Array<{id:string;version:number;referenceSpecs:Record<string,string|number|boolean>;reviewStatus:string}>>(`${root(w)}/models/${uri(modelId)}/revisions`),
 reviseModel:(w:string,modelId:string,input:{referenceSpecs:Record<string,string|number|boolean>;provenance?:Record<string,string>})=>apiClient.post<V2Model>(`${root(w)}/models/${uri(modelId)}/revisions`,input,idempotency()),
 reviewModel:(w:string,modelId:string,outcome:'reviewed'|'rejected')=>apiClient.post<V2Model>(`${root(w)}/models/${uri(modelId)}/review`,{outcome},idempotency()),
};
