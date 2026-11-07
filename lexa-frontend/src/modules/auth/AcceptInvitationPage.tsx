import { validNewPassword, NEW_PASSWORD_RULE } from '../../domain/shared/newPasswordPolicy';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, LoaderCircle, Mail, ShieldCheck, UserRound } from '../../components/LexaIcon';
import { apiAuth, type InvitationPreview } from '../../data/remote/apiAuth';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import { PasswordField, PasswordLengthGuide } from './AuthFields';

export default function AcceptInvitationPage() {
  const [invitation] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return { workspaceId: q.get('workspaceId')||'', invitationId: q.get('invitationId')||'', token: q.get('token')||'' };
  });
  const [preview, setPreview] = useState<InvitationPreview|null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const once = useRef(false);
  const navigate = useNavigate();
  useEffect(()=>{
    if (once.current) return; once.current=true;
    // Keep the bearer invitation token out of browser history and referrer headers.
    window.history.replaceState({},document.title,'/accept-invitation');
    if (!invitation.workspaceId || !invitation.invitationId || !invitation.token) { setError('The invitation link is incomplete.'); setLoading(false); return; }
    void apiAuth.previewInvitation(invitation).then(setPreview).catch(cause=>setError(businessErrorMessage(cause))).finally(()=>setLoading(false));
  },[invitation]);
  async function accept(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');
    if(!validNewPassword(password)){setError(NEW_PASSWORD_RULE);return;}
    if(password!==confirmPassword){setError('The passwords do not match.');return;}
    setSaving(true);
    try{await apiAuth.joinInvitation({...invitation,displayName,password});navigate('/workspace',{replace:true});}
    catch(cause){setError(businessErrorMessage(cause));}finally{setSaving(false)}
  }
  async function acceptExisting(){
    setError('');setSaving(true);
    try{
      const session=await apiAuth.getSession();
      if(session.user.email.toLowerCase()!==preview?.email.toLowerCase()){setError(`Sign in with ${preview?.email} to accept this invitation.`);return;}
      await apiAuth.acceptExistingInvitation(invitation);
      navigate('/workspace',{replace:true});
    }catch(cause){setError(businessErrorMessage(cause));}finally{setSaving(false)}
  }
  // Existing-account sign-in navigation needs to preserve the invitation token in memory.
  // It is passed through React Router navigation state rather than localStorage.
  const returnTo=`/accept-invitation?workspaceId=${encodeURIComponent(invitation.workspaceId)}&invitationId=${encodeURIComponent(invitation.invitationId)}&token=${encodeURIComponent(invitation.token)}`;
  return <main className="auth-simple-page"><section className="auth-simple-card auth-invite-card">
    <img src="/lexa-master-lockup.png" alt="LEXA" className="auth-simple-logo"/>
    <div className="auth-result-icon"><Building2 size={28}/></div>
    <div className="auth-eyebrow">YOU'RE INVITED</div>
    <h1>Work better, together.</h1>
    {loading?<p><LoaderCircle className="auth-spin" size={17}/> Checking your secure invitation…</p>:preview?<>
      <p>Join <strong>{preview.businessName}</strong> as <strong>{preview.role.replace(/_/g,' ')}</strong>.</p>
      <div className="auth-invite-email"><Mail size={17}/><span>{preview.email}</span><CheckCircle2 size={17}/></div>
      {preview.existingAccount?<>
        <p className="auth-invite-small">You already have a LEXA account. Sign in with your invited email, then accept your role.</p>
        <button className="auth-submit" type="button" onClick={()=>void acceptExisting()} disabled={saving}>{saving?'Joining business…':'Accept invitation'}<ArrowRight size={18}/></button>
        <Link className="auth-back-link auth-invite-signin" to="/sign-in" state={{returnTo}}>Sign in to your account <ArrowRight size={15}/></Link>
      </>:<form className="auth-form" onSubmit={accept}>
        <div className="auth-field"><label htmlFor="invite-name">Your full name <span>*</span></label><div className="auth-input-wrap"><UserRound size={17}/><input id="invite-name" autoComplete="name" maxLength={100} required value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Your full name" /></div></div>
        <PasswordField id="invite-password" label="Create your password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="8 mixed characters" />
        <PasswordLengthGuide value={password}/>
        <PasswordField id="invite-confirm" label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="Repeat your password" />
        <button className="auth-submit" type="submit" disabled={saving}>{saving?'Creating your account…':'Join business securely'}<ArrowRight size={18}/></button>
      </form>}
    </>:null}
    {error&&<div role="alert" className="auth-error">{error}</div>}
    <Link className="auth-back-link auth-invite-signin" to="/sign-in"><ArrowLeft size={15}/> Back to sign in</Link>
    <div className="auth-simple-security"><ShieldCheck size={16}/> Invitation-only access. Your business data stays private.</div>
  </section></main>;
}
