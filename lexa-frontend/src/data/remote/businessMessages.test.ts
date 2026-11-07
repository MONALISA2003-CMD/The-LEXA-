import { describe, expect, it } from 'vitest';
import { businessErrorMessage, businessSignInErrorMessage, httpBusinessMessage, platformAdministratorErrorMessage } from './businessMessages';

describe('business-facing messages', () => {
  it('shows sign-in verification failures instead of generic permission messages', () => {
    expect(httpBusinessMessage(503, '', 'HUMAN_VERIFICATION_UNAVAILABLE')).toMatch(/verification/i);
    expect(httpBusinessMessage(403, '', 'HUMAN_VERIFICATION_REQUIRED')).toMatch(/Cloudflare verification/i);
    expect(httpBusinessMessage(503, '', 'SIGNIN_EMAIL_UNAVAILABLE')).toMatch(/verification email/i);
    expect(httpBusinessMessage(403, '', 'ADMIN_ONLY_IDENTITY')).toMatch(/administrator sign-in/i);
    expect(platformAdministratorErrorMessage({status:403,code:'HUMAN_VERIFICATION_REQUIRED'})).toMatch(/security check/i);
    expect(platformAdministratorErrorMessage({status:403})).not.toMatch(/business administrator/i);
  });

  it('does not accuse a legacy owner of lacking permission when login security returns 403', () => {
    expect(businessSignInErrorMessage({status:403,message:'Forbidden'})).toMatch(/sign-in security verification/i);
    expect(businessSignInErrorMessage({status:403,code:'HUMAN_VERIFICATION_REQUIRED'})).toMatch(/Cloudflare verification/i);
    expect(businessSignInErrorMessage({status:403,code:'CSRF_TOKEN_INVALID'})).toMatch(/Refresh the page/i);
    expect(businessSignInErrorMessage({status:403,code:'SECURITY_ENROLLMENT_REQUIRED'})).toMatch(/browser enrollment/i);
    expect(businessSignInErrorMessage({status:401,code:'INVALID_CREDENTIALS'})).toMatch(/password/i);
  });

  it('never shows server or database jargon to the customer', () => {
    expect(httpBusinessMessage(500, 'Internal server error')).not.toMatch(/internal|backend|api|database/i);
    expect(businessErrorMessage({ status: 500, message: 'Prisma 42501 database error' })).not.toMatch(/Prisma|42501|database/i);
    expect(businessErrorMessage(new Error('The backend returned an invalid response'))).not.toMatch(/backend|response/i);
  });
  it('provides actionable session and permission messages', () => {
    expect(httpBusinessMessage(401, 'Unauthorized')).toMatch(/sign in/i);
    expect(httpBusinessMessage(403, 'Forbidden')).toMatch(/administrator/i);
    expect(httpBusinessMessage(429, 'Too Many Requests')).toMatch(/wait/i);
  });
  it('preserves useful validation and credential messages', () => {
    expect(httpBusinessMessage(400, 'Business name is required')).toBe('Business name is required');
    expect(httpBusinessMessage(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS')).toMatch(/password/i);
  });
  it('handles network failures without developer instructions', () => {
    expect(businessErrorMessage({ status: 0, code: 'NETWORK_ERROR', message: 'failed to fetch' })).toMatch(/internet connection/i);
  });
});
