import { apiClient } from './apiClient';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName?: string;
}

export interface SessionResponse {
  user: AuthenticatedUser;
  roles: string[];
  requiresPasswordChange?: boolean;
}

function objectResponse<T>(value: unknown, label: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The service returned an invalid ${label} response.`);
  return value as T;
}

export interface InvitationLink { workspaceId: string; invitationId: string; token: string }
export interface InvitationPreview { email: string; role: string; businessName: string; existingAccount: boolean; expiresAt: string }

/** Cookie-session auth adapter. Credentials and reset tokens are never persisted in browser storage. */
export const apiAuth = {
  async requestPublicSignup(input: { email: string; displayName: string; businessName: string; password: string; turnstileToken?: string }): Promise<void> {
    await apiClient.post('/auth/signup', { ...input, email: input.email.trim().toLowerCase(), displayName: input.displayName.trim(), businessName: input.businessName.trim() });
  },
  async verifyPublicSignup(token: string): Promise<void> {
    await apiClient.post('/auth/signup/verify', { token });
  },
  async previewInvitation(input: InvitationLink): Promise<InvitationPreview> {
    return objectResponse<InvitationPreview>(await apiClient.post('/auth/invitations/preview', input), 'invitation details');
  },
  async joinInvitation(input: InvitationLink & { displayName: string; password: string }): Promise<void> {
    await apiClient.post('/auth/invitations/join', input);
  },
  async acceptExistingInvitation(input: InvitationLink): Promise<void> {
    await apiClient.post('/auth/invitations/accept', input);
  },
  async bootstrapAvailable(): Promise<boolean> {
    const response = objectResponse<{ available: unknown }>(await apiClient.get('/auth/bootstrap/status'), 'account setup status');
    return response.available === true;
  },
  async register(displayName: string, email: string, password: string, bootstrapSecret: string): Promise<SessionResponse> {
    const response = objectResponse<SessionResponse>(await apiClient.post('/auth/register', { displayName: displayName.trim(), email: email.trim().toLowerCase(), password, bootstrapSecret }), 'account setup');
    if (!response.user || typeof response.user.id !== 'string' || !Array.isArray(response.roles)) throw new Error('The account could not be created.');
    return response;
  },
  async getSession(): Promise<SessionResponse> {
    const response = objectResponse<SessionResponse>(await apiClient.get('/auth/session'), 'session');
    if (!response.user || typeof response.user.id !== 'string' || typeof response.user.email !== 'string' || !Array.isArray(response.roles)) {
      throw new Error('The session response is incomplete.');
    }
    return response;
  },
  async signIn(email: string, password: string): Promise<SessionResponse> {
    const response = objectResponse<SessionResponse>(await apiClient.post('/auth/login', { email: email.trim().toLowerCase(), password }), 'sign-in');
    if (!response.user || typeof response.user.id !== 'string' || !Array.isArray(response.roles)) throw new Error('Sign-in did not return a valid session.');
    return response;
  },
  async changeInitialPassword(currentPassword:string,newPassword:string): Promise<void> {
    await apiClient.post('/auth/change-initial-password',{currentPassword,newPassword});
  },
  async signOut(): Promise<void> {
    await apiClient.post('/auth/logout', {});
  },
  async requestPasswordReset(email: string): Promise<void> {
    await apiClient.post('/auth/password/forgot', { email: email.trim().toLowerCase() });
  },
  async resetPassword(token: string, password: string): Promise<void> {
    await apiClient.post('/auth/password/reset', { token, password });
  },
};
