/** Server-side validation; never accept unbounded or executable catalogue data. */
import { BadRequestException } from '@nestjs/common';
import { INDUSTRY_POLICIES, LEGACY_PRODUCT_TYPE_FIELDS } from './industry-contract.generated';
import { normaliseSavedIndustries } from '../business-setup/business-setup.rules';

export const KNOWN_PRODUCT_TYPE_FIELDS: Record<string,readonly string[]> = {
 ...Object.fromEntries(Object.entries(INDUSTRY_POLICIES).map(([key,p])=>[key,p.fields.map(field=>field.key)])),
 ...LEGACY_PRODUCT_TYPE_FIELDS,
};

export type CategoryFieldPolicy={key:string;label:string;kind:'text'|'number'|'select';options?:readonly string[];required?:boolean};
type TrackingPolicy = {trackStock:boolean;trackSerial:boolean;trackLot:boolean};
type ProductPresetPolicy = (typeof INDUSTRY_POLICIES)[keyof typeof INDUSTRY_POLICIES];
export function activePreset(key:string|null|undefined):ProductPresetPolicy|null {
 return key&&Object.prototype.hasOwnProperty.call(INDUSTRY_POLICIES,key)?(INDUSTRY_POLICIES as Record<string,ProductPresetPolicy>)[key]??null:null;
}
/** Historical retired product types remain readable; new types must belong to the active manifest. */
export function validateProductType(raw: unknown,existingType: string|null= null): string | null {
 if(raw === undefined || raw === null || raw === '') return null;
 if(typeof raw!=='string'||(!activePreset(raw)&&raw!==existingType))throw new BadRequestException('Choose a supported product type.');
 return raw;
}
/** Enforced here, not only by the React form: mobile, third-party and API clients obey the same policies. */
export async function assertTypeAllowed(db:{businessProfile:{findUnique:(args:any)=>Promise<any>}},tenantId:string,productType:string|null|undefined,existingType:string|null= null):Promise<void> {
 if(!productType||productType==='general')return;
 const preset=activePreset(productType);
 if(!preset){if(productType===existingType)return;throw new BadRequestException('This product type is retired or unsupported for new products.');}
 const profile=await db.businessProfile.findUnique({where:{tenantId},select:{industries:true,industry:true}});
 const selected=normaliseSavedIndustries(profile?.industries,profile?.industry);
 if(!selected.length)return; // Legacy workspaces without completed business setup remain editable.
 if(!preset.industries.some(code=>selected.includes(code)))throw new BadRequestException('This product type is not enabled for this business. Add its industry in Business Setup first.');
}
/** Stock policy is read by all downstream modules using the same product tracking flags. */
export function enforceTrackingPolicy(productType:string|null|undefined,tracking:TrackingPolicy):void {
 const preset=activePreset(productType);
 if(!preset||productType==='general')return; // Generic products keep configurable stock/non-stock semantics.
 if(preset.stock==='none'&&tracking.trackStock)throw new BadRequestException('Service items cannot be stock-tracked.');
 if(preset.stock!=='none'&&!tracking.trackStock)throw new BadRequestException('This item must be tracked in inventory.');
 if(preset.stock==='serial'&&!tracking.trackSerial)throw new BadRequestException('Serial or IMEI tracking is required for this product type.');
 if(preset.stock==='batch'&&!tracking.trackLot)throw new BadRequestException('Batch/lot tracking is required for this product type.');
}
export function cleanProductAttributes(raw: unknown,productType:string|null,customFieldKeys:readonly string[]=[],strictRequired=false,customFields:readonly CategoryFieldPolicy[]=[]):Record<string,string|number|boolean> {
 const entries = raw===undefined||raw===null ? [] : Object.entries(validateObject(raw));
 if(entries.length>40)throw new BadRequestException('Too many product attributes.');
 if(JSON.stringify(raw??{}).length>8000)throw new BadRequestException('Product attributes are too large.');
 const preset=activePreset(productType);
 const known=new Map<string,{kind?:string;label:string;required?:boolean;options?:readonly string[]}>([...customFields.map(f=>[f.key,f] as const),...(preset?.fields.map(f=>[f.key,f] as const)??[])]);
 const allowed=new Set([...(KNOWN_PRODUCT_TYPE_FIELDS[productType??'general']??[]),...customFieldKeys]);
 const clean:Record<string,string|number|boolean>={};
 for(const [key,value] of entries) {
  if(!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key)||!allowed.has(key))throw new BadRequestException(`Attribute ${key} is not available for this product category.`);
  const field=known.get(key);
  if(field?.kind==='text'&&typeof value!=='string')throw new BadRequestException(`${field.label} must be text.`);
  if(field?.kind==='select'&&typeof value!=='string')throw new BadRequestException(`Choose a valid ${field.label}.`);
  if(typeof value==='string'&&value.length<=250) {
    const trimmed=value.trim();
    if(field?.kind==='number') {
      if(trimmed!==''&&(!Number.isFinite(Number(trimmed))||Number(trimmed)<0))throw new BadRequestException(`${field.label} must be a non-negative number.`);
      if(trimmed!=='')clean[key]=Number(trimmed);
    } else {
      if(field?.kind==='select'&&trimmed&&field.options&&!field.options.includes(trimmed))throw new BadRequestException(`Choose a valid ${field.label}.`);
      if(trimmed!=='')clean[key]=trimmed;
    }
  } else if(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<1e12&&(!(field?.kind==='number')||value>=0))clean[key]=value;
  else if(typeof value==='boolean'&&!field)clean[key]=value;
  else throw new BadRequestException(`Enter a valid value for ${key}.`);
 }
 if(strictRequired)for(const field of [...customFields,...(preset?.fields??[])] as readonly {key:string;label:string;required?:boolean}[])if(field.required&&!(''+(clean[field.key]??'')).trim())throw new BadRequestException(`${field.label} is required for this product category.`);
 return clean;
}
function validateObject(raw:unknown):Record<string,unknown> {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Product attributes must be valid fields.');
 return raw as Record<string,unknown>;
}
/** Variant keys must represent actual sellable choices, not duplicate copies of the same SKU. */
export function validateVariantDimensions(productType:string|null|undefined,attributes:Record<string,string|number|boolean>):void {
 const preset=activePreset(productType);
 if(!preset?.variants.length)return;
 if(!preset.variants.some(key=>attributes[key]!==undefined&&String(attributes[key]).trim()!==''))
  throw new BadRequestException(`Enter at least one variant detail: ${preset.variants.join(', ')}.`);
}

export function cleanCategoryAttributeSchema(raw: unknown): CategoryFieldPolicy[] {
 if(raw===undefined || raw===null)return [];
 if(!Array.isArray(raw)||raw.length>25)throw new BadRequestException('Category fields must be a list of at most 25 definitions.');
 const seen=new Set<string>();
 return raw.map((v:unknown)=>{
  if(!v||typeof v!=='object'||Array.isArray(v))throw new BadRequestException('Invalid category field.');
  const x=v as Record<string,unknown>,key=x.key,label=x.label,kind=x.kind??'text';
  if(x.required!==undefined&&typeof x.required!=='boolean')throw new BadRequestException('Category required rule must be true or false.');
  if(typeof key!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(key)||seen.has(key))throw new BadRequestException('Category field keys must be unique.');
  if(typeof label!=='string'||label.trim().length<1||label.length>100)throw new BadRequestException('Invalid category field label.');
  if(!['text','number','select'].includes(String(kind)))throw new BadRequestException('Invalid field type.');
  seen.add(key);
  const options=x.options === undefined ? [] : x.options;
  if(!Array.isArray(options)||options.length>60||options.some(o=>typeof o!=='string'||o.length>100||!o.trim()))throw new BadRequestException('Invalid category field choices.');
  if(kind==='select'&&options.length===0)throw new BadRequestException('Select fields must have at least one choice.');
  return {key,label:label.trim(),kind:kind as 'text'|'number'|'select',...(x.required===true?{required:true}:{}),...(options.length?{options:[...new Set((options as string[]).map(o=>o.trim()))]}:{})};
 });
}
