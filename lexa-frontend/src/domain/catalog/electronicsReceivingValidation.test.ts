import {describe,it,expect} from 'vitest';
import {isValidImeiNumber,validateReceiptDraft} from './electronicsReceivingValidation';
import {familyForCategory,makeWizardFields,validGtin,validateWizardVariants,validateWizardVariantAxes} from './electronicsFamilyWizard';
import {ELECTRONICS_V2_CONTRACT} from './electronics-catalogue-v2.generated';

describe('Electronics receiving and variant integrity',()=>{
 it('maps only selectable catalogue leaves to their published product family',()=>{
  // Division and intermediate category nodes have no familyCode by design.
  expect(familyForCategory({catalogCode:'ELEC.MOB'})).toBeNull();
  expect(familyForCategory({catalogCode:'ELEC.MOB.FEATURE'})).toBeNull();
  expect(familyForCategory({catalogCode:'ELEC.MOB.FEATURE.GSM'})?.code).toBe('feature_phone');
  expect(familyForCategory({catalogCode:'ELEC.ACC.CHARGE.WALL'})?.code).toBe('charger');
  expect(familyForCategory({catalogCode:'ELEC.COMP.LAPTOP.STUDENT'})?.code).toBe('laptop');
  expect(familyForCategory({catalogCode:'ELEC.HOME.COLD.SINGLE'})?.code).toBe('refrigerator');
  expect(familyForCategory({catalogCode:'ELEC.UNKNOWN'})).toBeNull();
  expect(familyForCategory(null)).toBeNull();
 });
 it('uses the canonical immutable family fields without rewriting the published policy',()=>{
  const family=familyForCategory({catalogCode:'ELEC.MOB.FEATURE.GSM'});
  expect(family).not.toBeNull();
  if(!family)throw new Error('Feature phone policy is unavailable.');
  const fields=makeWizardFields(family);
  expect(fields.some(field=>field.key==='simSlots')).toBe(true);
  expect(fields).toEqual(ELECTRONICS_V2_CONTRACT.families.find(item=>item.code==='feature_phone')?.fields);
 });
 it('accepts one IMEI for a two-SIM feature phone as exactly one physical unit',()=>{
  const draft=[{serialNumber:'490154203237518',condition:'new' as const}];
  expect(validateReceiptDraft(draft,true)).toEqual([]);
  expect(draft).toHaveLength(1);
 });
 it('treats dual IMEIs as one physical unit, not two available stock units',()=>{
  const draft=[{serialNumber:'490154203237518',imei2:'490154203237526'}];
  expect(validateReceiptDraft(draft,true)).toEqual([]);
  expect(draft).toHaveLength(1);
 });
 it('rejects accidental re-scans and invalid Luhn check digits',()=>{
  expect(isValidImeiNumber('490154203237518')).toBe(true);
  expect(isValidImeiNumber('490154203237519')).toBe(false);
  expect(validateReceiptDraft([{serialNumber:'490154203237518'},{serialNumber:'490154203237518'}],true).some(x=>x.includes('duplicate'))).toBe(true);
 });
 it('rejects second IMEI on unconnected devices',()=>{
  expect(validateReceiptDraft([{serialNumber:'ABC-012',imei2:'490154203237526'}],false)).not.toEqual([]);
 });
 it('validates GS1 check digits and published phone variation types',()=>{
  expect(validGtin('012345678905')).toBe(true);
  expect(validGtin('012345678906')).toBe(false);
  const family=ELECTRONICS_V2_CONTRACT.families.find(item=>item.code==='smartphone');
  expect(family).toBeDefined();
  if(!family)throw new Error('Smartphone catalogue policy missing.');
  const verified={...family,enabled:true};
  expect(validateWizardVariantAxes([{attributes:{storageGb:'128',colour:'Black'}}],verified)).toEqual([]);
  expect(validateWizardVariantAxes([{attributes:{storageGb:'128GB'}}],verified)).not.toEqual([]);
  expect(validateWizardVariantAxes([{attributes:{unpublishedAxis:'Yes'}}],verified)).not.toEqual([]);
 });
 it('rejects SKU duplication and barcode-to-GTIN collisions before server submission',()=>{
  expect(validateWizardVariants([{sku:'CABLE-A',barcode:'012345678905'},{sku:'CABLE-A',gtin:'012345678905'}],[]).length).toBeGreaterThan(0);
 });
});
