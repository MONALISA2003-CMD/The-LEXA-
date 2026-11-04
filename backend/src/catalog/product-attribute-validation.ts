/** Server-side validation; never accept unbounded or executable catalogue data. */
import { BadRequestException } from '@nestjs/common';
export const KNOWN_PRODUCT_TYPE_FIELDS: Record<string,readonly string[]> = {
 smartphone:['model','storage','ram','colour','condition','sim','warrantyMonths'],
 tv:['model','screenSize','resolution','displayType','connectivity','warrantyMonths'],
 audio:['model','powerWatts','connectivity','warrantyMonths'],
 phone_accessory:['compatibleModels','colour','connector'],
 clothing:['style','size','colour','material','fit','gender'],
 footwear:['style','sizeSystem','size','colour','material'],
 perfume:['fragrance','concentration','bottleMl','scentFamily'],
 cosmetic:['shade','volume','ingredients'],
 bread:['weightGrams','ingredients','allergens','shelfLifeDays'],
 groceries:['packSize','weight','allergens'],
 produce:['grade','origin','harvestDate'],
 household:['material','capacity','dimensions','colour','packSize'],
 hardware:['material','dimensions','grade','length'],
 spare_part:['partNumber','compatibleModels','condition'],
 service:['durationMinutes','serviceDescription'],
 general:[],
};
export function validateProductType(raw: unknown): string | null {
 if(raw === undefined || raw === null || raw === '') return null;
 if(typeof raw!=='string'||!(raw in KNOWN_PRODUCT_TYPE_FIELDS)) throw new BadRequestException('Choose a supported product type.');
 return raw;
}
export function cleanProductAttributes(raw: unknown, productType: string | null, customFieldKeys: readonly string[] = []): Record<string,string|number|boolean> {
 if(raw === undefined || raw === null) return {};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new BadRequestException('Product attributes must be valid fields.');
 const entries=Object.entries(raw);
 if(entries.length > 40) throw new BadRequestException('Too many product attributes.');
 if(JSON.stringify(raw).length > 8000) throw new BadRequestException('Product attributes are too large.');
 const allowed=new Set([...(KNOWN_PRODUCT_TYPE_FIELDS[productType??'general']??[]),...customFieldKeys]);
 const clean: Record<string,string|number|boolean> = {};
 for(const [key,value] of entries) {
  if(!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key)||!allowed.has(key))throw new BadRequestException(`Attribute ${key} is not available for this product category.`);
  if(typeof value==='string'&&value.length<=250)clean[key]=value.trim();
  else if(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<1e12)clean[key]=value;
  else if(typeof value==='boolean')clean[key]=value;
  else throw new BadRequestException(`Enter a valid value for ${key}.`);
 }
 return clean;
}
export function cleanCategoryAttributeSchema(raw: unknown): Array<{key:string;label:string;kind:'text'|'number'|'select';options?:string[]}> {
 if(raw===undefined || raw===null)return [];
 if(!Array.isArray(raw)||raw.length>25)throw new BadRequestException('Category fields must be a list of at most 25 definitions.');
 const seen=new Set<string>();
 return raw.map((v:unknown)=>{
  if(!v||typeof v!=='object'||Array.isArray(v))throw new BadRequestException('Invalid category field.');
  const x=v as Record<string,unknown>,key=x.key,label=x.label,kind=x.kind??'text';
  if(typeof key!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(key)||seen.has(key))throw new BadRequestException('Category field keys must be unique.');
  if(typeof label!=='string'||label.trim().length<1||label.length>100)throw new BadRequestException('Invalid category field label.');
  if(!['text','number','select'].includes(String(kind)))throw new BadRequestException('Invalid field type.');
  seen.add(key);
  const options=x.options === undefined ? [] : x.options;
  if(!Array.isArray(options)||options.length>60||options.some(o=>typeof o!=='string'||o.length>100))throw new BadRequestException('Invalid category field choices.');
  return {key,label:label.trim(),kind:kind as 'text'|'number'|'select',...(options.length?{options:[...new Set(options as string[])]}:{})};
 });
}
