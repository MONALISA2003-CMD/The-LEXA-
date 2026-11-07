import { apiClient } from './apiClient';

export const isDemoDeployment = import.meta.env.VITE_LEXA_DEMO === 'true';
export type DemoSessionInfo = { workspaceId: string; expiresAt: string; idleSeconds: number; demo?: boolean };
export const apiDemo = {
  status: () => apiClient.get<DemoSessionInfo>('/demo/session'),
  start: (turnstileToken?: string) => apiClient.post<DemoSessionInfo>('/demo/sessions', {turnstileToken}),
  reset: () => apiClient.post<DemoSessionInfo>('/demo/reset', {}),
  end: () => apiClient.post<{ended:boolean}>('/demo/end', {}),
};
