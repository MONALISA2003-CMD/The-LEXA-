import { createHash, randomUUID } from 'node:crypto';

export type ImportType = 'products'|'categories'|'product_variants'|'customers'|'suppliers'|'warehouses'|'storage_bins';
export const IMPORT_TEMPLATES: Record<ImportType,{version:number;required:string[];optional:string[]}> = {
 products:{version:2,required:['sku','name','product_type'],optional:['attributes_json','barcode','brand','unit_of_measure','category_name','cost_price_minor','selling_price_minor','low_stock_threshold','track_stock','track_lot','track_serial','active']},
 categories:{version:1,required:['name'],optional:[]}, product_variants:{version:2,required:['product_sku','sku'],optional:['barcode','gtin','attributes_json','cost_price_minor','selling_price_minor','active']},
 customers:{version:1,required:['customer_code','name'],optional:['email','phone','tax_number','address']}, suppliers:{version:1,required:['supplier_code','name'],optional:['email','phone','tax_number','address']},
 warehouses:{version:1,required:['code','name'],optional:['active']}, storage_bins:{version:1,required:['warehouse_code','code','name'],optional:['bin_type','active']}
};
export function parseCsv(input:string, delimiter?:string){
 input=input.replace(/^\uFEFF/,'');
 if(input.length>25*1024*1024) throw new Error('CSV exceeds 25 MiB.');
 const first=input.slice(0,8192); const candidates=delimiter?[delimiter]:[',',';','\t'];
 const delim=candidates.map(d=>({d,n:(first.split('\n')[0].match(new RegExp(d==='\t'?'\\t':`\\${d}`,'g'))||[]).length})).sort((a,b)=>b.n-a.n)[0]?.d||',';
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'&&input[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"'){quoted=true;}else if(c===delim){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw new Error('Unclosed quoted field.');if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}if(!rows.length)throw new Error('CSV is empty.');
 const headers=rows.shift()!.map(h=>h.trim());if(!headers.length||headers.some(h=>!h)||new Set(headers).size!==headers.length)throw new Error('Headers must be non-empty and unique.');
 return {delimiter:delim,headers,rows:rows.filter(r=>r.some(v=>v.trim())).map((r,i)=>({line:i+2,values:Object.fromEntries(headers.map((h,j)=>[h,(r[j]??'').trim()]))}))};
}
export const sha256=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
export const rowKey=(jobId:string,line:number)=>sha256(`${jobId}:${line}`).slice(0,48);
export interface MappedImportRow { line:number; values:Record<string,string>; after:Record<string,string>; errors:string[]; action:'invalid'|'create'|'update'|'skip'; before?:Record<string,unknown>; }
export function validateMappedRows(type:ImportType, rows:{line:number;values:Record<string,string>}[], mapping:Record<string,string>, defaults:Record<string,string>={}):MappedImportRow[]{
 const template=IMPORT_TEMPLATES[type];if(!template)throw new Error('Unsupported importer.');
 const mapped=rows.map(r=>{const value:Record<string,string>={...defaults};for(const [source,target] of Object.entries(mapping)){if(r.values[source]!==undefined)value[target]=r.values[source];}const errors:string[]=[];for(const field of template.required)if(!String(value[field]??'').trim())errors.push(`Missing required field: ${field}`);
  for(const f of ['cost_price_minor','selling_price_minor','rate_basis_points'])if(value[f]!==undefined&&value[f]!==''&&(!/^\d+$/.test(value[f])||Number(value[f])<0))errors.push(`${f} must be a non-negative integer.`);
  if(value.low_stock_threshold!==undefined&&value.low_stock_threshold!==''&&(!/^\d+(?:\.\d{1,3})?$/.test(value.low_stock_threshold)||Number(value.low_stock_threshold)<0))errors.push('low_stock_threshold must be a non-negative quantity with at most 3 decimals.');
  for(const f of ['active','track_stock','track_lot','track_serial'])if(value[f]!==undefined&&!['true','false','1','0','yes','no'].includes(value[f].toLowerCase()))errors.push(`${f} must be true/false.`);
  if(['product_variants','products'].includes(type)&&value.attributes_json){try{const parsed=JSON.parse(value.attributes_json);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))errors.push('attributes_json must be a JSON object.');}catch{errors.push('attributes_json must contain valid JSON.');}}
  const action: MappedImportRow['action'] = errors.length ? 'invalid' : 'create';
  return {...r,after:value,errors,action,before:undefined as Record<string,unknown>|undefined};});
 const seen=new Set<string>();for(const r of mapped){const key=String(r.after.sku??r.after.code??r.after.customer_code??r.after.supplier_code??r.after.name??'').toLowerCase();if(key&&seen.has(key)){r.errors.push('Duplicate stable identifier within file.');r.action='invalid';}if(key)seen.add(key);}
 return mapped;
}
export function spreadsheetSafe(value:unknown){const s=String(value??'');return /^[\s\u0000-\u001f]*[=+@\-]/.test(s)?`'${s}`:s;}
export function csvEncode(headers:string[],rows:Record<string,unknown>[]){return [headers.join(','),...rows.map(r=>headers.map(h=>`"${spreadsheetSafe(r[h]).replace(/"/g,'""')}"`).join(','))].join('\r\n');}
export function newJobId(){return randomUUID();}
