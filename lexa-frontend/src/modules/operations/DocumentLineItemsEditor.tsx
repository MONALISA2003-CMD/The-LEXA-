import { Plus, Trash2 } from 'lucide-react';
import type { DocumentLine, DocumentLineConfig } from './documentLines';
import { documentLineQuantity, documentLineSubtotal } from './documentLines';

interface Props {
  config: DocumentLineConfig;
  lines: DocumentLine[];
  currency: string;
  onChange: (lines: DocumentLine[]) => void;
}

function amountLabel(value: number, currency: string): string {
  try { return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: currency === 'UGX' ? 0 : 2 }).format(value); }
  catch { return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
}

export default function DocumentLineItemsEditor({ config, lines, currency, onChange }: Props) {
  function update(index: number, field: 'description' | 'quantity' | 'unitAmount', value: string) {
    onChange(lines.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
  }
  function addLine() {
    onChange([...lines, { id: `line-${Date.now()}-${lines.length}`, description: '', quantity: '1', unitAmount: '0' }]);
  }
  function removeLine(index: number) {
    onChange(lines.filter((_, lineIndex) => lineIndex !== index));
  }

  return (
    <section className="document-lines" aria-label={config.title}>
      <div className="document-lines-heading">
        <div><h4>{config.title}</h4><p>Enter one or more items. Document subtotal, discount and tax update from these lines.</p></div>
        <button type="button" className="button button-secondary button-small" onClick={addLine}><Plus size={14} /> Add line</button>
      </div>
      <div className="document-lines-list">
        {lines.map((line, index) => <div className="document-line-row" key={line.id}>
          <label className="field-label document-line-description"><span>Item / service {index + 1}</span><input aria-label={`Item or service ${index + 1}`} required maxLength={180} value={line.description} onChange={(event) => update(index, 'description', event.target.value)} placeholder="Item, SKU or service" /></label>
          <label className="field-label document-line-number"><span>Quantity</span><input aria-label={`Quantity for line ${index + 1}`} required type="number" min="0.0001" step="any" inputMode="decimal" value={line.quantity} onChange={(event) => update(index, 'quantity', event.target.value)} /></label>
          <label className="field-label document-line-number"><span>{config.priceKey === 'unitCost' ? 'Unit cost' : 'Unit price'} ({currency})</span><input aria-label={`Unit amount for line ${index + 1}`} required type="number" min="0" step={currency === 'UGX' ? '1' : '0.01'} inputMode="decimal" value={line.unitAmount} onChange={(event) => update(index, 'unitAmount', event.target.value)} /></label>
          <button type="button" className="icon-button document-line-remove" aria-label={`Remove line ${index + 1}`} title="Remove line" disabled={lines.length <= 1} onClick={() => removeLine(index)}><Trash2 size={15} /></button>
        </div>)}
        {!lines.length && <div className="document-lines-empty"><p>No lines added. Add an item before saving.</p><button type="button" className="button button-secondary button-small" onClick={addLine}><Plus size={14} /> Add first line</button></div>}
      </div>
      <div className="document-lines-totals"><span>{documentLineQuantity(lines).toLocaleString(undefined, { maximumFractionDigits: 4 })} total units / service quantity</span><strong>Line subtotal · {amountLabel(documentLineSubtotal(lines), currency)}</strong></div>
    </section>
  );
}
