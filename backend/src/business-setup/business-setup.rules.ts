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

const industries = new Set(['retail_trade','wholesale_distribution','food_hospitality','electronics','fashion_beauty','construction','agriculture','professional_services','healthcare','manufacturing','logistics_transport','education','other']);
const businessModels = new Set(['retail','wholesale','distribution','services','manufacturing','rental','subscription','mixed','other']);
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
    const industry = text(body.industry,'Industry',80,true);
    if (!industries.has(industry)) throw new SetupValidationError('Choose a valid industry.');
    return {step:2 as const,industry,businessModels:picks(body.businessModels,businessModels,'business models'),offeringTypes:picks(body.offeringTypes,offeringTypes,'offerings'),offeringsDescription:text(body.offeringsDescription,'What you sell or do',500,true),sellingChannels:picks(body.sellingChannels,sellingChannels,'selling channels',false)};
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
