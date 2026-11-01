import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BrainCircuit, CheckCircle2, LoaderCircle, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'react-router';
import { useWorkspace } from '../../app/WorkspaceContext';
import { apiIntelligence, type IntelligenceScope } from '../../data/remote/apiIntelligence';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { moduleAccentForPath } from '../../domain/shared/moduleAccents';

const scopes: Array<{ value: IntelligenceScope; label: string }> = [
  { value: 'overview', label: 'Whole business' },
  { value: 'sales', label: 'Sales and customer receipts' },
  { value: 'inventory', label: 'Stock and inventory' },
  { value: 'finance', label: 'Finance and accounts' },
  { value: 'customers', label: 'Customers and relationships' },
  { value: 'people', label: 'People and payroll' },
];

export default function IntelligencePage() {
  const { workspace, branch } = useWorkspace();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const requestedScope = params.get('scope') as IntelligenceScope | null;
  const allowedScopes: IntelligenceScope[] = ['overview', 'sales', 'inventory', 'finance', 'customers', 'people'];
  const initialScope = requestedScope && allowedScopes.includes(requestedScope) ? requestedScope : 'overview';
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState(params.get('question')?.slice(0, 2000) || 'Summarise the most important business trends and what needs my attention.');
  const [scope, setScope] = useState<IntelligenceScope>(initialScope);
  const [answer, setAnswer] = useState('');
  const statusQuery = useQuery({
    queryKey: ['intelligence-status', workspace.id, branch.id],
    queryFn: () => apiIntelligence.status(workspace.id, branch.id),
    enabled: isApiProvider,
    retry: false,
    staleTime: 30_000,
  });
  const status = statusQuery.data;
  const canAsk = isApiProvider && status?.canRunBusiness === true;
  const explainMutation = useMutation({
    mutationFn: () => apiIntelligence.explain(workspace.id, branch.id, question.trim(), scope),
    onSuccess: (result) => {
      setAnswer(result.answer);
      void queryClient.invalidateQueries({ queryKey: ['intelligence-status', workspace.id, branch.id] });
    },
    onError: () => toast.error('LEXA could not prepare an answer. Please try again shortly.'),
  });

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAsk || !question.trim()) return;
    setAnswer('');
    explainMutation.mutate();
  }

  return <main className="page-stack" data-module-accent={moduleAccentForPath('/intelligence')}>
    <header className="page-heading-row">
      <div><div className="eyebrow eyebrow-blue">YOUR BUSINESS ASSISTANT</div><h2>Ask LEXA</h2><p>Get clear explanations and practical recommendations based on authorised business information.</p></div>
      <button className="button button-secondary button-small" type="button" onClick={() => void statusQuery.refetch()} disabled={statusQuery.isFetching}><RefreshCw size={14}/> Refresh</button>
    </header>
    {!isApiProvider && <section className="overview-service-note"><AlertCircle size={18}/><div><strong>Sign in to your LEXA business account</strong><span>The assistant is available through your secure business account.</span></div></section>}
    {statusQuery.isError && <section className="inline-error"><strong>The assistant is temporarily unavailable.</strong><span>Your business records and other LEXA services remain available.</span><button className="button button-secondary button-small" type="button" onClick={() => void statusQuery.refetch()}>Try again</button></section>}
    <section className="section-card">
      <div className="section-card-heading"><span className="heading-icon blue-icon"><BrainCircuit size={19}/></span><div><h3>Business advice and explanations</h3><p>Ask about performance, cash flow, stock, sales or business priorities.</p></div><span className={`status-pill ${canAsk ? 'status-good' : 'status-neutral'}`}>{canAsk ? 'Available' : status?.enabled && !status.canRun ? 'Limited access' : 'Temporarily unavailable'}</span></div>
      {!canAsk && isApiProvider && !statusQuery.isError && <div className="overview-service-note"><ShieldCheck size={18}/><div><strong>{status?.enabled && !status.canRun ? 'Your account has view-only access' : 'LEXA is preparing the assistant'}</strong><span>{status?.enabled && !status.canRun ? 'Contact your business administrator to request access to business explanations.' : 'The assistant is not available at the moment. Please try again later.'}</span></div></div>}
      <form className="page-stack" onSubmit={ask}>
        <label className="field-label">Business area<select value={scope} onChange={(event) => setScope(event.target.value)} disabled={!canAsk}>{scopes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label className="field-label">What would you like LEXA to help you understand?<textarea rows={4} maxLength={2000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="For example: Which areas need management attention this month?" disabled={!canAsk}/></label>
        <div><button className="button button-primary" type="submit" disabled={!canAsk || explainMutation.isPending || !question.trim()}>{explainMutation.isPending ? <><LoaderCircle size={16} className="spin-icon"/> Preparing your answer…</> : <><Sparkles size={16}/> Ask LEXA</>}</button></div>
      </form>
      {answer && <section className="section-card" aria-live="polite"><div className="section-card-heading"><div><h3>LEXA's response</h3><p>Prepared for {branch.name}.</p></div><CheckCircle2 size={18}/></div><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{answer}</div></section>}
    </section>
    <div className="overview-integrity-note"><ShieldCheck size={16}/><p>LEXA uses business summaries your account is authorised to view. The assistant does not approve payments, change records or replace professional financial and tax advice.</p></div>
  </main>;
}
