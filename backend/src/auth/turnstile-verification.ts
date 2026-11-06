/** Cloudflare Turnstile Siteverify, scoped to LEXA's public signup.
 * Enable only after both the frontend widget site key and backend secret are deployed.
 * Tokens are never logged and verification fails closed when enforcement is enabled.
 */
export interface TurnstileVerifyResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}
export async function verifyTurnstileChallenge(
  token: unknown,
  config: { secret?: string; enforced: boolean; allowedHosts: string[]; action: string; fetchImpl?: typeof fetch },
): Promise<'disabled' | 'verified'> {
  if (!config.enforced) return 'disabled';
  if (!config.secret) throw new Error('TURNSTILE_CONFIGURATION_MISSING');
  if (typeof token !== 'string' || token.length < 10 || token.length > 2048) throw new Error('TURNSTILE_TOKEN_REQUIRED');
  const request = new URLSearchParams({secret:config.secret,response:token});
  let response: Response;
  try {
    response = await (config.fetchImpl ?? fetch)('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:'POST', body:request, headers:{'Content-Type':'application/x-www-form-urlencoded'}, signal:AbortSignal.timeout(8000),
    });
  } catch { throw new Error('TURNSTILE_VERIFICATION_UNAVAILABLE'); }
  if (!response.ok) throw new Error('TURNSTILE_VERIFICATION_UNAVAILABLE');
  let result: TurnstileVerifyResponse;
  try { result = await response.json() as TurnstileVerifyResponse; }
  catch { throw new Error('TURNSTILE_VERIFICATION_UNAVAILABLE'); }
  if (result.success !== true || result.action !== config.action || !result.hostname || !config.allowedHosts.includes(result.hostname)) {
    throw new Error('TURNSTILE_TOKEN_INVALID');
  }
  return 'verified';
}

/** Keep the existing signup contract and move both login and signup to the same verifier. */
export function verifySignupChallenge(
  token:unknown,config:{secret?:string;enforced:boolean;allowedHosts:string[];fetchImpl?:typeof fetch},
):Promise<'disabled'|'verified'>{return verifyTurnstileChallenge(token,{...config,action:'signup'});}
