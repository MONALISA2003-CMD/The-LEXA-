/** Return allocation is selected by the actual scanned/sold unit, never by array order.
 * Shared between the API, import checks, and deterministic regression scenarios.
 */
export class ExactSerialReturnError extends Error {
  constructor(message: string) { super(message); this.name = 'ExactSerialReturnError'; }
}

export type ReturnConditionEvidence = {
  physicalSerialScanned?: unknown;
  conditionChecked?: unknown;
  notes?: unknown;
  scannedSerialNumbers?: unknown;
};

export function exactReturnedSerials(
  soldSerialIds: readonly string[] | null | undefined,
  alreadyReturnedIds: readonly string[],
  selectedSerialIds: readonly string[],
  quantity: number,
): string[] {
  const sold = soldSerialIds ?? [];
  if (sold.length === 0) {
    if (selectedSerialIds.length) throw new ExactSerialReturnError('A non-serialized sale line cannot accept physical-unit identifiers.');
    return [];
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || selectedSerialIds.length !== quantity)
    throw new ExactSerialReturnError('Select exactly one real sold serial for each returned physical unit.');
  if (new Set(selectedSerialIds).size !== selectedSerialIds.length)
    throw new ExactSerialReturnError('The same physical unit cannot be returned twice in one request.');
  const belonging = new Set(sold);
  const alreadyReturned = new Set(alreadyReturnedIds);
  for (const serialId of selectedSerialIds) {
    if (!belonging.has(serialId)) throw new ExactSerialReturnError('The scanned unit does not belong to this original sale line.');
    if (alreadyReturned.has(serialId)) throw new ExactSerialReturnError('The scanned unit has already been returned.');
  }
  return [...selectedSerialIds];
}

/** Scrapping a returned serial requires a separately approved write-off and GL posting. */
export function validateSerializedReturnDisposition(disposition: string, evidence: ReturnConditionEvidence | null | undefined): void {
  if (disposition === 'scrap') throw new ExactSerialReturnError('Use quarantine first; scrapping serialized stock requires an approved write-off journal.');
  if (!['restock', 'quarantine'].includes(disposition)) throw new ExactSerialReturnError('Unsupported physical-unit return disposition.');
  if (evidence?.physicalSerialScanned !== true || evidence.conditionChecked !== true ||
      typeof evidence.notes !== 'string' || evidence.notes.trim().length < 5 || evidence.notes.trim().length > 500)
    throw new ExactSerialReturnError('Physically scan the returned unit, document its inspection and provide condition notes.');
}

/** Prisma findMany() does not preserve requested IN-array ordering. The immutable
 * sale snapshot must be reassembled by unit ID, never by result array position.
 */
export function orderedSaleSerialNumbers(
  soldUnitIds: readonly string[],
  lookedUpUnits: readonly { id: string; serialNumber: string }[],
): string[] {
  const byId = new Map(lookedUpUnits.map(unit => [unit.id, unit.serialNumber]));
  if (byId.size !== lookedUpUnits.length || new Set(soldUnitIds).size !== soldUnitIds.length)
    throw new ExactSerialReturnError('Duplicated physical-unit identity during checkout.');
  return soldUnitIds.map(unitId => {
    const serialNumber = byId.get(unitId);
    if (!serialNumber) throw new ExactSerialReturnError('A selected unit is missing its manufacturer serial number.');
    return serialNumber;
  });
}

/** Verify raw physical scans against server-owned serials, not client-provided
 * unit IDs/booleans. This is inspection evidence, not a claim of authenticity.
 */
export function matchPhysicalReturnScans(
  selectedUnitIds: readonly string[],
  scannedSerialNumbers: unknown,
  verifiedUnits: readonly {id:string;serialNumber:string}[],
): void {
  if (!Array.isArray(scannedSerialNumbers) || scannedSerialNumbers.length !== selectedUnitIds.length)
    throw new ExactSerialReturnError('Provide one raw physical-serial scan for every returned unit.');
  const byId = new Map(verifiedUnits.map(unit=>[unit.id,unit.serialNumber]));
  if (byId.size !== verifiedUnits.length) throw new ExactSerialReturnError('Ambiguous original device identity.');
  selectedUnitIds.forEach((id,index)=>{
    const scanned=scannedSerialNumbers[index];
    const original=byId.get(id);
    if (typeof scanned!=='string' || !original || scanned.trim().toUpperCase()!==original.trim().toUpperCase())
      throw new ExactSerialReturnError('The physical serial does not match the selected original-sale unit.');
  });
}
