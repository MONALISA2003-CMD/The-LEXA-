/** Shared browser/mobile view of the server-published electronics family policies.
 * Keep the type checked against the generated canonical catalogue, not a
 * handwritten partial version that can silently omit server fields.
 */
import type { ELECTRONICS_V2_CONTRACT } from './electronics-catalogue-v2.generated';

export type V2Field = {
  key: string;
  type: 'text' | 'number' | 'enum' | 'boolean';
  required: boolean;
  unit?: string;
  options?: readonly string[];
};

export type V2Family = {
  code: string;
  policyVersion: number;
  industryCodes: readonly string[];
  legacyProductType: string;
  stockProfile: 'serial' | 'batch' | 'quantity' | 'none';
  baseUnits: readonly string[];
  variantAxes: readonly string[];
  identifiers: readonly string[];
  fields: readonly V2Field[];
  reviewStatus: string;
  enabled: boolean; // Computed server-side for the authenticated workspace.
};

// Compile-time safety net: if the canonical generator adds a published field
// or changes a field type, frontend TypeScript compilation fails until the
// API contract is updated. `enabled` is the sole response-only field.
type PublishedFamily = (typeof ELECTRONICS_V2_CONTRACT.families)[number];
type Expect<T extends true> = T;
export type V2PublishedFamilyCompatible = Expect<
  PublishedFamily extends Omit<V2Family, 'enabled'> ? true : false
>;
export type V2PublishedFamilyFieldsCovered = Expect<
  Exclude<keyof PublishedFamily, keyof V2Family> extends never ? true : false
>;
