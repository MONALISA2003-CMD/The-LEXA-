/** Sale-linked physical-unit valuation.
 *
 * A device that was sold must return at the exact inventory cost recorded for
 * that same physical unit at checkout. Current catalogue prices, current lot
 * averages and a different unit from the sale cannot substitute for evidence.
 */
export class SerializedSaleCostError extends Error {
  constructor(message: string) { super(message); this.name = 'SerializedSaleCostError'; }
}

export type SerializedSaleMovement = Readonly<{
  serialId: string | null;
  productId: string;
  variantId: string | null;
  quantityDelta: unknown;
  unitCostMinor: number;
}>;

/** Verified map of original sale costs; duplicate/missing/zero-cost evidence is rejected. */
export function serializedCostsFromOriginalSale(
  selectedUnitIds: readonly string[],
  expectedProductId: string,
  expectedVariantId: string | null,
  movements: readonly SerializedSaleMovement[],
): ReadonlyMap<string, number> {
  if (!selectedUnitIds.length || new Set(selectedUnitIds).size !== selectedUnitIds.length) {
    throw new SerializedSaleCostError('Choose distinct physical units from the original sale.');
  }
  const selected = new Set(selectedUnitIds);
  const costById = new Map<string, number>();
  for (const movement of movements) {
    const id = movement.serialId;
    if (!id || !selected.has(id)) throw new SerializedSaleCostError('Sale evidence includes an unexpected physical unit.');
    if (movement.productId !== expectedProductId || (movement.variantId ?? null) !== expectedVariantId) {
      throw new SerializedSaleCostError('The original sale movement does not match the sold product variant.');
    }
    if (String(movement.quantityDelta) !== '-1') {
      throw new SerializedSaleCostError('A physical-unit sale must have reduced stock by exactly one.');
    }
    if (!Number.isSafeInteger(movement.unitCostMinor) || movement.unitCostMinor <= 0 || movement.unitCostMinor > 2_000_000_000) {
      throw new SerializedSaleCostError('Original physical-unit cost is missing; reconcile the sale before returning stock.');
    }
    if (costById.has(id)) throw new SerializedSaleCostError('Duplicate original movements require reconciliation before a return.');
    costById.set(id, movement.unitCostMinor);
  }
  if (costById.size !== selected.size) throw new SerializedSaleCostError('Original physical-unit cost evidence is missing.');
  return costById;
}

export function totalSerializedReturnCost(costById: ReadonlyMap<string,number>): number {
  const total = [...costById.values()].reduce((value, cost) => value + cost, 0);
  if (!Number.isSafeInteger(total) || total > 2_000_000_000) {
    throw new SerializedSaleCostError('Return valuation exceeds the supported journal limit.');
  }
  return total;
}
