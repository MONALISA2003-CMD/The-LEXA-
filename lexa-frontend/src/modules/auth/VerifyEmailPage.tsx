import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, CheckCircle2, LoaderCircle, MailCheck, ShieldCheck } from 'lucide-react';
import { apiAuth } from '../../data/remote/apiAuth';
import { businessErrorMessage } from '../../data/remote/businessMessages';

/** Do not consume the single-use email token on GET: email security link scanners
 * sometimes follow verification URLs before the intended recipient opens them. */
export default function VerifyEmailPage() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [status, setStatus] = useState<'ready'|'checking'|'complete'|'error'>(token ? 'ready' : 'error');
  const [error, setError] = useState(token ? '' : 'Your verification link is incomplete. Please request a new one.');
  const navigate = useNavigate();
  useEffect(() => {
    // Remove the bearer token from browser URL/history without discarding it from component memory.
    window.history.replaceState({}, document.title, '/verify-email');
  }, []);
  async function verify() {
    if (status !== 'ready' || !token) return;
    setStatus('checking');
    try {
      await apiAuth.verifyPublicSignup(token);
      setStatus('complete');
      navigate('/workspace', { replace: true });
    } catch (cause) {
      setError(businessErrorMessage(cause));
      setStatus('error');
    }
  }
  return <main className="auth-simple-page"><section className="auth-simple-card">
    <img src="/lexa-master-lockup.png" alt="LEXA" className="auth-simple-logo" />
    <div className="auth-result-icon">{status==='checking'?<LoaderCircle className="auth-spin" size={30}/>:status==='complete'?<CheckCircle2 size={30}/>:<MailCheck size={30}/>}</div>
    <div className="auth-eyebrow">SECURE EMAIL VERIFICATION</div>
    <h1>{status==='ready'?'Your business starts here.':status==='checking'?'Creating your workspace…':status==='complete'?'Welcome to LEXA.':'This link needs attention.'}</h1>
    <p>{status==='ready'?'Confirm that this is your email address to activate your account and open your own private business.':status==='checking'?'Verifying your email and creating your business workspace.':status==='complete'?'Your account and business are ready. Opening LEXA…':error}</p>
    {status==='ready'&&<button type="button" className="auth-submit auth-return-button" onClick={()=>void verify()}>Verify my email and create account <ArrowRight size={17}/></button>}
    {status==='error'&&<Link to="/create-account" className="auth-submit auth-return-button">Create account <ArrowRight size={17}/></Link>}
    <div className="auth-simple-security"><ShieldCheck size={16}/> Verified identities. Private business data.</div>
  </section></main>;
}
