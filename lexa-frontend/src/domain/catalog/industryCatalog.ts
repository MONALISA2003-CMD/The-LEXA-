/** Same versioned catalogue as backend. Do not edit the generated JSON by hand. */
import manifest from './industry-manifest.json' with { type: 'json' };
import { availableBusinessSpecialties,recommendedBusinessProducts } from './business-specialties.generated.ts';
export { availableBusinessSpecialties,recommendedBusinessProducts } from './business-specialties.generated.ts';

export const INDUSTRY_OPTIONS: readonly (readonly [string,string])[] = manifest.industries.map(i=>[i.code,i.label] as const);
export const RETIRED_INDUSTRIES: readonly string[] = manifest.retiredIndustryCodes;
export type ProductField = {key: string; label: string; kind?: 'text'|'number'|'select'|'boolean'; options?: readonly string[]; unit?: string; required?: boolean};
export type ProductPreset = {
  key: string; label: string; industries: readonly string[]; path: readonly string[];
  fields: readonly ProductField[]; stock: 'quantity'|'serial'|'batch'|'none'; unit: string;
  variants: readonly string[]; identifiers: readonly string[];
};
/** A product hierarchy template never creates pretend stock or real customer records. */
export const PRODUCT_PRESETS: readonly ProductPreset[] = manifest.presets.map(p=>({
  ...p,stock:p.stock as ProductPreset['stock'],fields:p.fields.map(f=>({...f,kind:(f.kind??'text') as NonNullable<ProductField['kind']>}))
}));
export const INDUSTRY_CATEGORY_PATHS: Readonly<Record<string,readonly (readonly string[])[]>> = Object.fromEntries(manifest.industries.map(i=>[i.code,i.categoryPaths]));
export const CATALOGUE_VERSION = manifest.schemaVersion;
export const presetFor = (key: string): ProductPreset => PRODUCT_PRESETS.find(p => p.key === key) ?? PRODUCT_PRESETS[PRODUCT_PRESETS.length - 1]!;
/** An existing item can still be edited even when its former industry has been retired. */
export function permittedPresets(industries: readonly string[], currentType?:string): ProductPreset[] {
  const selected = new Set(industries);
  return PRODUCT_PRESETS.filter(p=>!industries.length||p.key==='general'||p.key===currentType||!p.industries.length||p.industries.some(k=>selected.has(k)));
}
export function suggestedPresets(industries: readonly string[], currentType?:string): ProductPreset[] {
  const selected = new Set(industries);
  return permittedPresets(industries,currentType).sort((a,b)=>{
    const aRelevant = a.industries.some(k=>selected.has(k)) ? 0 : 1;
    const bRelevant = b.industries.some(k=>selected.has(k)) ? 0 : 1;
    return aRelevant-bRelevant || a.label.localeCompare(b.label);
  });
}
/** The first product menu follows the niches picked by the owner; historical products remain readable. */
export function firstViewPresets(industries:readonly string[], specialties:readonly string[], currentType?:string):ProductPreset[]{
 const permitted=suggestedPresets(industries,currentType);
 const selected=availableBusinessSpecialties(industries).filter(item=>specialties.includes(item.code));
 if(!selected.length)return permitted;
 const preferred=new Set(recommendedBusinessProducts(industries,specialties));
 const selectedIndustries=new Set(selected.map(item=>item.industryCode));
 const unscoped=permitted.filter(item=>item.industries.some(industry=>!selectedIndustries.has(industry)));
 const first=permitted.filter(item=>preferred.has(item.key)||item.key===currentType);
 const result=[...first,...unscoped.filter(item=>!first.includes(item))];
 return result.length?result:permitted;
}
/**
 * A business without any selected industry should start with the flexible
 * general product, not the first alphabetical specialist preset. The latter
 * may require an IMEI, model or batch attributes that a normal item lacks.
 */
export function initialProductPreset(industries:readonly string[], specialties:readonly string[]):ProductPreset {
  if (!industries.length) return presetFor('general');
  return firstViewPresets(industries, specialties).find(p => p.key !== 'general') ?? presetFor('general');
}
export function suggestedCategoryPaths(industries:readonly string[]): readonly (readonly string[])[] {
  const paths=industries.flatMap(code=>INDUSTRY_CATEGORY_PATHS[code]??[]);
  return paths.filter((path,index)=>paths.findIndex(p=>p.join('/')===path.join('/'))===index);
}
export function validateProductDraft(productType:string,attrs:Record<string,string>,tracking:{trackStock:boolean;trackSerial:boolean;trackLot:boolean},industries:readonly string[]):string[] {
  const errors:string[]=[];
  const preset=PRODUCT_PRESETS.find(p=>p.key===productType);
  if(!preset)return ['Choose a supported product type.'];
  if(!permittedPresets(industries).includes(preset))return ['Choose a product type offered by the business.'];
  for(const field of preset.fields){const value=attrs[field.key]?.trim()??'';
    if(field.required&&!value)errors.push(`${field.label} is required.`);
    if(field.kind==='number'&&value&&(!Number.isFinite(Number(value))||Number(value)<0))errors.push(`${field.label} must be a non-negative number.`);
    if(field.kind==='select'&&value&&field.options&&!field.options.includes(value))errors.push(`Select a valid ${field.label}.`);
  }
  if(preset.key==='general')return errors; // Flexible generic products may represent stock or services.
  if(preset.stock==='serial'&&(!tracking.trackStock||!tracking.trackSerial))errors.push('This product requires individual serial/IMEI tracking.');
  if(preset.stock==='batch'&&(!tracking.trackStock||!tracking.trackLot))errors.push('This product requires lot/batch tracking.');
  if(preset.stock==='none'&&tracking.trackStock)errors.push('This is a non-stock service.');
  if(preset.stock==='quantity'&&!tracking.trackStock)errors.push('This product requires quantity stock tracking.');
  return errors;
}
export function describeAttributes(attributes: Record<string,unknown> | undefined, keys: readonly string[]): string {
  if (!attributes) return '';
  return keys.map(k=>attributes[k]).filter(v=>typeof v==='string'||typeof v==='number').map(String).filter(Boolean).join(' · ');
}
