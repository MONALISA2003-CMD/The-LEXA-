import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, LockKeyhole, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '../../data/remote/apiClient';
import { PasswordField, PasswordLengthGuide } from '../auth/AuthFields';

type RecoveryState = 'checking' | 'available' | 'unavailable';

export default function SecurityPanel() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking');

  useEffect(() => {
    let active = true;
    void apiClient.get<{ available?: boolean }>('/auth/recovery/status')
      .then((result) => { if (active) setRecoveryState(result?.available === true ? 'available' : 'unavailable'); })
      .catch(() => { if (active) setRecoveryState('unavailable'); });
    return () => { active = false; };
  }, []);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Array.from(newPassword.normalize('NFKC')).length < 15) {
      toast.error('Use at least 15 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('The new passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/auth/password/change', { currentPassword, newPassword });
      apiClient.clearCsrfToken();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated. Other active sessions have been signed out.');
    } catch (error) {
      toast.error('Password was not changed', { description: error instanceof Error ? error.message : 'Check your current password and try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="section-card security-card" aria-labelledby="account-security-heading">
      <div className="section-card-heading">
        <div className="heading-icon green-icon"><ShieldCheck size={18} /></div>
        <div>
          <h3 id="account-security-heading">Account security</h3>
          <p>Protect access to your account and manage your password.</p>
        </div>
      </div>

      <div className="security-status-grid">
        <div className="security-status-item">
          <span className="security-status-icon"><LockKeyhole size={17} /></span>
          <div><strong>Secure sign-in session</strong><span>Session cookies are HttpOnly, Secure and issued by the backend.</span></div>
          <CheckCircle2 className="security-status-check" size={17} />
        </div>
        <div className="security-status-item">
          <span className="security-status-icon"><KeyRound size={17} /></span>
          <div><strong>Password recovery</strong><span>{recoveryState === 'checking' ? 'Checking email delivery…' : recoveryState === 'available' ? 'Recovery email delivery is configured.' : 'Email recovery needs an administrator to configure a sender.'}</span></div>
          {recoveryState === 'available' ? <CheckCircle2 className="security-status-check" size={17} /> : recoveryState === 'unavailable' ? <ShieldOff className="security-status-muted" size={17} /> : <span className="security-status-pending" />}
        </div>
        <div className="security-status-item">
          <span className="security-status-icon"><ShieldOff size={17} /></span>
          <div><strong>Multi-factor verification</strong><span>Not enabled yet. LEXA currently uses password sign-in and secure server sessions.</span></div>
          <ShieldOff className="security-status-muted" size={17} />
        </div>
      </div>

      <form className="security-password-form" onSubmit={changePassword}>
        <div className="security-form-heading"><div><strong>Change password</strong><span>Use a unique passphrase that you do not use on another service.</span></div></div>
        <PasswordField id="security-current-password" label="Current password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" placeholder="Enter your current password" />
        <div className="security-new-password-grid">
          <div>
            <PasswordField id="security-new-password" label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" placeholder="Create a new passphrase" />
            <PasswordLengthGuide value={newPassword} />
          </div>
          <PasswordField id="security-confirm-password" label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="Enter it again" />
        </div>
        <div className="security-form-footer">
          <p><ShieldCheck size={15} /> Changing your password signs out your other active sessions. This device remains signed in.</p>
          <button className="button button-primary" type="submit" disabled={saving || !currentPassword || !newPassword || !confirmPassword}>{saving ? 'Updating password…' : 'Update password'}</button>
        </div>
      </form>

      <div className="security-policy-note">
        <ShieldCheck size={16} />
        <span>LEXA accepts long passphrases, spaces and password-manager input. It does not require arbitrary mixes of symbols, numbers or capital letters.</span>
      </div>
    </section>
  );
}
