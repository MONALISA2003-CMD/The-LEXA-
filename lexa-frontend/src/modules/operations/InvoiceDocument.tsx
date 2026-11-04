
import type {ReceivablesInvoice} from '../../data/remote/apiReceivables';
import {formatMinorAmount} from '../../domain/money/money';
import './invoice-document.css';

export default function InvoiceDocument({invoice,businessName,currency}:{invoice:ReceivablesInvoice;businessName:string;currency:string}){
 const seller=invoice.sellerSnapshot;
 const name=seller?.businessName||businessName;
 const money=(n:number)=>formatMinorAmount(n,currency);
 return <article className="invoice-print-sheet" aria-label={'Customer invoice '+invoice.invoiceNumber}>
  <header className="invoice-paper-header">
   <div><span className="invoice-paper-kicker">CUSTOMER INVOICE</span><h1>{name}</h1>
    {seller?.legalName&&seller.legalName!==name&&<p>{seller.legalName}</p>}
    {[seller?.address,seller?.city,seller?.district].filter(Boolean).length>0&&<p>{[seller?.address,seller?.city,seller?.district].filter(Boolean).join(', ')}</p>}
    {seller?.phone&&<p>Tel: {seller.phone}</p>}{seller?.email&&<p>Email: {seller.email}</p>}
    {seller?.taxIdentificationNumber&&<p>TIN: {seller.taxIdentificationNumber}</p>}
   </div>
   <div><strong>{invoice.invoiceNumber}</strong><span>{invoice.status.replaceAll('_',' ')}</span></div>
  </header>
  <section className="invoice-paper-meta">
   <div><small>Bill to</small><strong>{invoice.customerName}</strong>{invoice.customerPhone&&<span>{invoice.customerPhone}</span>}</div>
   <div><small>Invoice date</small><strong>{invoice.issueDate||'Not issued'}</strong><small>Due date</small><strong>{invoice.dueDate}</strong></div>
  </section>
  <table><thead><tr><th>Product or service</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
   <tbody>{invoice.lines.map(line=><tr key={line.id}>
    <td>{line.productName}</td><td>{line.quantity}</td><td>{money(line.unitPriceMinor)}</td><td>{money(line.lineTotalMinor)}</td>
   </tr>)}</tbody>
  </table>
  <section className="invoice-paper-totals">
   <div><span>Subtotal</span><b>{money(invoice.subtotalMinor)}</b></div>
   {invoice.taxMinor>0&&<div><span>Recorded tax</span><b>{money(invoice.taxMinor)}</b></div>}
   <div className="invoice-paper-total"><span>Invoice total</span><strong>{money(invoice.totalMinor)}</strong></div>
   <div><span>Customer payments received</span><b>{money(invoice.receivedMinor)}</b></div>
   <div className="invoice-paper-due"><span>Balance due</span><strong>{money(invoice.balanceDueMinor)}</strong></div>
  </section>
  {invoice.notes&&<p className="invoice-paper-notes">Terms / notes: {invoice.notes}</p>}
  <footer>Thank you for doing business with {name}.<span>Business invoice. If an official URA EFRIS invoice is required, it must be issued separately through an authorised fiscal service.</span><small>Prepared with LEXA</small></footer>
 </article>;
}

