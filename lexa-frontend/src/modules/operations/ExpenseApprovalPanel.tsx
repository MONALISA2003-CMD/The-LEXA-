import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiFinanceOperations } from '../../data/remote/apiWorkstream03';
import { apiGeneralLedger } from '../../data/remote/apiGeneralLedger';
import { refreshBusinessProjections } from '../../data/remote/businessRefresh';
import { formatMinorAmount, fractionDigitsForCurrency, parseMajorAmount } from '../../domain/money/money';

const dateToday = () => new Date().toISOString().slice(0,10);
function toMinor(value: string, currency: string): number {
  const digits=fractionDigitsForCurrency(currency);
  const valueMajor=Number(value);
  if(value.trim()===''||!Number.isFinite(valueMajor)||valueMajor<0||Math.abs(valueMajor*10**digits-Math.round(valueMajor*10**digits))>1e-6) {
    throw new Error(`Enter a valid ${currency} amount with no more than ${digits} decimal places.`);
  }
  return parseMajorAmount(value,currency);
}

export default function ExpenseApprovalPanel() {
  const { workspace, branch }=useWorkspace();
  const w=workspace.id, b=branch.id, currency=workspace.currency || 'UGX';
  const cache=useQueryClient();
  const [busy,setBusy]=useState(false);
  const [paymentDetails,setPaymentDetails]=useState<Record<string,{method:string;reference:string}>>({});
  const categories=useQuery({queryKey:['ws-finance-expense-categories',w,b],queryFn:()=>apiFinanceOperations.expenseCategories(w,b)});
  const accounts=useQuery({queryKey:['general-ledger-accounts',w],queryFn:()=>apiGeneralLedger.accounts({workspaceId:w,branchId:b})});
  const expenses=useQuery({queryKey:['ws-finance-expenses',w,b],queryFn:()=>apiFinanceOperations.expenses(w,b)});
  const expenseAccounts=(accounts.data??[]).filter(a=>a.accountType==='expense'&&a.isActive);
  async function save(work:()=>Promise<unknown>,message:string):Promise<boolean> {
    setBusy(true);
    try {
      await work(); await refreshBusinessProjections(cache,w,b);
      await cache.invalidateQueries({queryKey:['ws-finance-expense-categories',w,b]});
      toast.success(message);return true;
    } catch(error) {toast.error(error instanceof Error?error.message:'Please review the transaction and try again.');return false;}
    finally {setBusy(false);}
  }
  async function addCategory(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form=e.currentTarget;
    const d=Object.fromEntries(new FormData(form).entries());
    if(await save(()=>apiFinanceOperations.createExpenseCategory(w,b,{code:String(d.code),name:String(d.name),ledgerAccountId:String(d.ledgerAccountId)}),'Expense category added')) form.reset();
  }
  async function addExpense(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form=e.currentTarget;
    const d=Object.fromEntries(new FormData(form).entries());
    const saved=await save(async()=>{
      const subtotal=toMinor(String(d.subtotal),currency),tax=toMinor(String(d.tax||'0'),currency);
      if(subtotal+tax<=0)throw new Error('Expense amount must be greater than zero.');
      await apiFinanceOperations.createExpense(w,b,{categoryId:String(d.categoryId),description:String(d.description).trim(),expenseDate:String(d.expenseDate),subtotalMinor:subtotal,taxMinor:tax,totalMinor:subtotal+tax});
    },'Expense saved for review');
    if(saved)form.reset();
  }
  return <section className="ws-finance-card" aria-label="Expense accounting and payment approvals">
    <div className="ws-finance-card-head"><div><h3>Expenses · approval and settlement</h3><p>A draft does not affect accounting. Approval records the expense and amount owed; only confirmed settlement reduces bank or cash.</p></div></div>
    {(expenses.isError||categories.isError||accounts.isError)&&<p role="alert">Expenses or accounting categories could not be loaded. Check your finance permissions and retry.</p>}
    <form className="ws-finance-inline-form" onSubmit={e=>void addCategory(e)}>
      <label>Category code<input name="code" maxLength={30} placeholder="OFFICE" required/></label>
      <label>Category name<input name="name" maxLength={100} placeholder="Office costs" required/></label>
      <label>Expense ledger account<select name="ledgerAccountId" required defaultValue=""><option value="">Choose an expense account</option>{expenseAccounts.map(a=><option key={a.id} value={a.id}>{a.accountCode} · {a.accountName}</option>)}</select></label>
      <button disabled={busy||!expenseAccounts.length} type="submit">Add category</button>
    </form>
    {!expenseAccounts.length&&<p>Set up an expense account in <Link to="/modules/accounting">Accounting</Link> before creating categories.</p>}
    <form className="ws-finance-inline-form" onSubmit={e=>void addExpense(e)}>
      <label>Expense date<input name="expenseDate" type="date" defaultValue={dateToday()} required/></label>
      <label>Category<select name="categoryId" required defaultValue=""><option value="">Choose category</option>{(categories.data??[]).map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}</select></label>
      <label>Description<input name="description" maxLength={500} placeholder="What was purchased?" required/></label>
      <label>Subtotal ({currency})<input name="subtotal" type="number" min="0" step={fractionDigitsForCurrency(currency)===0?'1':'0.01'} required/></label>
      <label>Tax ({currency})<input name="tax" type="number" min="0" step={fractionDigitsForCurrency(currency)===0?'1':'0.01'} defaultValue="0" required/></label>
      <button disabled={busy||!categories.data?.length} type="submit">Save draft expense</button>
    </form>
    <div className="ws-finance-list"><h4>Expense register and accounting actions</h4>
      {(expenses.data??[]).map(row=>{
        const id=String(row.id),status=String(row.status),detail=paymentDetails[id]??{method:'bank_transfer',reference:''};
        return <article key={id}><div><strong>{String(row.expenseNumber)} · {String(row.description)}</strong><small>{status.replaceAll('_',' ')} · {String(row.expenseDate??'')}</small><span>{formatMinorAmount(Number(row.totalMinor??0),currency)}</span></div>
          {status==='draft'&&<button disabled={busy} onClick={()=>void save(()=>apiFinanceOperations.approveExpense(w,b,id),'Expense approved and recorded as payable')}>Approve expense</button>}
          {status==='approved'&&<form className="ws-finance-inline-form" onSubmit={e=>{e.preventDefault();if(detail.reference.trim())void save(()=>apiFinanceOperations.payApprovedExpense(w,b,id,{method:detail.method,reference:detail.reference.trim()}),'Payment recorded in the ledger');}}>
            <label>Paid using<select aria-label={`Payment method for ${id}`} value={detail.method} onChange={e=>setPaymentDetails(v=>({...v,[id]:{...detail,method:e.target.value}}))}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="mtn_momo">MTN Mobile Money</option><option value="airtel_money">Airtel Money</option><option value="cheque">Cheque</option><option value="card_recorded">Card (recorded externally)</option></select></label>
            <label>External payment reference<input aria-label={`Payment reference for ${id}`} required maxLength={120} value={detail.reference} onChange={e=>setPaymentDetails(v=>({...v,[id]:{...detail,reference:e.target.value}}))}/></label>
            <button type="submit" disabled={busy||!detail.reference.trim()}>Confirm external payment</button>
          </form>}
          {status==='paid'&&<span>Expense settled and posted to accounting</span>}
        </article>;
      })}
      {!expenses.data?.length&&<p>No expenses have been recorded for this branch.</p>}
    </div>
    <small>Recording an external payment updates your ledger; LEXA does not transfer funds through this form. Review the <Link to="/modules/accounting">trial balance and audit trail</Link> after posting.</small>
  </section>;
}
