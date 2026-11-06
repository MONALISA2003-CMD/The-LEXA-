import { useState } from 'react';
import { Cookie } from 'lucide-react';
import './account-security.css';
const VERSION = '2026-11-05';
const KEY = `lexa:public-cookie-choice:${VERSION}`;
function saved(): boolean { try {
    return localStorage.getItem(KEY) !== null;
}
catch {
    return false;
} }
/** Public-browser notice only. No optional analytics SDK is loaded by this component. */
export default function CookieNotice() {
    const [visible, setVisible] = useState(() => !saved());
    const [showPreferences, setShowPreferences] = useState(false);
    const [analytics, setAnalytics] = useState(false);
    if (!visible)
        return null;
    function choose(value: boolean) {
        try {
            localStorage.setItem(KEY, JSON.stringify({ optionalAnalytics: value, policyVersion: VERSION }));
        }
        catch { /* No browser storage required for declining optional cookies. */ }
        setVisible(false);
    }
    return <section className="lexa-cookie-notice" role="region" aria-label="Cookie choices">
    <div className="lexa-cookie-lead"><Cookie size={22}/><div><strong>Cookie preferences</strong><p>LEXA uses essential cookies for sign-in and account security. Optional analytics are off until you choose otherwise.</p></div></div>
    {showPreferences && <label className="account-security-check"><input type="checkbox" checked={analytics} onChange={event => setAnalytics(event.target.checked)}/><span>Allow optional analytics when available</span></label>}
    <div className="lexa-cookie-actions"><button type="button" className="button button-primary" onClick={() => choose(showPreferences ? analytics : false)}>{showPreferences ? 'Save preferences' : 'Essential only'}</button><button type="button" className="button button-secondary" onClick={() => setShowPreferences(x => !x)}>{showPreferences ? 'Close options' : 'Review options'}</button><a href="/legal/cookies">Cookie policy</a></div>
  </section>;
}
