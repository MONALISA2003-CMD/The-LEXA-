import type { ReactNode } from 'react';

export interface TrendPoint {
  label: string;
  value: number;
  comparisonValue?: number | null;
}
export interface BreakdownPoint {
  label: string;
  value: number;
  color?: string;
}

function validValues(values: number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function chartFrame(title: string, description: string | undefined, content: ReactNode) {
  return (
    <div className="lexa-chart-frame">
      <div className="lexa-chart-heading"><div><h3>{title}</h3>{description && <p>{description}</p>}</div></div>
      {content}
    </div>
  );
}

export function LineTrendChart({
  title,
  description,
  points,
  currencyFormatter,
  comparisonLabel = 'Previous period',
}: {
  title: string;
  description?: string;
  points: TrendPoint[];
  currencyFormatter?: (value: number) => string;
  comparisonLabel?: string;
}) {
  const safe = points.filter((point) => point.label && Number.isFinite(point.value));
  if (!safe.length) return chartFrame(title, description, <div className="lexa-chart-empty"><span>No trend data available for this period.</span></div>);
  const all = validValues(safe.flatMap((point) => [point.value, ...(Number.isFinite(point.comparisonValue) ? [point.comparisonValue as number] : [])]));
  const min = Math.min(0, ...all);
  const max = Math.max(1, ...all);
  const spread = max - min || 1;
  const x = (index: number) => safe.length === 1 ? 160 : 22 + (index / (safe.length - 1)) * 276;
  const y = (value: number) => 88 - ((value - min) / spread) * 70;
  const path = (getValue: (point: TrendPoint) => number | null | undefined) => { let segmentStarted = false; return safe.flatMap((point, index) => { const value = getValue(point); if (!Number.isFinite(value)) { segmentStarted = false; return []; } const command = segmentStarted ? 'L' : 'M'; segmentStarted = true; return [`${command} ${x(index).toFixed(2)} ${y(value as number).toFixed(2)}`]; }).join(' '); };
  const hasComparison = safe.some((point) => Number.isFinite(point.comparisonValue));
  const money = currencyFormatter ?? ((value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, notation: 'compact' }).format(value));
  return chartFrame(title, description, <>
    <div className="lexa-chart-canvas">
      <svg viewBox="0 0 320 116" role="img" aria-label={`${title} line chart`} className="lexa-chart-svg">
        <title>{title}</title>
        {[18, 41, 64, 88].map((line) => <line key={line} x1="18" x2="302" y1={line} y2={line} className="lexa-chart-gridline" />)}
        {hasComparison && <path d={path((point) => point.comparisonValue)} className="lexa-chart-line lexa-chart-line-compare" />}
        <path d={path((point) => point.value)} className="lexa-chart-line lexa-chart-line-current" />
        {safe.map((point, index) => <circle key={`${point.label}-${index}`} cx={x(index)} cy={y(point.value)} r="2.8" className="lexa-chart-point"><title>{`${point.label}: ${money(point.value)}`}</title></circle>)}
      </svg>
      <div className="lexa-chart-axis"><span>{safe[0]?.label}</span><span>{safe[Math.floor((safe.length - 1) / 2)]?.label}</span><span>{safe[safe.length - 1]?.label}</span></div>
    </div>
    <div className="lexa-chart-legend"><span><i className="lexa-legend-dot current" />Selected period</span>{hasComparison && <span><i className="lexa-legend-dot compare" />{comparisonLabel}</span>}</div>
    <details className="lexa-chart-data-details"><summary>View chart data</summary><div className="lexa-chart-data-list">{safe.map((point, index) => <div key={`${point.label}-${index}`}><span>{point.label}</span><strong>{money(point.value)}</strong>{Number.isFinite(point.comparisonValue) && <small>{comparisonLabel}: {money(point.comparisonValue as number)}</small>}</div>)}</div></details>
  </>);
}

export function BarBreakdownChart({ title, description, points, formatValue }: {
  title: string;
  description?: string;
  points: BreakdownPoint[];
  formatValue?: (value: number) => string;
}) {
  const safe = points.filter((point) => point.label && Number.isFinite(point.value));
  if (!safe.length) return chartFrame(title, description, <div className="lexa-chart-empty"><span>No category data available yet.</span></div>);
  const plotted = [...safe].sort((a, b) => b.value - a.value).slice(0, 8);
  const max = Math.max(1, ...plotted.map((point) => Math.max(0, point.value)));
  const format = formatValue ?? ((value: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value));
  return chartFrame(title, description, <div className="lexa-bar-list">{plotted.map((point, index) => <div className="lexa-bar-row" key={`${point.label}-${index}`}>
    <div className="lexa-bar-meta"><span title={point.label}>{point.label}</span><strong>{format(point.value)}</strong></div>
    <div className="lexa-bar-track"><span style={{ width: `${Math.min(100, Math.max(0, point.value) / max * 100)}%`, ...(point.color ? { backgroundColor: point.color } : {}) }} /></div>
  </div>)}</div>);
}

export function DonutBreakdownChart({ title, description, points, centerLabel = 'Total', formatValue }: {
  title: string;
  description?: string;
  points: BreakdownPoint[];
  centerLabel?: string;
  formatValue?: (value: number) => string;
}) {
  const safe = points.filter((point) => point.label && Number.isFinite(point.value) && point.value >= 0);
  const total = safe.reduce((sum, point) => sum + point.value, 0);
  if (!safe.length || total <= 0) return chartFrame(title, description, <div className="lexa-chart-empty"><span>No composition data available yet.</span></div>);
  const plotted = safe.length > 8 ? [...safe.slice(0, 7), { label: 'Other', value: safe.slice(7).reduce((sum, point) => sum + point.value, 0) }] : safe;
  const palette = ['#075CF5', '#08BDEB', '#00BD83', '#F5C84B', '#FF9B18', '#7C8DA8', '#F52235', '#6C63C7'];
  let offset = 0;
  const segments = plotted.map((point, index) => {
    const start = offset;
    const pct = point.value / total * 100;
    offset += pct;
    return `${point.color ?? palette[index % palette.length]} ${start.toFixed(3)}% ${offset.toFixed(3)}%`;
  });
  const format = formatValue ?? ((value: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value));
  return chartFrame(title, description, <div className="lexa-donut-layout">
    <div className="lexa-donut" style={{ background: `conic-gradient(${segments.join(', ')})` }} role="img" aria-label={`${title}; total ${format(total)}`}><div className="lexa-donut-hole"><small>{centerLabel}</small><strong>{format(total)}</strong></div></div>
    <div className="lexa-donut-legend">{plotted.map((point, index) => <div key={`${point.label}-${index}`}><span><i style={{ backgroundColor: point.color ?? palette[index % palette.length] }} />{point.label}</span><strong>{format(point.value)}</strong><small>{(point.value / total * 100).toFixed(1)}%</small></div>)}</div>
  </div>);
}
