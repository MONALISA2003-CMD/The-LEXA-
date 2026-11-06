import { useEffect, useRef } from 'react';

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi; } }
const SCRIPT_ID = 'lexa-turnstile-script';
export const publicTurnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || (import.meta.env.PROD ? '0x4AAAAAAFzE4aPvB2YCgpLd' : ''); // A public sitekey; the matching secret stays exclusively on Render.

export default function TurnstileWidget({ onToken, action='signup' }: {onToken: (value: string | null) => void; action?: 'signup'|'login'}) {
  const holder = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  useEffect(() => { callback.current = onToken; }, [onToken]);
  useEffect(() => {
    if (!publicTurnstileSiteKey) return;
    let alive = true;
    let widget: string | null = null;
    const initialize = () => {
      if (!alive || !holder.current || !window.turnstile || widget) return;
      widget = window.turnstile.render(holder.current, {
        sitekey:publicTurnstileSiteKey, action, theme:'auto',
        callback:(token: string) => callback.current(token),
        'expired-callback':() => callback.current(null),
        'error-callback':() => callback.current(null),
      });
    };
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script'); script.id = SCRIPT_ID;
      script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async=true;script.defer=true;script.addEventListener('load', initialize);
      document.head.appendChild(script);
    } else if (window.turnstile) initialize(); else script.addEventListener('load', initialize);
    return () => { alive=false;callback.current(null);if(widget && window.turnstile) window.turnstile.remove(widget);script?.removeEventListener('load',initialize); };
  }, [action]);
  if (!publicTurnstileSiteKey) return null;
  return <div className="lexa-turnstile-control"><div ref={holder} aria-label="Human verification"/><p className="auth-security-note">{action==='login'?'Complete the verification to sign in.':'Complete the verification to create your account.'}</p></div>;
}
