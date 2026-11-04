import { validNewPassword, NEW_PASSWORD_RULE } from '../../domain/shared/newPasswordPolicy';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { apiAuth } from '../../data/remote/apiAuth';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import { PasswordField, PasswordLengthGuide } from './AuthFields';
import TurnstileWidget, { publicTurnstileSiteKey } from './TurnstileWidget';

export default function SignupPage() {
  const [displayName, setDisplayName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!validNewPassword(password)) { setError(NEW_PASSWORD_RULE); return; }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
    if (publicTurnstileSiteKey && !turnstileToken) { setError('Complete the security check before continuing.'); return; }
    setSaving(true);
    try {
      await apiAuth.requestPublicSignup({ email, displayName, businessName, password, ...(turnstileToken ? {turnstileToken} : {}) });
      setSent(true);
      setPassword(''); setConfirmPassword('');
    } catch (cause) { setError(businessErrorMessage(cause)); }
    finally { setSaving(false); }
  }
  return (
    <main className="auth-page auth-premium auth-signup-page">
      <aside className="auth-brand-panel">
        <div className="auth-brand-top"><img src="/lexa-master-lockup-light.png" alt="LEXA" /><span className="auth-brand-badge"><span /> Enterprise-grade protection</span></div>
        <div className="auth-brand-content">
          <div className="auth-brand-orbit auth-orbit-one"/><div className="auth-brand-orbit auth-orbit-two"/>
          <div className="auth-brand-kicker"><Sparkles size={16}/> EVERYTHING, CONNECTED</div>
          <h2>Build your next<br/><span>chapter with LEXA.</span></h2>
          <p>Bring sales, inventory, finance and your team together in one beautifully simple business workspace.</p>
          <div className="auth-feature-list">
            <div><span className="auth-feature-icon"><ShieldCheck size={18}/></span><div><strong>Your business, your data</strong><small>Separate workspaces and role-based access for every business.</small></div></div>
            <div><span className="auth-feature-icon"><Building2 size={18}/></span><div><strong>Ready from day one</strong><small>Your private business workspace and main branch are created automatically.</small></div></div>
            <div><span className="auth-feature-icon"><LockKeyhole size={18}/></span><div><strong>Verified, secure access</strong><small>Confirm your email before your account is activated.</small></div></div>
          </div>
        </div>
        <div className="auth-brand-footer"><span>LEXA</span><span>Made for businesses moving forward.</span></div>
      </aside>
      <section className="auth-main-panel">
        <div className="auth-main-top"><Link to="/sign-in" className="auth-back-link"><ArrowLeft size={16}/> Back to sign in</Link><span className="auth-top-secure"><ShieldCheck size={16}/> Protected registration</span></div>
        <div className="auth-card auth-card-registration">
          <div className="auth-mobile-brand"><img src="/lexa-master-lockup.png" alt="LEXA" /></div>
          {sent ? <>
            <div className="auth-result-icon"><Mail size={30}/></div>
            <div className="auth-eyebrow">ONE STEP AWAY</div>
            <h1>Check your inbox.</h1>
            <p className="auth-intro">We've accepted your request. If this email is eligible, you'll receive a secure verification link. Follow it to activate your account and create your private business workspace.</p>
            <div className="auth-complete-panel"><CheckCircle2 size={22}/><div><strong>Verification requested</strong><span>Check your spam folder too. Links expire after 24 hours.</span></div></div>
            <Link className="auth-submit auth-return-button" to="/sign-in">Back to sign in <ArrowRight size={17}/></Link>
          </> : <>
            <div className="auth-eyebrow">JOIN THE NEXT GENERATION OF BUSINESS</div>
            <h1>Create your LEXA account.</h1>
            <p className="auth-intro">A beautifully organized business starts here. Verify your email to open your workspace.</p>
            <form className="auth-form" onSubmit={submit}>
              <div className="auth-field"><label htmlFor="signup-name">Full name <span>*</span></label><div className="auth-input-wrap"><UserRound size={17}/><input id="signup-name" required autoComplete="name" maxLength={100} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Your full name" /></div></div>
              <div className="auth-field"><label htmlFor="signup-business">Business name <span>*</span></label><div className="auth-input-wrap"><Building2 size={17}/><input id="signup-business" required maxLength={100} value={businessName} onChange={e=>setBusinessName(e.target.value)} placeholder="Your company or business" /></div></div>
              <div className="auth-field"><label htmlFor="signup-email">Business email <span>*</span></label><div className="auth-input-wrap"><Mail size={17}/><input id="signup-email" required type="email" autoComplete="email" inputMode="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@business.com" /></div></div>
              <PasswordField id="signup-password" label="Create password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="8 mixed characters" />
              <PasswordLengthGuide value={password} />
              <PasswordField id="signup-confirm" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="Repeat your password" />
              <TurnstileWidget onToken={setTurnstileToken} />
              {error && <div className="auth-error" role="alert">{error}</div>}
              <button className="auth-submit" type="submit" disabled={saving || (Boolean(publicTurnstileSiteKey) && !turnstileToken)}>{saving?'Sending verification link…':'Create my account'} <ArrowRight size={19}/></button>
            </form>
            <div className="auth-premium-switch">Already part of LEXA? <Link to="/sign-in">Sign in</Link></div>
          </>}
          <div className="auth-security-footnote"><ShieldCheck size={17}/><span>We verify your email first. Your password is never sent in email, and your business data stays private.</span></div>
        </div>
        <div className="auth-main-footer"><span>© {new Date().getFullYear()} LEXA</span><span>LEXA is a subsidiary of AMAAL GROUP.</span></div>
      </section>
    </main>
  );
}
