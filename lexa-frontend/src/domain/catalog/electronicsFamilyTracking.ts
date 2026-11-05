import type { V2Family } from './electronicsFamilyTypes';

/** User-facing stock terminology, derived from the published family policy.
 * An empty `identifiers` list is NOT proof of quantity tracking.
 */
export function describeElectronicsStockPolicy(
  family: Pick<V2Family, 'stockProfile' | 'identifiers'>,
): string {
  switch (family.stockProfile) {
    case 'serial': {
      const names = family.identifiers.map(identifier => {
        if (identifier === 'imei2?') return 'IMEI 2 (if assigned)';
        if (identifier === 'imei') return 'IMEI';
        if (identifier === 'serial') return 'manufacturer serial';
        return identifier;
      });
      return names.length ? `Track each unit: ${names.join(', ')}` : 'Track each unit by its serial';
    }
    case 'batch': return 'Track quantities by batch or lot';
    case 'quantity': return 'Track quantity by sellable SKU';
    case 'none': return 'Non-stock item';
  }
}
