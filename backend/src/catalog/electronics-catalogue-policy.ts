/** Electronics V2 taxonomy + versioned family specifications.
 * All clients consume the same generated contract. This is independent of
 * historical Product.productType and never mutates legacy products.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ELECTRONICS_V2_CONTRACT } from './electronics-catalogue-v2.generated';
import { normaliseSavedIndustries } from '../business-setup/business-setup.rules';

type Field = { key:string;type:'text'|'number'|'enum'|'boolean';required:boolean;unit?:string;options?:readonly string[] };
export type FamilyPolicy = {code:string;policyVersion:number;industryCodes:readonly string[];legacyProductType:string;stockProfile:'serial'|'quantity'|'batch'|'none';baseUnits:readonly string[];variantAxes:readonly string[];identifiers:readonly string[];fields:readonly Field[];reviewStatus:string};
export type TaxonomyNode = {code:string;parentCode:string|null;label:string;path:readonly string[];industryCodes:readonly string[];selectable:boolean;familyCode?:string;aliases?:readonly string[]};
export const V2_TAXONOMY_VERSION = ELECTRONICS_V2_CONTRACT.schemaVersion;
export const V2_POLICY_VERSION = ELECTRONICS_V2_CONTRACT.policyVersion;
export const V2_CONTRACT_HASH = ELECTRONICS_V2_CONTRACT.contentHash;
export const V2_NODES: readonly TaxonomyNode[] = ELECTRONICS_V2_CONTRACT.nodes;
export const V2_FAMILIES: readonly FamilyPolicy[] = ELECTRONICS_V2_CONTRACT.families;
const BY_NODE = new Map(V2_NODES.map(node=>[node.code,node]));
const BY_FAMILY = new Map(V2_FAMILIES.map(family=>[family.code,family]));
const normalized = (value:string)=>value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
export const normalizeCatalogueAlias = normalized;
const BY_ALIAS = new Map<string,TaxonomyNode>();
for (const node of V2_NODES) {
 const terms = [node.code,node.path.join(' > '),node.path.join('/'),...(node.aliases??[])];
 for(const value of terms)BY_ALIAS.set(normalized(value),node);
}
export function taxonomyNode(raw:string):TaxonomyNode {
 const found=BY_NODE.get(raw.toUpperCase())??BY_ALIAS.get(normalized(raw));
 if(!found)throw new NotFoundException('This electronics taxonomy code or alias is not supported.');
 return found;
}
export function familyPolicy(raw:string):FamilyPolicy {
 const found=BY_FAMILY.get(raw);
 if(!found)throw new NotFoundException('This electronics family policy is not published.');
 return found;
}
export function selectedBusinessIndustries(profile:{industries?:unknown;industry?:unknown}|null):string[] {
 return normaliseSavedIndustries(profile?.industries,profile?.industry);
}
export function industryEnabled(allowed:readonly string[], selected:readonly string[]):boolean {
 return selected.length>0 && selected.some(code=>allowed.includes(code));
}
export function assertFamilyEnabled(policy:FamilyPolicy,selected:readonly string[]):void {
 if(!industryEnabled(policy.industryCodes,selected))throw new ForbiddenException('This catalogue family is not enabled for the business. Activate the relevant industry in Business Setup.');
}
export function assertNodeEnabled(node:TaxonomyNode,selected:readonly string[]):void {
 if(!industryEnabled(node.industryCodes,selected))throw new ForbiddenException('This catalogue category is not enabled for the business.');
}
export function searchTaxonomy(query:string,selected:readonly string[],limit=200):Array<TaxonomyNode&{enabled:boolean;breadcrumb:string}> {
 const needle=normalized(query);
 return V2_NODES.filter(n=>!needle||[n.code,n.label,n.path.join(' > '),...(n.aliases??[])].some(v=>normalized(v).includes(needle)))
  .slice(0,Math.max(1,Math.min(limit,400)))
  .map(node=>({...node,enabled:industryEnabled(node.industryCodes,selected),breadcrumb:node.path.join(' › ')}));
}
/** Strict on new or reviewed reference specs; legacy saved products remain editable. */
export function validateFamilySpecifications(raw:unknown,family:FamilyPolicy,{required=true}:{required?:boolean}={}):Record<string,string|number|boolean>{
 if(raw===null||raw===undefined)raw={};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Reference specifications must be a keyed object.');
 const obj=raw as Record<string,unknown>;
 if(Object.keys(obj).length>40 || JSON.stringify(obj).length>8000)throw new BadRequestException('Reference specifications are too large.');
 const allowed=new Map(family.fields.map(f=>[f.key,f]));
 const clean:Record<string,string|number|boolean>={};
 for(const [key,value] of Object.entries(obj)){
  const field=allowed.get(key);
  if(!field)throw new BadRequestException(`Specification ${key} is not published for ${family.code}.`);
  if(value===null||value===undefined||value==='')continue;
  if(field.type==='boolean'){
   if(typeof value!=='boolean')throw new BadRequestException(`${key} must be true or false.`);
   clean[key]=value;
  } else if(field.type==='number'){
   if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e9)throw new BadRequestException(`${key} must be a non-negative numeric measurement${field.unit?` in ${field.unit}`:''}.`);
   clean[key]=value;
  } else {
   if(typeof value!=='string'||value.trim().length>250)throw new BadRequestException(`${key} must be a string of at most 250 characters.`);
   if(field.type==='enum'&&!field.options?.includes(value.trim()))throw new BadRequestException(`${key} must use a published enumeration value.`);
   clean[key]=value.trim();
  }
 }
 if(required)for(const field of family.fields)if(field.required && clean[field.key]===undefined)
  throw new BadRequestException(`${field.key} is required for ${family.code}.`);
 return clean;
}
export function validateSourceProvenance(raw:unknown):Record<string,string>{
 if(raw===undefined||raw===null)return {};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Specification provenance must be an object.');
 const data=raw as Record<string,unknown>, allowed=['sourceName','sourceUrl','documentVersion','evidenceNote'];
 if(Object.keys(data).some(k=>!allowed.includes(k)))throw new BadRequestException('Unknown provenance field.');
 const out:Record<string,string>={};
 for(const [key,value] of Object.entries(data)){
  if(typeof value!=='string'||value.trim().length>400)throw new BadRequestException('Invalid specification source.');
  if(key==='sourceUrl'&&value&&!/^https:\/\/[^\s/]+/i.test(value))throw new BadRequestException('Evidence links must use HTTPS.');
  if(value.trim())out[key]=value.trim();
 }
 return out;
}
/** A model family and its legacy product type must be compatible. */
export function assertModelFamilyProductType(family:FamilyPolicy,productType:string):void {
 if(productType!==family.legacyProductType)throw new BadRequestException(`Family ${family.code} requires the compatible legacy product type ${family.legacyProductType}.`);
}
/** Published V2 categories may contribute text/number/select fields to the existing editor.
 * Boolean specifications are exposed in V2 directory; Phase 2 provides the full wizard.
 */
export function legacyCategoryAttributeSchema(family:FamilyPolicy) {
 return family.fields.slice(0,25).map(f=>({
   key:f.key,label:f.key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,x=>x.toUpperCase())+(f.unit?` (${f.unit})`:''),
   kind:f.type==='number'?'number':f.type==='enum'?'select':f.type==='boolean'?'boolean':'text',required:f.required,
   ...(f.type==='enum'?{options:[...(f.options??[])]}:{})
 }));
}

/** Resolve a category to its versioned public policy, without changing old product types. */
export function familyForCategoryCode(code:string|null|undefined):FamilyPolicy|null {
 if(!code)return null;
 const node=V2_NODES.find(n=>n.code===code);
 return node?.familyCode?BY_FAMILY.get(node.familyCode)??null:null;
}
/** Only brand-new products must obey the V2 family tracking defaults. */
export function enforceFamilyTracking(stockProfile:FamilyPolicy['stockProfile'], tracking:{trackStock:boolean;trackSerial:boolean;trackLot:boolean}):void {
 if(stockProfile==='serial'&&(!tracking.trackStock||!tracking.trackSerial))throw new BadRequestException('This electronics family must track the actual physical serial or IMEI.');
 if(stockProfile==='quantity'&&!tracking.trackStock)throw new BadRequestException('This family requires quantity stock tracking.');
 if(stockProfile==='batch'&&(!tracking.trackStock||!tracking.trackLot))throw new BadRequestException('This family requires lot tracking.');
 if(stockProfile==='none'&&tracking.trackStock)throw new BadRequestException('This family is a non-stock service.');
}
