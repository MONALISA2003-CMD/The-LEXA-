import { apiClient } from './apiClient';
const enc = (v: string) => encodeURIComponent(v);
const tenant = (w: string) => `/workspaces/${enc(w)}`;
const branch = (w: string, b: string) => `${tenant(w)}/branches/${enc(b)}`;
const key = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `lexa-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const apiCatalogInventory = {
  units: (w: string) => apiClient.get<Record<string, unknown>[]>(`${tenant(w)}/catalog/units`),
  createUnit: (w: string, input: {code:string;name:string;dimension?:string;precision?:number}) => apiClient.post(`${tenant(w)}/catalog/units`, input, key()),
  taxCodes: (w: string) => apiClient.get<Record<string, unknown>[]>(`${tenant(w)}/catalog/tax-codes`),
  createTaxCode: (w: string, input: Record<string, unknown>) => apiClient.post(`${tenant(w)}/catalog/tax-codes`, input, key()),
  priceLists: (w: string) => apiClient.get<Record<string, unknown>[]>(`${tenant(w)}/catalog/price-lists`),
  createPriceList: (w: string, input: Record<string, unknown>) => apiClient.post(`${tenant(w)}/catalog/price-lists`, input, key()),
  createLot: (w: string, b: string, input: Record<string, unknown>) => apiClient.post(`${branch(w,b)}/inventory/lots`, input, key()),
  warehouses: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/inventory/warehouses`),
  createWarehouse: (w: string, b: string, input: Record<string, unknown>) => apiClient.post(`${branch(w,b)}/inventory/warehouses`, input, key()),
  bins: (w: string, b: string, warehouseId: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/inventory/warehouses/${enc(warehouseId)}/bins`),
  createBin: (w: string, b: string, warehouseId: string, input: Record<string, unknown>) => apiClient.post(`${branch(w,b)}/inventory/warehouses/${enc(warehouseId)}/bins`, input, key()),
  createSerial: (w: string, b: string, lotId: string, serialNumber: string) => apiClient.post(`${branch(w,b)}/inventory/lots/${enc(lotId)}/serials`, {serialNumber}, key()),
  reservations: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/inventory/reservations`),
  reserve: (w: string, b: string, input: Record<string, unknown>) => apiClient.post(`${branch(w,b)}/inventory/reservations`, input, key()),
};

export const apiFinanceOperations = {
  cashSessions: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/cash-sessions`),
  openCashSession: (w: string, b: string, openingFloatMinor: number) => apiClient.post(`${branch(w,b)}/finance/cash-sessions`, {openingFloatMinor}, key()),
  closeCashSession: (w: string, b: string, sessionId: string, countedClosingMinor: number) => apiClient.post(`${branch(w,b)}/finance/cash-sessions/${enc(sessionId)}/close`, {countedClosingMinor}, key()),
  expenses: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/expenses`),
  createExpense: (w: string, b: string, input: Record<string, unknown>) => apiClient.post(`${branch(w,b)}/finance/expenses`, input, key()),
  approveExpense: (w: string, b: string, expenseId: string) => apiClient.post(`${branch(w,b)}/finance/expenses/${enc(expenseId)}/approve`, {}, key()),
  fixedAssets: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/fixed-assets`),
  creditNotes: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/credit-notes`),
  bankAccounts: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/bank-accounts`),
  costCentres: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/cost-centres`),
};
