import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiAuth } from '../../data/remote/apiAuth';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import { isDemoDeployment } from '../../data/remote/apiDemo';
import { isApiProvider } from '../../data/remote/runtimeConfig';

/** Account closure is separate from deleting a business. Historical ledgers are retained. */
export default function AccountClosurePanel() {
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [acknowledge, setAcknowledge] = useState(false);
  const [busy, setBusy] = useState(false);
  const session = useQuery({queryKey:['account-closure-session'],queryFn:apiAuth.getSession,enabled:expanded&&isApiProvider&&!isDemoDeployment,retry:1});
  const security = useQuery({queryKey:['account-closure-mfa'],queryFn:apiAuth.security,enabled:expanded&&isApiProvider&&!isDemoDeployment,retry:1});
  const isOwner = Boolean(session.data?.roles.some(role=>role==='owner'||role==='owner_administrator'));
  const ready = session.data && !isOwner && email.trim().toLowerCase()===session.data.user.email.toLowerCase() && password.length>0 && reason.trim().length>=10 && reason.trim().length<=500 && confirmation==='DELETE MY ACCOUNT' && acknowledge && (!security.data?.mfa.enabled || code.trim().length>0);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      await apiAuth.closePersonalAccount({email:email.trim().toLowerCase(),password,reason:reason.trim(),...(code.trim() ? { code: code.trim() } : {}),confirmation,acknowledgeRetention:acknowledge});
      setPassword(''); setCode('');
      toast.success('Your LEXA sign-in is closed.');
      window.location.assign('/sign-in?account=closed');
    } catch(error) {
      toast.error('Account could not be closed',{description:businessErrorMessage(error)});
      setBusy(false);
    }
  }
  return <section className="account-closure-panel" aria-label="Close personal account">
    <div className="account-closure-heading"><div><span className="account-closure-tag">PERSONAL ACCOUNT</span><h3>Delete my account</h3><p>End your LEXA login and revoke every signed-in session. Business invoices, financial history and required audit records are kept.</p></div>
      <button className="button button-secondary" type="button" onClick={()=>{if(expanded){setPassword('');setCode('');setConfirmation('');setAcknowledge(false);}setExpanded(value=>!value);}} aria-expanded={expanded}>{expanded?'Cancel':'Review deletion requirements'}</button>
    </div>
    {expanded && <div className="account-closure-body">
      {!isApiProvider || isDemoDeployment ? <p role="note">A temporary demo or device-only workspace has no permanent online account to delete.</p> : <>
        {session.isLoading && <p role="status">Checking your account…</p>}
        {session.isError && <p role="alert">{businessErrorMessage(session.error)} <button className="button button-secondary" onClick={()=>void session.refetch()}>Try again</button></p>}
        {isOwner && <div className="account-closure-warning" role="alert"><strong>Business ownership must be transferred first.</strong><p>You are an owner on at least one business. Arrange a transfer to another authorized owner before closing this login. We will not abandon your company's records or employees.</p></div>}
        <p className="account-closure-disclosure"><strong>What stays:</strong> posted invoices, journal entries, stock history, transaction authorship and other records required for business operations or retention. This closes sign-in access; it is not a deletion of the business or its accounting records.</p>
        <form className="account-closure-form" onSubmit={e=>void submit(e)}>
          <label>Registered email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder={session.data?.user.email || 'Email on your account'}/></label>
          <label>Current password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
          {security.data?.mfa.enabled && <label>Authenticator or recovery code<input type="text" autoComplete="one-time-code" inputMode="numeric" required value={code} onChange={e=>setCode(e.target.value.trim())}/></label>}
          <label>Why are you leaving? <small>(10–500 characters)</small><textarea rows={3} minLength={10} maxLength={500} required value={reason} onChange={e=>setReason(e.target.value)} placeholder="Tell us why you want to close this login."/></label>
          <label>Type DELETE MY ACCOUNT<input type="text" autoComplete="off" required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
          <label className="account-closure-checkbox"><input type="checkbox" checked={acknowledge} onChange={e=>setAcknowledge(e.target.checked)}/><span>I understand that sign-in ends now, all sessions will be revoked, and historical business records are retained.</span></label>
          <button className="account-closure-submit" type="submit" disabled={!ready||busy||security.isLoading||security.isError}>{busy?'Closing account…':'Confirm and close my account'}</button>
        </form>
      </>}
    </div>}
  </section>;
}
