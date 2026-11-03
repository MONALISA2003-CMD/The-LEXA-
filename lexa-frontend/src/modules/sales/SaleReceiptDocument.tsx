import type { PaymentRecord, Sale, SaleLine, SaleReturn } from '../../domain/shared/types';
import { formatMinorAmount } from '../../domain/money/money';
import './selling-receipt.css';

interface Props {
  sale:Sale;lines:SaleLine[];payments:PaymentRecord[];returns:SaleReturn[];
  businessFallback:string;branchName:string;currency:string;timezone:string;paper:'thermal'|'a4';
}
const label=(method:string)=>({
  cash:'Cash',mtn_momo:'MTN Mobile Money',airtel_money:'Airtel Money',mobile_money:'Mobile money',
  bank_transfer:'Bank transfer',card:'Card',card_recorded:'Card',cheque:'Cheque'
} as Record<string,string>)[method]??'Other payment';

export default function SaleReceiptDocument({sale,lines,payments,returns,businessFallback,branchName,currency,timezone,paper}:Props){
  const business=sale.receiptBusinessSnapshot;
  const money=(amount:number)=>formatMinorAmount(amount,currency);
  const received=payments.filter(p=>p.kind==='receipt');
  const refunded=payments.filter(p=>p.kind==='refund');
  const paid=received.reduce((v,p)=>v+p.amountMinor,0);
  const refundTotal=refunded.reduce((v,p)=>v+p.amountMinor,0);
  const returnTotal=returns.reduce((v,r)=>v+r.totalMinor,0);
  const outstanding=Math.max(0,sale.totalMinor-returnTotal-paid);
  const taxTotal=lines.reduce((v,line)=>v+(line.taxMinor??0),0);
  const taxableTotal=lines.reduce((v,line)=>v+(line.taxableMinor??0),0);
  const name=business?.businessName||businessFallback;
  const localTime=new Intl.DateTimeFormat('en-UG',{dateStyle:'medium',timeStyle:'short',timeZone:business?.timezone||timezone}).format(new Date(sale.createdAt));
  return <article className="selling-print-surface" data-paper={paper} aria-label={'Receipt '+sale.receiptNumber}>
    <header className="selling-paper-head">
      <div className="selling-paper-business-name">{name}</div>
      {business?.legalName&&business.legalName!==name&&<div className="selling-paper-note">{business.legalName}</div>}
      {business?.address&&<div>{business.address}</div>}
      {(business?.city||business?.district)&&<div>{[business.city,business.district].filter(Boolean).join(', ')}</div>}
      {business?.phone&&<div>Tel: {business.phone}</div>}
      {business?.email&&<div>{business.email}</div>}
      {business?.website&&<div>{business.website}</div>}
      {business?.taxIdentificationNumber&&<div>TIN: {business.taxIdentificationNumber}</div>}
      {business?.registrationNumber&&<div>Registration: {business.registrationNumber}</div>}
    </header>
    <div className="selling-paper-title">SALES RECEIPT</div>
    <section className="selling-paper-meta">
      <div><span>Receipt</span><strong>{sale.receiptNumber}</strong></div>
      <div><span>Date</span><strong>{localTime}</strong></div>
      <div><span>Location</span><strong>{branchName}</strong></div>
      <div><span>Customer</span><strong>{sale.customerName||'Walk-in customer'}</strong></div>
      {sale.customerPhone&&<div><span>Customer phone</span><strong>{sale.customerPhone}</strong></div>}
      {business?.cashierName&&<div><span>Served by</span><strong>{business.cashierName}</strong></div>}
    </section>
    <table className="selling-paper-items">
      <thead><tr><th>Item / description</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>{lines.map(line=><tr key={line.id}>
        <td><strong>{line.productNameSnapshot}</strong>{line.skuSnapshot&&<small>{line.skuSnapshot}</small>}{line.serialIds?.length?<small>Serial: {line.serialIds.join(', ')}</small>:null}</td>
        <td>{line.quantity}</td><td>{money(line.unitPriceMinor)}</td><td>{money(line.lineTotalMinor)}</td>
      </tr>)}</tbody>
    </table>
    <section className="selling-paper-totals">
      <div><span>Items</span><strong>{lines.reduce((v,l)=>v+l.quantity,0)}</strong></div>
      {taxTotal>0&&<div><span>Amount before tax</span><strong>{money(taxableTotal)}</strong></div>}
      {taxTotal>0&&<div><span>Tax included</span><strong>{money(taxTotal)}</strong></div>}
      <div className="selling-paper-total"><span>SALE TOTAL</span><strong>{money(sale.totalMinor)}</strong></div>
      {returnTotal>0&&<div><span>Returned items</span><strong>− {money(returnTotal)}</strong></div>}
      {received.map(p=><div key={p.id}><span>{label(p.method)} received</span><strong>{money(p.amountMinor)}</strong></div>)}
      {sale.cashTenderedMinor!==undefined&&sale.cashTenderedMinor!==null&&
        <div><span>Cash tendered</span><strong>{money(sale.cashTenderedMinor)}</strong></div>}
      {sale.cashChangeMinor!==undefined&&sale.cashChangeMinor!==null&&sale.cashChangeMinor>0&&
        <div><span>Change given</span><strong>{money(sale.cashChangeMinor)}</strong></div>}
      {refundTotal>0&&<div><span>Refunds recorded</span><strong>{money(refundTotal)}</strong></div>}
      <div className="selling-paper-outstanding"><span>{outstanding>0?'BALANCE DUE':'PAYMENT STATUS'}</span><strong>{outstanding>0?money(outstanding):'Paid'}</strong></div>
      {outstanding>0&&sale.promisedPaymentDate&&<div><span>Due date</span><strong>{sale.promisedPaymentDate}</strong></div>}
    </section>
    {received.some(p=>Boolean(p.reference))&&<section className="selling-paper-references">
      <strong>Payment references</strong>
      {received.filter(p=>p.reference).map(p=><div key={p.id}>{label(p.method)}: {p.reference}</div>)}
    </section>}
    {returns.length>0&&<section className="selling-paper-references">
      <strong>Returns</strong>{returns.map(r=><div key={r.id}>{r.returnNumber}: {money(r.totalMinor)}</div>)}
    </section>}
    <footer className="selling-paper-footer">
      <strong>Thank you for shopping with us!</strong>
      <span>Please keep this receipt for any return or enquiry.</span>
      <span>Business receipt. An official URA fiscal document is separate where required.</span>
      <small>Prepared with LEXA</small>
    </footer>
  </article>;
}

