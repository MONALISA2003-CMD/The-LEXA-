import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles } from '../../components/LexaIcon';
import { apiPlatformAdministratorAuth as auth } from '../../data/remote/apiPlatformAdministration';
import { platformAdministratorErrorMessage } from '../../data/remote/businessMessages';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import TurnstileWidget, { publicTurnstileSiteKey } from '../auth/TurnstileWidget';
import './platform-administration.css';

/** Independent administrator sign-in; customer logins cannot open this console. */
export default function PlatformAdministratorLoginPage(){
  const navigate=useNavigate();
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [token,setToken]=useState<string|null>(null);
  const [tokenRevision,setTokenRevision]=useState(0);
  const [checking,setChecking]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [supportReference,setSupportReference]=useState('');
  const [bootstrapAvailable,setBootstrapAvailable]=useState(false);
  const [inviteRequested,setInviteRequested]=useState(false);
  useEffect(()=>{
    let active=true;
    if(!isApiProvider){setChecking(false);return;}
    void Promise.allSettled([auth.session(),auth.bootstrap()]).then(results=>{
      if(!active)return;
      if(results[0].status==='fulfilled')navigate('/platform-admin',{replace:true});
      if(results[1].status==='fulfilled')setBootstrapAvailable(results[1].value.firstAdministratorSetupAvailable);
    }).finally(()=>{if(active)setChecking(false);});
    return()=>{active=false;};
  },[navigate]);
  async function signIn(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');setSupportReference('');
    if(!isApiProvider){setError('Secure administrator sign-in is unavailable in this environment.');return;}
    if(publicTurnstileSiteKey&&!token){setError('Complete the security verification first.');return;}
    setBusy(true);
    try{await auth.login(email.trim(),password,token??undefined);setPassword('');navigate('/platform-admin',{replace:true});}
    catch(e){setError(platformAdministratorErrorMessage(e));setSupportReference(e&&typeof e==='object'&&'requestId' in e&&typeof e.requestId==='string'?e.requestId:'');setToken(null);setTokenRevision(n=>n+1);}
    finally{setBusy(false);}
  }
  async function requestFounder(){
    setError('');setSupportReference('');setBusy(true);
    try{await auth.requestFounder();setInviteRequested(true);}
    catch(e){setError(platformAdministratorErrorMessage(e));setSupportReference(e&&typeof e==='object'&&'requestId' in e&&typeof e.requestId==='string'?e.requestId:'');}finally{setBusy(false);}
  }
  return <main className="lexa-admin-login">
    <div className="lexa-admin-login-orbit lexa-admin-login-orbit-a" aria-hidden="true"/>
    <div className="lexa-admin-login-orbit lexa-admin-login-orbit-b" aria-hidden="true"/>
    <div className="lexa-admin-login-orbit lexa-admin-login-orbit-c" aria-hidden="true"/>
    <div className="lexa-admin-login-layout">
      <section className="lexa-admin-login-intro">
        <div className="lexa-admin-login-wordmark"><img src="/lexa-master-lockup.png" alt="LEXA"/><span>PRIVATE PLATFORM ADMINISTRATION</span></div>
        <div className="lexa-admin-login-eyebrow"><Sparkles size={17}/> THE YELLOW COMMAND CENTRE</div>
        <h1>Your platform. <em>Your command.</em></h1>
        <p>Private administration for up to five people. Dedicated admin credentials, verified payment activation, business oversight and operational intelligence.</p>
        <div className="lexa-admin-login-capabilities">
          <div><span>01</span><strong>Private admin accounts</strong><small>Separate from customer registrations</small></div>
          <div><span>02</span><strong>Invitation-only access</strong><small>Two Super Admins supported</small></div>
          <div><span>03</span><strong>Safe activation</strong><small>UGX 50,000 per 30 days</small></div>
        </div>
      </section>
      <section className="lexa-admin-login-card" aria-label="Secure LEXA administrator sign-in">
        <div className="lexa-admin-login-icon"><LockKeyhole size={26}/></div>
        <div className="lexa-admin-login-kicker">PRIVATE PLATFORM ENTRY</div>
        <h2>Administrator sign-in</h2>
        <p className="lexa-admin-login-description">Use the password you created through your private admin invitation. This login is separate from your LEXA business account.</p>
        {checking?<div role="status" className="lexa-admin-login-status">Checking secure administrator access…</div>:<>
          <form className="lexa-admin-login-form" onSubmit={e=>void signIn(e)}>
            <label htmlFor="lexa-admin-email">Administrator email</label>
            <div className="lexa-admin-login-field"><ShieldCheck size={19}/><input id="lexa-admin-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Your administrator email" autoComplete="username" required maxLength={254}/></div>
            <div className="lexa-admin-login-form-row"><label htmlFor="lexa-admin-password">Administrator password</label><Link to="/platform-admin/recover">Forgot password?</Link></div>
            <div className="lexa-admin-login-field"><LockKeyhole size={19}/><input id="lexa-admin-password" type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your private admin password" autoComplete="current-password" required/><button type="button" aria-label={showPassword?'Hide password':'Show password'} className="lexa-admin-login-eye" onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
            <TurnstileWidget key={tokenRevision} action="login" onToken={setToken}/>
            {error&&<div className="lexa-admin-login-error" role="alert">{error}{supportReference&&<small className="lexa-login-support-reference">Support reference: {supportReference}</small>}</div>}
            <button type="submit" disabled={busy||!isApiProvider||(Boolean(publicTurnstileSiteKey)&&!token)} className="lexa-admin-login-submit">{busy?'Signing in…':'Enter Control Centre'} <ArrowRight size={18}/></button>
          </form>
          {bootstrapAvailable&&<div className="lexa-admin-founder-start">
            <strong>First-time setup</strong>
            <p>Developer: activate the first Super Admin by receiving a private 30-minute invitation at your designated email address. No Neon setup required.</p>
            {inviteRequested?<div role="status">Invitation requested. Check your developer email, including spam.</div>:<button type="button" disabled={busy} onClick={()=>void requestFounder()}>Email my administrator setup link</button>}
          </div>}
        </>}
        <div className="lexa-admin-login-secure"><ShieldCheck size={17}/> Invitation-only access · Up to five administrators · MFA can be introduced later</div>
        <div className="lexa-admin-login-bottom"><Link to="/lexa">LEXA website</Link><span>Private administration portal</span></div>
      </section>
    </div>
    <footer className="lexa-admin-login-footer">LEXA is a subsidiary of AMAAL GROUP. · © {new Date().getFullYear()} LEXA</footer>
  </main>;
}
