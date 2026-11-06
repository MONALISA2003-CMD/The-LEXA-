import { validNewPassword, NEW_PASSWORD_RULE } from '../../domain/shared/newPasswordPolicy';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Mail, ShieldCheck,
  Sparkles, Users, LockKeyhole,
} from 'lucide-react';
import { apiAuth } from '../../data/remote/apiAuth';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import { apiBaseUrl, dataProviderMode } from '../../data/remote/runtimeConfig';
import { PasswordField, PasswordLengthGuide } from './AuthFields';
import TurnstileWidget, { publicTurnstileSiteKey } from './TurnstileWidget';
import type { PendingSignIn } from '../../data/remote/apiAuth';

type AuthMode = 'sign-in' | 'forgot-password' | 'reset-password';
type AuthLocationState = {
  returnTo?: unknown;
  connectionIssue?: unknown;
};

function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/onboarding';
  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin) return '/onboarding';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/onboarding';
  }
}

const copy: Record<AuthMode, { eyebrow: string; title: string; description: string; submit: string }> = {
  'sign-in': {
    eyebrow: 'SECURE BUSINESS ACCESS',
    title: 'Welcome back to LEXA.',
    description: 'Your workspace for sales, operations, finance and everything in between.',
    submit: 'Sign in securely',
  },
  'forgot-password': {
    eyebrow: 'ACCOUNT RECOVERY',
    title: 'Recover your account.',
    description: 'Enter the email address associated with your LEXA account. We will send a recovery link when an account matches.',
    submit: 'Send recovery link',
  },
  'reset-password': {
    eyebrow: 'SECURE ACCOUNT RECOVERY',
    title: 'Create a new password.',
    description: 'Choose a unique passphrase that you do not use anywhere else.',
    submit: 'Update password',
  },
};

function errorMessage(error: unknown): string { return businessErrorMessage(error); }

function BrandPanel() {
  return (
    <aside className="auth-brand-panel">
      <div className="auth-brand-top">
        <img src="/lexa-master-lockup-light.png" alt="LEXA" />
        <span className="auth-brand-badge"><span /> Business workspace</span>
      </div>
      <div className="auth-brand-content">
        <div className="auth-brand-orbit auth-orbit-one" />
        <div className="auth-brand-orbit auth-orbit-two" />
        <div className="auth-brand-kicker"><Sparkles size={15} /> Clarity for every business decision</div>
        <h2>Your business.<br /><span>Without limits.</span></h2>
        <p>Manage your people, customers, finances and daily work in one professional workspace.</p>
        <div className="auth-feature-list">
          <div><span className="auth-feature-icon"><Users size={17} /></span><div><strong>Access for your team</strong><small>Each team member sees the information and tasks assigned to their role.</small></div></div>
          <div><span className="auth-feature-icon"><LockKeyhole size={17} /></span><div><strong>Protected sign-in</strong><small>Your account is protected by secure sign-in.</small></div></div>
          <div><span className="auth-feature-icon"><ShieldCheck size={17} /></span><div><strong>Secure account recovery</strong><small>Reset links are time-limited and single-use.</small></div></div>
        </div>
      </div>
      <div className="auth-brand-footer"><span>LEXA</span><span>A clearer way to manage your business.</span></div>
    </aside>
  );
}

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationState = (location.state ?? null) as AuthLocationState | null;
  const returnTo = safeReturnTo(navigationState?.returnTo);
  const connectionIssue = mode === 'sign-in' ? navigationState?.connectionIssue : null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [formError, setFormError] = useState('');
  const [supportReference, setSupportReference] = useState('');
  const [turnstileToken,setTurnstileToken] = useState<string | null>(null);
  const [turnstileRevision,setTurnstileRevision] = useState(0);
  const [pendingSignIn,setPendingSignIn] = useState<PendingSignIn|null>(null);
  const [verificationCode,setVerificationCode] = useState('');
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  const text = copy[mode];
  const apiReady = dataProviderMode === 'api' && Boolean(apiBaseUrl);
  const passwordUpdated = mode === 'sign-in' && new URLSearchParams(window.location.search).get('password-updated') === '1';

  useEffect(() => {
    if (mode !== 'sign-in' || !apiReady) return;
    let active = true;
    void apiAuth.bootstrapAvailable()
      .then((available) => { if (active) setBootstrapAvailable(available); })
      .catch(() => { if (active) setBootstrapAvailable(false); });
    return () => { active = false; };
  }, [mode, apiReady]);

  useEffect(() => {
    if (mode === 'reset-password' && token) {
      // Keep the one-time token in component memory, not in the address bar or later navigation history.
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [mode, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');setSupportReference('');
    if (!apiReady) {
      setFormError('Account access is not configured. Please contact your LEXA administrator.');
      return;
    }
    if (mode === 'reset-password' && !token) {
      setFormError('This recovery link is incomplete. Request a new password-reset link.');
      return;
    }
    if (mode === 'reset-password' && !validNewPassword(password)) {
      setFormError(NEW_PASSWORD_RULE);
      return;
    }
    if (mode === 'reset-password' && password !== confirmPassword) {
      setFormError('The two passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'sign-in') {
        const account = await apiAuth.signIn(email, password, turnstileToken??undefined);
        // apiAuth.signIn only returns a challenge when verificationRequired is true.
        // The other branch is therefore a validated authenticated session.
        if ('verificationRequired' in account) {
          setPendingSignIn(account);
          setPassword('');setTurnstileToken(null);return;
        }
        // The business shell opens the saved business or guides first-time users to setup.
        navigate(account.requiresPasswordChange ? '/change-password' : returnTo, { replace: true });
        return;
      }
      if (mode === 'forgot-password') {
        await apiAuth.requestPasswordReset(email);
        setComplete(true);
        return;
      }
      await apiAuth.resetPassword(token, password);
      navigate('/sign-in?password-updated=1', { replace: true });
    } catch (error) {
      setFormError(errorMessage(error));
      setSupportReference(error && typeof error === 'object' && 'requestId' in error && typeof error.requestId === 'string' ? error.requestId : '');
      if(mode==='sign-in'){setTurnstileToken(null);setTurnstileRevision(value=>value+1);}
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyBrowser(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!pendingSignIn)return;
    setFormError('');setSubmitting(true);
    try{
      const account=await apiAuth.verifySignIn(pendingSignIn.challengeToken,verificationCode.trim());
      navigate(account.requiresPasswordChange?'/change-password':returnTo,{replace:true});
    }catch(error){setFormError(errorMessage(error));setSupportReference(error && typeof error === 'object' && 'requestId' in error && typeof error.requestId === 'string' ? error.requestId : '');}
    finally{setSubmitting(false);}
  }
  return (
    <main className="auth-page">
      <BrandPanel />
      <section className="auth-main-panel">
        <div className="auth-main-top"><Link to="/onboarding" className="auth-back-link"><ArrowLeft size={15} /> Choose your business</Link><span className="auth-top-secure"><ShieldCheck size={15} /> Protected sign-in</span></div>
        <div className="auth-card">
          <div className="auth-mobile-brand"><img src="/lexa-master-lockup.png" alt="LEXA" /></div>
          <div className="auth-eyebrow">{complete ? 'REQUEST RECEIVED' : text.eyebrow}</div>
          <h1>{pendingSignIn ? 'Verify this browser.' : complete ? 'Check your inbox.' : text.title}</h1>
          <p className="auth-intro">{pendingSignIn
            ? pendingSignIn.method==='email'?'Enter the eight-digit code sent to your account email. It expires in 10 minutes.':'Enter the six-digit code from your authenticator app, or a saved recovery code.'
            : complete ? 'If an account matches that email address, a recovery link will be sent. Check your inbox and spam folder.' : text.description}</p>

          {passwordUpdated && <div className="auth-complete-panel auth-password-updated" role="status"><CheckCircle2 size={20} /><div><strong>Password updated successfully</strong><span>Sign in with your new password. Your previous sessions have been closed.</span></div></div>}
          {mode === 'sign-in' && connectionIssue === 'session' && <div className="auth-notice" role="status">Your sign-in session has expired. Sign in again to continue to your business workspace.</div>}
          {mode === 'sign-in' && connectionIssue === 'workspace' && <div className="auth-notice" role="status">We could not reopen your business. Sign in again and choose your business to continue.</div>}
          {!apiReady && <div className="auth-notice" role="status">Your business account is temporarily unavailable. Please contact your administrator.</div>}

          {mode === 'reset-password' && !token && <div className="auth-notice" role="alert">This page needs the private link from your recovery email. Open your latest LEXA password-reset email and tap <strong>Reset password</strong>, or request a fresh link below.</div>}
          {pendingSignIn && <form className="auth-form" onSubmit={verifyBrowser}>
            <div className="auth-field"><label htmlFor="browser-verification-code">Verification code</label>
              <input id="browser-verification-code" autoComplete="one-time-code" inputMode={pendingSignIn.method==='email'?'numeric':'text'}
                value={verificationCode} onChange={event=>setVerificationCode(event.target.value)} maxLength={20} required autoFocus /></div>
            {formError && <div className="auth-error" role="alert">{formError}{supportReference&&<small className="lexa-login-support-reference">Support reference: {supportReference}</small>}</div>}
            <button className="auth-submit" type="submit" disabled={submitting||!verificationCode.trim()}>{submitting?'Verifying…':'Verify and sign in'}</button>
            <button className="button button-secondary" type="button" onClick={()=>{setPendingSignIn(null);setVerificationCode('');setFormError('');setTurnstileRevision(v=>v+1);}}>Start sign-in again</button>
          </form>}
          {!pendingSignIn && !complete && (mode !== 'reset-password' || Boolean(token)) && <form className="auth-form" onSubmit={submit}>
            {mode !== 'reset-password' && <div className="auth-field">
              <label htmlFor="account-email">{mode === 'sign-in' ? 'Business email or employee username' : 'Business email address'} <span aria-hidden="true">*</span></label>
              <div className="auth-input-wrap"><Mail size={17} aria-hidden="true" /><input id="account-email" name="email" type={mode === 'sign-in' ? 'text' : 'email'} inputMode={mode === 'sign-in' ? 'text' : 'email'} autoComplete="username" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@business.com" /></div>
            </div>}
            {mode !== 'forgot-password' && <PasswordField
              id="account-password"
              label={mode === 'reset-password' ? 'New password' : 'Password'}
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              placeholder={mode === 'reset-password' ? 'Create a unique passphrase' : 'Enter your password'}
            />}
            {mode === 'reset-password' && <>
              <PasswordLengthGuide value={password} />
              <PasswordField id="confirm-password" label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="Enter the new password again" />
            </>}

{mode==='sign-in' && email.trim().toLowerCase()==='kabuusumohammed182@gmail.com' &&
  <div className="auth-notice" role="status">This address is designated for the private LEXA Control Centre. <Link to="/platform-admin/login">Open administrator sign-in</Link>. Existing business-owner access remains available only while ownership of the previous workspaces is being transferred safely.</div>}
            {mode==='sign-in'&&<TurnstileWidget key={turnstileRevision} action="login" onToken={setTurnstileToken}/>}
            {formError && <div className="auth-error" role="alert">{formError}{supportReference&&<small className="lexa-login-support-reference">Support reference: {supportReference}</small>}</div>}
            <button className="auth-submit" type="submit" disabled={submitting || !apiReady || (mode==='sign-in'&&Boolean(publicTurnstileSiteKey)&&!turnstileToken)}>
              <span>{submitting ? 'Please wait…' : text.submit}</span><ArrowRight size={17} />
            </button>
          </form>}

          {complete && <div className="auth-complete-panel"><CheckCircle2 size={22} /><div><strong>Recovery request submitted</strong><span>For security, this page does not reveal whether an account exists.</span></div></div>}

          {mode === 'sign-in' && !complete && !pendingSignIn && <>
            <div className="auth-support-row"><Link to="/forgot-password">Forgot password?</Link><span>Protected by secure sign-in</span></div>
            <Link className="auth-create-account-link" to="/create-account">Create your LEXA account <ArrowRight size={17}/></Link>
            <p className="auth-invite-hint">Joining a team? Use the private invitation link sent to your email.</p>
          </>}
          {mode === 'forgot-password' && <div className="auth-support-row"><Link to="/sign-in"><ArrowLeft size={14} /> Back to sign in</Link></div>}
          {mode === 'reset-password' && <div className="auth-support-row"><Link to="/forgot-password">Request a new recovery link</Link></div>}
          {mode === 'sign-in' && bootstrapAvailable && <Link className="auth-first-admin" to="/first-admin-setup">Create the first administrator account <ArrowRight size={15} /></Link>}
          {complete && <Link className="auth-submit auth-return-button" to="/sign-in">Return to sign in <ArrowRight size={17} /></Link>}

          <div className="auth-security-footnote"><ShieldCheck size={16} /><span>Your account and business information are protected. Keep your password private.</span></div>
          <p className="auth-invite-hint"><Link to="/legal/cookies">Cookie policy</Link> · <Link to="/legal/privacy">Privacy policy</Link></p>
        </div>
        <div className="auth-main-footer"><span>© {new Date().getFullYear()} LEXA</span><span>LEXA is a subsidiary of AMAAL GROUP.</span></div>
      </section>
    </main>
  );
}

export function SignInPage() { return <AuthPage mode="sign-in" />; }
export function ForgotPasswordPage() { return <AuthPage mode="forgot-password" />; }
export function ResetPasswordPage() { return <AuthPage mode="reset-password" />; }

export function FirstAdministratorPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let active = true;
    void apiAuth.bootstrapAvailable()
      .then((value) => { if (active) setAvailable(value); })
      .catch(() => { if (active) setAvailable(false); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    if (!validNewPassword(password)) { setFormError(NEW_PASSWORD_RULE); return; }
    if (password !== confirmPassword) { setFormError('The two passwords do not match.'); return; }
    setSaving(true);
    try {
      await apiAuth.register(displayName, email, password, bootstrapSecret);
      navigate('/onboarding', { replace: true });
    } catch (error) {
      setFormError(errorMessage(error));
    } finally { setSaving(false); }
  }

  return (
    <main className="auth-page auth-page-setup">
      <BrandPanel />
      <section className="auth-main-panel">
        <div className="auth-main-top"><Link to="/sign-in" className="auth-back-link"><ArrowLeft size={15} /> Back to sign in</Link><span className="auth-top-secure"><ShieldCheck size={15} /> First administrator setup</span></div>
        <div className="auth-card auth-card-setup">
          <div className="auth-mobile-brand"><img src="/lexa-master-lockup.png" alt="LEXA" /></div>
          <div className="auth-eyebrow">SECURE ACCOUNT SETUP</div>
          <h1>{checking ? 'Checking setup access…' : available ? 'Create the first administrator.' : 'Setup is closed.'}</h1>
          <p className="auth-intro">{available
            ? 'Create the owner account that will manage the first LEXA workspace and its access.'
            : checking
              ? 'Checking whether the one-time first-account setup is available.'
              : 'The first administrator has already been registered or setup has not been enabled. Contact your LEXA administrator.'}</p>
          {available && <form className="auth-form" onSubmit={submit}>
            <div className="auth-field"><label htmlFor="bootstrap-secret">One-time setup code <span aria-hidden="true">*</span></label><div className="auth-input-wrap"><KeyRound size={17} /><input id="bootstrap-secret" type="password" autoComplete="off" required maxLength={256} value={bootstrapSecret} onChange={(event) => setBootstrapSecret(event.target.value)} placeholder="Enter the private setup code" /></div></div>
            <div className="auth-field"><label htmlFor="admin-name">Full name <span aria-hidden="true">*</span></label><div className="auth-input-wrap"><input id="admin-name" autoComplete="name" required maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" /></div></div>
            <div className="auth-field"><label htmlFor="admin-email">Business email address <span aria-hidden="true">*</span></label><div className="auth-input-wrap"><Mail size={17} /><input id="admin-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@business.com" /></div></div>
            <PasswordField id="admin-password" label="Create password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="8 mixed characters" />
            <PasswordLengthGuide value={password} />
            <PasswordField id="admin-password-confirm" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="Enter the password again" />
            {formError && <div className="auth-error" role="alert">{formError}</div>}
            <button className="auth-submit" type="submit" disabled={saving}>{saving ? 'Creating secure account…' : 'Create administrator account'} <ArrowRight size={17} /></button>
          </form>}
          {!available && !checking && <Link className="auth-submit auth-return-button" to="/sign-in">Return to sign in <ArrowRight size={17} /></Link>}
          <div className="auth-security-footnote"><ShieldCheck size={16} /><span>The setup code is used once. The password is stored as a salted hash, and the public setup route closes after the first account is created.</span></div>
        </div>
        <div className="auth-main-footer"><span>© {new Date().getFullYear()} LEXA</span><span>LEXA is a subsidiary of AMAAL GROUP.</span></div>
      </section>
    </main>
  );
}
