import type { FormValues } from './previewRules';

export interface DocumentLine {
  id: string;
  description: string;
  quantity: string;
  unitAmount: string;
}

export interface DocumentLineConfig {
  title: string;
  priceKey: 'unitPrice' | 'unitCost';
  descriptionKey: 'itemSummary' | 'itemDescription' | 'description';
}

const CONFIGS: Record<string, DocumentLineConfig> = {
  quotations: { title: 'Quotation items', priceKey: 'unitPrice', descriptionKey: 'itemSummary' },
  'sales-orders': { title: 'Order items', priceKey: 'unitPrice', descriptionKey: 'itemSummary' },
  'sales-invoices': { title: 'Invoice items', priceKey: 'unitPrice', descriptionKey: 'itemSummary' },
  purchases: { title: 'Purchase order items', priceKey: 'unitCost', descriptionKey: 'itemSummary' },
  'purchase-invoices': { title: 'Supplier bill items', priceKey: 'unitCost', descriptionKey: 'itemSummary' },
  'supplier-quotes': { title: 'Supplier quote items', priceKey: 'unitCost', descriptionKey: 'itemSummary' },
  'sales-returns': { title: 'Returned items', priceKey: 'unitPrice', descriptionKey: 'itemDescription' },
  'purchase-returns': { title: 'Returned items', priceKey: 'unitCost', descriptionKey: 'itemDescription' },
  'recurring-invoices': { title: 'Recurring invoice items', priceKey: 'unitPrice', descriptionKey: 'description' },
};

export function getDocumentLineConfig(moduleId: string): DocumentLineConfig | null {
  return CONFIGS[moduleId] ?? null;
}

function numberValue(value: string | undefined): number {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readDocumentLines(moduleId: string, values: FormValues): DocumentLine[] {
  const config = getDocumentLineConfig(moduleId);
  if (!config) return [];
  const raw = values.lineItemsJson;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((line) => line && typeof line.id === 'string' && typeof line.description === 'string' && typeof line.quantity === 'string' && typeof line.unitAmount === 'string')) {
        return parsed as DocumentLine[];
      }
    } catch { /* Old records pre-date the multi-line editor; fall back to their legacy single line. */ }
  }
  return [{
    id: 'line-1',
    description: values[config.descriptionKey] ?? '',
    quantity: values.quantity || '1',
    unitAmount: values[config.priceKey] ?? '0',
  }];
}

export function documentLineQuantity(lines: DocumentLine[]): number {
  return lines.reduce((sum, line) => sum + Math.max(0, numberValue(line.quantity)), 0);
}

export function documentLineSubtotal(lines: DocumentLine[]): number {
  return Math.round((lines.reduce((sum, line) => sum + Math.max(0, numberValue(line.quantity)) * Math.max(0, numberValue(line.unitAmount)), 0) + Number.EPSILON) * 100) / 100;
}

export function documentLineSubtotalFromValues(moduleId: string, values: FormValues): number | null {
  if (!getDocumentLineConfig(moduleId) || !values.lineItemsJson) return null;
  try {
    const parsed: unknown = JSON.parse(values.lineItemsJson);
    if (!Array.isArray(parsed) || !parsed.every((line) => line && typeof line.quantity === 'string' && typeof line.unitAmount === 'string')) return null;
    return documentLineSubtotal(parsed as DocumentLine[]);
  } catch { return null; }
}

export function syncDocumentLines(moduleId: string, values: FormValues, lines: DocumentLine[]): FormValues {
  const config = getDocumentLineConfig(moduleId);
  if (!config) return values;
  const quantity = documentLineQuantity(lines);
  const subtotal = documentLineSubtotal(lines);
  const weightedAverage = quantity > 0 ? Math.round((subtotal / quantity + Number.EPSILON) * 10000) / 10000 : 0;
  const summary = lines.map((line) => line.description.trim()).filter(Boolean).join('; ');
  return {
    ...values,
    lineItemsJson: JSON.stringify(lines.map((line, index) => ({ ...line, id: line.id || `line-${index + 1}` }))),
    quantity: String(Math.round((quantity + Number.EPSILON) * 10000) / 10000),
    [config.priceKey]: String(weightedAverage),
    [config.descriptionKey]: summary,
  };
}

export function validateDocumentLines(moduleId: string, values: FormValues): string | null {
  if (!getDocumentLineConfig(moduleId)) return null;
  const lines = readDocumentLines(moduleId, values);
  if (!lines.length) return 'Add at least one document line.';
  if (lines.some((line) => !line.description.trim())) return 'Every document line needs an item or service description.';
  if (lines.some((line) => numberValue(line.quantity) <= 0)) return 'Every document line quantity must be greater than zero.';
  if (lines.some((line) => numberValue(line.unitAmount) < 0)) return 'Document line prices and costs cannot be negative.';
  if (lines.some((line) => !Number.isFinite(Number(line.quantity)) || !Number.isFinite(Number(line.unitAmount)))) return 'Enter valid numeric values for every document line.';
  return null;
}
