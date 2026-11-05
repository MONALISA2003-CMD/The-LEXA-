/** Electronics service/after-sales invariants, shared by REST, batch workers and imports.
 * Pure functions are deliberately independent of Nest and the database client.
 */
import {EQUIPMENT_SUBTYPE_CONTRACT} from './equipment-subtypes.generated.js';
import {ELECTRONICS_V2_CONTRACT} from './electronics-catalogue-v2.generated.js';

export class EquipmentRuleError extends Error { constructor(message:string){super(message);this.name='EquipmentRuleError';} }
export type EquipmentSubtype=(typeof EQUIPMENT_SUBTYPE_CONTRACT.subtypes)[number];
export const EQUIPMENT_SUBTYPES:readonly EquipmentSubtype[]=EQUIPMENT_SUBTYPE_CONTRACT.subtypes;
export function subtypePolicy(code:string,expectedFamily?:string):EquipmentSubtype{
 const found:EquipmentSubtype|undefined=EQUIPMENT_SUBTYPES.find(s=>s.code===code);
 if(!found)throw new EquipmentRuleError('Choose a published electronics subtype.');
 const publishedFamily=ELECTRONICS_V2_CONTRACT.families.find(family=>family.code===found.familyCode);
 if(expectedFamily&&found.familyCode!==expectedFamily&&publishedFamily?.legacyProductType!==expectedFamily)
  throw new EquipmentRuleError('Subtype does not belong to the selected product family.');
 return found;
}
export function validateEquipmentSpecs(subtypeCode:string,values:unknown,manufacturerCode:unknown,expectedFamily?:string):Record<string,string|number|boolean>{
 const policy=subtypePolicy(subtypeCode,expectedFamily);
 if(policy.requiresVerifiedModelCode&&(typeof manufacturerCode!=='string'||!manufacturerCode.trim()||manufacturerCode.trim().length>120))throw new EquipmentRuleError('Enter the actual verified manufacturer model code.');
 if(!values||typeof values!=='object'||Array.isArray(values))throw new EquipmentRuleError('Provide model specifications as an object.');
 const input=values as Record<string,unknown>;
 if(Object.keys(input).length>45||JSON.stringify(input).length>8000)throw new EquipmentRuleError('Specification payload exceeds accepted size.');
 const allowed=new Map<string,(typeof policy.fields)[number]>(policy.fields.map(f=>[f.key,f]));
 const clean:Record<string,string|number|boolean>={};
 for(const [key,value] of Object.entries(input)){
  const field=allowed.get(key);if(!field)throw new EquipmentRuleError(`Specification ${key} is not valid for ${subtypeCode}.`);
  if(value===null||value===''||value===undefined)continue;
  if(field.type==='number'){
   if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e9)throw new EquipmentRuleError(`${key} must be a non-negative numeric value.`);
   clean[key]=value;
  }else if(field.type==='boolean'){
   if(typeof value!=='boolean')throw new EquipmentRuleError(`${key} must be true or false.`);
   clean[key]=value;
  }else{
   if(typeof value!=='string'||!value.trim()||value.length>250)throw new EquipmentRuleError(`${key} must be a valid string.`);
   if(field.type==='enum'&&'choices' in field&&!field.choices.some(x=>x===value.trim()))throw new EquipmentRuleError(`${key} must use a published option.`);
   clean[key]=value.trim();
  }
 }
 for(const field of policy.fields)if(field.required&&clean[field.key]===undefined)throw new EquipmentRuleError(`Required ${field.key} is missing.`);
 return clean;
}
export const FULFILMENT_TRANSITIONS={
 reserved:['picked','cancelled'],picked:['dispatched','cancelled'],dispatched:['delivered','delivery_failed'],delivery_failed:['dispatched','returned_to_warehouse'],delivered:[],returned_to_warehouse:[],cancelled:[]
} as const;
export type FulfilmentState=keyof typeof FULFILMENT_TRANSITIONS;
export function validateFulfilmentTransition(from:FulfilmentState,to:FulfilmentState):void{
 if(!(FULFILMENT_TRANSITIONS[from] as readonly string[]).includes(to))throw new EquipmentRuleError(`Cannot move a delivery from ${from} to ${to}.`);
}
export function requireExactSoldUnit(saleUnitIds:readonly string[],unitId:string):void{
 if(!saleUnitIds.includes(unitId))throw new EquipmentRuleError('The physical serial does not belong to this original sale line.');
}
export function validateMeterReading(previous:{total:number;colour:number}|null,next:{total:number;colour:number}):void{
 for(const v of [next.total,next.colour])if(!Number.isSafeInteger(v)||v<0||v>2_000_000_000)throw new EquipmentRuleError('Copy meter readings must be non-negative integers.');
 if(next.colour>next.total)throw new EquipmentRuleError('Colour count cannot exceed the total print count.');
 if(previous&&(next.total<previous.total||next.colour<previous.colour))throw new EquipmentRuleError('Meter reading cannot decrease without a documented meter replacement.');
}
export function exactRefurbishedUnitCost(initialCostMinor:number,partCostsMinor:readonly number[],approvedLabourMinor=0):number{
 const values=[initialCostMinor,...partCostsMinor,approvedLabourMinor];
 if(values.some(n=>!Number.isSafeInteger(n)||n<0))throw new EquipmentRuleError('Unit cost, parts and approved labour must use non-negative integer minor units.');
 const result=values.reduce((s,n)=>s+n,0);
 if(!Number.isSafeInteger(result)||result>2_000_000_000)throw new EquipmentRuleError('Refurbished unit cost exceeds supported accounting limits.');
 return result;
}
/** Integer minor-unit allocation: no floating-point split or missing remainder. */
export function allocateLandedCost(amountMinor:number,weights:readonly number[]):number[]{
 if(!Number.isSafeInteger(amountMinor)||amountMinor<0||amountMinor>2_000_000_000)throw new EquipmentRuleError('Landed cost must be integer minor units.');
 if(weights.length===0||weights.length>1000||weights.some(n=>!Number.isSafeInteger(n)||n<=0))throw new EquipmentRuleError('Provide positive integer allocation weights.');
 const total=weights.reduce((sum,n)=>sum+BigInt(n),0n),amount=BigInt(amountMinor);
 const shares=weights.map(n=>Number(amount*BigInt(n)/total));
 const remaining=amountMinor-shares.reduce((sum,n)=>sum+n,0);
 const ranking=weights.map((n,i)=>({i,remain:amount*BigInt(n)%total})).sort((a,b)=>a.remain===b.remain?a.i-b.i:(a.remain>b.remain?-1:1));
 for(let i=0;i<remaining;i++)shares[ranking[i]!.i]++;
 return shares;
}
export function validateFiscalClaim(status:'not_applicable'|'pending'|'confirmed'|'rejected',providerReference?:string,confirmedByAuthorizedProvider=false):void{
 if(status==='confirmed'&&(!confirmedByAuthorizedProvider||!providerReference?.trim()))throw new EquipmentRuleError('Fiscal confirmation needs an authorized provider reference and verified response.');
}
export type ReleaseCheck={backendBuild:boolean;frontendBuild:boolean;databaseMigrated:boolean;rlsVerified:boolean;restoreRehearsed:boolean;serialLedgerReconciled:boolean;financeReconciled:boolean;smokeTests:boolean;ownerApproved:boolean};
export function canPromoteElectronics(checks:ReleaseCheck):{allowed:boolean;missing:(keyof ReleaseCheck)[]}{
 const missing=(Object.keys(checks) as (keyof ReleaseCheck)[]).filter(k=>checks[k]!==true);
 return {allowed:missing.length===0,missing};
}
