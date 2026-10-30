import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Mail, ShieldCheck,
  Sparkles, Users, LockKeyhole,
} from 'lucide-react';
import { apiAuth } from '../../data/remote/apiAuth';
import { apiBaseUrl, dataProviderMode } from '../../data/remote/runtimeConfig';
import { PasswordField, PasswordLengthGuide } from './AuthFields';

type AuthMode = 'sign-in' | 'forgot-password' | 'reset-password';

const copy: Record<AuthMode, { eyebrow: string; title: string; description: string; submit: string }> = {
  'sign-in': {
    eyebrow: 'SECURE BUSINESS ACCESS',
    title: 'Welcome back.',
    description: 'Sign in to continue to your business workspace.',
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

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Please check your connection and try again.';
  const value = error.message.toLowerCase();
  if (value.includes('incorrect') || value.includes('invalid_credentials')) return 'The email or password is incorrect. Check your details and try again.';
  if (value.includes('rate') || value.includes('too many')) return 'There have been too many attempts. Please wait a little before trying again.';
  if (value.includes('recovery') && (value.includes('not configured') || value.includes('unavailable'))) return 'Password recovery email is not available yet. Please contact your LEXA administrator.';
  return error.message;
}

function BrandPanel() {
  return (
    <aside className="auth-brand-panel">
      <div className="auth-brand-top">
        <img src="/lexa-logo.png" alt="LEXA" />
        <span className="auth-brand-badge"><span /> Business workspace</span>
      </div>
      <div className="auth-brand-content">
        <div className="auth-brand-orbit auth-orbit-one" />
        <div className="auth-brand-orbit auth-orbit-two" />
        <div className="auth-brand-kicker"><Sparkles size={15} /> A clearer way to run your business</div>
        <h2>Everything connected.<br /><span>Work made clearer.</span></h2>
        <p>Bring your people, daily operations, and business information into one organised workspace.</p>
        <div className="auth-feature-list">
          <div><span className="auth-feature-icon"><Users size={17} /></span><div><strong>Workspace-based access</strong><small>People see the work they are authorised to manage.</small></div></div>
          <div><span className="auth-feature-icon"><LockKeyhole size={17} /></span><div><strong>Protected sign-in</strong><small>Account access is verified by the LEXA service.</small></div></div>
          <div><span className="auth-feature-icon"><ShieldCheck size={17} /></span><div><strong>Secure account recovery</strong><small>Reset links are time-limited and single-use.</small></div></div>
        </div>
      </div>
      <div className="auth-brand-footer"><span>LEXA</span><span>Business operations, in one place.</span></div>
    </aside>
  );
}

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [formError, setFormError] = useState('');
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
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
    setFormError('');
    if (!apiReady) {
      setFormError('Account access is not configured. Please contact your LEXA administrator.');
      return;
    }
    if (mode === 'reset-password' && !token) {
      setFormError('This recovery link is incomplete. Request a new password-reset link.');
      return;
    }
    if (mode === 'reset-password' && Array.from(password).length < 15) {
      setFormError('Use a password or passphrase with at least 15 characters.');
      return;
    }
    if (mode === 'reset-password' && password !== confirmPassword) {
      setFormError('The two passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'sign-in') {
        await apiAuth.signIn(email, password);
        navigate('/', { replace: true });
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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <BrandPanel />
      <section className="auth-main-panel">
        <div className="auth-main-top"><Link to="/onboarding" className="auth-back-link"><ArrowLeft size={15} /> Back to LEXA</Link><span className="auth-top-secure"><ShieldCheck size={15} /> Secure connection</span></div>
        <div className="auth-card">
          <div className="auth-mobile-brand"><img src="/lexa-logo.png" alt="LEXA" /></div>
          <div className="auth-eyebrow">{complete ? 'REQUEST RECEIVED' : text.eyebrow}</div>
          <h1>{complete ? 'Check your inbox.' : text.title}</h1>
          <p className="auth-intro">{complete
            ? 'If an account matches that email address, a recovery link will be sent. Check your inbox and spam folder.'
            : text.description}</p>

          {passwordUpdated && <div className="auth-complete-panel auth-password-updated" role="status"><CheckCircle2 size={20} /><div><strong>Password updated successfully</strong><span>Sign in with your new password. Your previous sessions have been closed.</span></div></div>}
          {!apiReady && <div className="auth-notice" role="status">LEXA account access requires the connected backend service.</div>}

          {!complete && <form className="auth-form" onSubmit={submit}>
            {mode !== 'reset-password' && <div className="auth-field">
              <label htmlFor="account-email">Account email <span aria-hidden="true">*</span></label>
              <div className="auth-input-wrap"><Mail size={17} aria-hidden="true" /><input id="account-email" name="email" type="email" inputMode="email" autoComplete="username" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@business.com" /></div>
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
            {formError && <div className="auth-error" role="alert">{formError}</div>}
            <button className="auth-submit" type="submit" disabled={submitting || !apiReady}>
              <span>{submitting ? 'Please wait…' : text.submit}</span><ArrowRight size={17} />
            </button>
          </form>}

          {complete && <div className="auth-complete-panel"><CheckCircle2 size={22} /><div><strong>Recovery request submitted</strong><span>For security, this page does not reveal whether an account exists.</span></div></div>}

          {mode === 'sign-in' && !complete && <div className="auth-support-row"><Link to="/forgot-password">Forgot password?</Link><span>Need access? Contact your workspace administrator.</span></div>}
          {mode === 'forgot-password' && <div className="auth-support-row"><Link to="/sign-in"><ArrowLeft size={14} /> Back to sign in</Link></div>}
          {mode === 'reset-password' && <div className="auth-support-row"><Link to="/forgot-password">Request a new recovery link</Link></div>}
          {mode === 'sign-in' && bootstrapAvailable && <Link className="auth-first-admin" to="/create-account">Set up the first administrator <ArrowRight size={15} /></Link>}
          {complete && <Link className="auth-submit auth-return-button" to="/sign-in">Return to sign in <ArrowRight size={17} /></Link>}

          <div className="auth-security-footnote"><ShieldCheck size={16} /><span>Your password is checked by the LEXA service. Session credentials are held in secure cookies, not browser storage.</span></div>
        </div>
        <div className="auth-main-footer"><span>© {new Date().getFullYear()} LEXA</span><span>Keep your account details private.</span></div>
      </section>
    </main>
  );
}

export function SignInPage() { return <AuthPage mode="sign-in" />; }
export function ForgotPasswordPage() { return <AuthPage mode="forgot-password" />; }
export function ResetPasswordPage() { return <AuthPage mode="reset-password" />; }

export function CreateAccountPage() {
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
    if (Array.from(password).length < 15) { setFormError('Use a password or passphrase with at least 15 characters.'); return; }
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
          <div className="auth-mobile-brand"><img src="/lexa-logo.png" alt="LEXA" /></div>
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
            <div className="auth-field"><label htmlFor="admin-email">Account email <span aria-hidden="true">*</span></label><div className="auth-input-wrap"><Mail size={17} /><input id="admin-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@business.com" /></div></div>
            <PasswordField id="admin-password" label="Create password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="Use a unique passphrase" />
            <PasswordLengthGuide value={password} />
            <PasswordField id="admin-password-confirm" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="Enter the password again" />
            {formError && <div className="auth-error" role="alert">{formError}</div>}
            <button className="auth-submit" type="submit" disabled={saving}>{saving ? 'Creating secure account…' : 'Create administrator account'} <ArrowRight size={17} /></button>
          </form>}
          {!available && !checking && <Link className="auth-submit auth-return-button" to="/sign-in">Return to sign in <ArrowRight size={17} /></Link>}
          <div className="auth-security-footnote"><ShieldCheck size={16} /><span>The setup code is used once. The password is stored as a salted hash, and the public setup route closes after the first account is created.</span></div>
        </div>
        <div className="auth-main-footer"><span>© {new Date().getFullYear()} LEXA</span><span>Keep your account details private.</span></div>
      </section>
    </main>
  );
}
