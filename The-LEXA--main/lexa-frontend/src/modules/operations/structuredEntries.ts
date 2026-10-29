import type { FormValues } from './previewRules';

export interface JournalLine {
  id: string;
  account: string;
  debit: string;
  credit: string;
  memo: string;
}

export interface AssemblyComponentLine {
  id: string;
  sku: string;
  description: string;
  quantity: string;
  unitCost: string;
}

function numberValue(value: string | undefined): number {
  const number = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : 0;
}

function parseRows<T>(raw: string | undefined, guard: (row: unknown) => row is T): T[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(guard) ? parsed : null;
  } catch {
    return null;
  }
}

function isJournalLine(row: unknown): row is JournalLine {
  if (!row || typeof row !== 'object') return false;
  const line = row as Record<string, unknown>;
  return ['id', 'account', 'debit', 'credit', 'memo'].every((key) => typeof line[key] === 'string');
}

function isComponentLine(row: unknown): row is AssemblyComponentLine {
  if (!row || typeof row !== 'object') return false;
  const line = row as Record<string, unknown>;
  return ['id', 'sku', 'description', 'quantity', 'unitCost'].every((key) => typeof line[key] === 'string');
}

export function readJournalLines(values: FormValues): JournalLine[] {
  const stored = parseRows(values.journalLinesJson, isJournalLine);
  if (stored) return stored;
  const amount = String(values.amount ?? '0');
  return [
    { id: 'journal-debit-1', account: values.debitAccount ?? '', debit: amount, credit: '0', memo: '' },
    { id: 'journal-credit-1', account: values.creditAccount ?? '', debit: '0', credit: amount, memo: '' },
  ];
}

export function journalTotals(lines: JournalLine[]): { debit: number; credit: number; difference: number } {
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const debit = round(lines.reduce((sum, line) => sum + Math.max(0, numberValue(line.debit)), 0));
  const credit = round(lines.reduce((sum, line) => sum + Math.max(0, numberValue(line.credit)), 0));
  return { debit, credit, difference: round(debit - credit) };
}

export function syncJournalLines(values: FormValues, lines: JournalLine[]): FormValues {
  const totals = journalTotals(lines);
  const debitLine = lines.find((line) => numberValue(line.debit) > 0);
  const creditLine = lines.find((line) => numberValue(line.credit) > 0);
  return {
    ...values,
    journalLinesJson: JSON.stringify(lines.map((line, index) => ({ ...line, id: line.id || `journal-${index + 1}` }))),
    debitAccount: debitLine?.account ?? '',
    creditAccount: creditLine?.account ?? '',
    amount: String(totals.debit),
    totalDebit: String(totals.debit),
    totalCredit: String(totals.credit),
    balanceDifference: String(totals.difference),
  };
}

export function validateJournalLines(values: FormValues): string | null {
  const lines = readJournalLines(values);
  if (lines.length < 2) return 'A journal requires at least two lines.';
  if (lines.length === 2 && lines[0]?.account.trim().toLocaleLowerCase() && lines[0]?.account.trim().toLocaleLowerCase() === lines[1]?.account.trim().toLocaleLowerCase()) return 'Choose different debit and credit accounts.';
  if (lines.some((line) => !line.account.trim())) return 'Choose an account for every journal line.';
  if (lines.some((line) => !Number.isFinite(Number(line.debit)) || !Number.isFinite(Number(line.credit)))) return 'Enter valid debit and credit amounts.';
  if (lines.some((line) => numberValue(line.debit) < 0 || numberValue(line.credit) < 0)) return 'Debit and credit amounts cannot be negative.';
  if (lines.some((line) => numberValue(line.debit) > 0 && numberValue(line.credit) > 0)) return 'A journal line must be either a debit or a credit, not both.';
  if (lines.some((line) => numberValue(line.debit) === 0 && numberValue(line.credit) === 0)) return 'Every journal line must contain a positive debit or credit amount.';
  const totals = journalTotals(lines);
  if (totals.debit <= 0 || totals.credit <= 0) return 'A journal must include both debit and credit amounts.';
  if (Math.abs(totals.difference) > 0.009) return `Journal is out of balance by ${totals.difference.toLocaleString()}. Total debits must equal total credits.`;
  return null;
}

export function readAssemblyComponents(moduleId: string, values: FormValues): AssemblyComponentLine[] {
  const stored = parseRows(values.componentsJson, isComponentLine);
  if (stored) return stored;
  if (moduleId === 'boms') {
    // Keep old one-cost BOMs editable. Detailed component costing can be entered after opening the record.
    return [{ id: 'component-1', sku: '', description: values.componentSummary ?? '', quantity: '1', unitCost: values.unitMaterialCost ?? '0' }];
  }
  if (moduleId === 'item-bundles') {
    return [{ id: 'component-1', sku: '', description: values.componentsSummary ?? '', quantity: '1', unitCost: values.unitCost ?? '0' }];
  }
  return [];
}

export function assemblyUnitCost(lines: AssemblyComponentLine[]): number {
  return Math.round((lines.reduce((sum, line) => sum + Math.max(0, numberValue(line.quantity)) * Math.max(0, numberValue(line.unitCost)), 0) + Number.EPSILON) * 100) / 100;
}

export function syncAssemblyComponents(moduleId: string, values: FormValues, lines: AssemblyComponentLine[]): FormValues {
  const unitCost = assemblyUnitCost(lines);
  const summary = lines.map((line) => { const description = line.description.trim(); return !description ? '' : numberValue(line.quantity) === 1 ? description : `${description} × ${line.quantity}`; }).filter(Boolean).join('; ');
  return {
    ...values,
    componentsJson: JSON.stringify(lines.map((line, index) => ({ ...line, id: line.id || `component-${index + 1}` }))),
    ...(moduleId === 'boms'
      ? { componentSummary: summary, unitMaterialCost: String(unitCost), componentCount: String(lines.length) }
      : { componentsSummary: summary, unitCost: String(unitCost), componentCount: String(lines.length) }),
  };
}

export function validateAssemblyComponents(moduleId: string, values: FormValues): string | null {
  if (moduleId !== 'boms' && moduleId !== 'item-bundles') return null;
  const lines = readAssemblyComponents(moduleId, values);
  if (!lines.length) return 'Add at least one component line.';
  if (lines.some((line) => !line.description.trim())) return 'Every component needs an item or material description.';
  if (lines.some((line) => !Number.isFinite(Number(line.quantity)) || numberValue(line.quantity) <= 0)) return 'Every component quantity must be a positive number.';
  if (lines.some((line) => !Number.isFinite(Number(line.unitCost)) || numberValue(line.unitCost) < 0)) return 'Component unit costs must be valid non-negative numbers.';
  return null;
}
