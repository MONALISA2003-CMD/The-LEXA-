/** Physical-unit evidence is an explicit unitId <-> manufacturer serial relationship.
 * A historical receipt snapshot is an array of labels, not an authoritative pair map.
 */
export function resolvePhysicalReturnIds(
  soldUnitIds: readonly string[],
  verifiedSoldUnits: readonly { unitId: string; serialNumber: string }[] | undefined,
  rawScans: string,
  alreadyReturnedIds: readonly string[] = [],
): string[] {
  if (!soldUnitIds.length) return [];
  if (!verifiedSoldUnits || verifiedSoldUnits.length !== soldUnitIds.length)
    throw new Error('The original sale has incomplete verified unit identifiers. Ask an authorized manager to reconcile them.');
  const scans = rawScans.split(/[\r\n,;]+/).map(value => value.trim()).filter(Boolean);
  if (!scans.length) throw new Error('Scan the actual returned serial number from the physical device.');
  const indexed = new Map<string, string>();
  const belonging = new Set(soldUnitIds);
  const observedUnits = new Set<string>();
  for (const evidence of verifiedSoldUnits) {
    const normalized = evidence.serialNumber.trim().toUpperCase();
    if (!normalized || !belonging.has(evidence.unitId) || observedUnits.has(evidence.unitId) || indexed.has(normalized))
      throw new Error('Original sale unit evidence is ambiguous; reconcile before accepting stock.');
    indexed.set(normalized, evidence.unitId);
    observedUnits.add(evidence.unitId);
  }
  const returned = new Set(alreadyReturnedIds);
  const selected = scans.map(value => {
    const unitId = indexed.get(value.toUpperCase());
    if (!unitId) throw new Error('A scanned physical serial does not match this original sale line.');
    if (returned.has(unitId)) throw new Error('This exact device has already been returned.');
    return unitId;
  });
  if (new Set(selected).size !== selected.length) throw new Error('The same physical serial was scanned twice.');
  return selected;
}
