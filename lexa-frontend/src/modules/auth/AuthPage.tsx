import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiAuth } from '../../data/remote/apiAuth';
import { apiBaseUrl, dataProviderMode } from '../../data/remote/runtimeConfig';

type AuthMode = 'sign-in' | 'forgot-password' | 'reset-password';

const copy: Record<AuthMode, { eyebrow: string; title: string; description: string; submit: string }> = {
  'sign-in': { eyebrow: 'SECURE BUSINESS ACCESS', title: 'Sign in to LEXA', description: 'Use your business account to continue to your authorized workspaces.', submit: 'Sign in' },
  'forgot-password': { eyebrow: 'ACCOUNT RECOVERY', title: 'Reset your password', description: 'Enter your account email. If the account exists, recovery instructions will be sent.', submit: 'Send recovery instructions' },
  'reset-password': { eyebrow: 'ACCOUNT RECOVERY', title: 'Choose a new password', description: 'Use the secure recovery link provided by your account service.', submit: 'Set new password' },
};

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const text = copy[mode];

  useEffect(() => {
    if (mode !== 'sign-in' || dataProviderMode !== 'api' || !apiBaseUrl) return;
    let active = true;
    void apiAuth.bootstrapAvailable().then((available) => { if (active) setBootstrapAvailable(available); }).catch(() => { if (active) setBootstrapAvailable(false); });
    return () => { active = false; };
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dataProviderMode !== 'api' || !apiBaseUrl) {
      toast.error('Account access is unavailable', { description: 'Connect LEXA to its secure account service before signing in.' });
      return;
    }
    if (mode === 'reset-password' && !token) {
      toast.error('Recovery link is invalid', { description: 'Request a fresh password-reset link and open it from your email.' });
      return;
    }
    if (mode === 'reset-password' && password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (mode === 'reset-password' && password.length < 12) {
      toast.error('Choose a stronger password', { description: 'Use at least 12 characters.' });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'sign-in') {
        await apiAuth.signIn(email, password);
        toast.success('Signed in successfully');
        navigate('/', { replace: true });
        return;
      }
      if (mode === 'forgot-password') {
        await apiAuth.requestPasswordReset(email);
        setComplete(true);
        return;
      }
      await apiAuth.resetPassword(token, password);
      toast.success('Password changed. Sign in with your new password.');
      navigate('/sign-in', { replace: true });
    } catch (error) {
      toast.error('Could not complete the request', { description: error instanceof Error ? error.message : 'Check your connection and retry.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="backend-block-screen auth-screen">
      <section className="backend-block-card auth-card">
        <Link className="auth-back-link" to={mode === 'sign-in' ? '/onboarding' : '/sign-in'}><ArrowLeft size={15} /> {mode === 'sign-in' ? 'Back to setup' : 'Back to sign in'}</Link>
        <div className="backend-block-mark">LEXA</div>
        <div className="eyebrow eyebrow-blue">{text.eyebrow}</div>
        <h1>{complete ? 'Check your email' : text.title}</h1>
        <p>{complete ? 'If an account matches that email address, recovery instructions will be sent. This response intentionally does not reveal whether the account exists.' : text.description}</p>

        {dataProviderMode === 'local' && <div className="auth-configuration-note">Account access requires a connected LEXA service. Device-only mode does not create or simulate accounts.</div>}
        {dataProviderMode === 'api' && !apiBaseUrl && <div className="auth-configuration-note">Account access is not available yet. Please contact your LEXA administrator.</div>}
        {!complete && <form className="form-stack auth-form" onSubmit={submit}>
          {mode !== 'reset-password' && <label className="field-label">Account email <span className="required-mark">*</span><span className="auth-field-control"><Mail size={16} /><input type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@business.com" /></span></label>}
          {mode !== 'forgot-password' && <label className="field-label">{mode === 'reset-password' ? 'New password' : 'Password'} <span className="required-mark">*</span><span className="auth-field-control"><LockKeyhole size={16} /><input type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={mode === 'reset-password' ? 12 : 1} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'reset-password' ? 'At least 12 characters' : 'Enter your password'} /></span></label>}
          {mode === 'reset-password' && <label className="field-label">Confirm new password <span className="required-mark">*</span><span className="auth-field-control"><KeyRound size={16} /><input type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" /></span></label>}
          <button className="button button-primary button-wide" type="submit" disabled={submitting || dataProviderMode !== 'api' || !apiBaseUrl}>{submitting ? 'Please wait…' : text.submit} <ArrowRight size={16} /></button>
        </form>}

        {mode === 'sign-in' && <div className="auth-links"><Link to="/forgot-password">Forgot your password?</Link><span>Access is controlled by your business account and workspace permissions.</span>{bootstrapAvailable && <Link to="/create-account">Set up the first administrator account</Link>}</div>}
        {mode === 'forgot-password' && complete && <button className="button button-primary button-wide" onClick={() => navigate('/sign-in', { replace: true })}>Return to sign in <ArrowRight size={16} /></button>}
        {mode === 'reset-password' && !token && <div className="auth-configuration-note">No recovery token was included in this link. <Link to="/forgot-password">Request a new reset link.</Link></div>}
        <div className="auth-security-note"><ShieldCheck size={16} /><span>LEXA uses server-issued sessions. Passwords and recovery tokens are not stored in browser storage.</span></div>
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

  useEffect(() => {
    let active = true;
    void apiAuth.bootstrapAvailable().then((value) => { if (active) setAvailable(value); }).catch(() => { if (active) setAvailable(false); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 12) { toast.error('Choose a stronger password', { description: 'Use at least 12 characters.' }); return; }
    if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setSaving(true);
    try {
      await apiAuth.register(displayName, email, password, bootstrapSecret);
      toast.success('Administrator account created');
      navigate('/onboarding', { replace: true });
    } catch (error) {
      toast.error('Account setup could not be completed', { description: error instanceof Error ? error.message : 'Refresh the page and retry.' });
    } finally { setSaving(false); }
  }

  return (
    <main className="backend-block-screen auth-screen">
      <section className="backend-block-card auth-card">
        <Link className="auth-back-link" to="/sign-in"><ArrowLeft size={15} /> Back to sign in</Link>
        <div className="backend-block-mark">LEXA</div>
        <div className="eyebrow eyebrow-blue">SECURE ACCOUNT SETUP</div>
        <h1>{checking ? 'Checking account setup' : available ? 'Create the first administrator' : 'Account setup is closed'}</h1>
        <p>{available ? 'Use the one-time setup code configured by the administrator to create the first administrator account. Additional access must be managed through authorized workspace administration.' : checking ? 'Checking whether first-time setup is available.' : 'Account setup is closed or has not been enabled by the administrator. Ask the administrator for access.'}</p>
        {available && <form className="form-stack auth-form" onSubmit={submit}>
          <label className="field-label">One-time setup code <span className="required-mark">*</span><span className="auth-field-control"><KeyRound size={16} /><input type="password" autoComplete="off" required maxLength={256} value={bootstrapSecret} onChange={(event) => setBootstrapSecret(event.target.value)} placeholder="Enter the setup code" /></span></label>
          <label className="field-label">Your name <span className="required-mark">*</span><span className="auth-field-control"><input autoComplete="name" required maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Full name" /></span></label>
          <label className="field-label">Account email <span className="required-mark">*</span><span className="auth-field-control"><Mail size={16} /><input type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@business.com" /></span></label>
          <label className="field-label">Password <span className="required-mark">*</span><span className="auth-field-control"><LockKeyhole size={16} /><input type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" /></span></label>
          <label className="field-label">Confirm password <span className="required-mark">*</span><span className="auth-field-control"><KeyRound size={16} /><input type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" /></span></label>
          <button className="button button-primary button-wide" type="submit" disabled={saving}>{saving ? 'Creating secure account…' : 'Create administrator account'} <ArrowRight size={16} /></button>
        </form>}
        {!available && !checking && <Link className="button button-secondary button-wide" to="/sign-in">Return to sign in <ArrowRight size={16} /></Link>}
        <div className="auth-security-note"><ShieldCheck size={16} /><span>Your password is stored as a salted password hash. The account-creation step closes after the first administrator is registered.</span></div>
      </section>
    </main>
  );
}
