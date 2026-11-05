import {describe,expect,it} from 'vitest';
import {ELECTRONICS_V2_CONTRACT} from './electronics-catalogue-v2.generated';
import {describeElectronicsStockPolicy} from './electronicsFamilyTracking';

const get = (code: string) => {
  const result = ELECTRONICS_V2_CONTRACT.families.find(family=>family.code===code);
  if (!result) throw new Error(`Missing catalogue family ${code}`);
  return result;
};

describe('published electronics stock tracking descriptions',()=>{
  it('treats a feature phone as exact-unit IMEI stock with an optional second IMEI',()=>{
    expect(describeElectronicsStockPolicy(get('feature_phone'))).toBe('Track each unit: IMEI, IMEI 2 (if assigned)');
  });
  it('treats phone accessories as SKU quantities rather than device serials',()=>{
    expect(describeElectronicsStockPolicy(get('charger'))).toBe('Track quantity by sellable SKU');
  });
  it('uses the correct policy for every one of the published families',()=>{
    for(const family of ELECTRONICS_V2_CONTRACT.families){
      const label=describeElectronicsStockPolicy(family);
      expect(label).toBeTruthy();
      if(family.stockProfile==='serial')expect(label).toContain('Track each unit');
      if(family.stockProfile==='quantity')expect(label).toContain('quantity');
    }
  });
});
