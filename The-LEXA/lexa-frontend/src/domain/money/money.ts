/** Currency amounts are stored as integers in each currency's minor unit. */
export function fractionDigitsForCurrency(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
  } catch {
    return 0;
  }
}

export function minorUnitFactor(currency: string): number {
  return 10 ** fractionDigitsForCurrency(currency);
}

export function parseMajorAmount(input: string, currency: string): number {
  const clean = input.trim().replace(/,/g, '');
  if (!clean) return 0;
  const value = Number(clean);
  if (!Number.isFinite(value) || value < 0) throw new Error('Enter a valid non-negative amount.');
  const factor = minorUnitFactor(currency);
  const minor = Math.round((value + Number.EPSILON) * factor);
  if (!Number.isSafeInteger(minor)) throw new Error('Amount is too large.');
  return minor;
}

export function formatMinorAmount(amountMinor: number, currency = 'UGX', locale = 'en-UG'): string {
  const factor = minorUnitFactor(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigitsForCurrency(currency),
    maximumFractionDigits: fractionDigitsForCurrency(currency),
  }).format(amountMinor / factor);
}

export function formatCompactMinorAmount(amountMinor: number, currency = 'UGX'): string {
  const factor = minorUnitFactor(currency);
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amountMinor / factor);
}

export function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole, non-negative amount.`);
  }
}
