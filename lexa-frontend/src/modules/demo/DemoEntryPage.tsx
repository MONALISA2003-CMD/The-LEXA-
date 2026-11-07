import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import TurnstileWidget, { publicTurnstileSiteKey } from '../auth/TurnstileWidget';
import { apiDemo, isDemoDeployment } from '../../data/remote/apiDemo';
import { ApiRequestError } from '../../data/remote/apiClient';
import './demo.css';

const PUBLIC_SITE = 'https://lexaaamaal.com';
const DEMO_ADDRESS = 'https://demo.lexaaamaal.com/demo';
const DEMO_TASKS = [
  { step: '01', title: 'Ring up a sale', detail: 'Open Checkout. Choose products and record a fictional cash receipt.' },
  { step: '02', title: 'Look at the stock', detail: 'Check the product quantities and the sale movement.' },
  { step: '03', title: 'Follow an order', detail: 'Open Purchasing to look at suppliers and purchase orders.' },
  { step: '04', title: 'Read the reports', detail: 'Review the sales history and business figures.' },
] as const;

export default function DemoEntryPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string|null>(null);
  const [revision, setRevision] = useState(0);
  const [checking, setChecking] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isDemoDeployment) { setChecking(false); return; }
    let active = true;
    void apiDemo.status().then(() => { if (active) navigate('/', {replace: true}); })
      .catch(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [navigate]);

  const start = async (event: FormEvent) => {
    event.preventDefault();
    if (opening) return;
    setOpening(true);
    setError('');
    try {
      await apiDemo.start(token ?? undefined);
      // A fresh document ensures no previous business state survives in memory.
      window.location.replace('/');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : 'The sample business could not open. Please try again.');
      setToken(null);
      setRevision(value => value + 1);
      setOpening(false);
    }
  };

  return <main className="lexa-demo-entry">
    <div className="lexa-demo-topbar">
      <a href={PUBLIC_SITE} aria-label="LEXA website"><img src="/lexa-master-lockup-light.png" alt="LEXA"/></a>
      <a href={PUBLIC_SITE + '/features'}>See the business areas <span aria-hidden="true">↗</span></a>
    </div>
    <div className="lexa-demo-layout">
      <section className="lexa-demo-copy" aria-labelledby="demo-heading">
        <p className="lexa-demo-kicker">LEXA DEMO TRADERS · SAMPLE BUSINESS</p>
        <h1 id="demo-heading">Make a sale. Check the stock. See what changed.</h1>
        <p className="lexa-demo-lead">There are already 48 products, 42 sample receipts and business records to explore. Use the same business areas available to a business owner.</p>
        <div className="lexa-demo-facts"><div><b>48</b><span>Products</span></div><div><b>42</b><span>Receipts</span></div><div><b>2 hrs</b><span>Maximum visit</span></div></div>
        <p className="lexa-demo-disclaimer">Every record is fictional. Your changes belong only to this visit. No real payment, email or bank transfer is made.</p>
      </section>
      <section className="lexa-demo-entry-card" aria-label="Open sample business">
        <div className="lexa-demo-step-label">FOUR THINGS TO TRY</div>
        <ol className="lexa-demo-task-list">{DEMO_TASKS.map(task => <li key={task.step}>
          <span className="lexa-demo-number">{task.step}</span><div><strong>{task.title}</strong><p>{task.detail}</p></div>
        </li>)}</ol>
        {!isDemoDeployment ? <a className="lexa-demo-primary" href={DEMO_ADDRESS}>Go to the demo <span aria-hidden="true">↗</span></a> : checking ?
          <p role="status" className="lexa-demo-checking">Checking whether you have a sample business open…</p> :
          <form onSubmit={event => void start(event)}>
            <TurnstileWidget key={revision} action="demo" onToken={setToken}/>
            {error && <p className="lexa-demo-error" role="alert">{error}</p>}
            <button className="lexa-demo-primary" type="submit" disabled={opening || (!token && Boolean(publicTurnstileSiteKey))}>
              {opening ? 'Opening your sample business…' : 'Open LEXA Demo Traders'} <span aria-hidden="true">↗</span>
            </button>
          </form>}
        <p className="lexa-demo-small">No registration or payment. The visit ends after 30 minutes without activity, or after two hours.</p>
      </section>
    </div>
    <div className="lexa-demo-bottom"><a href={PUBLIC_SITE}>LEXA website</a><span>Sample records only · Kampala · UGX</span><a href="https://app.lexaaamaal.com/sign-in">Already have an account? Sign in</a></div>
  </main>;
}
