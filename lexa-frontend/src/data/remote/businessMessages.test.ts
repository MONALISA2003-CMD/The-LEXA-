import { describe, expect, it } from 'vitest';
import { businessErrorMessage, httpBusinessMessage } from './businessMessages';

describe('business-facing messages', () => {
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
