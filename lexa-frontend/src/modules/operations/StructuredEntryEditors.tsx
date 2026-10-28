import { Plus, Trash2 } from 'lucide-react';
import type { FormValues } from './previewRules';
import {
  assemblyUnitCost, journalTotals, readAssemblyComponents, readJournalLines,
  syncAssemblyComponents, syncJournalLines, type AssemblyComponentLine, type JournalLine,
} from './structuredEntries';

interface SharedProps {
  values: FormValues;
  currency: string;
  onChange: (values: FormValues) => void;
}

const JOURNAL_ACCOUNTS = [
  'Cash', 'Bank', 'Accounts receivable', 'Inventory', 'Expenses', 'Fixed assets',
  'Tax recoverable', 'Accounts payable', 'Sales income', 'Capital', 'Accumulated depreciation',
  'Tax payable', 'Cost of goods sold', 'Retained earnings', 'Suspense / clearing',
];

function money(value: number, currency: string): string {
  try { return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: currency === 'UGX' ? 0 : 2 }).format(value); }
  catch { return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
}

export function JournalLinesEditor({ values, currency, onChange }: SharedProps) {
  const lines = readJournalLines(values);
  const totals = journalTotals(lines);
  function update(index: number, field: keyof Omit<JournalLine, 'id'>, value: string) {
    onChange(syncJournalLines(values, lines.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line)));
  }
  function addLine() {
    onChange(syncJournalLines(values, [...lines, { id: `journal-${Date.now()}-${lines.length}`, account: '', debit: '0', credit: '0', memo: '' }]));
  }
  function removeLine(index: number) { onChange(syncJournalLines(values, lines.filter((_, lineIndex) => lineIndex !== index))); }
  return <section className="structured-lines" aria-label="Journal entry lines">
    <div className="structured-lines-heading"><div><h4>Journal lines</h4><p>Enter debit and credit rows. The journal cannot be posted until both totals balance.</p></div><button type="button" className="button button-secondary button-small" onClick={addLine}><Plus size={14} /> Add line</button></div>
    {lines.map((line, index) => <div className="journal-line-row" key={line.id}>
      <label className="field-label"><span>Account · line {index + 1}</span><select required aria-label={`Account for journal line ${index + 1}`} value={line.account} onChange={(event) => update(index, 'account', event.target.value)}><option value="">Select account</option>{JOURNAL_ACCOUNTS.map((account) => <option key={account}>{account}</option>)}</select></label>
      <label className="field-label"><span>Debit ({currency})</span><input required aria-label={`Debit for journal line ${index + 1}`} type="number" min="0" step={currency === 'UGX' ? '1' : '0.01'} value={line.debit} onChange={(event) => update(index, 'debit', event.target.value)} /></label>
      <label className="field-label"><span>Credit ({currency})</span><input required aria-label={`Credit for journal line ${index + 1}`} type="number" min="0" step={currency === 'UGX' ? '1' : '0.01'} value={line.credit} onChange={(event) => update(index, 'credit', event.target.value)} /></label>
      <label className="field-label journal-line-memo"><span>Line narration (optional)</span><input aria-label={`Narration for journal line ${index + 1}`} value={line.memo} onChange={(event) => update(index, 'memo', event.target.value)} placeholder="Optional reference" /></label>
      <button type="button" className="icon-button structured-remove" aria-label={`Remove journal line ${index + 1}`} disabled={lines.length <= 2} onClick={() => removeLine(index)}><Trash2 size={15} /></button>
    </div>)}
    <div className="journal-totals"><div><span>Total debits</span><strong>{money(totals.debit, currency)}</strong></div><div><span>Total credits</span><strong>{money(totals.credit, currency)}</strong></div><div className={Math.abs(totals.difference) > 0.009 ? 'journal-unbalanced' : 'journal-balanced'}><span>Difference</span><strong>{money(totals.difference, currency)}</strong></div></div>
    <p className="structured-editor-note">This preview validates arithmetic only. It does not post the journal to your existing general ledger.</p>
  </section>;
}

export function AssemblyComponentsEditor({ moduleId, values, currency, onChange }: SharedProps & { moduleId: 'boms' | 'item-bundles' }) {
  const lines = readAssemblyComponents(moduleId, values);
  const unitCost = assemblyUnitCost(lines);
  function update(index: number, field: keyof Omit<AssemblyComponentLine, 'id'>, value: string) {
    onChange(syncAssemblyComponents(moduleId, values, lines.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line)));
  }
  function addLine() { onChange(syncAssemblyComponents(moduleId, values, [...lines, { id: `component-${Date.now()}-${lines.length}`, sku: '', description: '', quantity: '1', unitCost: '0' }])); }
  function removeLine(index: number) { onChange(syncAssemblyComponents(moduleId, values, lines.filter((_, lineIndex) => lineIndex !== index))); }
  return <section className="structured-lines" aria-label={moduleId === 'boms' ? 'Bill of materials components' : 'Item bundle components'}>
    <div className="structured-lines-heading"><div><h4>{moduleId === 'boms' ? 'Material / ingredient lines' : 'Bundle component lines'}</h4><p>{moduleId === 'boms' ? 'Enter the quantity of each component needed per output unit and its cost.' : 'Add each item and quantity included in the sellable bundle.'}</p></div><button type="button" className="button button-secondary button-small" onClick={addLine}><Plus size={14} /> Add component</button></div>
    {lines.map((line, index) => <div className="component-line-row" key={line.id}>
      <label className="field-label"><span>Item / material {index + 1}</span><input required aria-label={`Component description ${index + 1}`} value={line.description} onChange={(event) => update(index, 'description', event.target.value)} placeholder="Component name" /></label>
      <label className="field-label"><span>SKU / code</span><input aria-label={`Component SKU ${index + 1}`} value={line.sku} onChange={(event) => update(index, 'sku', event.target.value)} placeholder="Optional SKU" /></label>
      <label className="field-label"><span>{moduleId === 'boms' ? 'Qty per output' : 'Qty per bundle'}</span><input required aria-label={`Component quantity ${index + 1}`} type="number" min="0.0001" step="any" value={line.quantity} onChange={(event) => update(index, 'quantity', event.target.value)} /></label>
      <label className="field-label"><span>Unit cost ({currency})</span><input required aria-label={`Component unit cost ${index + 1}`} type="number" min="0" step={currency === 'UGX' ? '1' : '0.01'} value={line.unitCost} onChange={(event) => update(index, 'unitCost', event.target.value)} /></label>
      <button type="button" className="icon-button structured-remove" aria-label={`Remove component ${index + 1}`} disabled={lines.length <= 1} onClick={() => removeLine(index)}><Trash2 size={15} /></button>
    </div>)}
    <div className="journal-totals"><div><span>Component lines</span><strong>{lines.length}</strong></div><div><span>Estimated cost per output / bundle</span><strong>{money(unitCost, currency)}</strong></div>{moduleId === 'boms' && <div><span>Estimated run material cost</span><strong>{money(unitCost * Math.max(0, Number(values.outputQuantity) || 0), currency)}</strong></div>}</div>
    <p className="structured-editor-note">Component quantities and costs are a frontend estimate only. Saving does not reserve, issue or consume stock.</p>
  </section>;
}
