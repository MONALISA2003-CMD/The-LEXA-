import type { BusinessToolsSnapshot } from '../local/businessTools';
import { apiClient } from './apiClient';

export interface ApiCashUp {
  workspaceId: string;
  branchId: string;
  date: string;
  openingFloatMinor: number;
  otherCashInMinor: number;
  otherCashOutMinor: number;
  expectedCashMinor: number;
  countedCashMinor: number;
  varianceMinor: number;
  reason: string;
  savedAt: string;
}
export interface ApiTaxProfile {
  tin: string;
  vatRegistered: boolean;
  sector: string;
  efrisOverride: 'auto' | 'yes' | 'no';
  vatThreshold: string;
  efrisTurnoverThreshold: string;
  ruleSource: string;
  ruleEffectiveFrom: string;
}
export interface ApiComplianceNote {
  id: string;
  date: string;
  documentType: string;
  internalReference: string;
  fdn: string;
  status: string;
  notes: string;
}
export interface ApiAttachment {
  id: string;
  workspaceId: string;
  branchId: string;
  reference: string;
  kind: 'product' | 'receipt' | 'other';
  name: string;
  mimeType: string;
  size: number;
  capturedAt: string;
}
const enc = (value: string) => encodeURIComponent(value);
function list<T>(value: unknown, name: string): T[] {
  const candidate = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items) ? (value as { items: unknown[] }).items : null;
  if (!candidate) throw new Error(`The backend returned an invalid ${name} list.`);
  return candidate as T[];
}
export const apiBusinessTools = {
  snapshot(workspaceId: string, branchId: string) {
    return apiClient.get<BusinessToolsSnapshot>(`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/business-tools/snapshot`);
  },
  async getTaxProfile(workspaceId: string) {
    return apiClient.get<ApiTaxProfile>(`/workspaces/${enc(workspaceId)}/business-tools/tax-profile`);
  },
  saveTaxProfile(workspaceId: string, profile: ApiTaxProfile) {
    return apiClient.put<ApiTaxProfile>(`/workspaces/${enc(workspaceId)}/business-tools/tax-profile`, profile);
  },
  async listCashUps(workspaceId: string, branchId: string) {
    return list<ApiCashUp>(await apiClient.get(`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/cash-ups`), 'cash-up');
  },
  saveCashUp(record: ApiCashUp) {
    return apiClient.put<ApiCashUp>(`/workspaces/${enc(record.workspaceId)}/branches/${enc(record.branchId)}/cash-ups/${enc(record.date)}`, record);
  },
  async listComplianceNotes(workspaceId: string) {
    return list<ApiComplianceNote>(await apiClient.get(`/workspaces/${enc(workspaceId)}/compliance-notes`), 'compliance note');
  },
  async createComplianceNote(workspaceId: string, note: Omit<ApiComplianceNote, 'id'> & { id?: string }) {
    return apiClient.post<ApiComplianceNote>(`/workspaces/${enc(workspaceId)}/compliance-notes`, note, crypto.randomUUID());
  },
  async listAttachments(workspaceId: string) {
    return list<ApiAttachment>(await apiClient.get(`/workspaces/${enc(workspaceId)}/attachments`), 'attachment');
  },
  uploadAttachment(workspaceId: string, branchId: string, reference: string, kind: ApiAttachment['kind'], file: File) {
    const form = new FormData();
    form.set('file', file, file.name);
    form.set('workspaceId', workspaceId);
    form.set('branchId', branchId);
    form.set('reference', reference);
    form.set('kind', kind);
    return apiClient.postForm<ApiAttachment>(`/workspaces/${enc(workspaceId)}/attachments`, form, crypto.randomUUID());
  },
  downloadAttachment(workspaceId: string, attachmentId: string) {
    return apiClient.download(`/workspaces/${enc(workspaceId)}/attachments/${enc(attachmentId)}/download`);
  },
  async exportBackup(workspaceId: string) {
    return apiClient.get<unknown>(`/workspaces/${enc(workspaceId)}/backup`);
  },
  restoreBackup(workspaceId: string, backup: unknown) {
    return apiClient.post<{ tablesRestored?: number; recordsRestored?: number; accepted?: boolean }>(`/workspaces/${enc(workspaceId)}/backup/restore`, { backup }, crypto.randomUUID());
  },
  async importProductsCsv(workspaceId: string, currency: string, csv: string) {
    return apiClient.post<{ importedCount: number }>(`/workspaces/${enc(workspaceId)}/imports/products-csv`, { currency, csv }, crypto.randomUUID());
  },
  async importOpeningStockCsv(workspaceId: string, branchId: string, csv: string) {
    return apiClient.post<{ importedCount: number }>(`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/imports/opening-stock-csv`, { csv }, crypto.randomUUID());
  },
};
