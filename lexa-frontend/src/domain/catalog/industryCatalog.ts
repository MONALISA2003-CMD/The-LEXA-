/** Industry recommendations are display preferences, never authorization or tenant boundaries. */
export const INDUSTRY_OPTIONS = [
  ['retail_trade','Retail shops & supermarkets'],
  ['wholesale_distribution','Wholesale & distribution'],
  ['electronics','Electronics, TVs & appliances'],
  ['mobile_phones','Phones & accessories'],
  ['fashion_beauty','Fashion, shoes & accessories'],
  ['perfumes_cosmetics','Perfumes & cosmetics'],
  ['food_hospitality','Food, restaurants & hospitality'],
  ['bakery','Bakeries & prepared food'],
  ['agriculture','Agriculture & produce'],
  ['construction','Hardware & construction'],
  ['household_goods','Household & home goods'],
  ['professional_services','Professional services'],
  ['repair_services','Repairs & technical services'],
  ['healthcare','Healthcare & pharmacy'],
  ['manufacturing','Production & manufacturing'],
  ['logistics_transport','Transport & logistics'],
  ['education','Education & training'],
  ['other','Other business activities'],
] as const;
export type ProductField = {key: string; label: string; kind?: 'text'|'number'|'select'; options?: readonly string[]; unit?: string};
export type ProductPreset = {
  key: string; label: string; industries: readonly string[]; path: readonly string[];
  fields: readonly ProductField[]; stock: 'quantity'|'serial'|'batch'|'none'; unit: string;
  variants: readonly string[];
};
/** No example products or pretend stock are inserted. These are optional field templates. */
export const PRODUCT_PRESETS: readonly ProductPreset[] = [
 {key:'smartphone',label:'Smartphone / mobile phone',industries:['mobile_phones','electronics'],path:['Electronics','Phones','Smartphones'],unit:'Each',stock:'serial',variants:['storage','colour','condition'],fields:[{key:'model',label:'Model'},{key:'storage',label:'Storage',kind:'text'},{key:'ram',label:'RAM',kind:'text'},{key:'colour',label:'Colour'},{key:'condition',label:'Condition',kind:'select',options:['New','Used','Refurbished']},{key:'sim',label:'SIM configuration'},{key:'warrantyMonths',label:'Warranty (months)',kind:'number'}]},
 {key:'tv',label:'Television',industries:['electronics'],path:['Electronics','Televisions'],unit:'Each',stock:'serial',variants:['screenSize','model'],fields:[{key:'model',label:'Model'},{key:'screenSize',label:'Screen size'},{key:'resolution',label:'Resolution'},{key:'displayType',label:'Display technology'},{key:'connectivity',label:'Connectivity'},{key:'warrantyMonths',label:'Warranty (months)',kind:'number'}]},
 {key:'audio',label:'Radio / speaker / woofer',industries:['electronics'],path:['Electronics','Audio equipment'],unit:'Each',stock:'serial',variants:['model'],fields:[{key:'model',label:'Model'},{key:'powerWatts',label:'Power (W)',kind:'number'},{key:'connectivity',label:'Connectivity'},{key:'warrantyMonths',label:'Warranty (months)',kind:'number'}]},
 {key:'phone_accessory',label:'Phone accessory',industries:['mobile_phones','electronics'],path:['Electronics','Phone accessories'],unit:'Each',stock:'quantity',variants:['model','colour'],fields:[{key:'compatibleModels',label:'Compatible models'},{key:'colour',label:'Colour'},{key:'connector',label:'Connector / type'}]},
 {key:'clothing',label:'Clothing / boutique item',industries:['fashion_beauty'],path:['Fashion','Clothing'],unit:'Each',stock:'quantity',variants:['size','colour'],fields:[{key:'style',label:'Style'},{key:'size',label:'Size'},{key:'colour',label:'Colour'},{key:'material',label:'Material'},{key:'fit',label:'Fit'},{key:'gender',label:'Fit category'}]},
 {key:'footwear',label:'Shoes / footwear',industries:['fashion_beauty'],path:['Fashion','Footwear'],unit:'Pair',stock:'quantity',variants:['size','colour'],fields:[{key:'style',label:'Style'},{key:'sizeSystem',label:'Size system',kind:'select',options:['EU','UK','US','Other']},{key:'size',label:'Shoe size'},{key:'colour',label:'Colour'},{key:'material',label:'Material'}]},
 {key:'perfume',label:'Perfume / fragrance',industries:['perfumes_cosmetics','fashion_beauty'],path:['Beauty','Fragrances','Perfumes'],unit:'Bottle',stock:'quantity',variants:['concentration','bottleMl'],fields:[{key:'fragrance',label:'Fragrance / scent'},{key:'concentration',label:'Concentration',kind:'select',options:['EDP','EDT','Parfum','Cologne','Body mist','Other']},{key:'bottleMl',label:'Bottle size (ml)',kind:'number'},{key:'scentFamily',label:'Scent family'}]},
 {key:'cosmetic',label:'Cosmetic / beauty product',industries:['perfumes_cosmetics','fashion_beauty'],path:['Beauty','Cosmetics'],unit:'Each',stock:'batch',variants:['shade','volume'],fields:[{key:'shade',label:'Shade'},{key:'volume',label:'Size / volume'},{key:'ingredients',label:'Ingredients or composition'}]},
 {key:'bread',label:'Bread / bakery item',industries:['bakery','food_hospitality'],path:['Food','Bakery','Bread'],unit:'Loaf',stock:'batch',variants:['weightGrams'],fields:[{key:'weightGrams',label:'Weight (grams)',kind:'number'},{key:'ingredients',label:'Ingredients'},{key:'allergens',label:'Allergens'},{key:'shelfLifeDays',label:'Shelf life (days)',kind:'number'}]},
 {key:'groceries',label:'Grocery / packaged food',industries:['retail_trade','wholesale_distribution','food_hospitality'],path:['Food','Groceries'],unit:'Each',stock:'batch',variants:['packSize'],fields:[{key:'packSize',label:'Pack size'},{key:'weight',label:'Net weight'},{key:'allergens',label:'Allergens'}]},
 {key:'produce',label:'Agricultural produce',industries:['agriculture','wholesale_distribution'],path:['Agriculture','Produce'],unit:'Kg',stock:'batch',variants:['grade'],fields:[{key:'grade',label:'Grade'},{key:'origin',label:'Origin'},{key:'harvestDate',label:'Harvest date'}]},
 {key:'household',label:'Household / kitchen item',industries:['household_goods','retail_trade'],path:['Home','Household items'],unit:'Each',stock:'quantity',variants:['size','colour'],fields:[{key:'material',label:'Material'},{key:'capacity',label:'Capacity'},{key:'dimensions',label:'Dimensions'},{key:'colour',label:'Colour'},{key:'packSize',label:'Pack size'}]},
 {key:'hardware',label:'Hardware / building material',industries:['construction'],path:['Hardware','Building materials'],unit:'Each',stock:'quantity',variants:['dimensions'],fields:[{key:'material',label:'Material'},{key:'dimensions',label:'Dimensions'},{key:'grade',label:'Grade'},{key:'length',label:'Length'}]},
 {key:'spare_part',label:'Vehicle / equipment spare part',industries:['repair_services','electronics'],path:['Repairs','Spare parts'],unit:'Each',stock:'quantity',variants:['partNumber'],fields:[{key:'partNumber',label:'Part number'},{key:'compatibleModels',label:'Compatible models'},{key:'condition',label:'Condition'}]},
 {key:'service',label:'Service / labour',industries:['professional_services','repair_services','food_hospitality'],path:['Services'],unit:'Service',stock:'none',variants:[],fields:[{key:'durationMinutes',label:'Duration (minutes)',kind:'number'},{key:'serviceDescription',label:'Description'}]},
 {key:'general',label:'General product / other',industries:[],path:[],unit:'Each',stock:'quantity',variants:[],fields:[]},
] as const;
export const presetFor = (key: string): ProductPreset => PRODUCT_PRESETS.find(p => p.key === key) ?? PRODUCT_PRESETS[PRODUCT_PRESETS.length - 1]!;
export function suggestedPresets(industries: readonly string[]): ProductPreset[] {
  const selected = new Set(industries);
  return [...PRODUCT_PRESETS].sort((a,b)=> {
    const aRelevant = a.industries.some(k=>selected.has(k)) ? 0 : 1;
    const bRelevant = b.industries.some(k=>selected.has(k)) ? 0 : 1;
    return aRelevant-bRelevant || a.label.localeCompare(b.label);
  });
}
export function describeAttributes(attributes: Record<string,unknown> | undefined, keys: readonly string[]): string {
  if (!attributes) return '';
  return keys.map(k=>attributes[k]).filter(v=>typeof v==='string'||typeof v==='number').map(String).filter(Boolean).join(' · ');
}
