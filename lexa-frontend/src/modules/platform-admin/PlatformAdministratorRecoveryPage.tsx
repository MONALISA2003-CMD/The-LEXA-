import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { apiAuth } from '../../data/remote/apiAuth';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import './platform-administration.css';

/**
 * Administrator recovery uses the same expiring one-time reset API as LEXA users.
 * No emergency admin password, account-enumeration endpoint or bypass of MFA.
 */
export default function PlatformAdministratorRecoveryPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await apiAuth.requestPasswordReset(email.trim());
      setSent(true);
    } catch (cause) {
      setError(businessErrorMessage(cause));
    } finally { setBusy(false); }
  }

  return <main className="lexa-admin-login lexa-admin-recovery">
    <div className="lexa-admin-login-orbit lexa-admin-login-orbit-a" aria-hidden="true"/>
    <div className="lexa-admin-login-orbit lexa-admin-login-orbit-b" aria-hidden="true"/>
    <section className="lexa-admin-login-card" aria-label="Recover platform administrator password">
      <div className="lexa-admin-login-icon"><KeyRound size={28}/></div>
      <div className="lexa-admin-login-kicker">SECURE ACCOUNT RECOVERY</div>
      <h1>Recover administrator access</h1>
      <p className="lexa-admin-login-description">Use the verified email address linked to your LEXA account. Password recovery does not bypass your authenticator or grant platform privileges.</p>
      {sent ? <div role="status" className="lexa-admin-login-status">
        <ShieldCheck size={20}/>
        <p>If that address is registered and delivery is available, a time-limited recovery link will arrive by email. Follow it to reset the password, then return to administrator sign-in.</p>
      </div> : <form className="lexa-admin-login-form" onSubmit={event=>void submit(event)}>
        <label htmlFor="lexa-admin-recovery-email">Registered administrator email</label>
        <div className="lexa-admin-login-field"><LockKeyhole size={19}/><input id="lexa-admin-recovery-email" type="email" required autoComplete="email" maxLength={254} placeholder="you@example.com" value={email} onChange={event=>setEmail(event.target.value)}/></div>
        {error && <div role="alert" className="lexa-admin-login-error">{error}</div>}
        <button type="submit" disabled={busy||!email.trim()} className="lexa-admin-login-submit">{busy?'Requesting recovery…':'Email secure recovery link'}</button>
      </form>}
      <div className="lexa-admin-login-secure"><ShieldCheck size={17}/> Recovery tokens expire after 30 minutes; existing sessions are revoked after a successful reset.</div>
      <div className="lexa-admin-login-bottom"><Link to="/platform-admin/login"><ArrowLeft size={15}/> Back to administrator sign-in</Link></div>
      <p className="lexa-admin-recovery-note">Lost your authenticator as well? Use a previously issued recovery code. If no code is available, contact an authorized platform administrator for a verified account-recovery procedure.</p>
    </section>
  </main>;
}
