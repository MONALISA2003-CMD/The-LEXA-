/** Fail-closed policy for point-of-sale accessory suggestions.
 * Proposals and old unreviewed links are NEVER treated as recommendations.
 * Electrical and consumable goods need an explicitly typed manufacturer review.
 */
export type AccessoryFitmentRecord = {
  compatibilityKind:string;
  reviewState:string;
  verifiedAt:Date|null;
  revokedAt:Date|null;
  evidence:unknown;
};
const ELECTRICAL_ACCESSORIES=new Set(['charger','power_bank','computer_charger','laptop_charger','dock','docking_station','solar_charger','inverter_accessory','power_adapter','ups_accessory']);
const CONSUMABLE_ACCESSORIES=new Set(['toner','ink','ink_cartridge','toner_cartridge','printer_consumable','printer_ink','printer_toner']);
export function safeAccessoryFitment(productType:string|null|undefined,record:AccessoryFitmentRecord):boolean{
 if(record.reviewState!=='verified'||!record.verifiedAt||record.revokedAt)return false;
 if(!record.evidence||typeof record.evidence!=='object'||Array.isArray(record.evidence))return false;
 const evidence=record.evidence as Record<string,unknown>;
 if(typeof evidence.reference!=='string'||evidence.reference.trim().length<5)return false;
 if(ELECTRICAL_ACCESSORIES.has(productType??'')&&record.compatibilityKind!=='electrical')return false;
 if(CONSUMABLE_ACCESSORIES.has(productType??'')&&record.compatibilityKind!=='consumable')return false;
 if(record.compatibilityKind==='electrical'){
  if(evidence.checkedElectricalSafety!==true)return false;
  if(typeof evidence.voltageRange!=='string'||!evidence.voltageRange.trim())return false;
  if(typeof evidence.connectorType!=='string'||!evidence.connectorType.trim())return false;
  if(typeof evidence.currentAmps!=='number'||!Number.isFinite(evidence.currentAmps)||evidence.currentAmps<=0)return false;
 }
 return ['physical','electrical','protocol','consumable'].includes(record.compatibilityKind);
}
