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

export interface PendingSignIn { verificationRequired: true; challengeToken: string; method: 'email' | 'totp'; expiresInSeconds: number }
export interface TrustedBrowser { id:string;label:string;createdAt:string;lastSeenAt:string;expiresAt:string;revokedAt:string|null;current:boolean }
export interface ActiveSession { id:string;deviceId:string|null;createdAt:string;expiresAt:string;current:boolean }
export interface SecurityEvent { id:string;type:string;deviceLabel:string|null;createdAt:string }
export interface AccountSecurity { mfa:{enabled:boolean;recoveryCodesRemaining:number};devices:TrustedBrowser[];sessions:ActiveSession[];events:SecurityEvent[] }
export interface PrivacyPreferences { optionalAnalytics:boolean; policyVersion:string; updatedAt:string|null }
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
  async signIn(email: string, password: string, turnstileToken?: string): Promise<SessionResponse | PendingSignIn> {
    const response = objectResponse<SessionResponse | PendingSignIn>(await apiClient.post('/auth/login', { email: email.trim().toLowerCase(), password, turnstileToken }), 'sign-in');
    // A pending verification challenge is NOT an authenticated session.
    // Narrow on the presence of the discriminant, and reject malformed challenges.
    if ('verificationRequired' in response) {
      if (response.verificationRequired !== true ||
          typeof response.challengeToken !== 'string' || !response.challengeToken ||
          !['email', 'totp'].includes(response.method) ||
          !Number.isFinite(response.expiresInSeconds) || response.expiresInSeconds <= 0) {
        throw new Error('The browser verification response is incomplete.');
      }
      return response;
    }
    if (!response.user || typeof response.user.id !== 'string' ||
        typeof response.user.email !== 'string' || !Array.isArray(response.roles)) {
      throw new Error('Sign-in did not return a valid session.');
    }
    return response;
  },
  async verifySignIn(challengeToken:string, code:string):Promise<SessionResponse>{
    const response=objectResponse<SessionResponse>(await apiClient.post('/auth/login/verify',{challengeToken,code}), 'browser verification');
    if(!response.user||!Array.isArray(response.roles))throw new Error('Verification did not establish a session.');
    return response;
  },
  async security():Promise<AccountSecurity>{return objectResponse<AccountSecurity>(await apiClient.get('/auth/security'),'security overview');},
  async revokeSession(id:string,password:string){return apiClient.post(`/auth/security/sessions/${encodeURIComponent(id)}/revoke`,{password});},
  async revokeOtherSessions(password:string){return apiClient.post('/auth/security/sessions/other/revoke',{password});},
  async revokeBrowser(id:string,password:string){return apiClient.post(`/auth/security/devices/${encodeURIComponent(id)}/revoke`,{password});},
  async beginAuthenticator(password:string):Promise<{secret:string;uri:string;expiresInSeconds:number}>{return objectResponse(await apiClient.post('/auth/security/authenticator/begin',{password}),'authenticator setup');},
  async confirmAuthenticator(code:string):Promise<{enabled:boolean;recoveryCodes:string[]}>{return objectResponse(await apiClient.post('/auth/security/authenticator/confirm',{code}),'authenticator confirmation');},
  async disableAuthenticator(password:string,code:string){return apiClient.post('/auth/security/authenticator/disable',{password,code});},
  async replaceRecoveryCodes(password:string,code:string):Promise<{recoveryCodes:string[]}>{return objectResponse(await apiClient.post('/auth/security/authenticator/recovery/replace',{password,code}),'recovery codes');},
  async privacyPreferences():Promise<PrivacyPreferences>{return objectResponse(await apiClient.get('/auth/privacy/preferences'),'privacy preferences');},
  async setPrivacyPreferences(optionalAnalytics:boolean):Promise<PrivacyPreferences>{return objectResponse(await apiClient.put('/auth/privacy/preferences',{optionalAnalytics}),'privacy preferences');},
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
