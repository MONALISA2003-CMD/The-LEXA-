import type {ElectronicsReceiptUnit} from '../../data/remote/apiWorkstream03';
/** Browser-side fast feedback. The server and PostgreSQL are authoritative. */
export function isValidImeiNumber(value:string):boolean {
 if(!/^\d{15}$/.test(value))return false;
 let checksum=0;
 for(let i=0;i<15;i++){let n=Number(value[i]);if(i%2===1){n*=2;if(n>9)n-=9;}checksum+=n;}
 return checksum%10===0;
}
export function isValidPhysicalIdentifier(value:string,imei:boolean):boolean {
 return imei?isValidImeiNumber(value.trim()):Boolean(value.trim().length&&value.trim().length<=120&&!/[\u0000-\u001f\u007f]/.test(value));
}
export function validateReceiptDraft(rows:readonly ElectronicsReceiptUnit[],imei:boolean):string[]{
 const errors:string[]=[],seen=new Set<string>();
 if(rows.length>100)errors.push('A receipt can contain at most 100 physical units.');
 rows.forEach((unit,i)=>{
  for(const identifier of [unit.serialNumber,...(unit.imei2?[unit.imei2]:[]),...(unit.extraImeis??[])]){
   const normalized=identifier.trim().toUpperCase();
   if(!isValidPhysicalIdentifier(identifier,imei))errors.push(`Unit ${i+1}: invalid ${imei?'IMEI':'serial'} identifier.`);
   if(seen.has(normalized))errors.push(`Unit ${i+1}: duplicate identifier in draft.`);
   seen.add(normalized);
  }
  if(!imei&&(unit.imei2||unit.extraImeis?.length))errors.push(`Unit ${i+1}: noncellular products cannot have additional IMEIs.`);
  if((unit.extraImeis?.length??0)>6)errors.push(`Unit ${i+1}: too many additional IMEIs.`);
 });
 return errors;
}
