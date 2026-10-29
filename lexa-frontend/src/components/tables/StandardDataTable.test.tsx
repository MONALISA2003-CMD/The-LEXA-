import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StandardDataTable, type DataTableColumn } from './StandardDataTable';

type Row = { id: string; name: string; total: number };
const rows: Row[] = Array.from({ length: 12 }, (_, index) => ({ id: `row-${index + 1}`, name: `Record ${String(index + 1).padStart(2, '0')}`, total: index + 1 }));
const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name', cell: (row) => row.name, sortValue: (row) => row.name },
  { key: 'total', header: 'Total', cell: (row) => row.total.toLocaleString(), sortValue: (row) => row.total, exportValue: (row) => row.total },
];

describe('StandardDataTable', () => {
  it('supports sorting and pagination without losing row identity', () => {
    render(<StandardDataTable rows={rows} columns={columns} rowLabel="records" />);
    expect(screen.getByText('Showing 1–10 of 12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Record 01');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Showing 11–12 of 12')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
  it('searches raw record values and exposes no demo rows when the source is empty', () => {
    const { rerender } = render(<StandardDataTable rows={rows} columns={columns} rowLabel="records" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search records…' }), { target: { value: 'Record 12' } });
    expect(screen.getByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(screen.getByText('Record 12')).toBeInTheDocument();
    rerender(<StandardDataTable rows={[]} columns={columns} rowLabel="records" emptyTitle="Nothing saved yet" />);
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
    expect(screen.queryByText('Record 12')).not.toBeInTheDocument();
  });
});
