import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BrainCircuit, CheckCircle2, FileSearch, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'react-router';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiIntelligence, type IntelligenceScope } from '../../data/remote/apiIntelligence';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { moduleAccentForPath } from '../../domain/shared/moduleAccents';

const scopes: Array<{ value: IntelligenceScope; label: string }> = [
  { value: 'overview', label: 'Whole business overview' },
  { value: 'sales', label: 'Sales & customer receipts' },
  { value: 'inventory', label: 'Stock & inventory' },
  { value: 'finance', label: 'Finance, AR/AP & general ledger' },
  { value: 'customers', label: 'Customers & CRM' },
  { value: 'people', label: 'Workforce overview' },
];
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'The request could not be completed.'; }
const managedFeatures: Array<{ key: string; label: string; detail: string }> = [
  { key: 'analytics.advanced', label: 'Advanced CRM and workforce summaries', detail: 'Aggregate counts only; never employee or customer record details.' },
  { key: 'intelligence.explain', label: 'LEXA business adviser', detail: 'Read-only explanations using LEXA’s unified multi-provider router.' },
  { key: 'intelligence.document_extract', label: 'Document extraction', detail: 'Local text extraction; no automatic model submission or record writes.' },
  { key: 'saas.usage_view', label: 'Workspace usage visibility', detail: 'Show current plan meters and recent AI request metadata.' },
];

export default function IntelligencePage() {
  const { workspace, branch } = useWorkspace();
  const location = useLocation();
  const initialParams = new URLSearchParams(location.search);
  const requestedScope = initialParams.get('scope');
  const allowedInitialScopes: IntelligenceScope[] = ['overview', 'sales', 'inventory', 'finance', 'customers', 'people'];
  const initialScope: IntelligenceScope = allowedInitialScopes.includes(requestedScope as IntelligenceScope) ? requestedScope as IntelligenceScope : 'overview';
  const requestedQuestion = initialParams.get('question');
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState(requestedQuestion?.slice(0, 2_000) || 'Summarise the most important business trends and anything I should review.');
  const [scope, setScope] = useState<IntelligenceScope>(initialScope);
  const [answer, setAnswer] = useState<{ answer: string; assurance: string; requestId: string } | null>(null);
  const [extracted, setExtracted] = useState<{ filename: string; text: string; warnings: string[]; assurance: string } | null>(null);
  const [overrideReason, setOverrideReason] = useState('Workspace administrator approved a temporary feature adjustment.');
  const statusQuery = useQuery({ queryKey: ['intelligence-status', workspace.id, branch.id], queryFn: () => apiIntelligence.status(workspace.id, branch.id), enabled: isApiProvider, retry: false, staleTime: 30_000 });
  const usageQuery = useQuery({ queryKey: ['intelligence-usage', workspace.id, branch.id], queryFn: () => apiIntelligence.usage(workspace.id, branch.id), enabled: isApiProvider, retry: false, staleTime: 30_000 });
  const entitlementQuery = useQuery({ queryKey: ['saas-entitlements', workspace.id, branch.id], queryFn: () => apiIntelligence.entitlements(workspace.id, branch.id), enabled: isApiProvider, retry: false, staleTime: 60_000 });
  const plansQuery = useQuery({ queryKey: ['saas-plans', workspace.id, branch.id], queryFn: () => apiIntelligence.plans(workspace.id, branch.id), enabled: isApiProvider, retry: false, staleTime: 300_000 });
  const status = statusQuery.data;
  const canAsk = isApiProvider && status?.canRunBusiness === true;
  const anyModelAvailable = isApiProvider && status?.canRunBusiness === true;
  const canExtract = isApiProvider && status?.canExtract === true;
  const supportQuery = useQuery({ queryKey: ['saas-support-diagnostics', workspace.id, branch.id], queryFn: () => apiIntelligence.supportDiagnostics(workspace.id, branch.id), enabled: isApiProvider && status?.canViewSupportDiagnostics === true, retry: false, staleTime: 60_000 });
  const featureMutation = useMutation({
    mutationFn: (input: { featureKey: string; enabled: boolean }) => apiIntelligence.setFeatureOverride(workspace.id, branch.id, input.featureKey, input.enabled, overrideReason),
    onSuccess: async () => { toast.success('Workspace feature setting updated'); await Promise.all([queryClient.invalidateQueries({ queryKey: ['saas-entitlements', workspace.id, branch.id] }), queryClient.invalidateQueries({ queryKey: ['intelligence-status', workspace.id, branch.id] })]); },
    onError: (error) => toast.error('Feature setting was not changed', { description: errorMessage(error) }),
  });
  const explainMutation = useMutation({
    mutationFn: () => apiIntelligence.explain(workspace.id, branch.id, question.trim(), scope),
    onSuccess: (result) => { setAnswer({ answer: result.answer, assurance: result.assurance, requestId: result.requestId }); void queryClient.invalidateQueries({ queryKey: ['intelligence-usage', workspace.id, branch.id] }); },
    onError: (error) => toast.error('LEXA could not complete the explanation', { description: errorMessage(error) }),
  });
  const extractMutation = useMutation({
    mutationFn: (file: File) => apiIntelligence.extract(workspace.id, branch.id, file),
    onSuccess: (result) => { setExtracted({ filename: result.filename, text: result.text, warnings: result.warnings, assurance: result.assurance }); void queryClient.invalidateQueries({ queryKey: ['intelligence-usage', workspace.id, branch.id] }); },
    onError: (error) => toast.error('Document could not be extracted', { description: errorMessage(error) }),
  });
  const subscription = entitlementQuery.data?.subscription;
  const meter = useMemo(() => usageQuery.data?.meters.find((item) => item.meter_key === 'ai') ?? null, [usageQuery.data]);
  const planRequests = Number(subscription?.ai_requests_monthly ?? 0);
  const requestsUsed = Number(meter?.quantity ?? 0);

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAsk || !question.trim()) return;
    setAnswer(null);
    explainMutation.mutate();
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setExtracted(null);
    extractMutation.mutate(file);
    event.target.value = '';
  }

  return <main className="page-stack" data-module-accent={moduleAccentForPath('/intelligence')}>
    <header className="page-heading-row">
      <div><div className="eyebrow eyebrow-blue">LEXA AI</div><h2>Business assistant</h2><p>One professional assistant for your business, with automatic provider fallback and read-only access to authorised business summaries.</p></div>
      <button className="button button-secondary button-small" onClick={() => { void statusQuery.refetch(); void usageQuery.refetch(); void entitlementQuery.refetch(); void plansQuery.refetch(); }} disabled={statusQuery.isFetching || usageQuery.isFetching}><RefreshCw size={14}/> Refresh</button>
    </header>
    {!isApiProvider && <section className="overview-service-note"><AlertCircle size={18}/><div><strong>Connect to your LEXA workspace</strong><span>Intelligence works through the secure LEXA backend. Your local records remain available independently.</span></div></section>}
    {statusQuery.isError && <section className="inline-error"><strong>Intelligence status is unavailable.</strong><span>{errorMessage(statusQuery.error)} Core LEXA workflows are unaffected.</span><button className="button button-secondary button-small" onClick={() => void statusQuery.refetch()}>Retry</button></section>}
    <section className="section-card">
      <div className="section-card-heading"><span className="heading-icon blue-icon"><BrainCircuit size={19}/></span><div><h3>LEXA Business Assistant</h3><p>Clear, practical explanations based on authorised business totals—not guesses.</p></div><span className={`status-pill ${canAsk ? 'status-good' : 'status-neutral'}`}>{canAsk ? 'Ready' : status?.enabled && !status.canRun ? 'View only' : 'Unavailable'}</span></div>
      {!canAsk && <div className="overview-service-note"><ShieldCheck size={18}/><div><strong>{status?.enabled && !status.canRun ? 'Your role is view-only' : 'AI provider routing is not ready'}</strong><span>{status?.enabled && !status.canRun ? 'Your current workspace role allows viewing status and usage, but not running explanations.' : status?.explanation ?? 'The AI router is not configured. Sales, stock, accounting and other core LEXA modules continue to operate normally.'}</span>{status?.providersAvailable?.length ? <small>Configured providers: {status.providersAvailable.join(' · ')}. Paid provider tier: off.</small> : null}</div></div>}
      <form className="page-stack" onSubmit={ask}>
        <label className="field-label">Business area<select value={scope} onChange={(event) => setScope(event.target.value as IntelligenceScope)} disabled={!anyModelAvailable}>{scopes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <div className="overview-service-note"><ShieldCheck size={18}/><div><strong>Business data protection</strong><span>LEXA sends permission-filtered aggregate figures only. Individual customer and employee details are excluded. Provider availability, free-tier limits and data-retention terms vary. LEXA automatically tries another configured provider when one is unavailable; do not type individual personal details. AI cannot post or change ERP records.</span>{status?.providersAvailable?.length ? <small>Configured providers: {status.providersAvailable.join(' · ')}. Paid provider tier: off.</small> : null}</div></div>
        <label className="field-label">What would you like to understand?<textarea rows={3} maxLength={2000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="For example: What should I review in this month’s sales performance?" disabled={!canAsk}/></label>
        <div><button className="button button-primary" type="submit" disabled={!canAsk || explainMutation.isPending || !question.trim()}>{explainMutation.isPending ? <><LoaderCircle size={16} className="spin-icon"/> Preparing explanation…</> : <><Sparkles size={16}/> Explain for my business</>}</button></div>
      </form>
      {answer && <section className="section-card" aria-live="polite"><div className="section-card-heading"><div><h3>LEXA's explanation</h3><p>Based on authorised business aggregates for {branch.name}.</p></div><CheckCircle2 size={18}/></div><div className="page-stack"><div style={{ whiteSpace: 'pre-wrap' }}>{answer.answer}</div><small>{answer.assurance} · Reference {answer.requestId}</small></div></section>}
    </section>
    <section className="section-card">
      <div className="section-card-heading"><span className="heading-icon blue-icon"><FileSearch size={19}/></span><div><h3>Document extraction</h3><p>Planned for a later production phase; it is not part of the single-service development setup.</p></div><span className={`status-pill ${canExtract ? 'status-good' : 'status-neutral'}`}>{canExtract ? 'Available' : 'Unavailable'}</span></div>
      <div className="overview-service-note"><ShieldCheck size={18}/><div><strong>Not enabled in this development phase</strong><span>Business AI responses are available separately. Document extraction will be added after the single-service AI router is validated.</span></div></div>
      <label className="button button-secondary" style={{ display: 'inline-flex', width: 'fit-content', cursor: canExtract ? 'pointer' : 'not-allowed', opacity: canExtract ? 1 : 0.55 }}><UploadCloud size={16}/> {extractMutation.isPending ? 'Extracting document…' : 'Choose a document'}<input type="file" hidden disabled={!canExtract || extractMutation.isPending} accept=".pdf,.docx,.xlsx,.pptx,.csv,.txt,.md,.json,.xml,.html" onChange={(event) => void chooseFile(event)}/></label>
      <small>Document processing is intentionally disabled until its production implementation is ready.</small>
      {extracted && <div className="page-stack" aria-live="polite"><div><strong>{extracted.filename}</strong><span> · {extracted.text.length.toLocaleString()} characters</span></div>{extracted.warnings.map((warning) => <div className="overview-service-note" key={warning}><AlertCircle size={16}/><span>{warning}</span></div>)}<textarea rows={12} readOnly value={extracted.text}/><div className="overview-integrity-note"><ShieldCheck size={16}/><p>{extracted.assurance}</p></div></div>}
    </section>
    <section className="section-card">
      <div className="section-card-heading"><div><h3>Plan & usage</h3><p>Workspace limits, subscription cycle and recorded AI usage</p></div></div>
      {entitlementQuery.isLoading || usageQuery.isLoading ? <div className="loading-state">Loading usage…</div> : entitlementQuery.isError || usageQuery.isError ? <div className="empty-state">Usage information is temporarily unavailable.</div> : <div className="overview-workflow-grid"><div><small>Current plan</small><strong>{String(subscription?.display_name ?? subscription?.plan_key ?? '—')}</strong></div><div><small>AI requests this billing period</small><strong>{requestsUsed.toLocaleString()} / {planRequests.toLocaleString()}</strong></div><div><small>Plan status</small><strong>{String(subscription?.status ?? '—')}</strong></div></div>}
      <small>{usageQuery.data?.periodStart ? `Billing period: ${usageQuery.data.periodStart} to ${usageQuery.data.periodEnd ?? '—'}. ` : ''}Usage is reserved in LEXA's database before a provider request. Failed requests are metered to prevent repeated retries from bypassing limits.</small>
      {plansQuery.data?.plans?.length ? <details className="section-card"><summary>Compare workspace plan limits</summary><div className="overview-workflow-grid">{plansQuery.data.plans.map((plan) => <div key={plan.plan_key}><strong>{plan.display_name}</strong><small>{plan.max_users.toLocaleString()} users · {plan.max_branches.toLocaleString()} branches</small><small>{plan.ai_requests_monthly.toLocaleString()} AI requests per billing period</small><small>AI budget ceiling: ${(plan.ai_budget_micros_monthly / 1_000_000).toFixed(2)}</small></div>)}</div><small>{plansQuery.data.billing}</small></details> : null}
    </section>
    {usageQuery.data?.recentAiActivity?.length ? <section className="section-card">
      <div className="section-card-heading"><div><h3>Recent Intelligence activity</h3><p>Audit metadata only. Questions, documents and model responses are not retained in LEXA.</p></div><ShieldCheck size={18}/></div>
      <div className="overview-workflow-grid">{usageQuery.data.recentAiActivity.slice(0, 8).map((item, index) => <div key={`${item.created_at}-${index}`}>
        <strong>{item.purpose === 'document_extraction' ? 'Document extraction' : item.data_class === 'public' ? 'Product guidance' : 'Business explanation'}</strong>
        <small>{item.provider_model || item.provider || item.model_alias || 'Local extraction'} · {item.status}</small>
        <small>{new Date(item.created_at).toLocaleString()} · {Number(item.input_tokens || 0) + Number(item.output_tokens || 0)} tokens</small>
      </div>)}</div>
    </section> : null}
    {status?.canManageFeatures && <section className="section-card">
      <div className="section-card-heading"><div><h3>Workspace feature controls</h3><p>Enterprise administrator controls. Every change is reasoned and audit logged.</p></div><ShieldCheck size={18}/></div>
      <label className="field-label">Reason for the next change<input maxLength={500} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Explain why this workspace feature is being adjusted"/></label>
      <div className="page-stack">{managedFeatures.map((feature) => {
        const enabled = entitlementQuery.data?.features?.[feature.key] === true;
        return <div className="overview-service-note" key={feature.key}><div><strong>{feature.label}</strong><span>{feature.detail}</span><small>Current state: {enabled ? 'Enabled' : 'Disabled'}</small></div><button className="button button-secondary button-small" disabled={featureMutation.isPending || overrideReason.trim().length < 8} onClick={() => featureMutation.mutate({ featureKey: feature.key, enabled: !enabled })}>{enabled ? 'Disable' : 'Enable'}</button></div>;
      })}</div>
    </section>}
    {status?.canViewSupportDiagnostics && <section className="section-card">
      <div className="section-card-heading"><div><h3>Workspace support diagnostics</h3><p>Restricted tenant metadata; access is recorded in the support audit trail.</p></div><button className="button button-secondary button-small" onClick={() => void supportQuery.refetch()} disabled={supportQuery.isFetching}><RefreshCw size={14}/> Refresh diagnostics</button></div>
      {supportQuery.isError ? <div className="empty-state">Support diagnostics are not available for this account.</div> : supportQuery.data ? <><div className="overview-workflow-grid"><div><small>Active workspace members</small><strong>{Number(supportQuery.data.diagnostics.active_members || 0).toLocaleString()}</strong></div><div><small>Branches</small><strong>{Number(supportQuery.data.diagnostics.branches || 0).toLocaleString()}</strong></div><div><small>AI requests (30 days)</small><strong>{Number(supportQuery.data.diagnostics.ai_requests_30d || 0).toLocaleString()}</strong></div><div><small>AI failures (30 days)</small><strong>{Number(supportQuery.data.diagnostics.ai_failures_30d || 0).toLocaleString()}</strong></div></div><small>{supportQuery.data.access}</small></> : <div className="loading-state">Loading restricted diagnostics…</div>}
    </section>}
  </main>;
}
