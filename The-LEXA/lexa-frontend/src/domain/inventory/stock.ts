import type { StockMovement } from '../shared/types';

export function stockOnHand(movements: Pick<StockMovement, 'quantityDelta'>[]): number {
  return movements.reduce((total, movement) => total + movement.quantityDelta, 0);
}

export function movementLabel(type: StockMovement['type']): string {
  const labels: Record<StockMovement['type'], string> = {
    opening: 'Opening stock',
    receiving: 'Goods received',
    sale: 'Sale',
    return: 'Customer return',
    adjustment: 'Stock adjustment',
    transfer_in: 'Transfer in',
    transfer_out: 'Transfer out',
    write_off: 'Write-off',
  };
  return labels[type];
}
