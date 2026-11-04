/** Customer-facing wording for failed business actions. Diagnostic codes remain on ApiRequestError. */
export function httpBusinessMessage(status: number, rawMessage: string, code?: string): string {
  const normalized = rawMessage.toLowerCase();
  if (code === 'INVALID_CREDENTIALS' || normalized.includes('invalid_credentials') || normalized.includes('email or password is incorrect')) {
    return 'That email address and password do not match. Please check your details and try again.';
  }
  if (code === 'CSRF_TOKEN_INVALID' || code === 'INVALID_CSRF_TOKEN') return 'This request could not be verified. Refresh the page and try again.';
  if (code === 'OWNER_ONLY') return 'LEXA Intelligence is available to the business owner only.';
  if (code === 'AI_USAGE_LIMIT_REACHED') return 'Your monthly Intelligence allowance has been used.';
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
