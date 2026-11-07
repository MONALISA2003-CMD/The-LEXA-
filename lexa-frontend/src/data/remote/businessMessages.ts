/** Customer-facing wording for failed business actions. Diagnostic codes remain on ApiRequestError. */
export function httpBusinessMessage(status: number, rawMessage: string, code?: string): string {
  const normalized = rawMessage.toLowerCase();
  if (code === 'INVALID_CREDENTIALS' || normalized.includes('invalid_credentials') || normalized.includes('email or password is incorrect')) {
    return 'That email address and password do not match. Please check your details and try again.';
  }
  if (code === 'CSRF_TOKEN_INVALID' || code === 'INVALID_CSRF_TOKEN') return 'This request could not be verified. Refresh the page and try again.';

  if (code === 'HUMAN_VERIFICATION_REQUIRED') return 'The security check was not accepted. Complete a fresh Cloudflare verification and try again.';
  if (code === 'HUMAN_VERIFICATION_UNAVAILABLE') return 'LEXA sign-in verification is temporarily unavailable. Please retry shortly or contact LEXA support.';
  if (code === 'AUTH_VERIFICATION_NOT_CONFIGURED') return 'LEXA account verification needs administrator configuration. Contact LEXA support.';
  if (code === 'SIGNIN_EMAIL_UNAVAILABLE' || code === 'SIGNUP_EMAIL_FAILED' || code === 'EMAIL_DELIVERY_FAILED' || code === 'EMAIL_DELIVERY_NOT_CONFIGURED') return 'LEXA could not deliver the verification email. Contact LEXA support if this continues.';
  if (code === 'ADMIN_ONLY_IDENTITY') return 'This address is reserved for LEXA administration. Use the yellow administrator sign-in page.';
  if (code === 'SECURITY_ENROLLMENT_REQUIRED') return 'This account needs secure browser enrollment. Contact your business owner to complete account recovery or authenticator setup.';
  if (code === 'LEXA_SUBSCRIPTION_REQUIRED') return 'This business is awaiting verified subscription payment. You can still reach the billing and support pages.';
  if (code === 'OWNER_ONLY') return 'LEXA Intelligence is available to the business owner only.';
  if (code === 'AI_USAGE_LIMIT_REACHED') return 'This month’s business assistant requests have reached the plan limit. Try again when the allowance renews.';
  if (code === 'AI_USAGE_RECORD_UNAVAILABLE') return 'The assistant could not record this request. Please try again.';
  if (code === 'AI_PROVIDER_UNAVAILABLE' || code === 'INTELLIGENCE_UNAVAILABLE') return 'Live analysis is temporarily unavailable. You can still review recorded business figures and reports.';
  if (status === 401) return 'Your sign-in has expired. Please sign in again to continue.';
  if (status === 403) return 'You do not have permission to make this change. Ask your business administrator for access.';
  if (status === 404) return 'We could not find the business information you requested. It may have been moved or removed.';
  if (status === 408 || status === 504) return 'This is taking longer than expected. Please try again.';
  if (status === 409) return readableServerMessage(rawMessage) ? rawMessage : 'This change conflicts with an existing business record. Please review it and try again.';
  if (status === 429) return 'There have been too many attempts. Please wait a moment before trying again.';
  if (status >= 500) return 'LEXA could not complete your request right now. Please try again. If it continues, contact your administrator.';
  return readableServerMessage(rawMessage) ? rawMessage : 'We could not complete that request. Please check the information and try again.';
}

function readableServerMessage(message: string): boolean {
  const lower = message.trim().toLowerCase();
  return Boolean(lower) && !/\b(api|backend|server|database|postgres|prisma|sql|endpoint|http|statuscode|exception|stack|rls|serialization|upstream|internal server error|undefined|null|json|csrf|runtime|network error|unexpected token)\b/i.test(lower) && !/[{}<>]/.test(message);
}

export function businessErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Something went wrong. Please try again.';
  const candidate = error as { status?: unknown; message?: unknown; code?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const code = typeof candidate.code === 'string' ? candidate.code : undefined;
  if (typeof candidate.status === 'number') {
    if (candidate.status === 0) return 'LEXA could not connect to your business account. Check your internet connection and try again.';
    return httpBusinessMessage(candidate.status, message, code);
  }
  if (/\b(timed out|network|could not reach|connection failed|fetch failed)\b/i.test(message)) {
    return 'LEXA could not connect to your business account. Check your internet connection and try again.';
  }
  if (/not configured|backend|database|internal server error|service returned an invalid|invalid.*response/i.test(message)) {
    return 'LEXA could not open your business information right now. Please try again or contact your administrator.';
  }
  return readableServerMessage(message) ? message : 'We could not complete that request. Please try again.';
}


/** Error wording for the private admin portal must never tell platform staff to
 * ask a customer business administrator for platform access. */
export function platformAdministratorErrorMessage(error: unknown): string {
  const candidate = (error && typeof error === 'object') ? error as {status?:unknown;code?:unknown} : {};
  const code = typeof candidate.code === 'string' ? candidate.code : undefined;
  if (code) {
    const resolved = httpBusinessMessage(typeof candidate.status === 'number' ? candidate.status : 0, '', code);
    if (['HUMAN_VERIFICATION_REQUIRED','HUMAN_VERIFICATION_UNAVAILABLE','CSRF_TOKEN_INVALID','INVALID_CSRF_TOKEN'].includes(code)) return resolved;
  }
  if(candidate.status===403) return 'Administrator security verification was not accepted. Refresh the page, complete a new challenge, and retry.';
  if(candidate.status===401) return 'Administrator email or password was not accepted. Check your private credentials or request a reset.';
  if(typeof candidate.status === 'number' && candidate.status>=500) return 'The LEXA administrator sign-in service is temporarily unavailable. Please retry shortly.';
  return businessErrorMessage(error);
}

/** Authentication has no business record to edit: never present a 403 on login as
 * "you do not have permission to make this change". Preserve exact known codes.
 */
export function businessSignInErrorMessage(error: unknown): string {
  const candidate = error && typeof error === 'object' ? error as {status?:unknown;code?:unknown} : {};
  if (candidate.status === 403 && (!candidate.code || ![
    'CSRF_TOKEN_INVALID','INVALID_CSRF_TOKEN','HUMAN_VERIFICATION_REQUIRED',
    'ADMIN_ONLY_IDENTITY','SECURITY_ENROLLMENT_REQUIRED','LEXA_SUBSCRIPTION_REQUIRED',
  ].includes(String(candidate.code)))) {
    return 'LEXA could not complete sign-in security verification. Refresh this page, complete a new security check and try again. If it continues, share the support reference with LEXA support.';
  }
  return businessErrorMessage(error);
}
