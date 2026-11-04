import { apiClient } from './apiClient';

export interface BusinessPaymentOption { code: string; label: string; enabled: boolean }
export interface BusinessSetupRecord {
  workspaceId: string; isOwner: boolean; businessName: string; currency: string; timezone: string;
  branchId: string | null; branchName: string; branchAddress: string;
  tradingName: string; legalName: string; country: string; district: string; city: string;
  physicalAddress: string; onlineOnly: boolean; email: string; phone: string; website: string;
  registrationNumber: string; taxIdentificationNumber: string;
  industry: string; industries: string[]; businessModels: string[]; offeringTypes: string[]; offeringsDescription: string;
  sellingChannels: string[]; setupStep: number; completedAt: string | null;
  manualPaymentsConfirmedAt: string | null; paymentMethods: BusinessPaymentOption[];
}
export type SetupSave =
 | { step: 1; businessName: string; branchName: string; tradingName: string; legalName: string; country: string; district: string; city: string; physicalAddress: string; onlineOnly: boolean; email: string; phone: string; website: string; registrationNumber: string; taxIdentificationNumber: string }
 | { step: 2; industry: string; industries: string[]; businessModels: string[]; offeringTypes: string[]; offeringsDescription: string; sellingChannels: string[] }
 | { step: 3; currency: string; timezone: string; methods: string[]; confirmation: boolean };

export const businessSetupApi = {
  read: (workspaceId: string): Promise<BusinessSetupRecord> => apiClient.get<BusinessSetupRecord>(`/workspaces/${encodeURIComponent(workspaceId)}/business-setup`),
  save: (workspaceId: string, step: SetupSave): Promise<{ saved: boolean; nextStep: number }> => apiClient.patch(`/workspaces/${encodeURIComponent(workspaceId)}/business-setup`, step),
  complete: (workspaceId: string): Promise<{ completed: boolean; completedAt: string }> => apiClient.post(`/workspaces/${encodeURIComponent(workspaceId)}/business-setup/complete`, {}),
};
