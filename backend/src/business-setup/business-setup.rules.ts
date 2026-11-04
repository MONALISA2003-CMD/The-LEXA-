export class SetupValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'SetupValidationError'; }
}

export const availablePaymentCodes = [
  { code: 'cash', label: 'Cash' },
  { code: 'mtn_momo', label: 'MTN Mobile Money (record only)' },
  { code: 'airtel_money', label: 'Airtel Money (record only)' },
  { code: 'mobile_money', label: 'Other mobile money (record only)' },
  { code: 'bank_transfer', label: 'Bank transfer (record only)' },
  { code: 'card_recorded', label: 'Card payment (record only)' },
  { code: 'cheque', label: 'Cheque (record only)' },
  { code: 'other', label: 'Other (record only)' },
] as const;

export const availableIndustryCodes = ["retail_trade", "wholesale_distribution", "electronics", "mobile_phones", "fashion_beauty", "perfumes_cosmetics", "food_hospitality", "bakery", "construction", "household_goods", "repair_services", "education", "other"] as const;
export const retiredIndustryCodes = ["agriculture", "healthcare", "manufacturing", "logistics_transport", "professional_services"] as const;
const industries = new Set<string>(availableIndustryCodes);
const LEGACY_INDUSTRY_CODES: Readonly<Record<string,string>> = Object.freeze({
  retail:'retail_trade',wholesale:'wholesale_distribution',restaurant:'food_hospitality',
  food:'food_hospitality',services:'other',fashion:'fashion_beauty',
  beauty:'perfumes_cosmetics',phones:'mobile_phones',general:'other',
});
/** Retired codes remain historic data only; never selectable by new API clients. */
const retired = new Set<string>(retiredIndustryCodes);
export function normaliseSavedIndustries(saved: unknown, legacy: unknown = undefined): string[] {
  const raw = Array.isArray(saved) ? saved : [];
  const active = [...new Set(raw.filter((code): code is string => typeof code === 'string' && industries.has(code)))];
  if (active.length) return active;
  if (raw.some(code => typeof code === 'string' && retired.has(code))) return ['other'];
  const fromLegacy = normaliseLegacyIndustry(legacy);
  return fromLegacy ? [fromLegacy] : [];
}
/** Preserve historical product and finance data while excluding retired industries. */
export function normaliseLegacyIndustry(value: unknown): string | null {
  if(typeof value !== 'string' || !value.trim()) return null;
  const normalized=value.trim().toLowerCase();
  return industries.has(normalized) ? normalized : (LEGACY_INDUSTRY_CODES[normalized] ?? 'other');
}
/** Owner choices are unrestricted combinations of supported industry codes, not subscription seats. */
export function selectIndustries(value: unknown, legacyIndustry: unknown = undefined): string[] {
 // Existing records may contain historical industry names and are normalized when read.
 // Newly submitted values must be recognised; silently mapping a typo to 'other'
 // would hide a registration mistake and invalidate the business profile.
 if (value !== undefined && !Array.isArray(value)) throw new SetupValidationError('Choose valid business activities.');
 const legacy = typeof legacyIndustry === 'string' ? legacyIndustry.trim().toLowerCase() : '';
 if (!Array.isArray(value) && legacy && !industries.has(legacy) && !Object.prototype.hasOwnProperty.call(LEGACY_INDUSTRY_CODES, legacy)) {
   throw new SetupValidationError('Choose a valid business industry.');
 }
 const requested = Array.isArray(value) ? value : (legacy ? [industries.has(legacy) ? legacy : LEGACY_INDUSTRY_CODES[legacy]!] : []);
 if (requested.length > availableIndustryCodes.length || requested.some(x => typeof x !== 'string' || !industries.has(x))) throw new SetupValidationError('Choose available business activities.');
 const unique = [...new Set(requested)];
 if (!unique.length) throw new SetupValidationError('Choose at least one business activity.');
 return unique;
}
const businessModels = new Set(['retail','wholesale','distribution','services','rental','subscription','mixed','other']);
const offeringTypes = new Set(['physical_goods','services','digital_goods','subscriptions','rentals']);
const sellingChannels = new Set(['shop','field_sales','online','social','b2b','delivery','other']);
const allowedMethods = new Set(availablePaymentCodes.map(m => m.code));
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SetupValidationError('Enter valid business setup details.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, required = false): string {
  if (value === null || value === undefined || value === '') {
    if (required) throw new SetupValidationError(`${label} is required.`);
    return '';
  }
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new SetupValidationError(`${label} must be valid and under ${max} characters.`);
  return value.trim();
}
function picks(value: unknown, allowed: Set<string>, label: string, required = true): string[] {
  if (!Array.isArray(value) || value.length > 12 || value.some(v => typeof v !== 'string' || !allowed.has(v))) throw new SetupValidationError(`Select valid ${label}.`);
  const unique = [...new Set(value as string[])];
  if (required && unique.length === 0) throw new SetupValidationError(`Choose at least one ${label}.`);
  return unique;
}
export type BusinessSetupStep = 1 | 2 | 3;
export function validateSetupStep(value: unknown) {
  const body = object(value);
  if (body.step === 1) {
    const country = text(body.country, 'Country', 2, true).toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new SetupValidationError('Choose a valid country code.');
    const onlineOnly = body.onlineOnly === true;
    const physicalAddress = text(body.physicalAddress, 'Address', 250);
    const city = text(body.city, 'City or town', 120);
    if (!onlineOnly && !physicalAddress && !city) throw new SetupValidationError('Enter your location or select online-only.');
    const email = text(body.email, 'Business email', 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SetupValidationError('Enter a valid business email.');
    const website = text(body.website, 'Website', 250);
    if (website && (!/^https:\/\//i.test(website) || !/^https:\/\/[^\s/]+\.[^\s/]+/.test(website))) throw new SetupValidationError('Website must begin with https:// and have a valid host.');
    return {step:1 as const,businessName:text(body.businessName,'Business name',100,true),branchName:text(body.branchName,'First branch',80,true),tradingName:text(body.tradingName,'Trading name',100),legalName:text(body.legalName,'Legal name',160),country,district:text(body.district,'District',120),city,physicalAddress,onlineOnly,email,phone:text(body.phone,'Business phone',40),website,registrationNumber:text(body.registrationNumber,'Registration number',100),taxIdentificationNumber:text(body.taxIdentificationNumber,'Tax identification number',100)};
  }
  if (body.step === 2) {
    const selected = selectIndustries(body.industries, body.industry);
    const industry = selected.includes(body.industry as string) ? body.industry as string : selected[0]!;
    return {step:2 as const,industry,industries:selected,businessModels:picks(body.businessModels,businessModels,'business models'),offeringTypes:picks(body.offeringTypes,offeringTypes,'offerings'),offeringsDescription:text(body.offeringsDescription,'What you sell or do',500,true),sellingChannels:picks(body.sellingChannels,sellingChannels,'selling channels',false)};
  }
  if (body.step === 3) {
    const currency = text(body.currency,'Currency',3,true).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new SetupValidationError('Use a valid three-letter currency code.');
    const timezone = text(body.timezone,'Timezone',80,true);
    if (!['Africa/Kampala','Africa/Nairobi','Africa/Dar_es_Salaam','Africa/Kigali','UTC','Europe/London','America/New_York'].includes(timezone)) throw new SetupValidationError('Choose a supported timezone.');
    const methods = picks(body.methods,allowedMethods,'payment recording methods');
    if (body.confirmation !== true) throw new SetupValidationError('The business owner must confirm that LEXA only records payments independently verified by the business.');
    return {step:3 as const,currency,timezone,methods,confirmation:true as const};
  }
  throw new SetupValidationError('Choose a valid business setup step.');
}
