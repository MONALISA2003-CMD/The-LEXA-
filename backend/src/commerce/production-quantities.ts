/** Exact fixed-point inventory arithmetic. All authoritative stock quantities have
 * three decimal places; monetary amounts are integer minor currency units.
 * API callers pass decimal strings, never IEEE-754 derived quantities.
 */
export class ProductionQuantityError extends Error { constructor(message: string) { super(message); this.name = 'ProductionQuantityError'; } }
const SCALE = 1000n;
const LIMIT = 1_000_000_000_000n;

export function quantityMilli(input: unknown, label = 'Quantity', allowZero = false): bigint {
  if (typeof input !== 'string' || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(input)) {
    throw new ProductionQuantityError(`${label} must be a decimal string with at most three decimal places.`);
  }
  const [whole, part = ''] = input.split('.');
  const units = BigInt(whole!) * SCALE + BigInt(part.padEnd(3, '0') || '0');
  if ((!allowZero && units === 0n) || units > LIMIT) throw new ProductionQuantityError(`${label} is outside the permitted range.`);
  return units;
}
export function formatMilli(value: bigint): string {
  if (value < 0n || value > LIMIT) throw new ProductionQuantityError('Quantity exceeds the supported range.');
  const fraction = (value % SCALE).toString().padStart(3, '0').replace(/0+$/, '');
  return `${value / SCALE}${fraction ? `.${fraction}` : ''}`;
}
export function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new ProductionQuantityError('Invalid conversion or allocation ratio.');
  return (numerator * 2n + denominator) / (2n * denominator);
}
export function multiplyQuantity(qty: bigint, batches: number): bigint {
  if (!Number.isSafeInteger(batches) || batches < 1 || batches > 10_000) throw new ProductionQuantityError('Batch count must be from 1 to 10,000.');
  const result = qty * BigInt(batches);
  if (result > LIMIT) throw new ProductionQuantityError('Production quantity exceeds the supported range.');
  return result;
}
export function extendedMinorCost(quantity: bigint, costPerUnitMinor: number): number {
  if (!Number.isSafeInteger(costPerUnitMinor) || costPerUnitMinor <= 0 || costPerUnitMinor > 2_000_000_000) {
    throw new ProductionQuantityError('An accepted, non-zero unit cost is required.');
  }
  const numerator = quantity * BigInt(costPerUnitMinor);
  // Source valuation and journal amounts must agree exactly. When the existing
  // integer-minor cost layer cannot express a fractional consumption, fail
  // closed instead of silently rounding each component independently.
  if (numerator % SCALE !== 0n) throw new ProductionQuantityError('Source cost cannot be represented without rounding; obtain an approved valuation adjustment before posting.');
  const result = numerator / SCALE;
  if (result > 9_000_000_000_000n) throw new ProductionQuantityError('Cost exceeds the permitted amount.');
  return Number(result);
}
export function outputUnitCost(totalMinor: number, produced: bigint): number {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0 || produced <= 0n) throw new ProductionQuantityError('Production has no documented cost or quantity.');
  // The current inventory_lots table stores integer minor-unit cost per base unit.
  // Do not post a rounded value which would leak a valuation remainder into sales.
  const numerator = BigInt(totalMinor) * SCALE;
  if (numerator % produced !== 0n) throw new ProductionQuantityError('Output cost cannot be represented exactly by the current cost layer; adjust documented yield or cost before posting.');
  const result = numerator / produced;
  if (result > 2_000_000_000n) throw new ProductionQuantityError('Unit cost is too large.');
  return Number(result);
}
export type UomDimension = 'count' | 'mass' | 'volume' | 'length' | 'area';
export function convertQuantity(value: bigint, from: UomDimension, to: UomDimension, numerator: bigint, denominator: bigint): bigint {
  if (from !== to || numerator <= 0n || denominator <= 0n || numerator > LIMIT || denominator > LIMIT) throw new ProductionQuantityError('Cross-dimension or invalid unit conversion is not supported.');
  if (value * numerator % denominator !== 0n) throw new ProductionQuantityError('Conversion would lose stock precision.');
  const result = value * numerator / denominator;
  if (result > LIMIT) throw new ProductionQuantityError('Converted quantity exceeds the supported range.');
  return result;
}
export function validateTransformation(kind: string, componentCount: number, outputQuantity: bigint, sourceIds: readonly string[], outputId?: string): void {
  if (!['decant', 'tester', 'recipe', 'production', 'assembly'].includes(kind)) throw new ProductionQuantityError('Unsupported transformation kind.');
  if (componentCount < 1 || componentCount > 30 || sourceIds.length !== componentCount) throw new ProductionQuantityError('Supply 1–30 distinct, verified input components.');
  if (new Set(sourceIds).size !== sourceIds.length) throw new ProductionQuantityError('Combine repeated inputs rather than consuming one lot twice.');
  if (outputId && sourceIds.includes(outputId)) throw new ProductionQuantityError('Output cannot also be an input to its own production formula.');
  if (outputQuantity <= 0n) throw new ProductionQuantityError('Production yield must be positive.');
}

/** Normalize display spellings at policy boundaries, never change posted UoM snapshots. */
export function canonicalStockUnit(value: string): string {
  const code = value.trim().toLocaleLowerCase('en-US').replace(/[\s_-]+/g,'');
  const names:Readonly<Record<string,string>>={meter:'m',meters:'m',metre:'m',metres:'m',centimeter:'cm',centimetre:'cm',millimeter:'mm',millimetre:'mm',
    kilogram:'kg',kilograms:'kg',gram:'g',grams:'g',liter:'l',litre:'l',liters:'l',litres:'l',milliliter:'ml',millilitre:'ml',milliliters:'ml',millilitres:'ml',
    unit:'each',units:'each',pieces:'each',piece:'each',bottles:'bottle',pairs:'pair',rolls:'roll'};
  return names[code]??code;
}
