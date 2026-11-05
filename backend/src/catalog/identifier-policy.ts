import { INDUSTRY_POLICIES } from './industry-contract.generated';

/**
 * Identifier capabilities are data, not distinct TypeScript literal tuple APIs.
 * Some manifest entries have no identifiers; without a widened boundary TypeScript
 * infers `never` for Array.includes on a union of the generated `as const` tuples.
 * Use this helper from all inventory and purchasing clients/handlers.
 */
type IdentifierPolicy = { readonly identifiers: readonly string[] };
const identifierPolicies: Readonly<Record<string, IdentifierPolicy>> = INDUSTRY_POLICIES;

export function productHasIdentifier(productType: string | null | undefined, identifier: string): boolean {
  if (!productType || !Object.prototype.hasOwnProperty.call(identifierPolicies, productType)) return false;
  return identifierPolicies[productType]?.identifiers.includes(identifier) ?? false;
}
