import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('./apiClient', () => ({ apiClient: { post } }));
import { apiAuth } from './apiAuth';

describe('sign-in session and MFA challenge boundaries', () => {
  beforeEach(() => { post.mockReset(); });

  it('accepts a valid authenticated session and preserves forced password changes', async () => {
    const authenticated = { user: { id: 'u-123', email: 'user@example.com' }, roles: ['owner'], requiresPasswordChange: true };
    post.mockResolvedValue(authenticated);
    await expect(apiAuth.signIn(' USER@example.com ', 'valid-password')).resolves.toEqual(authenticated);
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'user@example.com', password: 'valid-password', turnstileToken: undefined });
  });

  it.each(['email', 'totp'] as const)('returns a %s challenge without treating it as a session', async (method) => {
    const challenge = { verificationRequired: true, challengeToken: 'opaque-token', method, expiresInSeconds: 600 };
    post.mockResolvedValue(challenge);
    await expect(apiAuth.signIn('user@example.com', 'valid-password')).resolves.toEqual(challenge);
  });

  it.each([
    { verificationRequired: false, challengeToken: 'x', method: 'totp', expiresInSeconds: 600 },
    { verificationRequired: true, challengeToken: '', method: 'totp', expiresInSeconds: 600 },
    { verificationRequired: true, challengeToken: 'x', method: 'other', expiresInSeconds: 600 },
    { verificationRequired: true, challengeToken: 'x', method: 'email', expiresInSeconds: -1 },
  ])('rejects an incomplete or contradictory MFA challenge', async (challenge) => {
    post.mockResolvedValue(challenge);
    await expect(apiAuth.signIn('user@example.com', 'valid-password')).rejects.toThrow('browser verification response is incomplete');
  });

  it.each([
    {},
    { roles: ['owner'] },
    { user: { id: 'u-1' }, roles: ['owner'] },
    { user: { id: 'u-1', email: 'user@example.com' }, roles: 'owner' },
  ])('rejects an incomplete authenticated session', async (session) => {
    post.mockResolvedValue(session);
    await expect(apiAuth.signIn('user@example.com', 'valid-password')).rejects.toThrow('Sign-in did not return a valid session');
  });

  it('validates the final session from MFA verification', async () => {
    const session = { user: { id: 'u-1', email: 'user@example.com' }, roles: ['owner'] };
    post.mockResolvedValue(session);
    await expect(apiAuth.verifySignIn('challenge', '123456')).resolves.toEqual(session);
  });
});
