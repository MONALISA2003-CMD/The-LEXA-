import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpenCheck, CalendarClock, Check, CircleAlert, Plus, RefreshCw, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiGeneralLedger, type LedgerAccount, type LedgerJournalInput } from '../../data/remote/apiGeneralLedger';
import './general-ledger.css';

type DraftLine = { key: string; accountId: string; debit: string; credit: string; description: string };

function localDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
}
function digits(currency: string) {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0; }
  catch { return 0; }
}
function factor(currency: string) { return 10 ** digits(currency); }
function money(minor: number, currency: string) {
  return new Intl.NumberFormat('en-UG', { style: 'currency', currency, maximumFractionDigits: digits(currency) }).format(minor / factor(currency));
}
function toMinor(value: string, currency: string): number | null {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const minor = Math.round(parsed * factor(currency));
  return Number.isSafeInteger(minor) ? minor : null;
}
function line(key: string): DraftLine { return { key, accountId: '', debit: '', credit: '', description: '' }; }
function statusLabel(value: string) { return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }

export default function GeneralLedgerPanel() {
  const { workspace, branch } = useWorkspace();
  const client = useQueryClient();
  const scope = { workspaceId: workspace.id, branchId: branch.id };
  const currency = workspace.currency || 'UGX';
  const accountsQuery = useQuery({ queryKey: ['general-ledger-accounts', workspace.id], queryFn: () => apiGeneralLedger.accounts(scope) });
  const periodsQuery = useQuery({ queryKey: ['general-ledger-periods', workspace.id], queryFn: () => apiGeneralLedger.periods(scope) });
  const journalsQuery = useQuery({ queryKey: ['general-ledger-journals', workspace.id, branch.id], queryFn: () => apiGeneralLedger.journals(scope) });
  const trialQuery = useQuery({ queryKey: ['general-ledger-trial-balance', workspace.id, branch.id], queryFn: () => apiGeneralLedger.trialBalance(scope) });
  const reportFrom = `${localDate().slice(0, 4)}-01-01`;
  const profitQuery = useQuery({ queryKey: ['general-ledger-profit-and-loss', workspace.id, branch.id, reportFrom], queryFn: () => apiGeneralLedger.profitAndLoss(scope, { from: reportFrom, to: localDate() }) });
  const balanceSheetQuery = useQuery({ queryKey: ['general-ledger-balance-sheet', workspace.id, branch.id], queryFn: () => apiGeneralLedger.balanceSheet(scope) });
  const reconciliationQuery = useQuery({ queryKey: ['general-ledger-source-reconciliation', workspace.id, branch.id], queryFn: () => apiGeneralLedger.sourceReconciliation(scope) });
  const accounts = accountsQuery.data ?? [];
  const periods = periodsQuery.data ?? [];
  const journals = journalsQuery.data ?? [];
  const trialRows = trialQuery.data ?? [];
  const profitReport = profitQuery.data;
  const balanceSheetReport = balanceSheetQuery.data;
  const reconciliation = reconciliationQuery.data;
  const [composeOpen, setComposeOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(localDate());
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([line('l1'), line('l2')]);
  const [saving, setSaving] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountCode, setAccountCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('expense');
  const [normalBalance, setNormalBalance] = useState<'debit' | 'credit'>('debit');

  const totals = useMemo(() => {
    return lines.reduce((total, item) => {
      const debit = toMinor(item.debit, currency);
      const credit = toMinor(item.credit, currency);
      return { debit: total.debit + (debit ?? 0), credit: total.credit + (credit ?? 0), invalid: total.invalid || debit === null || credit === null };
    }, { debit: 0, credit: 0, invalid: false });
  }, [lines, currency]);
  const trialTotals = useMemo(() => trialRows.reduce((sum, item) => ({ debit: sum.debit + item.debitMinor, credit: sum.credit + item.creditMinor }), { debit: 0, credit: 0 }), [trialRows]);

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['general-ledger-accounts', workspace.id] }),
      client.invalidateQueries({ queryKey: ['general-ledger-periods', workspace.id] }),
      client.invalidateQueries({ queryKey: ['general-ledger-journals', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['general-ledger-trial-balance', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['general-ledger-profit-and-loss', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['general-ledger-balance-sheet', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['general-ledger-source-reconciliation', workspace.id, branch.id] }),
      client.invalidateQueries({ queryKey: ['module-register', workspace.id, branch.id, 'accounting'] }),
    ]);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines(current => current.map(item => item.key === key ? { ...item, ...patch } : item));
  }

  async function createJournal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memo.trim()) { toast.error('Enter a journal description.'); return; }
    if (totals.invalid) { toast.error('Enter valid non-negative amounts.'); return; }
    const mapped = lines.map((item, index) => {
      const debitMinor = toMinor(item.debit, currency);
      const creditMinor = toMinor(item.credit, currency);
      return { accountId: item.accountId, debitMinor: debitMinor ?? 0, creditMinor: creditMinor ?? 0, description: item.description.trim() || `Line ${index + 1}` };
    }).filter(item => item.debitMinor > 0 || item.creditMinor > 0);
    if (mapped.length < 2 || mapped.some(item => !item.accountId || (item.debitMinor > 0) === (item.creditMinor > 0))) { toast.error('Each journal line needs an account and either a debit or a credit.'); return; }
    if (totals.debit <= 0 || totals.debit !== totals.credit) { toast.error('Debits and credits must balance to the same positive amount.'); return; }
    setSaving(true);
    try {
      const input: LedgerJournalInput = { entryDate, memo: memo.trim(), lines: mapped };
      const created = await apiGeneralLedger.createJournal(scope, input);
      toast.success('Draft journal created', { description: created.journalNumber });
      setComposeOpen(false); setMemo(''); setEntryDate(localDate()); setLines([line('l1'), line('l2')]); await refresh();
    } catch (error) { toast.error('Journal was not saved', { description: error instanceof Error ? error.message : 'Check the journal and try again.' }); }
    finally { setSaving(false); }
  }

  async function runAction(action: () => Promise<unknown>, success: string) {
    setSaving(true);
    try { await action(); toast.success(success); await refresh(); }
    catch (error) { toast.error('Accounting action failed', { description: error instanceof Error ? error.message : 'Check permissions, period status and journal data.' }); }
    finally { setSaving(false); }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiGeneralLedger.createAccount(scope, { accountCode: accountCode.trim(), accountName: accountName.trim(), accountType, normalBalance });
      toast.success('Account created'); setAccountOpen(false); setAccountCode(''); setAccountName(''); await refresh();
    } catch (error) { toast.error('Account not created', { description: error instanceof Error ? error.message : 'Check the account code and try again.' }); }
    finally { setSaving(false); }
  }

  const loading = accountsQuery.isLoading || journalsQuery.isLoading || periodsQuery.isLoading || trialQuery.isLoading || profitQuery.isLoading || balanceSheetQuery.isLoading || reconciliationQuery.isLoading;
  const error = accountsQuery.error ?? journalsQuery.error ?? periodsQuery.error ?? trialQuery.error ?? profitQuery.error ?? balanceSheetQuery.error ?? reconciliationQuery.error;
  const activePeriod = periods.find(period => period.status === 'open' && period.startsOn.slice(0, 10) <= localDate() && period.endsOn.slice(0, 10) >= localDate());

  return (
    <section className="gl-workspace">
      <header className="gl-header">
        <div><span className="eyebrow eyebrow-blue">FINANCE & CONTROL</span><h3>General Ledger</h3><p>Authoritative journal entries, account balances and accounting-period controls for {branch.name}.</p></div>
        <div className="gl-header-actions"><button type="button" className="gl-button gl-button-secondary" onClick={() => void refresh()} disabled={saving}><RefreshCw size={15} /> Refresh</button><button type="button" className="gl-button gl-button-primary" onClick={() => setComposeOpen(true)}><Plus size={16} /> New journal</button></div>
      </header>

      {error && <div className="gl-alert gl-alert-error"><CircleAlert size={17} /><span>{error instanceof Error ? error.message : 'The ledger could not be loaded.'}</span></div>}
      {loading && <div className="gl-loading">Loading chart of accounts and ledger activity…</div>}

      <div className="gl-summary-grid">
        <article className="gl-summary-card"><span>Chart of accounts</span><strong>{accounts.length}</strong><small>Active and inactive ledger accounts</small></article>
        <article className="gl-summary-card"><span>Posted journals</span><strong>{journals.filter(j => j.status === 'posted').length}</strong><small>In the selected branch</small></article>
        <article className="gl-summary-card"><span>Draft journals</span><strong>{journals.filter(j => j.status === 'draft').length}</strong><small>Awaiting authorised posting</small></article>
        <article className="gl-summary-card"><span>Current period</span><strong>{activePeriod?.periodKey ?? 'Unavailable'}</strong><small>{activePeriod ? 'Open for posting' : 'No open period covering today'}</small></article>
      </div>

      <section className="gl-section-card">
        <div className="gl-section-heading"><div><h4><BookOpenCheck size={17} /> Trial balance</h4><p>Posted entries only · through the selected branch's current ledger history.</p></div><span className={trialTotals.debit === trialTotals.credit ? 'gl-balanced' : 'gl-unbalanced'}>{trialTotals.debit === trialTotals.credit ? <Check size={14} /> : <CircleAlert size={14} />}{trialTotals.debit === trialTotals.credit ? 'Balanced' : 'Out of balance'}</span></div>
        <div className="gl-table-wrap"><table className="gl-table"><thead><tr><th>Account</th><th>Type</th><th className="is-number">Debits</th><th className="is-number">Credits</th><th className="is-number">Net debit</th></tr></thead><tbody>
          {trialRows.length === 0 && <tr><td colSpan={5} className="gl-empty">No posted ledger activity yet. Complete a sale or create a journal to begin building the trial balance.</td></tr>}
          {trialRows.map(row => <tr key={row.id}><td><strong>{row.accountCode}</strong><span>{row.accountName}</span></td><td>{statusLabel(row.accountType)}</td><td className="is-number">{money(row.debitMinor, currency)}</td><td className="is-number">{money(row.creditMinor, currency)}</td><td className="is-number">{money(row.netDebitMinor, currency)}</td></tr>)}
        </tbody>{trialRows.length > 0 && <tfoot><tr><th colSpan={2}>Total</th><th className="is-number">{money(trialTotals.debit, currency)}</th><th className="is-number">{money(trialTotals.credit, currency)}</th><th className="is-number">{money(trialTotals.debit - trialTotals.credit, currency)}</th></tr></tfoot>}</table></div>
      </section>

      <div className="gl-lower-grid">
        <section className="gl-section-card"><div className="gl-section-heading"><div><h4>Profit & loss</h4><p>Current calendar year · {profitReport?.from ?? reportFrom} to {profitReport?.to ?? localDate()}.</p></div></div>
          {profitReport ? <><div className="gl-summary-grid gl-report-summary"><article className="gl-summary-card"><span>Revenue</span><strong>{money(profitReport.revenueMinor, currency)}</strong></article><article className="gl-summary-card"><span>Expenses</span><strong>{money(profitReport.expensesMinor, currency)}</strong></article><article className="gl-summary-card"><span>Net profit / (loss)</span><strong>{money(profitReport.netProfitMinor, currency)}</strong></article></div><div className="gl-report-accounts">{profitReport.accounts.map(account => <div key={account.id}><span>{account.accountCode} · {account.accountName}</span><strong>{money(account.amountMinor, currency)}</strong></div>)}</div></> : <div className="gl-empty">Profit and loss is not available.</div>}
        </section>
        <section className="gl-section-card"><div className="gl-section-heading"><div><h4>Balance sheet</h4><p>Branch balances as at {balanceSheetReport?.asOf ?? localDate()}.</p></div></div>
          {balanceSheetReport ? <><div className="gl-report-summary"><article className="gl-summary-card"><span>Assets</span><strong>{money(balanceSheetReport.totalAssetsMinor, currency)}</strong></article><article className="gl-summary-card"><span>Liabilities</span><strong>{money(balanceSheetReport.totalLiabilitiesMinor, currency)}</strong></article><article className="gl-summary-card"><span>Equity</span><strong>{money(balanceSheetReport.totalEquityMinor, currency)}</strong></article></div><div className="gl-report-check"><span>Liabilities + equity</span><strong>{money(balanceSheetReport.liabilitiesAndEquityMinor, currency)}</strong><small>{balanceSheetReport.totalAssetsMinor === balanceSheetReport.liabilitiesAndEquityMinor ? 'Balances' : 'Difference requires review'}</small></div><div className="gl-report-accounts">{balanceSheetReport.accounts.map(account => <div key={account.id}><span>{account.accountCode} · {account.accountName}</span><strong>{money(account.balanceMinor, currency)}</strong></div>)}</div></> : <div className="gl-empty">Balance sheet is not available.</div>}
        </section>
      </div>

      <section className="gl-section-card gl-source-reconciliation">
        <div className="gl-section-heading"><div><h4>Source-to-ledger reconciliation</h4><p>Automated sales, inventory, receiving and AP/AR events matched to posted balanced journals.</p></div><span className={reconciliation?.healthy ? 'gl-balanced' : 'gl-unbalanced'}>{reconciliation?.healthy ? <Check size={14} /> : <CircleAlert size={14} />}{reconciliation?.healthy ? 'Reconciled' : 'Review required'}</span></div>
        {reconciliation ? <><div className="gl-summary-grid gl-report-summary"><article className="gl-summary-card"><span>Expected source events</span><strong>{reconciliation.expectedCount}</strong></article><article className="gl-summary-card"><span>Posted journals</span><strong>{reconciliation.postedCount}</strong></article><article className="gl-summary-card"><span>Missing journals</span><strong>{reconciliation.missingCount}</strong></article><article className="gl-summary-card"><span>Journal exceptions</span><strong>{reconciliation.unpostedCount + reconciliation.unbalancedCount + reconciliation.amountMismatchCount + reconciliation.orphanJournalCount}</strong></article></div><div className="gl-table-wrap"><table className="gl-table"><thead><tr><th>Source workflow</th><th className="is-number">Expected</th><th className="is-number">Posted</th><th className="is-number">Missing</th><th className="is-number">Unposted</th><th className="is-number">Unbalanced</th><th className="is-number">Value mismatch</th></tr></thead><tbody>{reconciliation.workflows.map(row => <tr key={row.sourceType}><td><strong>{row.sourceType.replace(/_/g, ' ')}</strong>{(row.missingCount || row.unpostedCount || row.unbalancedCount || row.amountMismatchCount) > 0 && <small className="gl-reconciliation-issues">Review source IDs: {[...row.missingIds, ...row.unpostedIds, ...row.unbalancedIds, ...row.amountMismatchIds].slice(0, 5).join(', ')}</small>}</td><td className="is-number">{row.expectedCount}</td><td className="is-number">{row.postedCount}</td><td className="is-number">{row.missingCount}</td><td className="is-number">{row.unpostedCount}</td><td className="is-number">{row.unbalancedCount}</td><td className="is-number">{row.amountMismatchCount}</td></tr>)}</tbody></table></div>{reconciliation.orphanJournalCount > 0 && <p className="gl-reconciliation-issues">Orphan source journals: {reconciliation.orphanJournalIds.join(', ')}</p>}<p className="gl-reconciliation-note">{reconciliation.note}</p></> : <div className="gl-empty">Source reconciliation is not available.</div>}
      </section>

      <div className="gl-lower-grid">
        <section className="gl-section-card"><div className="gl-section-heading"><div><h4>Journal register</h4><p>Draft, posted and reversed accounting entries.</p></div><span className="gl-count">{journals.length} entries</span></div>
          <div className="gl-journal-list">{journals.length === 0 && <div className="gl-empty">No journal entries have been recorded for this branch.</div>}
            {journals.map(journal => <article className="gl-journal-row" key={journal.id}><div className="gl-journal-main"><strong>{journal.journalNumber}</strong><span>{journal.memo}</span><small>{journal.entryDate} · {money(journal.debitMinor, currency)}</small></div><span className={`gl-status gl-status-${journal.status}`}>{statusLabel(journal.status)}</span><div className="gl-row-actions">{journal.status === 'draft' && <button type="button" disabled={saving} onClick={() => void runAction(() => apiGeneralLedger.postJournal(scope, journal.id), 'Journal posted')}>Post</button>}{journal.status === 'posted' && <button type="button" disabled={saving} onClick={() => { const reason = window.prompt('Reason for reversing this journal:'); if (reason?.trim()) void runAction(() => apiGeneralLedger.reverseJournal(scope, journal.id, reason.trim()), 'Reversal journal posted'); }}><RotateCcw size={13} /> Reverse</button>}</div></article>)}
          </div>
        </section>

        <section className="gl-section-card"><div className="gl-section-heading"><div><h4><CalendarClock size={17} /> Accounting periods</h4><p>Posting is blocked outside open periods.</p></div><span className="gl-count">{periods.length} periods</span></div>
          <div className="gl-period-list">{periods.slice(0, 12).map(period => <article className="gl-period-row" key={period.id}><div><strong>{period.periodKey}</strong><small>{period.startsOn.slice(0, 10)} – {period.endsOn.slice(0, 10)}</small></div><span className={`gl-status gl-status-${period.status}`}>{statusLabel(period.status)}</span>{period.status === 'open' && <button type="button" disabled={saving} onClick={() => { if (window.confirm(`Close accounting period ${period.periodKey}? No further entries can be posted to it.`)) void runAction(() => apiGeneralLedger.closePeriod(scope, period.id), 'Accounting period closed'); }}>Close</button>}</article>)}</div>
        </section>
      </div>

      <section className="gl-section-card"><div className="gl-section-heading"><div><h4>Chart of accounts</h4><p>Workspace-wide account definitions; balances remain branch-specific.</p></div><button type="button" className="gl-button gl-button-secondary" onClick={() => setAccountOpen(value => !value)}><Plus size={14} /> Add account</button></div>
        {accountOpen && <form className="gl-account-form" onSubmit={createAccount}><label>Account code<input value={accountCode} onChange={event => setAccountCode(event.target.value)} maxLength={24} required /></label><label>Account name<input value={accountName} onChange={event => setAccountName(event.target.value)} maxLength={120} required /></label><label>Type<select value={accountType} onChange={event => setAccountType(event.target.value)}><option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="revenue">Revenue</option><option value="expense">Expense</option></select></label><label>Normal balance<select value={normalBalance} onChange={event => setNormalBalance(event.target.value as 'debit' | 'credit')}><option value="debit">Debit</option><option value="credit">Credit</option></select></label><div className="gl-form-actions"><button className="gl-button gl-button-primary" disabled={saving} type="submit">Save account</button><button className="gl-button gl-button-secondary" type="button" onClick={() => setAccountOpen(false)}><X size={14} /> Cancel</button></div></form>}
        <div className="gl-account-grid">{accounts.map(account => <article key={account.id}><div><strong>{account.accountCode}</strong><span>{account.accountName}</span></div><small>{statusLabel(account.accountType)} · {account.normalBalance} normal</small>{account.systemKey && <em>System</em>}</article>)}</div>
      </section>

      <div className="gl-footnote"><ShieldCheck size={15} /><span>Posted journals are immutable. Corrections are made through a separately authorised reversal; journal posting and source transactions use the same database transaction.</span></div>

      {composeOpen && <div className="gl-modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setComposeOpen(false); }}><section className="gl-modal" role="dialog" aria-modal="true" aria-labelledby="gl-compose-title"><div className="gl-modal-heading"><div><h4 id="gl-compose-title">Create journal entry</h4><p>Enter a balanced draft. Posting is a separate permission-controlled action.</p></div><button type="button" aria-label="Close" onClick={() => setComposeOpen(false)}><X size={18} /></button></div><form onSubmit={createJournal}><label className="gl-field">Entry date<input type="date" value={entryDate} onChange={event => setEntryDate(event.target.value)} required /></label><label className="gl-field">Description<input value={memo} onChange={event => setMemo(event.target.value)} maxLength={500} placeholder="e.g. Month-end accrual" required /></label>
          <div className="gl-line-heading"><strong>Journal lines</strong><button type="button" onClick={() => setLines(current => [...current, line(`l${Date.now()}`)])}><Plus size={14} /> Add line</button></div>
          <div className="gl-line-editor">{lines.map((item, index) => <div className="gl-line-row" key={item.key}><span className="gl-line-number">{index + 1}</span><select aria-label={`Account for line ${index + 1}`} value={item.accountId} onChange={event => updateLine(item.key, { accountId: event.target.value })} required><option value="">Select account</option>{accounts.filter(account => account.isActive).map((account: LedgerAccount) => <option key={account.id} value={account.id}>{account.accountCode} · {account.accountName}</option>)}</select><input aria-label={`Debit for line ${index + 1}`} inputMode="decimal" placeholder="Debit" value={item.debit} onChange={event => updateLine(item.key, { debit: event.target.value, credit: event.target.value ? '' : item.credit })} /><input aria-label={`Credit for line ${index + 1}`} inputMode="decimal" placeholder="Credit" value={item.credit} onChange={event => updateLine(item.key, { credit: event.target.value, debit: event.target.value ? '' : item.debit })} /><input aria-label={`Description for line ${index + 1}`} placeholder="Line note" value={item.description} onChange={event => updateLine(item.key, { description: event.target.value })} />{lines.length > 2 && <button type="button" aria-label={`Remove line ${index + 1}`} onClick={() => setLines(current => current.filter(entry => entry.key !== item.key))}><X size={14} /></button>}</div>)}</div>
          <div className={`gl-balance-check ${!totals.invalid && totals.debit > 0 && totals.debit === totals.credit ? 'is-balanced' : ''}`}><span>Debits <strong>{money(totals.debit, currency)}</strong></span><span>Credits <strong>{money(totals.credit, currency)}</strong></span><b>{!totals.invalid && totals.debit > 0 && totals.debit === totals.credit ? 'Balanced' : 'Not balanced'}</b></div>
          <div className="gl-form-actions"><button type="submit" className="gl-button gl-button-primary" disabled={saving || totals.invalid || totals.debit <= 0 || totals.debit !== totals.credit}>{saving ? 'Saving…' : 'Save draft'}</button><button type="button" className="gl-button gl-button-secondary" onClick={() => setComposeOpen(false)}>Cancel</button></div>
        </form></section></div>}
    </section>
  );
}
