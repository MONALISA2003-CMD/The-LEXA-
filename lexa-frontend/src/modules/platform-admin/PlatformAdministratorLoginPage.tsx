import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { apiAuth, type PendingSignIn } from '../../data/remote/apiAuth';
import { apiPlatformAdministration } from '../../data/remote/apiPlatformAdministration';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import TurnstileWidget, { publicTurnstileSiteKey } from '../auth/TurnstileWidget';
import './platform-administration.css';

/**
 * The platform entry uses the existing LEXA cookie-session and verification APIs.
 * It never creates, guesses, or promotes administrator identities.
 * The server alone authorizes /platform-admin and enforces enrolled authenticator MFA.
 */
export default function PlatformAdministratorLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState<PendingSignIn | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileRevision, setTurnstileRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!isApiProvider) { setChecking(false); return; }
    void apiPlatformAdministration.profile()
      .then(profile => {
        if (!active) return;
        if (profile.requiresMfa) navigate('/account/security', { replace: true });
        else navigate('/platform-admin', { replace: true });
      })
      .catch(() => { /* Signed out or not enrolled; show the same generic login. */ })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [navigate]);

  async function finishSignIn(requiresPasswordChange?: boolean) {
    if (requiresPasswordChange) {
      navigate('/change-password', { replace: true });
      return;
    }
    // A successful business sign-in does not imply platform privileges.
    const profile = await apiPlatformAdministration.profile();
    navigate(profile.requiresMfa ? '/account/security' : '/platform-admin', { replace: true });
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!isApiProvider) { setError('Secure platform sign-in is unavailable in this environment.'); return; }
    if (publicTurnstileSiteKey && !turnstileToken) { setError('Complete the security verification before continuing.'); return; }
    setBusy(true);
    try {
      const result = await apiAuth.signIn(email, password, turnstileToken ?? undefined);
      setPassword('');
      if ('verificationRequired' in result) {
        setChallenge(result);
        setVerificationCode('');
      } else {
        await finishSignIn(result.requiresPasswordChange);
      }
    } catch (cause) {
      setError(businessErrorMessage(cause));
      setTurnstileToken(null);
      setTurnstileRevision(value => value + 1);
    } finally { setBusy(false); }
  }

  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || !verificationCode.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiAuth.verifySignIn(challenge.challengeToken, verificationCode.trim());
      setVerificationCode('');
      await finishSignIn(result.requiresPasswordChange);
    } catch (cause) { setError(businessErrorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <main className="lexa-admin-login">
    <div className="lexa-admin-login-orbit lexa-admin-login-orbit-a" aria-hidden="true"/>
    <div className="lexa-admin-login-orbit lexa-admin-login-orbit-b" aria-hidden="true"/>
    <div className="lexa-admin-login-orbit lexa-admin-login-orbit-c" aria-hidden="true"/>
    <div className="lexa-admin-login-layout">
      <section className="lexa-admin-login-intro">
        <div className="lexa-admin-login-wordmark"><img src="/lexa-master-lockup.png" alt="LEXA"/><span>PLATFORM ADMINISTRATION</span></div>
        <div className="lexa-admin-login-eyebrow"><Sparkles size={17}/> ADMINISTRATOR COMMAND CENTRE</div>
        <h1>Keep every business <em>moving forward.</em></h1>
        <p>One secure vantage point for subscriptions, account oversight, verified revenue, customer support and operational intelligence.</p>
        <div className="lexa-admin-login-capabilities">
          <div><span>01</span><strong>Accounts & billing</strong><small>UGX 50,000 per 30 days</small></div>
          <div><span>02</span><strong>Platform intelligence</strong><small>Health, incidents and action queues</small></div>
          <div><span>03</span><strong>Protected administration</strong><small>Account privileges verified by the server</small></div>
        </div>
      </section>

      <section className="lexa-admin-login-card" aria-label="Secure LEXA administrator sign-in">
        <div className="lexa-admin-login-icon"><LockKeyhole size={26}/></div>
        <div className="lexa-admin-login-kicker">RESTRICTED PLATFORM ENTRY</div>
        <h2>{challenge ? 'Verify this sign-in' : 'Administrator sign-in'}</h2>
        <p className="lexa-admin-login-description">{challenge
          ? challenge.method === 'totp'
            ? 'Enter your authenticator code or an approved recovery code.'
            : 'Enter the verification code sent to your registered email.'
          : 'Sign in with your authorized LEXA account. Platform privileges and authenticator enrolment are checked after sign-in.'}</p>

        {checking ? <div role="status" className="lexa-admin-login-status">Checking secure session…</div> : <>
          {challenge ? <form className="lexa-admin-login-form" onSubmit={event => void submitVerification(event)}>
            <label htmlFor="lexa-admin-otp">{challenge.method === 'totp' ? 'Authenticator or recovery code' : 'Email verification code'}</label>
            <div className="lexa-admin-login-field"><KeyRound size={19}/><input id="lexa-admin-otp" value={verificationCode} onChange={event => setVerificationCode(event.target.value)} required maxLength={20} autoComplete="one-time-code" inputMode={challenge.method === 'email' ? 'numeric' : 'text'}/></div>
            {error && <div className="lexa-admin-login-error" role="alert">{error}</div>}
            <button type="submit" disabled={busy || !verificationCode.trim()} className="lexa-admin-login-submit">{busy ? 'Verifying…' : 'Verify and enter'} <ArrowRight size={18}/></button>
            <button type="button" className="lexa-admin-login-reset" onClick={() => { setChallenge(null); setVerificationCode(''); setError(''); setTurnstileRevision(v => v + 1); }}>Start sign-in again</button>
          </form> : <form className="lexa-admin-login-form" onSubmit={event => void submitCredentials(event)}>
            <label htmlFor="lexa-admin-email">Administrator email or username</label>
            <div className="lexa-admin-login-field"><ShieldCheck size={19}/><input id="lexa-admin-email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Authorized LEXA account" autoComplete="username" required maxLength={254}/></div>
            <div className="lexa-admin-login-form-row"><label htmlFor="lexa-admin-password">Password</label><Link to="/forgot-password">Forgot password?</Link></div>
            <div className="lexa-admin-login-field"><LockKeyhole size={19}/><input id="lexa-admin-password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} className="lexa-admin-login-eye" onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>
            <TurnstileWidget key={turnstileRevision} action="login" onToken={setTurnstileToken}/>
            {error && <div className="lexa-admin-login-error" role="alert">{error}</div>}
            <button type="submit" disabled={busy || !isApiProvider || (Boolean(publicTurnstileSiteKey) && !turnstileToken)} className="lexa-admin-login-submit">{busy ? 'Signing in…' : 'Access command centre'} <ArrowRight size={18}/></button>
          </form>}
        </>}
        <div className="lexa-admin-login-secure"><ShieldCheck size={17}/> Encrypted sign-in · Restricted staff access · Server-enforced authorization</div>
        <div className="lexa-admin-login-bottom"><Link to="/sign-in">Business sign-in</Link><Link to="/lexa">LEXA website</Link></div>
      </section>
    </div>
    <footer className="lexa-admin-login-footer">LEXA is a subsidiary of AMAAL GROUP. · © {new Date().getFullYear()} LEXA</footer>
  </main>;
}
