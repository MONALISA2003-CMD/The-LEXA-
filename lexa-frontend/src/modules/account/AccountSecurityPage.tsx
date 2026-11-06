import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, KeyRound, Laptop2, LockKeyhole, ShieldCheck, ShieldX, Smartphone, Trash2 } from 'lucide-react';
import { apiAuth, type AccountSecurity } from '../../data/remote/apiAuth';
import { businessErrorMessage } from '../../data/remote/businessMessages';
import './account-security.css';
type AuthenticatorSetup = {
    secret: string;
    uri: string;
    expiresInSeconds: number;
};
const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const eventLabel = (event: string) => ({
    login_verified: 'Sign-in verified', login_succeeded: 'Sign-in completed', login_verification_requested: 'Verification requested',
    provisioning_browser_registered: 'Initial browser registered', browser_revoked: 'Browser removed',
    session_revoked: 'Session ended', other_sessions_revoked: 'Other sessions ended',
    authenticator_enabled: 'Authenticator enabled', authenticator_disabled: 'Authenticator disabled',
    recovery_codes_regenerated: 'Recovery codes replaced',
} as Record<string, string>)[event] ?? event.replaceAll('_', ' ');
export default function AccountSecurityPage() {
    const client = useQueryClient();
    const security = useQuery({ queryKey: ['account-security'], queryFn: () => apiAuth.security(), staleTime: 15000, refetchOnWindowFocus: true });
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [setup, setSetup] = useState<AuthenticatorSetup | null>(null);
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [operation, setOperation] = useState('');
    async function run(label: string, work: () => Promise<unknown>, success: string) {
        if (busy)
            return;
        setBusy(true);
        setOperation(label);
        try {
            await work();
            await client.invalidateQueries({ queryKey: ['account-security'] });
            toast.success(success);
        }
        catch (error) {
            toast.error('Security change was not completed', { description: businessErrorMessage(error) });
        }
        finally {
            setBusy(false);
            setOperation('');
        }
    }
    async function begin(event: FormEvent) {
        event.preventDefault();
        await run('setup', async () => { const next = await apiAuth.beginAuthenticator(password); setSetup(next); setCode(''); }, 'Authenticator setup started. Enter the code from your app to finish.');
    }
    async function confirm(event: FormEvent) {
        event.preventDefault();
        await run('confirm', async () => {
            const result = await apiAuth.confirmAuthenticator(code.trim());
            setRecoveryCodes(result.recoveryCodes);
            setSetup(null);
            setCode('');
            setPassword('');
        }, 'Authenticator verification enabled. Save your recovery codes now.');
    }
    async function disable() {
        if (!window.confirm('Disable authenticator verification for this account?'))
            return;
        await run('disable', async () => { await apiAuth.disableAuthenticator(password, code.trim()); setPassword(''); setCode(''); setRecoveryCodes([]); }, 'Authenticator verification disabled.');
    }
    async function replaceCodes(event: FormEvent) {
        event.preventDefault();
        if (!window.confirm('Replace your existing recovery codes? Old codes will stop working.'))
            return;
        await run('replace', async () => { const response = await apiAuth.replaceRecoveryCodes(password, code.trim()); setRecoveryCodes(response.recoveryCodes); setCode(''); setPassword(''); }, 'Recovery codes replaced. Save the new codes now.');
    }
    async function revokeSession(id: string, current: boolean) {
        if (!password) {
            toast.error('Enter your current password first.');
            return;
        }
        if (!window.confirm('End this sign-in session?'))
            return;
        await run(`session-${id}`, async () => { await apiAuth.revokeSession(id, password); if (current)
            window.location.assign('/sign-in'); }, 'Session ended.');
    }
    async function revokeBrowser(id: string, current: boolean) {
        if (!password) {
            toast.error('Enter your current password first.');
            return;
        }
        if (!window.confirm('Remove this trusted browser and end its sessions?'))
            return;
        await run(`device-${id}`, async () => { await apiAuth.revokeBrowser(id, password); if (current)
            window.location.assign('/sign-in'); }, 'Browser removed.');
    }
    async function endOtherSessions() {
        if (!password) {
            toast.error('Enter your current password first.');
            return;
        }
        if (!window.confirm('Sign out your account on every other browser?'))
            return;
        await run('other-sessions', async () => { await apiAuth.revokeOtherSessions(password); setPassword(''); }, 'Other sessions ended.');
    }
    const info: AccountSecurity | undefined = security.data;
    return <main className="account-security-page page-stack">
    <header className="account-security-heading"><div><span className="account-security-eyebrow"><ShieldCheck size={16}/> ACCOUNT PROTECTION</span><h1>Sign-in and security</h1><p>Manage authenticator verification, trusted browsers, and current sign-in sessions.</p></div><Link to="/settings/privacy" className="button button-secondary">Privacy preferences</Link></header>
    {security.isPending && <p role="status">Loading account security…</p>}
    {security.isError && <div className="account-security-error" role="alert">{businessErrorMessage(security.error)} <button type="button" onClick={() => void security.refetch()}>Try again</button></div>}
    {info && <>
      <section className="section-card account-security-section"><div className="account-security-title"><KeyRound size={22}/><div><h2>Authenticator app</h2><p>Use a six-digit code from your authenticator when signing in. Recovery codes are for when you cannot access the app.</p></div></div>
        <p className="account-security-status">{info.mfa.enabled ? <><CheckCircle2 size={17}/> Enabled · {info.mfa.recoveryCodesRemaining} recovery codes remaining</> : <><ShieldX size={17}/> Not configured</>}</p>
        {!info.mfa.enabled && !setup && <form onSubmit={begin} className="account-security-form"><label>Current password<input autoComplete="current-password" type="password" minLength={1} required value={password} onChange={event => setPassword(event.target.value)}/></label><button className="button button-primary" type="submit" disabled={busy}>Set up authenticator</button></form>}
        {setup && <form onSubmit={confirm} className="account-security-form"><div className="account-security-guidance"><strong>1. Add LEXA to your authenticator app</strong><p>Enter this private setup key into your app. Do not share it or enter it into a website other than LEXA.</p><code className="account-security-secret">{setup.secret}</code><p>Setup expires after 10 minutes. The key will disappear when you finish or leave this page.</p></div><label>2. Six-digit authenticator code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.trim())}/></label><div className="account-security-actions"><button className="button button-primary" type="submit" disabled={busy}>Confirm authenticator</button><button className="button button-secondary" type="button" onClick={() => { setSetup(null); setCode(''); }}>Cancel</button></div></form>}
        {info.mfa.enabled && <div className="account-security-protected-actions"><form onSubmit={replaceCodes} className="account-security-form"><h3>Manage authenticator verification</h3><p>Enter your current password and a fresh authenticator code to replace recovery codes. To disable verification, you may also enter an unused recovery code.</p><label>Current password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)}/></label><label>Authenticator or recovery code<input autoComplete="one-time-code" maxLength={20} required value={code} onChange={event => setCode(event.target.value.trim())}/></label><div className="account-security-actions"><button className="button button-secondary" disabled={busy} type="submit">Replace recovery codes</button><button className="button button-secondary" disabled={busy || !password || !code} type="button" onClick={() => void disable()}>Disable authenticator</button></div></form></div>}

        {recoveryCodes.length > 0 && <div className="account-security-recovery" role="status"><strong>Store these recovery codes somewhere private</strong><p>Each code works only once. This is the only time they will be displayed.</p><div className="account-security-code-grid">{recoveryCodes.map(value => <code key={value}>{value}</code>)}</div><button className="button button-secondary" type="button" onClick={() => { void navigator.clipboard.writeText(recoveryCodes.join('\n')).then(() => toast.success('Recovery codes copied')).catch(() => toast.error('Could not copy codes. Save them manually.')); }}>Copy codes</button><button className="button button-secondary" type="button" onClick={() => setRecoveryCodes([])}>I have saved these codes</button></div>}
      </section>
      <section className="section-card account-security-section"><div className="account-security-title"><LockKeyhole size={22}/><div><h2>Confirm sensitive changes</h2><p>Your password is required before removing browsers or ending sessions. It is not stored on this device.</p></div></div><label className="account-security-password">Current password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/></label><button className="button button-secondary" type="button" disabled={busy || !password} onClick={() => void endOtherSessions()}>End other sessions</button></section>
      <section className="section-card account-security-section"><div className="account-security-title"><Laptop2 size={22}/><div><h2>Trusted browsers</h2><p>A trusted browser can be revoked at any time. A future sign-in from that browser may require additional verification.</p></div></div><div className="account-security-list">{info.devices.length === 0 && <p>No trusted browsers are recorded.</p>}{info.devices.map(item => <div className="account-security-item" key={item.id}><Smartphone size={20}/><div><strong>{item.label}{item.current ? ' · This browser' : ''}</strong><small>Last verified {date(item.lastSeenAt)} · Expires {date(item.expiresAt)} {item.revokedAt ? `· Removed ${date(item.revokedAt)}` : ''}</small></div>{!item.revokedAt && <button className="button button-secondary" type="button" disabled={busy || !password} aria-label={`Remove ${item.label}`} onClick={() => void revokeBrowser(item.id, item.current)}><Trash2 size={16}/> Remove</button>}</div>)}</div></section>
      <section className="section-card account-security-section"><div className="account-security-title"><ShieldCheck size={22}/><div><h2>Active sessions</h2><p>Only sessions that have not expired are listed.</p></div></div><div className="account-security-list">{info.sessions.map(item => <div className="account-security-item" key={item.id}><Laptop2 size={20}/><div><strong>{item.current ? 'This session' : 'Other session'}</strong><small>Signed in {date(item.createdAt)} · Expires {date(item.expiresAt)}</small></div><button className="button button-secondary" type="button" disabled={busy || !password} onClick={() => void revokeSession(item.id, item.current)}>End session</button></div>)}</div></section>
      <section className="section-card account-security-section"><h2>Recent account security activity</h2><div className="account-security-list">{info.events.length === 0 && <p>No security events recorded.</p>}{info.events.map(item => <div className="account-security-item" key={item.id}><ShieldCheck size={18}/><div><strong>{eventLabel(item.type)}</strong><small>{date(item.createdAt)}{item.deviceLabel ? ` · ${item.deviceLabel}` : ''}</small></div></div>)}</div></section>
    </>}
    {operation && <span role="status" className="account-security-working">Updating {operation}…</span>}
  </main>;
}
