import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { apiDemo } from '../../data/remote/apiDemo';
import { isBrowserDemoBuild } from '../../data/remote/runtimeConfig';
import { BROWSER_DEMO_EXPIRY_KEY, resetBrowserDemo } from './browserDemoSeed';
import './demo.css';

const SITE_URL = 'https://lexaaamaal.com/';
const SIGNUP_URL = 'https://lexaaamaal.com/create-account';

export default function DemoBanner() {
  const location = useLocation();
  const [showGuide, setShowGuide] = useState(() => { try { return window.sessionStorage.getItem('lexa.demo.guide.hidden') !== 'yes'; } catch { return true; } });
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    if (isBrowserDemoBuild) {
      const expiry = Number(window.localStorage.getItem(BROWSER_DEMO_EXPIRY_KEY));
      if (active && expiry) setDeadline(expiry);
    } else void apiDemo.status().then(data => { if (active) setDeadline(new Date(data.expiresAt).getTime()); }).catch(() => {});
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline-now)/60_000));
  useEffect(() => { if (isBrowserDemoBuild && deadline && now >= deadline) { void resetBrowserDemo().then(() => window.location.replace('/demo/demo')); } }, [deadline, now]);
  const reset = async () => {
    if (!window.confirm('Start a new sample business? Your changes in this demo will be lost.')) return;
    setBusy(true); setMessage('');
    try {
      if (isBrowserDemoBuild) await resetBrowserDemo();
      else await apiDemo.reset();
      try { window.sessionStorage.removeItem('lexa.demo.guide.hidden'); } catch { /* Optional browser setting. */ }
      window.location.replace(isBrowserDemoBuild ? '/demo/demo' : '/');
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The sample business could not be reset.'); setBusy(false); }
  };
  const exit = async () => {
    setBusy(true);
    if (!isBrowserDemoBuild) { try { await apiDemo.end(); } catch { /* Session may have expired. */ } }
    window.location.replace(SITE_URL);
  };
  return <div className="lexa-demo-chrome"><aside className="lexa-demo-banner" aria-label="Sample business controls">
    <div className="lexa-demo-banner-label"><span className="lexa-demo-live-marker">SAMPLE</span><strong>LEXA Demo Traders</strong><span>Fictional records only</span>{remaining !== null && <small>{remaining} min left</small>}</div>
    <div className="lexa-demo-banner-actions">
      <button type="button" disabled={busy} onClick={() => void reset()}>Start again</button>
      <a href={SIGNUP_URL}>Open a real account <span aria-hidden="true">↗</span></a>
      <button type="button" disabled={busy} onClick={() => void exit()}>Leave demo</button>
    </div>
    {message && <p role="alert" className="lexa-demo-banner-error">{message}</p>}
  </aside>
    {location.pathname === '/' && showGuide && <section className="lexa-demo-guide" aria-label="Things to try in this sample business">
      <div><span>YOUR FIRST FIVE MINUTES</span><strong>Record a sale, then check what moved.</strong></div>
      <nav aria-label="Sample business starting points"><Link to="/checkout">1. Checkout</Link><Link to="/products">2. Products</Link><Link to="/inventory">3. Stock</Link><Link to="/modules/purchases">4. Supplier orders</Link><Link to="/reports">5. Reports</Link></nav>
      <button type="button" onClick={() => { setShowGuide(false); try { window.sessionStorage.setItem('lexa.demo.guide.hidden','yes'); } catch { /* Optional preference. */ } }}>Hide guide</button>
    </section>}
  </div>;
}
