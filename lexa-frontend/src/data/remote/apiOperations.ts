import { apiClient } from './apiClient';

const enc = (value: string) => encodeURIComponent(value);
const root = (workspaceId: string, branchId: string) =>
  `/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/operations`;
export interface OperationsOverview {
  checkedAt?: string | null;
  api: { status: string };
  database: { status: string };
  worker: {
    lastHeartbeat?: string | null;
    details?: Record<string, unknown>;
    redis: string;
    clamav: string;
    r2Configured: boolean;
  };
  queue: {
    queued: number;
    active: number;
    deadLetter: number;
    outboxPending: number;
    outboxDeadLetter: number;
    oldestQueuedAt?: string | null;
  };
  attachments: { pendingScan: number; scanFailures: number };
  notifications: { emailFailures: number };
  recurringInvoices: { failures: number };
  backup: { lastSuccessful?: string | null };
  restore: { lastJob?: string | null };
  alerts: { open: number };
}

const idempotencyKey = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `lexa-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Protected operational controls. The backend enforces administrator and branch scope. */
export const apiOperations = {
  overview: (workspaceId: string, branchId: string) =>
    apiClient.get<OperationsOverview>(`${root(workspaceId, branchId)}/overview`),
  alerts: (workspaceId: string, branchId: string) =>
    apiClient.get<Record<string, unknown>[]>(`${root(workspaceId, branchId)}/alerts`),
  rules: (workspaceId: string, branchId: string) =>
    apiClient.get<Record<string, unknown>[]>(`${root(workspaceId, branchId)}/alert-rules`),
  updateRule: (workspaceId: string, branchId: string, ruleKey: string, input: unknown) =>
    apiClient.put<Record<string, unknown>>(`${root(workspaceId, branchId)}/alert-rules/${enc(ruleKey)}`, input),
  acknowledge: (workspaceId: string, branchId: string, id: string) =>
    apiClient.post(`${root(workspaceId, branchId)}/alerts/${enc(id)}/acknowledge`, {}, idempotencyKey()),
  resolve: (workspaceId: string, branchId: string, id: string) =>
    apiClient.post(`${root(workspaceId, branchId)}/alerts/${enc(id)}/resolve`, {}, idempotencyKey()),
  emailDeliveries: (workspaceId: string, branchId: string) =>
    apiClient.get<Record<string, unknown>[]>(`${root(workspaceId, branchId)}/email-deliveries`),
  retryEmail: (workspaceId: string, branchId: string, id: string) =>
    apiClient.post(`${root(workspaceId, branchId)}/email-deliveries/${enc(id)}/retry`, {}, idempotencyKey()),
};
