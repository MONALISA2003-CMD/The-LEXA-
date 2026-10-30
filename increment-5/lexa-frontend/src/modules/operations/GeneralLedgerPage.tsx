import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, CalendarClock, ChevronDown, CircleDollarSign, FilePlus2, LockKeyhole, RefreshCw, Scale, Settings2, ShieldCheck, Table2, Wallet } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import {
  apiGeneralLedger,
  type AccountType,
  type AccountControlKey,
  type GeneralLedgerJournal,
} from '../../data/remote/apiGeneralLedger';
import './general-ledger.css';

type Tab = 'overview' | 'accounts' | 'journals' | 'periods' | 'rules' | 'reports' | 'reconciliation';
type DraftLine = { accountId: string; description: string; debit: string; credit: string };
const ACCOUNT_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: 'ASSET', label: 'Assets' }, { value: 'LIABILITY', label: 'Liabilities' }, { value: 'EQUITY', label: 'Equity' },
  { value: 'INCOME', label: 'Income' }, { value: 'COST_OF_SALES', label: 'Cost of sales' }, { value: 'EXPENSE', label: 'Expenses' },
];
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' }, { id: 'accounts', label: 'Chart of Accounts' }, { id: 'journals', label: 'Journals' },
  { id: 'periods', label: 'Periods' }, { id: 'rules', label: 'Posting Rules' }, { id: 'reports', label: 'Financial Reports' }, { id: 'reconciliation', label: 'Reconciliation' },
];
function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`;
}
function currencyFactor(currency: string): number {
  try { return 10 ** (new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0); }
  catch { return 1; }
}
function toMinor(value: string, currency: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * currencyFactor(currency)) : 0;
}
function money(value: number, currency: string): string {
  return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: currencyFactor(currency) === 1 ? 0 : Math.log10(currencyFactor(currency)) }).format(value / currencyFactor(currency));
}
function dateLabel(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('en-UG', { dateStyle: 'medium' }).format(parsed);
}
function titleCase(value: string): string { return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()); }
function emptyLine(): DraftLine { return { accountId: '', description: '', debit: '', credit: '' }; }

export default function GeneralLedgerPage() {
  const { workspace, branch } = useWorkspace();
  const client = useQueryClient();
  const scope = { workspaceId: workspace.id, branchId: branch.id };
  const currency = workspace.currency;
  const [tab, setTab] = useState<Tab>('overview');
  const [asAt, setAsAt] = useState(today());
  const [from, setFrom] = useState(`${today().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today());
  const [accountCode, setAccountCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('ASSET');
  const [accountControlKey, setAccountControlKey] = useState<AccountControlKey | ''>('');
  const [accountDescription, setAccountDescription] = useState('');
  const [periodName, setPeriodName] = useState('');
  const [periodStart, setPeriodStart] = useState(`${today().slice(0, 4)}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(`${today().slice(0, 4)}-12-31`);
  const [journalDate, setJournalDate] = useState(today());
  const [journalReference, setJournalReference] = useState('');
  const [journalDescription, setJournalDescription] = useState('');
  const [journalLines, setJournalLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [auditJournalId, setAuditJournalId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const accountsQuery = useQuery({ queryKey: ['gl', workspace.id, branch.id, 'accounts'], queryFn: () => apiGeneralLedger.accounts(scope) });
  const periodsQuery = useQuery({ queryKey: ['gl', workspace.id, branch.id, 'periods'], queryFn: () => apiGeneralLedger.periods(scope) });
  const journalsQuery = useQuery({ queryKey: ['gl', workspace.id, branch.id, 'journals'], queryFn: () => apiGeneralLedger.journals(scope) });
  const rulesQuery = useQuery({ queryKey: ['gl', workspace.id, branch.id, 'rules'], queryFn: () => apiGeneralLedger.postingRules(scope) });
  const mappingsQuery = useQuery({ queryKey: ['gl', workspace.id, branch.id, 'mappings'], queryFn: () => apiGeneralLedger.mappings(scope) });
  const trialQuery = useQuery({ queryKey: ['gl', workspace.id, branch.id, 'trial-balance', asAt], queryFn: () => apiGeneralLedger.trialBalance(scope, asAt) });
  const pnlQuery = useQuery({ queryKey: ['gl', workspace.id, branch.id, 'pnl', from, to], queryFn: () => apiGeneralLedger.profitAndLoss(scope, from, to), enabled: from <= to });
  const balanceSheetQuery = useQuery({ queryKey: ['gl', workspace.id, branch.id, 'balance-sheet', asAt], queryFn: () => apiGeneralLedger.balanceSheet(scope, asAt) });
  const reconciliationQuery = useQuery({ queryKey: ['gl', workspace.id, branch.id, 'reconciliation'], queryFn: () => apiGeneralLedger.reconciliation(scope) });
  const auditQuery = useQuery({ queryKey: ['gl', workspace.id, branch.id, 'audit', auditJournalId], queryFn: () => apiGeneralLedger.journalAudit(scope, auditJournalId!), enabled: Boolean(auditJournalId) });

  const accounts = accountsQuery.data ?? [];
  const activeAccounts = accounts.filter(account => account.isActive);
  const periods = periodsQuery.data ?? [];
  const journals = journalsQuery.data ?? [];
  const rules = rulesQuery.data ?? [];
  const mappings = mappingsQuery.data ?? [];
  const trial = trialQuery.data;
  const pnl = pnlQuery.data;
  const balanceSheet = balanceSheetQuery.data;
  const reconciliation = reconciliationQuery.data;
  const openPeriod = useMemo(() => periods.find(period => period.status === 'open' && period.startDate.slice(0, 10) <= today() && period.endDate.slice(0, 10) >= today()), [periods]);
  const postedJournals = journals.filter(journal => journal.status === 'posted');
  const draftJournals = journals.filter(journal => journal.status === 'draft');
  const draftDebits = journalLines.reduce((sum, line) => sum + toMinor(line.debit, currency), 0);
  const draftCredits = journalLines.reduce((sum, line) => sum + toMinor(line.credit, currency), 0);
  const isDraftBalanced = draftDebits > 0 && draftDebits === draftCredits && journalLines.every(line => line.accountId && ((toMinor(line.debit, currency) > 0) !== (toMinor(line.credit, currency) > 0)));

  async function refresh() {
    await client.invalidateQueries({ queryKey: ['gl', workspace.id, branch.id] });
  }
  async function run(key: string, success: string, task: () => Promise<unknown>) {
    setBusyKey(key);
    try { await task(); toast.success(success); await refresh(); }
    catch (error) { toast.error('Accounting change was not saved', { description: error instanceof Error ? error.message : 'Check the details and retry.' }); }
    finally { setBusyKey(null); }
  }
  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run('account', 'Account added to the chart of accounts', async () => {
      await apiGeneralLedger.createAccount(scope, { code: accountCode.trim(), name: accountName.trim(), accountType, ...(accountControlKey ? { controlKey: accountControlKey } : {}), ...(accountDescription.trim() ? { description: accountDescription.trim() } : {}) });
      setAccountCode(''); setAccountName(''); setAccountDescription(''); setAccountControlKey('');
    });
  }
  async function savePeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run('period', 'Accounting period created', async () => {
      await apiGeneralLedger.createPeriod(scope, { name: periodName.trim(), startDate: periodStart, endDate: periodEnd });
      setPeriodName('');
    });
  }
  function updateLine(index: number, field: keyof DraftLine, value: string) {
    setJournalLines(current => current.map((line, i) => i === index ? { ...line, [field]: value } : line));
  }
  async function saveJournal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lines = journalLines.map(line => ({ accountId: line.accountId, ...(line.description.trim() ? { description: line.description.trim() } : {}), debitMinor: toMinor(line.debit, currency), creditMinor: toMinor(line.credit, currency) })).filter(line => line.debitMinor > 0 || line.creditMinor > 0);
    const debits = lines.reduce((sum, line) => sum + line.debitMinor, 0); const credits = lines.reduce((sum, line) => sum + line.creditMinor, 0);
    if (lines.length < 2 || debits <= 0 || debits !== credits || lines.some(line => !line.accountId || ((line.debitMinor > 0) === (line.creditMinor > 0)))) { toast.error('Balance the journal before saving. Each line needs one account and either a debit or a credit.'); return; }
    await run('journal', 'Balanced journal saved as a draft', async () => {
      await apiGeneralLedger.createJournal(scope, { postingDate: journalDate, reference: journalReference.trim(), description: journalDescription.trim(), currency, lines });
      setJournalReference(''); setJournalDescription(''); setJournalLines([emptyLine(), emptyLine()]); setTab('journals');
    });
  }
  async function toggleRule(eventType: string, enabled: boolean) {
    await run(`rule:${eventType}`, enabled ? 'Automatic posting rule enabled' : 'Automatic posting rule disabled', () => apiGeneralLedger.setPostingRule(scope, eventType, enabled));
  }
  async function changeMapping(mappingKey: string, accountId: string) {
    if (!accountId) return;
    await run(`map:${mappingKey}`, 'Posting account mapping updated', () => apiGeneralLedger.updateMapping(scope, mappingKey, accountId));
  }
  function openAudit(journal: GeneralLedgerJournal) { setAuditJournalId(journal.id); }

  const error = [accountsQuery.error, periodsQuery.error, journalsQuery.error].find(Boolean);
  const isLoading = accountsQuery.isLoading || periodsQuery.isLoading || journalsQuery.isLoading;

  return (
    <div className="page-stack gl-page">
      <header className="gl-header">
        <div><div className="eyebrow eyebrow-blue">FINANCE / CONTROLLED ACCOUNTING</div><h2>General Ledger</h2><p>One controlled accounting ledger, linked to the sales, stock, receivables and payables records already in LEXA.</p></div>
        <div className="gl-header-meta"><span><ShieldCheck size={14} /> Source-linked postings</span><span>{currency} · {branch.name}</span></div>
      </header>
      <div className="gl-source-note"><LockKeyhole size={16} /><span>Sales, customer receipts, supplier bills, supplier payments and stock movements remain the operational source records. This area records their balanced accounting impact; it does not create replacement transactions.</span></div>
      <nav className="gl-tabs" aria-label="General ledger sections">
        {TABS.map(item => <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </nav>
      {isLoading && <div className="gl-empty">Loading general-ledger records…</div>}
      {error && <div className="gl-error">{error instanceof Error ? error.message : 'The general ledger could not be loaded. Check the backend connection and permissions.'}</div>}
      {!isLoading && !error && <>
        {tab === 'overview' && <section className="gl-content">
          <div className="gl-metrics">
            <article><span>Chart accounts</span><strong>{accounts.length}</strong><small>{activeAccounts.length} active accounts</small></article>
            <article><span>Posted journals</span><strong>{postedJournals.length}</strong><small>{draftJournals.length} draft journals awaiting posting</small></article>
            <article><span>Trial balance debits</span><strong>{money(trial?.totals.debitMinor ?? 0, currency)}</strong><small>As at {dateLabel(asAt)}</small></article>
            <article><span>Trial balance credits</span><strong>{money(trial?.totals.creditMinor ?? 0, currency)}</strong><small>{trial?.totals.isBalanced ? 'Debits equal credits' : 'Review the difference'}</small></article>
          </div>
          <div className="gl-overview-grid">
            <article className="gl-card"><div className="gl-section-title"><div><span className="eyebrow eyebrow-blue">CONTROL STATUS</span><h3>Accounting controls</h3></div><Scale size={18}/></div>
              <div className="gl-status-row"><span>Current accounting period</span><strong>{openPeriod?.name ?? 'No open period for today'}</strong></div>
              <div className="gl-status-row"><span>Trial balance</span><strong className={trial?.totals.isBalanced ? 'gl-ok' : 'gl-warning'}>{trial?.totals.isBalanced ? 'Balanced' : 'Needs review'}</strong></div>
              <div className="gl-status-row"><span>Automatic posting rules</span><strong>{rules.filter(rule => rule.enabled).length} / {rules.length} enabled</strong></div>
              <div className="gl-status-row"><span>Control reconciliations</span><strong>{reconciliation?.matched ?? 0} matched · {reconciliation?.needsReview ?? 0} to review</strong></div>
            </article>
            <article className="gl-card"><div className="gl-section-title"><div><span className="eyebrow eyebrow-blue">QUICK ACTIONS</span><h3>Accounting workspace</h3></div><BookOpen size={18}/></div>
              <div className="gl-quick-actions"><button type="button" onClick={() => setTab('accounts')}><Table2 size={16}/> Configure accounts</button><button type="button" onClick={() => setTab('journals')}><FilePlus2 size={16}/> Prepare a journal</button><button type="button" onClick={() => setTab('periods')}><CalendarClock size={16}/> Manage periods</button><button type="button" onClick={() => setTab('reports')}><Scale size={16}/> Open financial reports</button></div>
            </article>
          </div>
          <div className="gl-card"><div className="gl-section-title"><div><span className="eyebrow eyebrow-blue">LATEST ACTIVITY</span><h3>Recent journals</h3></div><button type="button" className="gl-link" onClick={() => setTab('journals')}>View all</button></div><JournalTable journals={journals.slice(0, 6)} currency={currency} onAudit={openAudit} onPost={id => run(`post:${id}`, 'Journal posted', () => apiGeneralLedger.postJournal(scope, id))} onVoid={id=>run(`void:${id}`,'Draft journal voided',()=>apiGeneralLedger.voidJournal(scope,id))} busyKey={busyKey}/></div>
        </section>}

        {tab === 'accounts' && <section className="gl-content">
          <div className="gl-section-head"><div><h3>Chart of Accounts</h3><p>Configure asset, liability, equity, income, cost-of-sales and expense accounts. System control accounts are mapped to operational source records.</p></div></div>
          <div className="gl-two-column"><form className="gl-card gl-form" onSubmit={saveAccount}><h4>Add an account</h4><div className="gl-form-grid"><label>Account code<input required maxLength={24} value={accountCode} onChange={event => setAccountCode(event.target.value)} placeholder="e.g. 1210"/></label><label>Account name<input required maxLength={120} value={accountName} onChange={event => setAccountName(event.target.value)} placeholder="e.g. Prepaid expenses"/></label><label>Account type<select value={accountType} onChange={event => { const next=event.target.value as AccountType; setAccountType(next); if (next!=='ASSET') setAccountControlKey(''); else if (accountControlKey==='AP') setAccountControlKey(''); }}>{ACCOUNT_TYPES.map(type => <option value={type.value} key={type.value}>{type.label}</option>)}</select></label><label>Control role<select value={accountControlKey} onChange={event=>setAccountControlKey(event.target.value as AccountControlKey | '')} disabled={accountType!=='ASSET'&&accountType!=='LIABILITY'}><option value="">None</option><option value="CASH" disabled={accountType!=='ASSET'}>Cash / bank</option><option value="AR" disabled={accountType!=='ASSET'}>Accounts receivable</option><option value="INVENTORY" disabled={accountType!=='ASSET'}>Inventory</option><option value="AP" disabled={accountType!=='LIABILITY'}>Accounts payable</option></select></label><label className="gl-span-2">Description<input value={accountDescription} maxLength={500} onChange={event => setAccountDescription(event.target.value)} placeholder="Optional account purpose"/></label></div><button className="button button-primary" type="submit" disabled={busyKey === 'account'}>Add account</button></form>
            <div className="gl-card"><h4>Account structure</h4>{ACCOUNT_TYPES.map(type => <div className="gl-account-type-row" key={type.value}><span>{type.label}</span><strong>{accounts.filter(account => account.accountType === type.value).length}</strong></div>)}</div>
          </div>
          <div className="gl-table-wrap"><table className="gl-table"><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Normal balance</th><th>Control</th><th>Status</th></tr></thead><tbody>{accounts.map(account => <tr key={account.id}><td className="gl-mono">{account.code}</td><td><strong>{account.name}</strong>{account.isSystem && <small className="gl-subtext">System control account</small>}</td><td>{titleCase(account.accountType)}</td><td>{titleCase(account.normalBalance)}</td><td>{account.controlKey ?? account.mappings?.map(item => item.key).join(', ') ?? '—'}</td><td><span className={`gl-status-pill ${account.isActive ? 'open' : 'closed'}`}>{account.isActive ? 'Active' : 'Inactive'}</span></td></tr>)}</tbody></table></div>
        </section>}

        {tab === 'journals' && <section className="gl-content">
          <div className="gl-section-head"><div><h3>Double-entry journals</h3><p>Manual adjustments only. Routine operational transactions are posted automatically from their source records.</p></div><span className="gl-note-tag"><ShieldCheck size={13}/> Posted journals are immutable</span></div>
          <form className="gl-card gl-form" onSubmit={saveJournal}><div className="gl-section-title"><div><h4>Prepare a manual journal</h4><p>Enter at least two lines; each line must be either a debit or a credit.</p></div><FilePlus2 size={18}/></div>
            <div className="gl-form-grid"><label>Posting date<input type="date" required value={journalDate} onChange={event => setJournalDate(event.target.value)}/></label><label>Reference<input value={journalReference} maxLength={120} onChange={event => setJournalReference(event.target.value)} placeholder="Supporting document"/></label><label className="gl-span-2">Narration<input required maxLength={500} value={journalDescription} onChange={event => setJournalDescription(event.target.value)} placeholder="Reason for this adjustment"/></label></div>
            <div className="gl-journal-lines-heading"><strong>Journal lines</strong><button className="button button-secondary button-small" type="button" onClick={() => setJournalLines(lines => [...lines, emptyLine()])}>Add line</button></div>
            <div className="gl-journal-lines">{journalLines.map((line,index)=><div className="gl-journal-line" key={index}><label>Account<select required value={line.accountId} onChange={event=>updateLine(index,'accountId',event.target.value)}><option value="">Select account</option>{activeAccounts.map(account=><option value={account.id} key={account.id}>{account.code} · {account.name}</option>)}</select></label><label>Description<input value={line.description} onChange={event=>updateLine(index,'description',event.target.value)} placeholder="Optional line note"/></label><label>Debit ({currency})<input inputMode="decimal" type="number" min="0" step={1/currencyFactor(currency)} value={line.debit} onChange={event=>updateLine(index,'debit',event.target.value)}/></label><label>Credit ({currency})<input inputMode="decimal" type="number" min="0" step={1/currencyFactor(currency)} value={line.credit} onChange={event=>updateLine(index,'credit',event.target.value)}/></label><button type="button" className="gl-remove-line" disabled={journalLines.length<=2} onClick={()=>setJournalLines(lines=>lines.filter((_,i)=>i!==index))} aria-label={`Remove journal line ${index+1}`}>×</button></div>)}</div>
            <div className="gl-journal-totals"><span>Debits <strong>{money(draftDebits,currency)}</strong></span><span>Credits <strong>{money(draftCredits,currency)}</strong></span><span className={isDraftBalanced?'gl-ok':'gl-warning'}>{isDraftBalanced?'Balanced':`Difference ${money(Math.abs(draftDebits-draftCredits),currency)}`}</span></div>
            <div className="gl-form-footer"><span>Saving creates a draft. Posting is a separate, permission-controlled action.</span><button className="button button-primary" type="submit" disabled={busyKey==='journal'||!isDraftBalanced}>Save balanced draft</button></div>
          </form>
          <div className="gl-card"><div className="gl-section-title"><div><h4>Journal register</h4><p>{journals.length} source-linked and manual journals</p></div><button className="gl-icon-button" type="button" onClick={()=>void refresh()} aria-label="Refresh journals"><RefreshCw size={15}/></button></div><JournalTable journals={journals} currency={currency} onAudit={openAudit} onPost={id=>run(`post:${id}`,'Journal posted',()=>apiGeneralLedger.postJournal(scope,id))} onVoid={id=>run(`void:${id}`,'Draft journal voided',()=>apiGeneralLedger.voidJournal(scope,id))} onReverse={id=>run(`reverse:${id}`,'Reversal journal posted',()=>apiGeneralLedger.reverseJournal(scope,id,today()))} busyKey={busyKey}/></div>
        </section>}

        {tab === 'periods' && <section className="gl-content"><div className="gl-section-head"><div><h3>Accounting periods</h3><p>Posting is accepted only when the source transaction date falls within an open period. Close a period to lock all subsequent postings.</p></div></div>
          <form className="gl-card gl-form" onSubmit={savePeriod}><h4>Create an accounting period</h4><div className="gl-form-grid"><label>Period name<input required maxLength={60} value={periodName} onChange={event=>setPeriodName(event.target.value)} placeholder="e.g. FY2028 or 2028-01"/></label><label>Start date<input type="date" required value={periodStart} onChange={event=>setPeriodStart(event.target.value)}/></label><label>End date<input type="date" required value={periodEnd} onChange={event=>setPeriodEnd(event.target.value)}/></label></div><button className="button button-primary" type="submit" disabled={busyKey==='period'}>Create open period</button></form>
          <div className="gl-table-wrap"><table className="gl-table"><thead><tr><th>Period</th><th>From</th><th>To</th><th>Status</th><th>Control</th></tr></thead><tbody>{periods.map(period=><tr key={period.id}><td><strong>{period.name}</strong></td><td>{dateLabel(period.startDate)}</td><td>{dateLabel(period.endDate)}</td><td><span className={`gl-status-pill ${period.status}`}>{titleCase(period.status)}</span></td><td><button className="button button-secondary button-small" type="button" disabled={busyKey===`period:${period.id}`} onClick={()=>run(`period:${period.id}`,period.status==='open'?'Accounting period closed':'Accounting period reopened',()=>apiGeneralLedger.setPeriodStatus(scope,period.id,period.status==='open'?'closed':'open'))}>{period.status==='open'?'Close period':'Reopen period'}</button></td></tr>)}</tbody></table></div>
        </section>}

        {tab === 'rules' && <section className="gl-content"><div className="gl-section-head"><div><h3>Automatic posting rules</h3><p>Rules are run in the same database transaction as the original operational event. A missing mapping or closed period blocks the source write, preventing an unposted financial record.</p></div></div>
          <div className="gl-card"><div className="gl-section-title"><div><h4>Posting rule controls</h4><p>Disable a rule only when the related operational workflow is intentionally being paused.</p></div><Settings2 size={18}/></div>
            <div className="gl-rule-list">{rules.map(rule=><div className="gl-rule-row" key={rule.eventType}><div><strong>{rule.label}</strong><small>{rule.description}</small><span className="gl-mono">{rule.eventType}</span></div><label className="gl-switch"><input type="checkbox" checked={rule.enabled} disabled={busyKey===`rule:${rule.eventType}`} onChange={event=>void toggleRule(rule.eventType,event.target.checked)}/><span>{rule.enabled?'Enabled':'Paused'}</span></label></div>)}</div>
          </div>
          <div className="gl-card"><div className="gl-section-title"><div><h4>Control-account mappings</h4><p>Choose the General Ledger account used by each automatic posting key. The same operational method can intentionally map to the same cash/bank account.</p></div><Wallet size={18}/></div>
            <div className="gl-mapping-list">{mappings.map(mapping=><div className="gl-mapping-row" key={mapping.mappingKey}><div><strong>{mapping.mappingKey}</strong><small>{mapping.accountCode} · {mapping.accountName}</small></div><label className="gl-mapping-select"><span className="sr-only">Account for {mapping.mappingKey}</span><select value={mapping.accountId} disabled={busyKey===`map:${mapping.mappingKey}`} onChange={event=>void changeMapping(mapping.mappingKey,event.target.value)}>{activeAccounts.filter(account=>{const key=mapping.mappingKey; const required=key.startsWith('cash:')?'CASH':key==='accounts_receivable'?'AR':key==='accounts_payable'?'AP':key==='inventory'?'INVENTORY':null; return required?account.controlKey===required:key==='cost_of_sales'?account.accountType==='COST_OF_SALES':['sales_revenue','sales_returns','inventory_adjustment_gain'].includes(key)?account.accountType==='INCOME':['inventory_adjustment_expense','inventory_write_off','purchase_price_variance'].includes(key)?account.accountType==='EXPENSE':['goods_received_not_invoiced','interbranch_payable'].includes(key)?account.accountType==='LIABILITY':key==='interbranch_receivable'?account.accountType==='ASSET':['owner_capital','opening_balance_equity'].includes(key)?account.accountType==='EQUITY':activeAccounts.includes(account);}).map(account=><option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select><ChevronDown size={14}/></label></div>)}</div>
          </div>
        </section>}

        {tab === 'reports' && <section className="gl-content"><div className="gl-section-head"><div><h3>Financial reports</h3><p>Reports are calculated exclusively from posted General Ledger journal lines.</p></div></div>
          <div className="gl-card gl-report-filters"><label>As at<input type="date" value={asAt} onChange={event=>setAsAt(event.target.value)}/></label><label>Profit & Loss from<input type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label><label>To<input type="date" value={to} onChange={event=>setTo(event.target.value)}/></label></div>
          <div className="gl-card"><div className="gl-section-title"><div><h4>Trial Balance</h4><p>As at {dateLabel(asAt)} · Debits must equal credits</p></div><Scale size={18}/></div><div className="gl-report-total"><span>Debits <strong>{money(trial?.totals.debitMinor??0,currency)}</strong></span><span>Credits <strong>{money(trial?.totals.creditMinor??0,currency)}</strong></span><span className={trial?.totals.isBalanced?'gl-ok':'gl-warning'}>{trial?.totals.isBalanced?'Balanced':`Difference ${money(trial?.totals.differenceMinor??0,currency)}`}</span></div><ReportTable rows={trial?.rows??[]} currency={currency} valueKey="balanceMinor" showDebitCredit/></div>
          <div className="gl-card"><div className="gl-section-title"><div><h4>Profit & Loss</h4><p>{dateLabel(from)} to {dateLabel(to)}</p></div><CircleDollarSign size={18}/></div><div className="gl-report-total"><span>Revenue <strong>{money(pnl?.totals.revenueMinor??0,currency)}</strong></span><span>Gross profit <strong>{money(pnl?.totals.grossProfitMinor??0,currency)}</strong></span><span>Net profit <strong>{money(pnl?.totals.netProfitMinor??0,currency)}</strong></span></div><ReportTable rows={pnl?.rows??[]} currency={currency} valueKey="netMinor"/></div>
          <div className="gl-card"><div className="gl-section-title"><div><h4>Balance Sheet</h4><p>As at {dateLabel(asAt)} · Current earnings are shown separately until year-end closing journals are posted.</p></div><Table2 size={18}/></div><BalanceSheetView report={balanceSheet} currency={currency}/></div>
        </section>}

        {tab === 'reconciliation' && <section className="gl-content"><div className="gl-section-head"><div><h3>Source-to-ledger reconciliation</h3><p>Control balances are compared with operational source records. Differences are surfaced, not silently adjusted.</p></div><button className="button button-secondary button-small" type="button" onClick={()=>void refresh()}><RefreshCw size={14}/> Refresh</button></div>
          <div className="gl-metrics"><article><span>Matched controls</span><strong>{reconciliation?.matched??0}</strong><small>Source equals posted control account</small></article><article><span>Needs review</span><strong className={reconciliation?.needsReview?'gl-warning':''}>{reconciliation?.needsReview??0}</strong><small>Difference requiring investigation</small></article></div>
          <div className="gl-reconciliation-list">{reconciliation?.rows.map(row=><article className="gl-card gl-recon-row" key={row.key}><div className="gl-recon-title"><div><strong>{row.label}</strong><small>{row.basis}</small></div><span className={`gl-status-pill ${row.status==='matched'?'open':'review'}`}>{row.status==='matched'?'Matched':'Review'}</span></div><div className="gl-recon-values"><div><span>Ledger balance</span><strong>{money(row.ledgerMinor,currency)}</strong></div><div><span>Operational source</span><strong>{money(row.sourceMinor,currency)}</strong></div><div><span>Difference</span><strong className={row.differenceMinor===0?'gl-ok':'gl-warning'}>{money(row.differenceMinor,currency)}</strong></div></div></article>)}</div>
          <p className="gl-footnote">Older stock movements were backfilled using the product's current cost because the legacy operational records did not retain historic unit-cost snapshots; new stock movements now preserve their source cost. Cash/bank reconciliation excludes opening balances not entered through an operational receipt or payment.</p>
        </section>}
      </>}

      {auditJournalId && <div className="gl-modal-backdrop" role="presentation" onClick={()=>setAuditJournalId(null)}><section className="gl-modal" role="dialog" aria-modal="true" aria-label="Journal audit history" onClick={event=>event.stopPropagation()}><div className="gl-section-title"><div><h3>Journal audit history</h3><p>Immutable history for the selected journal.</p></div><button className="gl-icon-button" type="button" onClick={()=>setAuditJournalId(null)} aria-label="Close audit history">×</button></div>{auditQuery.isLoading?'Loading audit history…':auditQuery.error?<div className="gl-error">Could not load journal audit history.</div>:<div className="gl-audit-list">{(auditQuery.data??[]).map(item=><div key={item.id}><strong>{titleCase(item.action)}</strong><small>{item.actorName??'System'} · {new Date(item.createdAt).toLocaleString()}</small><code>{JSON.stringify(item.details)}</code></div>)}</div>}</section></div>}
    </div>
  );
}

function JournalTable({ journals, currency, onAudit, onPost, onVoid, onReverse, busyKey }: {
  journals: GeneralLedgerJournal[]; currency: string; onAudit: (journal: GeneralLedgerJournal) => void;
  onPost: (id: string) => void; onVoid?: (id: string) => void; onReverse?: (id: string) => void; busyKey: string | null;
}) {
  if (!journals.length) return <div className="gl-empty">No journals have been posted yet. New operational transactions will appear here after their accounting rules run.</div>;
  return <div className="gl-table-wrap"><table className="gl-table"><thead><tr><th>Journal</th><th>Date</th><th>Source / reference</th><th>Debit</th><th>Credit</th><th>Status</th><th>Actions</th></tr></thead><tbody>{journals.map(journal=><tr key={journal.id}><td><strong className="gl-mono">{journal.journalNumber}</strong><small className="gl-subtext">{journal.description}</small></td><td>{dateLabel(String(journal.postingDate).slice(0,10))}</td><td>{journal.reference??journal.sourceType??'Manual'}</td><td>{money(journal.debitTotalMinor,currency)}</td><td>{money(journal.creditTotalMinor,currency)}</td><td><span className={`gl-status-pill ${journal.status}`}>{titleCase(journal.status)}</span></td><td><div className="gl-row-actions"><button type="button" className="gl-link" onClick={()=>onAudit(journal)}>Audit</button>{journal.status==='draft'&&<><button type="button" className="button button-primary button-small" disabled={busyKey===`post:${journal.id}`} onClick={()=>onPost(journal.id)}>Post</button>{onVoid&&<button type="button" className="button button-secondary button-small" disabled={busyKey===`void:${journal.id}`} onClick={()=>onVoid(journal.id)}>Void</button>}</>}{journal.status==='posted'&&onReverse&&<button type="button" className="button button-secondary button-small" disabled={busyKey===`reverse:${journal.id}`} onClick={()=>onReverse(journal.id)}>Reverse</button>}</div></td></tr>)}</tbody></table></div>;
}
function ReportTable({ rows, currency, valueKey, showDebitCredit=false }: { rows: any[]; currency: string; valueKey: string; showDebitCredit?: boolean }) {
  if(!rows.length) return <div className="gl-empty">No posted activity in this report period.</div>;
  return <div className="gl-table-wrap"><table className="gl-table"><thead><tr><th>Code</th><th>Account</th><th>Type</th>{showDebitCredit&&<><th>Debit</th><th>Credit</th></>}<th>{showDebitCredit?'Net balance':'Net amount'}</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td className="gl-mono">{row.code}</td><td>{row.name}</td><td>{titleCase(row.accountType)}</td>{showDebitCredit&&<><td>{money(Number(row.debitMinor),currency)}</td><td>{money(Number(row.creditMinor),currency)}</td></>}<td>{money(Number(row[valueKey]),currency)}</td></tr>)}</tbody></table></div>;
}
function BalanceSheetView({ report, currency }: { report?: { assets: any[]; liabilities: any[]; equity: any[]; currentEarningsMinor: number; totals: { assetsMinor: number; liabilitiesMinor: number; equityMinor: number; liabilitiesAndEquityMinor: number; differenceMinor: number } }; currency: string }) {
  if(!report) return <div className="gl-empty">Balance sheet is loading.</div>;
  const group=(label:string,rows:any[],total:number)=> <div className="gl-bs-group"><h5>{label}</h5>{rows.map(row=><div className="gl-bs-row" key={row.id}><span>{row.code} · {row.name}</span><strong>{money(Number(row.balanceMinor),currency)}</strong></div>)}<div className="gl-bs-total"><span>Total {label.toLowerCase()}</span><strong>{money(total,currency)}</strong></div></div>;
  return <div className="gl-bs-grid">{group('Assets',report.assets,report.totals.assetsMinor)}{group('Liabilities',report.liabilities,report.totals.liabilitiesMinor)}<div className="gl-bs-group"><h5>Equity</h5>{report.equity.map(row=><div className="gl-bs-row" key={row.id}><span>{row.code} · {row.name}</span><strong>{money(Number(row.balanceMinor),currency)}</strong></div>)}<div className="gl-bs-row"><span>Current earnings (unclosed)</span><strong>{money(report.currentEarningsMinor,currency)}</strong></div><div className="gl-bs-total"><span>Total equity</span><strong>{money(report.totals.equityMinor,currency)}</strong></div></div><div className="gl-bs-grand-total"><span>Assets</span><strong>{money(report.totals.assetsMinor,currency)}</strong><span>Liabilities + equity</span><strong>{money(report.totals.liabilitiesAndEquityMinor,currency)}</strong><span>Difference</span><strong className={report.totals.differenceMinor===0?'gl-ok':'gl-warning'}>{money(report.totals.differenceMinor,currency)}</strong></div></div>;
}
