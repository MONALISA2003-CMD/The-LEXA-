import type { ModuleDefinition, PreviewRecord } from './moduleCatalog';

export interface PreviewListFilters {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Pure selector used by the register table and independently unit-tested. */
export function filterPreviewRecords(
  rows: PreviewRecord[],
  module: Pick<ModuleDefinition, 'dateKey'>,
  filters: PreviewListFilters = {},
): PreviewRecord[] {
  const needle = (filters.search ?? '').trim().toLocaleLowerCase();
  const status = filters.status ?? 'All statuses';
  const dateFrom = filters.dateFrom ?? '';
  const dateTo = filters.dateTo ?? '';
  return rows.filter((row) => {
    const searchable = Object.entries(row).filter(([key]) => key !== 'updatedAt').map(([, value]) => value).join(' ').toLocaleLowerCase();
    if (needle && !searchable.includes(needle)) return false;
    if (status !== 'All statuses' && row.status !== status) return false;
    const valueDate = module.dateKey ? String(row[module.dateKey] ?? '').slice(0, 10) : '';
    if (module.dateKey && dateFrom && valueDate < dateFrom) return false;
    if (module.dateKey && dateTo && valueDate > dateTo) return false;
    return true;
  }).sort((a, b) => String(b[module.dateKey ?? 'updatedAt'] ?? b.updatedAt).localeCompare(String(a[module.dateKey ?? 'updatedAt'] ?? a.updatedAt)));
}

export function paginatePreviewRecords<T>(rows: T[], page: number, pageSize: number): T[] {
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 10;
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  return rows.slice((safePage - 1) * safePageSize, safePage * safePageSize);
}
