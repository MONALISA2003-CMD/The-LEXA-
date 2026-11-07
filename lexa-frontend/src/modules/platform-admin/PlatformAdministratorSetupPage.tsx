import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CheckCircle2, LockKeyhole, ShieldCheck, Sparkles } from '../../components/LexaIcon';
import { apiPlatformAdministratorAuth as auth } from '../../data/remote/apiPlatformAdministration';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import './platform-administration.css';
/** One-time emailed founder/invitation registration: no customer account required. */
export default function PlatformAdministratorSetupPage(){
  const [params]=useSearchParams(),navigate=useNavigate();
  const token=params.get('token')??'';
  const [name,setName]=useState('');const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [completed,setCompleted]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setError('');
    if(password!==confirm){setError('Passwords do not match.');return;}
    if(password.length<12){setError('Use a unique passphrase of at least 12 characters.');return;}
    setBusy(true);
    try{await auth.register(token,email.trim(),name.trim(),password);setCompleted(true);setPassword('');setConfirm('');}
    catch(e){setError(businessErrorMessage(e));}finally{setBusy(false);}}
  return <main className="lexa-admin-login lexa-admin-recovery">
    <div className="lexa-admin-login-orbit lexa-admin-login-orbit-a" aria-hidden="true"/>
    <section className="lexa-admin-login-card" aria-label="Create a private LEXA administrator account">
      <div className="lexa-admin-login-icon"><Sparkles size={28}/></div>
      <div className="lexa-admin-login-kicker">INVITATION-ONLY ADMINISTRATOR SETUP</div>
      <h1>Create your admin account</h1>
      {completed?<div className="lexa-admin-login-status" role="status"><CheckCircle2 size={24}/><p>Your separate administrator account is ready. Use its private password to sign in to the yellow Control Centre.</p><button className="lexa-admin-login-submit" onClick={()=>navigate('/platform-admin/login',{replace:true})}>Go to administrator sign-in</button></div>:<>
        <p className="lexa-admin-login-description">Only invited people can register. This account is separate from your business workspace and never changes your existing LEXA business profile.</p>
        {!token?<p role="alert">This invitation link is missing or invalid. Ask a Super Admin to invite you again.</p>:<form className="lexa-admin-login-form" onSubmit={e=>void submit(e)}>
          <label htmlFor="admin-name">Your full name</label><div className="lexa-admin-login-field"><ShieldCheck size={18}/><input id="admin-name" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={100} required autoComplete="name"/></div>
          <label htmlFor="admin-email">Invited email address</label><div className="lexa-admin-login-field"><ShieldCheck size={18}/><input id="admin-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} required autoComplete="email"/></div>
          <label htmlFor="admin-password">Create a private admin password (12+ characters)</label><div className="lexa-admin-login-field"><LockKeyhole size={18}/><input id="admin-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" minLength={12} required/></div>
          <label htmlFor="admin-confirm">Confirm new password</label><div className="lexa-admin-login-field"><LockKeyhole size={18}/><input id="admin-confirm" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" minLength={12} required/></div>
          {error&&<div role="alert" className="lexa-admin-login-error">{error}</div>}
          <button type="submit" className="lexa-admin-login-submit" disabled={busy||!name.trim()||!email.trim()||password.length<12||password!==confirm}>{busy?'Creating administrator…':'Activate my administrator account'}</button>
        </form>}
      </>}
      <div className="lexa-admin-login-bottom"><Link to="/platform-admin/login">Administrator sign-in</Link></div>
    </section>
  </main>;
}
