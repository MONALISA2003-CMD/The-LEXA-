import { useEffect, useRef, useState } from 'react';

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi; } }

const SCRIPT_ID = 'lexa-turnstile-script';
// This is the public widget identifier; the Siteverify secret is never included in the frontend.
export const publicTurnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || (import.meta.env.PROD ? '0x4AAAAAAFzE4aPvB2YCgpLd' : '');

export default function TurnstileWidget({ onToken, action='signup' }: {onToken: (value: string | null) => void; action?: 'signup'|'login'|'demo'}) {
  const holder = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  const [retryRevision, setRetryRevision] = useState(0);
  const [needsRetry, setNeedsRetry] = useState(false);
  useEffect(() => { callback.current = onToken; }, [onToken]);

  useEffect(() => {
    if (!publicTurnstileSiteKey) return;
    let active = true;
    let widget: string | null = null;
    let verified = false;
    setNeedsRetry(false);
    const stuckTimer = window.setTimeout(() => {
      // Neither an error nor a missing callback may silently strand sign-in.
      if (active && !verified) setNeedsRetry(true);
    }, 15_000);
    const acceptToken = (token: string) => {
      if (!active) return;
      verified = true;
      setNeedsRetry(false);
      callback.current(token);
    };
    const requestRetry = () => {
      if (!active) return;
      verified = false;
      callback.current(null);
      setNeedsRetry(true);
    };
    const initialize = () => {
      if (!active || !holder.current || !window.turnstile || widget) return;
      try {
        widget = window.turnstile.render(holder.current, {
          sitekey: publicTurnstileSiteKey,
          action,
          theme: 'auto',
          callback: acceptToken,
          'expired-callback': requestRetry,
          'error-callback': requestRetry,
        });
      } catch {
        requestRetry();
      }
    };
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    // If a script previously failed (network filtering, WebView), allow retry
    // to create a fresh loader instead of waiting for an event that already fired.
    if (retryRevision > 0 && script && !window.turnstile) {
      script.remove();
      script = null;
    }
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', initialize);
      script.addEventListener('error', requestRetry);
      document.head.appendChild(script);
    } else if (window.turnstile) {
      initialize();
    } else {
      script.addEventListener('load', initialize);
      script.addEventListener('error', requestRetry);
    }
    return () => {
      active = false;
      window.clearTimeout(stuckTimer);
      callback.current(null);
      if (widget && window.turnstile) window.turnstile.remove(widget);
      script?.removeEventListener('load', initialize);
      script?.removeEventListener('error', requestRetry);
    };
  }, [action, retryRevision]);

  if (!publicTurnstileSiteKey) return null;
  return (
    <div className="lexa-turnstile-control">
      <div ref={holder} aria-label="Human verification" />
      <p className="auth-security-note">{action==='login' ? 'Complete the verification to sign in.' : action==='demo' ? 'Verify you are human to open the interactive demo.' : 'Complete the verification to create your account.'}</p>
      {needsRetry && (
        <div className="lexa-turnstile-retry" role="status">
          <span>Verification is taking longer than expected.</span>
          <button type="button" onClick={() => { callback.current(null); setRetryRevision(value => value + 1); }}>
            Retry security check
          </button>
        </div>
      )}
    </div>
  );
}
