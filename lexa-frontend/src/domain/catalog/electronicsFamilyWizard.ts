/** The only source of electronics wizard dimensions is the published V2 catalogue. */
import {ELECTRONICS_V2_CONTRACT} from './electronics-catalogue-v2.generated';
import type {V2Family,V2Field} from './electronicsFamilyTypes';
export type WizardCategory={catalogCode?:string|null};
export function familyForCategory(category:WizardCategory|null|undefined):V2Family|null {
 const node=ELECTRONICS_V2_CONTRACT.nodes.find(n=>n.code===category?.catalogCode);
 const familyCode=node && 'familyCode' in node ? node.familyCode : undefined;
 const family=familyCode?ELECTRONICS_V2_CONTRACT.families.find(f=>f.code===familyCode):null;
 return family?{...family,enabled:true}:null;
}
export function makeWizardFields(family:V2Family):readonly V2Field[]{return family.fields;}
/** Fast feedback for identifiers; the transaction/API remains authoritative. */
export function validGtin(value:string):boolean {
 if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value))return false;
 let total=0;
 for(let i=value.length-2,position=0;i>=0;i--,position++)total+=Number(value[i])*(position%2===0?3:1);
 return (10-total%10)%10===Number(value.at(-1));
}
export function validateWizardVariants(rows:ReadonlyArray<{sku:string;barcode?:string;gtin?:string}>,existing:ReadonlyArray<{sku:string;barcode?:string|null;gtin?:string|null}>):string[]{
 const errors:string[]=[],seen=new Set(existing.map(r=>r.sku.trim().toUpperCase())),codes=new Set(existing.flatMap(r=>[r.barcode,r.gtin].filter((x):x is string=>Boolean(x)).map(x=>x.trim().toUpperCase())));
 for(const row of rows){
  const sku=row.sku.trim().toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9._-]{0,79}$/.test(sku))errors.push(`SKU must contain 1–80 letters, numbers, dots, underscores or hyphens: ${row.sku}`);
  if(seen.has(sku))errors.push(`Duplicate SKU: ${row.sku}`);
  seen.add(sku);
  for(const value of [row.barcode,row.gtin]){
   if(!value?.trim())continue;
   const code=value.trim().toUpperCase();
   if(codes.has(code))errors.push(`Repeated barcode or GTIN: ${code}`);
   codes.add(code);
  }
  if(row.gtin?.trim()&&!validGtin(row.gtin.trim()))errors.push(`Invalid GTIN check digit or length: ${row.gtin}`);
 }
 return errors;
}
/** Validate published axis field types before a bulk variant can be submitted. */
export function validateWizardVariantAxes(rows:ReadonlyArray<{attributes:Record<string,string>}>,family:V2Family|null):string[]{
 if(!family)return [];
 const errors:string[]=[];
 const allowed=new Map(family.fields.map(field=>[field.key,field]));
 for(const row of rows){
  const keys=Object.keys(row.attributes);
  if(!keys.some(key=>family.variantAxes.includes(key)))errors.push('Choose a published product option before generating SKUs.');
  for(const [key,value] of Object.entries(row.attributes)){
   const field=allowed.get(key);
   if(!family.variantAxes.includes(key)||!field){errors.push(`Unsupported variation: ${key}`);continue;}
   if(field.type==='number'&&(!value.trim()||!Number.isFinite(Number(value))||Number(value)<0))errors.push(`${key} must be a non-negative number without units.`);
   if(field.type==='boolean'&&!['true','false'].includes(value.trim().toLowerCase()))errors.push(`${key} must be true or false.`);
   if(field.type==='enum'&&!field.options?.includes(value.trim()))errors.push(`${key} must be one of: ${(field.options??[]).join(', ')}.`);
  }
 }
 return errors;
}
