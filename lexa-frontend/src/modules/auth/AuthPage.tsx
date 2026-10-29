import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiAuth } from '../../data/remote/apiAuth';
import { apiBaseUrl, dataProviderMode } from '../../data/remote/runtimeConfig';

type AuthMode = 'sign-in' | 'forgot-password' | 'reset-password';

const copy: Record<AuthMode, { eyebrow: string; title: string; description: string; submit: string }> = {
  'sign-in': { eyebrow: 'SECURE BUSINESS ACCESS', title: 'Sign in to LEXA', description: 'Use your business account to continue to your authorized workspaces.', submit: 'Sign in' },
  'forgot-password': { eyebrow: 'ACCOUNT RECOVERY', title: 'Reset your password', description: 'Enter your account email. If the account exists, the backend will send recovery instructions.', submit: 'Send recovery instructions' },
  'reset-password': { eyebrow: 'ACCOUNT RECOVERY', title: 'Choose a new password', description: 'Use the secure recovery link provided by your account service.', submit: 'Set new password' },
};

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const text = copy[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dataProviderMode !== 'api' || !apiBaseUrl) {
      toast.error('Backend is not configured', { description: 'Configure VITE_API_BASE_URL and deploy the authentication endpoints before using account access.' });
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
      toast.error('Choose a stronger password', { description: 'Use at least 12 characters; the backend should enforce its configured password policy too.' });
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

        {dataProviderMode === 'local' && <div className="auth-configuration-note">Sign-in and password recovery require the server API. Device-only mode does not create or simulate accounts.</div>}
        {dataProviderMode === 'api' && !apiBaseUrl && <div className="auth-configuration-note">The API origin is missing. Set <code>VITE_API_BASE_URL</code> in the deployment environment before enabling sign-in.</div>}
        {!complete && <form className="form-stack auth-form" onSubmit={submit}>
          {mode !== 'reset-password' && <label className="field-label">Account email <span className="required-mark">*</span><span className="auth-field-control"><Mail size={16} /><input type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@business.com" /></span></label>}
          {mode !== 'forgot-password' && <label className="field-label">{mode === 'reset-password' ? 'New password' : 'Password'} <span className="required-mark">*</span><span className="auth-field-control"><LockKeyhole size={16} /><input type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} minLength={mode === 'reset-password' ? 12 : 1} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'reset-password' ? 'At least 12 characters' : 'Enter your password'} /></span></label>}
          {mode === 'reset-password' && <label className="field-label">Confirm new password <span className="required-mark">*</span><span className="auth-field-control"><KeyRound size={16} /><input type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" /></span></label>}
          <button className="button button-primary button-wide" type="submit" disabled={submitting || dataProviderMode !== 'api' || !apiBaseUrl}>{submitting ? 'Contacting backend…' : text.submit} <ArrowRight size={16} /></button>
        </form>}

        {mode === 'sign-in' && <div className="auth-links"><Link to="/forgot-password">Forgot your password?</Link><span>Access is controlled by your business account and backend permissions.</span></div>}
        {mode === 'forgot-password' && complete && <button className="button button-primary button-wide" onClick={() => navigate('/sign-in', { replace: true })}>Return to sign in <ArrowRight size={16} /></button>}
        {mode === 'reset-password' && !token && <div className="auth-configuration-note">No recovery token was included in this link. <Link to="/forgot-password">Request a new reset link.</Link></div>}
        <div className="auth-security-note"><ShieldCheck size={16} /><span>LEXA does not store your password or recovery token in browser storage. Authentication must be enforced by the backend.</span></div>
      </section>
    </main>
  );
}

export function SignInPage() { return <AuthPage mode="sign-in" />; }
export function ForgotPasswordPage() { return <AuthPage mode="forgot-password" />; }
export function ResetPasswordPage() { return <AuthPage mode="reset-password" />; }
