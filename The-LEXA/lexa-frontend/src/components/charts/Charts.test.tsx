import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarBreakdownChart, DonutBreakdownChart, LineTrendChart } from './Charts';

describe('LEXA real-data visualisations', () => {
  it('shows an explicit empty state instead of rendering fabricated trend points', () => {
    render(<LineTrendChart title="Sales trend" points={[]} />);
    expect(screen.getByText('No trend data available for this period.')).toBeInTheDocument();
  });
  it('renders supplied trend data accessibly and exposes the underlying values', () => {
    render(<LineTrendChart title="Sales trend" points={[{ label: 'Monday', value: 125 }, { label: 'Tuesday', value: 210, comparisonValue: 180 }]} />);
    expect(screen.getByRole('img', { name: 'Sales trend line chart' })).toBeInTheDocument();
    expect(screen.getByText('View chart data')).toBeInTheDocument();
    expect(screen.getByText('Previous period')).toBeInTheDocument();
  });
  it('handles empty and populated breakdowns without dividing by zero', () => {
    const { rerender } = render(<DonutBreakdownChart title="Sales mix" points={[{ label: 'Cash', value: 0 }]} />);
    expect(screen.getByText('No composition data available yet.')).toBeInTheDocument();
    rerender(<DonutBreakdownChart title="Sales mix" points={[{ label: 'Cash', value: 65 }, { label: 'Bank', value: 35 }]} />);
    expect(screen.getByRole('img', { name: /Sales mix; total 100/ })).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });
  it('renders only provided bar data', () => {
    render(<BarBreakdownChart title="Stock health" points={[{ label: 'Low stock', value: 4 }]} />);
    expect(screen.getByText('Low stock')).toBeInTheDocument();
    expect(screen.queryByText('Healthy stock')).not.toBeInTheDocument();
  });
});
