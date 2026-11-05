/** Deterministic sellable SKU matrix. The backend owns uniqueness and atomic creation. */
export type MatrixVariant={sku:string;attributes:Record<string,string>};
export function buildVariantMatrix(prefix:string, dimensions:readonly string[], draft:Readonly<Record<string,string>>, max=80):MatrixVariant[]{
 const keys=dimensions.filter(key=>Boolean(draft[key]?.trim()));
 if(!keys.length)return [];
 let rows:Record<string,string>[]=[{}];
 for(const key of keys){
  const values=[...new Map((draft[key]??'').split(/[,\n]/).map(v=>v.trim()).filter(Boolean).map(v=>[v.toLocaleLowerCase(),v] as const)).values()];
  if(!values.length)continue;
  if(rows.length*values.length>max)throw new Error(`Too many combinations. Limit this batch to ${max} variants.`);
  rows=rows.flatMap(row=>values.map(v=>({...row,[key]:v})));
 }
 const base=prefix.trim().toUpperCase();
 if(!base||base.length>55||!/^[A-Z0-9][A-Z0-9._-]*$/.test(base))throw new Error('Enter a short SKU prefix using letters, numbers, hyphens or underscores.');
 const skus=new Set<string>();
 return rows.map(attributes=>{
  const suffix=keys.map(key=>attributes[key]!.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toUpperCase().slice(0,14)).filter(Boolean).join('-');
  const sku=(base+'-'+suffix).slice(0,80);
  if(skus.has(sku))throw new Error('Two combinations generate the same SKU. Use distinct variant values or shorter labels.');
  skus.add(sku);
  return {sku,attributes};
 });
}
