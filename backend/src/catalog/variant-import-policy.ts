/** Shared batch/CSV validation of sellable variants against the published family policy.
 * Does not create or change inventory; database uniqueness remains authoritative.
 */
import {createHash} from 'node:crypto';
import {BadRequestException} from '@nestjs/common';
import {cleanProductAttributes,validateVariantDimensions,type CategoryFieldPolicy} from './product-attribute-validation';
import {familyForCategoryCode,validateFamilySpecifications} from './electronics-catalogue-policy';

export function validCatalogGtin(value:string):boolean{
 if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value))return false;
 let total=0;
 for(let i=value.length-2,position=0;i>=0;i--,position++)total+=Number(value[i])*(position%2===0?3:1);
 return (10-total%10)%10===Number(value.at(-1));
}

export function validateCatalogVariantImport(
 productType:string|null, categoryCode:string|null|undefined, raw:unknown,
):{attributes:Record<string,string|number|boolean>;variantSignature:string|null}{
 const family=familyForCategoryCode(categoryCode);
 const customFields:CategoryFieldPolicy[]=family?.fields.map(field=>({
  key:field.key,label:field.key,kind:field.type==='enum'?'select':field.type,
  ...(field.options?{options:field.options}:{})
 }))??[];
 const attributes=cleanProductAttributes(raw,productType,family?.fields.map(f=>f.key)??[],false,customFields);
 if(family){
  if(!family.variantAxes.length)throw new BadRequestException('This product family does not support separate sellable variants.');
  const published=Object.fromEntries(Object.entries(attributes).filter(([key])=>family.fields.some(f=>f.key===key)));
  validateFamilySpecifications(published,family,{required:false});
  if(!family.variantAxes.some(key=>attributes[key]!==undefined&&String(attributes[key]).trim()!==''))
   throw new BadRequestException(`Choose at least one published variation: ${family.variantAxes.join(', ')}.`);
 }else validateVariantDimensions(productType,attributes);
 const keys=new Set(family?.variantAxes??[]);
 const signature=JSON.stringify(Object.entries(attributes)
  .filter(([key,value])=>(!keys.size||keys.has(key))&&value!==null&&value!==undefined&&String(value).trim())
  .sort(([a],[b])=>a.localeCompare(b)));
 return {attributes,variantSignature:signature!=='[]'?createHash('sha256').update(signature).digest('hex'):null};
}
