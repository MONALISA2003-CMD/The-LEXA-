import { validNewPassword, NEW_PASSWORD_RULE } from '../../domain/shared/newPasswordPolicy';

import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { apiAuth } from '../../data/remote/apiAuth';
import { businessErrorMessage } from '../../data/remote/businessMessages';
export default function ChangeInitialPasswordPage(){
  const navigate=useNavigate();
  const [current,setCurrent]=useState('');
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setError('');
    if(!validNewPassword(password)){setError(NEW_PASSWORD_RULE);return;}
    if(password!==confirmation){setError('The confirmation does not match.');return;}
    if(password===current){setError('Please choose a new password, different from the temporary password.');return;}
    setBusy(true);
    try{await apiAuth.changeInitialPassword(current,password);navigate('/onboarding',{replace:true})}
    catch(cause){setError(businessErrorMessage(cause))}
    finally{setBusy(false)}
  };
  return <main className="bs-shell" style={{minHeight:'100vh',padding:'32px 14px'}}>
    <section className="bs-card" style={{maxWidth:540,margin:'auto'}}>
      <ShieldCheck size={32} color="#075cf5"/>
      <span className="eyebrow eyebrow-blue">SECURE EMPLOYEE SIGN-IN</span>
      <h1>Create your private password</h1>
      <p>Your CEO issued a temporary password. Replace it before accessing your business records. Neither your CEO nor LEXA can view the new password.</p>
      <form className="bs-form" onSubmit={submit}>
        <label>Temporary password<input type="password" autoComplete="current-password" required value={current} onChange={e=>setCurrent(e.target.value)}/></label>
        <label>New personal password<input type="password" autoComplete="new-password" minLength={8} maxLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} maxLength={8} required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
        {error&&<div className="bs-error" role="alert">{error}</div>}
        <button className="button button-primary" disabled={busy} type="submit"><KeyRound size={16}/>{busy?'Saving securely…':'Secure my account'}</button>
      </form>
      <Link to="/sign-in" className="button button-secondary">Sign in with another account</Link>
    </section>
  </main>;
}

