import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from 'lucide-react';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  hideOnMobile?: boolean;
  align?: 'start' | 'end';
  exportValue?: (row: T) => string | number | null | undefined;
}

export function StandardDataTable<T extends { id: string }>({
  rows, columns, emptyTitle = 'Nothing to show yet', emptyDescription = 'Records will appear here when available.', searchPlaceholder = 'Search records…', pageSizes = [10, 25, 50], rowLabel = 'records', initialPageSize = 10, enableSearch = true,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  emptyTitle?: string;
  emptyDescription?: string;
  searchPlaceholder?: string;
  pageSizes?: number[];
  rowLabel?: string;
  initialPageSize?: number;
  enableSearch?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState<string[]>([]);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => columns.map((column) => column.key));
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  // When the backing register becomes empty, clear stale search and selection state.
  // Otherwise the UI can incorrectly report 'No matching records' for an empty source.
  useEffect(() => {
    if (rows.length === 0) {
      setQuery('');
      setPage(1);
      setSelected([]);
    }
  }, [rows.length]);

  const displayColumns = columns.filter((column) => visibleColumnKeys.includes(column.key));
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const subset = needle ? rows.filter((row) => columns.some((column) => { const raw = (row as unknown as Record<string, unknown>)[column.key]; const value = column.sortValue?.(row) ?? column.exportValue?.(row) ?? raw; return String(value ?? '').toLocaleLowerCase().includes(needle); })) : rows;
    const column = columns.find((item) => item.key === sortKey);
    if (!column?.sortValue) return subset;
    return [...subset].sort((a, b) => {
      const av = column.sortValue?.(a); const bv = column.sortValue?.(b);
      const compared = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? compared : -compared;
    });
  }, [rows, columns, query, sortKey, sortDirection]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const allOnPageSelected = visible.length > 0 && visible.every((row) => selected.includes(row.id));
  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortValue) return;
    if (sortKey === column.key) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSortKey(column.key); setSortDirection('asc'); }
  }
  function toggleAll() { setSelected((current) => allOnPageSelected ? current.filter((id) => !visible.some((row) => row.id === id)) : [...new Set([...current, ...visible.map((row) => row.id)])]); }
  function exportCsv(data: T[], suffix: string) {
    const escape = (value: unknown) => { const text = String(value ?? ''); return /[\",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
    const headers = displayColumns.map((column) => column.header);
    const lines = [headers, ...data.map((row) => displayColumns.map((column) => column.exportValue?.(row) ?? column.sortValue?.(row) ?? (row as unknown as Record<string, unknown>)[column.key] ?? ''))];
    const blob = new Blob(['\uFEFF', lines.map((line) => line.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `lexa-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="standard-table-shell">
    <div className="standard-table-toolbar">{enableSearch && <label className="standard-table-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={searchPlaceholder} aria-label={searchPlaceholder} /></label>}<span>{filtered.length.toLocaleString()} {rowLabel}{selected.length ? ` · ${selected.length} selected` : ''}</span><div className="standard-table-tools"><div className="standard-column-menu"><button type="button" onClick={() => setShowColumnMenu((value) => !value)}>Columns ▾</button>{showColumnMenu && <div className="standard-column-options">{columns.map((column) => <label key={column.key}><input type="checkbox" checked={visibleColumnKeys.includes(column.key)} disabled={visibleColumnKeys.length === 1 && visibleColumnKeys.includes(column.key)} onChange={() => setVisibleColumnKeys((current) => current.includes(column.key) ? current.filter((key) => key !== column.key) : [...current, column.key])}/>{column.header}</label>)}</div>}</div><button type="button" onClick={() => exportCsv(filtered, rowLabel)}>Export CSV</button>{selected.length > 0 && <button type="button" onClick={() => exportCsv(filtered.filter((row) => selected.includes(row.id)), `${rowLabel}-selected`)}>Export selected</button>}</div></div>
    {filtered.length === 0 ? <div className="standard-table-empty"><strong>{rows.length > 0 && query ? 'No matching records' : emptyTitle}</strong><span>{rows.length > 0 && query ? 'Try a different search term.' : emptyDescription}</span></div> : <div className="standard-table-overflow"><table className="standard-data-table"><thead><tr><th className="standard-checkbox-col"><input aria-label="Select all rows on this page" type="checkbox" checked={allOnPageSelected} onChange={toggleAll} /></th>{displayColumns.map((column) => <th key={column.key} className={`${column.hideOnMobile ? 'hide-on-mobile' : ''} ${column.align === 'end' ? 'cell-align-end' : ''}`}><button type="button" className="standard-sort-button" disabled={!column.sortValue} onClick={() => toggleSort(column)}>{column.header}{column.sortValue && (sortKey === column.key ? sortDirection === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} /> : <ChevronsUpDown size={13} />)}</button></th>)}</tr></thead><tbody>{visible.map((row) => <tr key={row.id}><td className="standard-checkbox-col"><input aria-label={`Select row ${row.id}`} type="checkbox" checked={selected.includes(row.id)} onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} /></td>{displayColumns.map((column) => <td key={column.key} className={`${column.hideOnMobile ? 'hide-on-mobile' : ''} ${column.align === 'end' ? 'cell-align-end' : ''}`}>{column.cell(row)}</td>)}</tr>)}</tbody></table></div>}
    <div className="standard-table-footer"><span>Showing {filtered.length ? ((safePage - 1) * pageSize + 1).toLocaleString() : 0}–{Math.min(safePage * pageSize, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}</span><div><label>Rows <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Rows per page">{pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label><button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {safePage} / {pageCount}</span><button type="button" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div></div>
  </div>;
}
