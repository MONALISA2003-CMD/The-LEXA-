import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiFinanceOperations } from '../../data/remote/apiWorkstream03';
import { refreshBusinessProjections } from '../../data/remote/businessRefresh';
import { parseBankStatementCsv } from './bankStatementParser';
import { formatMinorAmount, minorUnitFactor } from '../../domain/money/money';

function asMoney(value: unknown, currency: string): string {
  const minor = Number(value ?? 0);
  return formatMinorAmount(minor, currency);
}
function minorAmount(value: string, currency: string): number {
  const factor = minorUnitFactor(currency);
  const raw = Number(value);
  const amount = Math.round(raw * factor);
  if (value.trim() === '' || !Number.isFinite(raw) || raw < 0 || !Number.isSafeInteger(amount) || Math.abs(raw * factor - amount) > 1e-6) {
    throw new Error(`Enter a valid non-negative ${currency} amount.`);
  }
  return amount;
}
const today = () => new Date().toISOString().slice(0,10);

/** Tenant-authorized bank statement → posted GL bank line → completed reconciliation. */
export default function BankReconciliationPanel() {
  const { workspace, branch } = useWorkspace();
  const cache = useQueryClient();
  const w = workspace.id, b = branch.id, currency = workspace.currency || 'UGX';
  const [accountId, setAccountId] = useState('');
  const [reconciliationId, setReconciliationId] = useState('');
  const [csv, setCsv] = useState('date,direction,amount,description,reference,externalId\n');
  const [statementDate, setStatementDate] = useState(today());
  const [opening, setOpening] = useState('0');
  const [closing, setClosing] = useState('0');
  const [ledgerSelection, setLedgerSelection] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false);
  const banksQuery = useQuery({queryKey:['ws-finance-banks',w,b],queryFn:()=>apiFinanceOperations.bankAccounts(w,b)});
  // Reconciliation is branch-scoped; shared accounts lack branch-isolated statement lines.
  const banks = {...banksQuery, data:(banksQuery.data??[]).filter(item=>String(item.branchId)===b)};
  const reconciliations = useQuery({queryKey:['bank-reconciliations',w,b],queryFn:()=>apiFinanceOperations.bankReconciliations(w,b)});
  const account = (banks.data ?? []).find(row=>String(row.id) === accountId);
  const selectedAccount = account ? String(account.id) : String(banks.data?.[0]?.id || '');
  const statements = useQuery({queryKey:['bank-statement-lines',w,b,selectedAccount],queryFn:()=>apiFinanceOperations.bankStatementLines(w,b,selectedAccount),enabled:!!selectedAccount});
  const ledgers = useQuery({queryKey:['bank-ledger-lines',w,b,selectedAccount],queryFn:()=>apiFinanceOperations.postedBankLedgerLines(w,b,selectedAccount),enabled:!!selectedAccount});
  const currentAccount = account || banks.data?.[0];
  const selectedReconciliation = (reconciliations.data ?? []).find(r=>r.id===reconciliationId && r.bankAccountId===selectedAccount);
  const openReconciliation = selectedReconciliation ?? (reconciliations.data ?? []).find(r=>r.bankAccountId===selectedAccount && r.status==='in_progress');
  const pending = (statements.data ?? []).filter(row=>row.reconciliationStatus==='unmatched');
  const postedLines = ledgers.data ?? [];

  async function refresh() {
    await refreshBusinessProjections(cache,w,b);
    await Promise.all([
      cache.invalidateQueries({queryKey:['bank-reconciliations',w,b]}),
      cache.invalidateQueries({queryKey:['bank-statement-lines',w,b,selectedAccount]}),
      cache.invalidateQueries({queryKey:['bank-ledger-lines',w,b,selectedAccount]}),
    ]);
  }
  async function run(work:()=>Promise<unknown>, message:string) {
    setBusy(true);
    try { await work(); await refresh(); toast.success(message); }
    catch (error) { toast.error(error instanceof Error?error.message:'This banking action could not be completed.'); }
    finally { setBusy(false); }
  }
  async function createAccount(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=event.currentTarget;
    const data=Object.fromEntries(new FormData(form).entries());
    await run(async()=>{
      await apiFinanceOperations.createBankAccount(w,b,{
        accountName:String(data.accountName).trim(),bankName:String(data.bankName).trim(),
        accountNumberMasked:String(data.accountNumberMasked).trim(),currency,
      });
    },'Bank account added');
  }
  async function importStatement(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount) return;
    await run(async()=>{
      const lines=parseBankStatementCsv(csv,currency);
      const result=await apiFinanceOperations.importBankStatement(w,b,selectedAccount,lines);
      toast.info(`${result.inserted} statement lines imported, ${result.duplicates} already present.`);
    },'Statement import checked');
  }
  async function startReconciliation(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!selectedAccount)return;
    await run(async()=>{
      const result=await apiFinanceOperations.startBankReconciliation(w,b,{
        bankAccountId:selectedAccount,statementDate,openingBalanceMinor:minorAmount(opening,currency),closingBalanceMinor:minorAmount(closing,currency),
      });
      setReconciliationId(result.id);
    },'Bank reconciliation started');
  }
  async function match(statementId:string, journalId:string) {
    if(!openReconciliation || !journalId)return;
    await run(()=>apiFinanceOperations.matchBankLine(w,b,openReconciliation.id,statementId,journalId),'Bank movement matched to posted accounting');
  }
  return <section className="ws-finance-card" aria-label="Bank statement reconciliation">
    <div className="ws-finance-card-head"><div><h3>Bank statements & reconciliation</h3><p>Import real bank movements, match them to posted accounting and confirm the closing balance. No movement is created just by importing a statement.</p></div></div>
    {banks.isError || reconciliations.isError ? <p role="alert">Bank information could not be loaded. Check your finance permissions and retry.</p> : null}
    {!banks.data?.length ? <><p>No bank accounts are connected to this branch yet.</p><form className="ws-finance-inline-form" onSubmit={e=>void createAccount(e)}>
      <label>Account label<input name="accountName" placeholder="Business current account" required maxLength={100}/></label>
      <label>Bank name<input name="bankName" required maxLength={100}/></label>
      <label>Masked account number<input name="accountNumberMasked" placeholder="**** 1234" required maxLength={40}/></label>
      <button type="submit" disabled={busy}>Add bank account</button>
    </form></> : <>
      <label className="field-label">Bank account <select value={selectedAccount} onChange={e=>{setAccountId(e.target.value);setReconciliationId('');setLedgerSelection({});}}>
        {banks.data.map(item=><option key={String(item.id)} value={String(item.id)}>{String(item.accountName??item.bankName??item.id)} · {String(item.accountNumberMasked??'')}</option>)}
      </select></label>
      {currentAccount && !currentAccount.ledgerAccountId && <p className="ws-finance-note">This account uses the default posted bank-control ledger. For separate bank control accounts, link an account through Finance administration before reconciling.</p>}
      <form className="ws-finance-inline-form" onSubmit={e=>void importStatement(e)}>
        <label style={{flex:'1 1 100%'}}>Import statement CSV (date,direction,amount,description,reference,externalId)
          <textarea value={csv} rows={5} onChange={e=>setCsv(e.target.value)} spellCheck={false} aria-label="Statement CSV data"/>
        </label>
        <button disabled={busy} type="submit">Validate & import statement</button>
      </form>
      <form className="ws-finance-inline-form" onSubmit={e=>void startReconciliation(e)}>
        <label>Statement date<input type="date" required value={statementDate} onChange={e=>setStatementDate(e.target.value)}/></label>
        <label>Opening balance ({currency})<input inputMode="decimal" required value={opening} onChange={e=>setOpening(e.target.value)}/></label>
        <label>Closing balance ({currency})<input inputMode="decimal" required value={closing} onChange={e=>setClosing(e.target.value)}/></label>
        <button disabled={busy} type="submit">Start reconciliation</button>
      </form>
      <div className="ws-finance-list"><h4>Reconciliation history</h4>
        {(reconciliations.data ?? []).filter(rec=>rec.bankAccountId===selectedAccount).map(rec=><article key={rec.id}><div><strong>{new Date(rec.statementDate).toLocaleDateString('en-UG')}</strong><small>{rec.status.replace(/_/g,' ')} · Closing: {asMoney(rec.closingBalanceMinor,currency)}</small></div>{rec.status==='in_progress'&&<button disabled={busy} onClick={()=>setReconciliationId(rec.id)}>Continue</button>}</article>)}
      </div>
      {openReconciliation ? <>
        <p><strong>Matching {openReconciliation.accountName??'bank statement'}</strong> · {pending.length} unmatched statement entries · {postedLines.length} available posted bank entries</p>
        {statements.isError || ledgers.isError ? <p role="alert">Statement or ledger details are unavailable. Refresh before matching.</p> : null}
        {pending.map(stmt=>{
          const expected=Number(stmt.amountMinor)*(stmt.direction==='credit'?1:-1);
          const candidates=postedLines.filter(line=>Number(line.debitMinor)-Number(line.creditMinor)===expected && new Date(line.entryDate).getTime()<=new Date(openReconciliation.statementDate).getTime());
          return <article key={stmt.id} className="ws-finance-list" style={{marginBlock:'0.6rem',padding:'0.7rem',border:'1px solid var(--border-color, #d9e1ee)',borderRadius:'0.7rem'}}>
            <div><strong>{stmt.description}</strong><small>{stmt.direction} · {asMoney(stmt.amountMinor,currency)} · {new Date(stmt.transactionDate).toLocaleDateString('en-UG')}</small></div>
            {candidates.length?<div className="ws-finance-inline-form"><label>Matching posted bank entry<select aria-label={`Posted ledger entry for ${stmt.description}`} value={ledgerSelection[stmt.id]??''} onChange={e=>setLedgerSelection(curr=>({...curr,[stmt.id]:e.target.value}))}><option value="">Choose a posted entry</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.journalNumber} · {c.description??'Bank movement'} · {asMoney(Math.abs(expected),currency)}</option>)}</select></label><button type="button" disabled={busy||!ledgerSelection[stmt.id]} onClick={()=>void match(stmt.id,ledgerSelection[stmt.id] ?? '')}>Match entry</button></div>:<p>No matching posted bank entry yet. Review the <Link to="/modules/accounting">general ledger</Link>; do not invent a transaction to force a match.</p>}
          </article>;
        })}
        {pending.length===0&&<button type="button" disabled={busy} onClick={()=>void run(()=>apiFinanceOperations.completeBankReconciliation(w,b,openReconciliation.id),'Bank reconciliation completed')}>Check balances & complete reconciliation</button>}
      </> : <p>Start or choose a reconciliation to compare statement movements with posted accounting entries.</p>}
    </>}
  </section>;
}
