import type { ModuleRecordScope } from '../contracts/previewData';
import { apiClient } from './apiClient';

/** IDs registered by the current LEXA module catalogue (kept aligned with the SQL migration). */
export const MODULE_IDS = [
  'customers', 'suppliers', 'sales-orders', 'sales-invoices', 'quotations', 'purchases', 'purchase-invoices',
  'receiving', 'expenses', 'money-accounts', 'payments', 'accounting', 'assets', 'stock-counts', 'tax-documents',
  'stock-transfers', 'team', 'price-lists', 'deliveries', 'warehouses', 'employees', 'attendance', 'payroll',
  'chart-of-accounts', 'tax-codes', 'bank-reconciliation', 'purchase-requests', 'rfqs', 'supplier-quotes', 'audit',
  'opportunities', 'sales-returns', 'purchase-returns', 'projects', 'tasks', 'support', 'work-orders', 'quality',
  'batches', 'leads', 'cash-sessions', 'boms', 'job-cards', 'leave', 'replenishment', 'packages', 'contacts',
  'campaigns', 'sales-teams', 'item-bundles', 'picklists', 'cost-centers', 'budgets', 'integrations',
  'recurring-invoices', 'timesheets',
] as const;

export type ModuleId = typeof MODULE_IDS[number];
export function isModuleId(value: string): value is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(value);
}

export interface ModuleDefinitionRecord {
  id: ModuleId;
  title: string;
  singularLabel: string;
  group: string;
  schemaVersion: number;
  writable: boolean;
  storageKind: string;
}

export interface ModuleRecordLink {
  id: string;
  direction: 'incoming' | 'outgoing';
  relatedModuleId: string;
  relatedRecordId: string;
  relatedTitle?: string | null;
  relationType: string;
  relatedData?: Record<string, unknown>;
  createdAt: string;
}

export interface ModuleDomainEvent {
  id: string;
  moduleId: string;
  recordId?: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  outboxStatus: 'pending' | 'processing' | 'processed' | 'failed' | string;
  createdAt: string;
  actorUserId?: string | null;
}

const enc = (value: string) => encodeURIComponent(value);
const base = (scope: ModuleRecordScope) => `/workspaces/${enc(scope.workspaceId)}/branches/${enc(scope.branchId)}/module-graph`;

function listPayload<T>(value: unknown, label: string): T[] {
  const rows = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items) ? (value as { items: unknown[] }).items : null;
  if (!rows) throw new Error(`The backend returned an invalid ${label} collection.`);
  return rows as T[];
}

export const apiModuleGraph = {
  async catalog(scope: ModuleRecordScope): Promise<ModuleDefinitionRecord[]> {
    return listPayload<ModuleDefinitionRecord>(await apiClient.get(`${base(scope)}/catalog`), 'module catalogue');
  },
  async links(scope: ModuleRecordScope, moduleId: string, recordId: string): Promise<ModuleRecordLink[]> {
    return listPayload<ModuleRecordLink>(await apiClient.get(`${base(scope)}/records/${enc(moduleId)}/${enc(recordId)}/links`), 'module relationship');
  },
  async events(scope: ModuleRecordScope, moduleId: string, recordId: string, limit = 20): Promise<ModuleDomainEvent[]> {
    return listPayload<ModuleDomainEvent>(await apiClient.get(`${base(scope)}/events`, { moduleId, recordId, limit }), 'module activity');
  },
  async link(scope: ModuleRecordScope, input: { sourceModuleId: string; sourceRecordId: string; targetModuleId: string; targetRecordId: string; relationType?: string }): Promise<void> {
    await apiClient.post(`${base(scope)}/links`, input, crypto.randomUUID());
  },
  async recordEvent(scope: ModuleRecordScope, input: { moduleId: string; recordId?: string; eventType: string; payload?: Record<string, unknown>; dedupeKey?: string }): Promise<void> {
    await apiClient.post(`${base(scope)}/events`, input, input.dedupeKey ?? crypto.randomUUID());
  },
  async unlink(scope: ModuleRecordScope, linkId: string): Promise<void> {
    await apiClient.delete(`${base(scope)}/links/${enc(linkId)}`);
  },
};
