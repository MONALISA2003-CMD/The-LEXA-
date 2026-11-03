import { apiClient } from './apiClient';

export interface BusinessAccess { workspaceId: string; role: string; isOwner: boolean; permissions: string[]; }
export interface TeamBranch { id: string; name: string; code: string; }
export interface StaffProfile {
  employeeId: string; userId: string|null; employeeNumber: string; username: string|null;
  fullName: string; preferredName: string|null; email: string|null; phone: string|null;
  department: string|null; jobTitle: string; employmentType: string; employmentStatus: string;
  hireDate: string; role: string|null; accessStatus: string|null;
  residentialAddress: string|null; district: string|null; dateOfBirth: string|null;
  emergencyContactName: string|null; emergencyContactPhone: string|null;
  nationalId: string|null; contractReference: string|null; probationEnd: string|null; notes: string|null;
}
export interface StaffDraft {
  fullName: string; preferredName: string; username: string; email: string; initialPassword: string;
  role: string; phone: string; department: string; jobTitle: string; employmentType: string;
  hireDate: string; residentialAddress: string; district: string; dateOfBirth: string;
  emergencyContactName: string; emergencyContactPhone: string; nationalId: string;
  contractReference: string; probationEnd: string; notes: string;
}

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
  if (!Array.isArray(value)) throw new Error(`We could not load the ${label} information. Please try again.`);
  return value as T[];
}

export const apiTeamAccess = {
  async staff(workspaceId: string): Promise<StaffProfile[]> { return list<StaffProfile>(await apiClient.get(`${base(workspaceId)}/staff`), "employee profiles"); },
  async createStaff(workspaceId:string,input:StaffDraft):Promise<{ created:boolean;employeeId:string;username:string;employeeNumber:string }> { return apiClient.post(`${base(workspaceId)}/staff`,input,crypto.randomUUID()); },
  async updateStaff(workspaceId:string,employeeId:string,input:StaffDraft):Promise<{updated:boolean}> {return apiClient.put(`${base(workspaceId)}/staff/${enc(employeeId)}`,input);},
  async resetStaffPassword(workspaceId:string,employeeId:string,initialPassword:string):Promise<{reset:boolean}> {return apiClient.post(`${base(workspaceId)}/staff/${enc(employeeId)}/reset-password`,{initialPassword},crypto.randomUUID());},
  async myEmployment(workspaceId:string):Promise<Pick<StaffProfile,"employeeNumber"|"fullName"|"jobTitle"|"department"|"employmentType"|"employmentStatus"|"hireDate">|null> {return apiClient.get(`${base(workspaceId)}/my-employment`);},
  async access(workspaceId: string): Promise<BusinessAccess> { return apiClient.get<BusinessAccess>(`${base(workspaceId)}/access`); },
  async setStatus(workspaceId: string, userId: string, status: 'ACTIVE' | 'SUSPENDED') { return apiClient.put(`${base(workspaceId)}/memberships/${enc(userId)}/status`, { status }); },
  async removeEmployee(workspaceId: string, userId: string) { return apiClient.delete(`${base(workspaceId)}/memberships/${enc(userId)}`); },
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
