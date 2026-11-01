import { apiClient } from './apiClient';

export interface TeamBranch { id: string; name: string; code: string; }
export interface TeamMember {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  branchScopeMode: 'all' | 'restricted';
  branchIds: string[];
  allBranches: boolean;
  createdAt: string;
}

const enc = (value: string) => encodeURIComponent(value);
const base = (workspaceId: string) => `/workspaces/${enc(workspaceId)}`;
function list<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`The backend returned an invalid ${label} collection.`);
  return value as T[];
}

export const apiTeamAccess = {
  async members(workspaceId: string) { return list<TeamMember>(await apiClient.get(`${base(workspaceId)}/members`), 'workspace members'); },
  async branches(workspaceId: string) { return list<TeamBranch>(await apiClient.get(`${base(workspaceId)}/branches`), 'workspace branches'); },
  async updateRole(workspaceId: string, userId: string, role: string) {
    return apiClient.put(`${base(workspaceId)}/memberships/${enc(userId)}/role`, { role });
  },
  async updateBranchScope(workspaceId: string, userId: string, input: { allBranches: boolean; branchIds: string[] }) {
    return apiClient.put(`${base(workspaceId)}/memberships/${enc(userId)}/branches`, input);
  },
  async invitations(workspaceId: string) { return list<Record<string, unknown>>(await apiClient.get(`${base(workspaceId)}/invitations`), 'invitations'); },
  async invite(workspaceId: string, input: { email: string; role: string; allBranches: boolean; branchIds: string[] }) { return apiClient.post(`${base(workspaceId)}/invitations`, input, crypto.randomUUID()); },
  async acceptInvitation(workspaceId: string, invitationId: string, token: string) { return apiClient.post(`${base(workspaceId)}/invitations/${enc(invitationId)}/accept`, { token }, crypto.randomUUID()); },
};
