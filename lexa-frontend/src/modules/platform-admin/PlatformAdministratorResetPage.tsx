import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { KeyRound, LockKeyhole, ShieldCheck } from '../../components/LexaIcon';
import { apiPlatformAdministratorAuth as auth } from '../../data/remote/apiPlatformAdministration';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import './platform-administration.css';
export default function PlatformAdministratorResetPage(){
  const [params]=useSearchParams(),token=params.get('token')??'';
  const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');
  const [done,setDone]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setError('');
    if(password!==confirm){setError('Passwords do not match.');return;}
    setBusy(true);try{await auth.reset(token,password);setDone(true);setPassword('');setConfirm('');}
    catch(err){setError(businessErrorMessage(err));}finally{setBusy(false);}}
  return <main className="lexa-admin-login lexa-admin-recovery"><div className="lexa-admin-login-orbit lexa-admin-login-orbit-a" aria-hidden="true"/>
    <section className="lexa-admin-login-card"><div className="lexa-admin-login-icon"><KeyRound size={28}/></div><div className="lexa-admin-login-kicker">PRIVATE PASSWORD RECOVERY</div><h1>Reset your administrator password</h1>
    {done?<div role="status" className="lexa-admin-login-status"><ShieldCheck size={22}/><p>Your password is updated and old administrator sessions are signed out.</p><Link to="/platform-admin/login">Sign in to Control Centre</Link></div>:!token?<p role="alert">Recovery link missing. Request a new one.</p>:<form className="lexa-admin-login-form" onSubmit={e=>void submit(e)}><label htmlFor="admin-reset-pass">New administrator password (12+ characters)</label><div className="lexa-admin-login-field"><LockKeyhole size={18}/><input id="admin-reset-pass" type="password" minLength={12} required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></div><label htmlFor="admin-reset-confirm">Confirm new password</label><div className="lexa-admin-login-field"><LockKeyhole size={18}/><input id="admin-reset-confirm" type="password" minLength={12} required autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></div>{error&&<div className="lexa-admin-login-error" role="alert">{error}</div>}<button className="lexa-admin-login-submit" disabled={busy||password.length<12||password!==confirm}>{busy?'Updating…':'Reset administrator password'}</button></form>}
    <div className="lexa-admin-login-bottom"><Link to="/platform-admin/login">Administrator sign-in</Link></div></section></main>;
}
