import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, KeyRound, LockKeyhole, ShieldCheck } from '../../components/LexaIcon';
import { apiPlatformAdministratorAuth as auth } from '../../data/remote/apiPlatformAdministration';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import './platform-administration.css';
export default function PlatformAdministratorRecoveryPage(){
  const [email,setEmail]=useState('');const [sent,setSent]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setError('');setBusy(true);
    try{await auth.recover(email.trim());setSent(true);}catch(e){setError(businessErrorMessage(e));}finally{setBusy(false);}}
  return <main className="lexa-admin-login lexa-admin-recovery">
    <div className="lexa-admin-login-orbit lexa-admin-login-orbit-a" aria-hidden="true"/>
    <div className="lexa-admin-login-orbit lexa-admin-login-orbit-b" aria-hidden="true"/>
    <section className="lexa-admin-login-card" aria-label="Recover private administrator password">
      <div className="lexa-admin-login-icon"><KeyRound size={28}/></div>
      <div className="lexa-admin-login-kicker">PRIVATE ADMINISTRATOR RECOVERY</div>
      <h1>Recover admin access</h1><p className="lexa-admin-login-description">Enter the email used to register your separate LEXA platform administrator account.</p>
      {sent?<div role="status" className="lexa-admin-login-status"><ShieldCheck size={20}/><p>If the account exists, a secure 30-minute recovery link has been emailed.</p></div>:<form className="lexa-admin-login-form" onSubmit={e=>void submit(e)}><label htmlFor="lexa-admin-recover-email">Administrator email</label><div className="lexa-admin-login-field"><LockKeyhole size={19}/><input id="lexa-admin-recover-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e=>setEmail(e.target.value)}/></div>{error&&<div role="alert" className="lexa-admin-login-error">{error}</div>}<button type="submit" disabled={busy||!email.trim()} className="lexa-admin-login-submit">{busy?'Requesting…':'Email recovery link'}</button></form>}
      <div className="lexa-admin-login-secure"><ShieldCheck size={17}/> One-time recovery link · All admin sessions revoked after reset</div>
      <div className="lexa-admin-login-bottom"><Link to="/platform-admin/login"><ArrowLeft size={15}/> Return to administrator sign-in</Link></div>
    </section>
  </main>;
}
