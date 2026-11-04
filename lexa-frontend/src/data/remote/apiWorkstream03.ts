import { apiClient } from './apiClient';
const enc = (v: string) => encodeURIComponent(v);
const tenant = (w: string) => `/workspaces/${enc(w)}`;
const branch = (w: string, b: string) => `${tenant(w)}/branches/${enc(b)}`;
const key = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `lexa-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const apiCatalogInventory = {
  categories: (w:string)=>apiClient.get<import('../../domain/shared/types').Category[]>(`${tenant(w)}/categories`),
  createCategory: (w:string,input:{name:string;parentId?:string;templateKey?:string;attributeSchema?:unknown[]})=>apiClient.post<import('../../domain/shared/types').Category>(`${tenant(w)}/categories`,input,key()),
  updateCategory: (w:string,id:string,input:Record<string,unknown>)=>apiClient.patch<import('../../domain/shared/types').Category>(`${tenant(w)}/categories/${enc(id)}`,input),
  allVariants:(w:string)=>apiClient.get<Array<{id:string;productId:string;sku:string;barcode:string|null;attributes:Record<string,string|number|boolean>;costPriceMinor:number;sellingPriceMinor:number;active:boolean}>>(`${tenant(w)}/catalog/variants`),
  variantBalances:(w:string,b:string)=>apiClient.get<Array<{productId:string;variantId:string|null;quantity:number}>>(`${branch(w,b)}/inventory/variant-balances`),
  availableLots:(w:string,b:string,p:string,variantId?:string)=>apiClient.get<Array<{id:string;lotNumber:string;expiryDate:string|null;available:number;variantId:string|null}>>(`${branch(w,b)}/inventory/lots`,{productId:p,...(variantId?{variantId}:{})}),
  variants: (w:string,p:string)=>apiClient.get<Array<{id:string;productId:string;sku:string;barcode:string|null;attributes:Record<string,string|number|boolean>;costPriceMinor:number;sellingPriceMinor:number;active:boolean}>>(`${tenant(w)}/products/${enc(p)}/variants`),
  createVariant: (w:string,p:string,input:Record<string,unknown>)=>apiClient.post(`${tenant(w)}/products/${enc(p)}/variants`,input,key()),
  availableSerials:(w:string,b:string,p:string,variantId?:string)=>apiClient.get<Array<{id:string;serialNumber:string;lotId:string|null;variantId:string|null}>>(`${branch(w,b)}/inventory/serials`,{productId:p,...(variantId?{variantId}:{})}),
  createStandaloneSerial:(w:string,b:string,input:{productId:string;variantId?:string;serialNumber:string;imei2?:string})=>apiClient.post(`${branch(w,b)}/inventory/serials`,input,key()),
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

export type BankReconciliationRecord = {id:string;bankAccountId:string;accountName?:string;statementDate:string;openingBalanceMinor:string;closingBalanceMinor:string;reconciledBalanceMinor:string;status:string;completedAt?:string};
export type BankStatementRecord = {id:string;bankAccountId:string;transactionDate:string;description:string;reference?:string;amountMinor:string;direction:'credit'|'debit';reconciliationStatus:string};
export type PostedBankLedgerLine = {id:string;journalId:string;journalNumber:string;entryDate:string;description?:string;debitMinor:string;creditMinor:string;ledgerAccountName:string};

export const apiFinanceOperations = {
  cashUps: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/cash-ups`),
  postCashUp: (w: string, b: string, id: string) => apiClient.post(`${branch(w,b)}/finance/cash-ups/${enc(id)}/post`, {}, key()),
  cashSessions: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/cash-sessions`),
  openCashSession: (w: string, b: string, openingFloatMinor: number) => apiClient.post(`${branch(w,b)}/finance/cash-sessions`, {openingFloatMinor}, key()),
  closeCashSession: (w: string, b: string, sessionId: string, countedClosingMinor: number) => apiClient.post(`${branch(w,b)}/finance/cash-sessions/${enc(sessionId)}/close`, {countedClosingMinor}, key()),
  expenseCategories: (w:string,b:string) => apiClient.get<Record<string,unknown>[]>(`${branch(w,b)}/finance/expense-categories`),
  createExpenseCategory: (w:string,b:string,input:{code:string;name:string;ledgerAccountId:string}) => apiClient.post(`${branch(w,b)}/finance/expense-categories`,input,key()),
  expenses: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/expenses`),
  createExpense: (w: string, b: string, input: Record<string, unknown>) => apiClient.post(`${branch(w,b)}/finance/expenses`, input, key()),
  approveExpense: (w: string, b: string, expenseId: string) => apiClient.post(`${branch(w,b)}/finance/expenses/${enc(expenseId)}/approve`, {}, key()),
  payApprovedExpense: (w:string,b:string,expenseId:string,input:{method:string;reference:string}) => apiClient.post(`${branch(w,b)}/finance/expenses/${enc(expenseId)}/payment`,input,key()),
  createFixedAsset: (w:string,b:string,input:Record<string,unknown>) => apiClient.post(`${branch(w,b)}/finance/fixed-assets`,input,key()),
  depreciateFixedAsset: (w:string,b:string,id:string,accountingPeriodId:string) => apiClient.post(`${branch(w,b)}/finance/fixed-assets/${enc(id)}/depreciate`,{accountingPeriodId},key()),
  fixedAssets: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/fixed-assets`),
  creditNotes: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/credit-notes`),
  bankAccounts: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/bank-accounts`),
  createBankAccount: (w: string, b: string, input: {accountName:string;bankName:string;accountNumberMasked:string;currency:string;ledgerAccountId?:string}) => apiClient.post(`${branch(w,b)}/finance/bank-accounts`, input, key()),
  bankReconciliations: (w:string,b:string) => apiClient.get<BankReconciliationRecord[]>(`${branch(w,b)}/finance/bank-reconciliations`),
  bankStatementLines: (w:string,b:string,accountId:string) => apiClient.get<BankStatementRecord[]>(`${branch(w,b)}/finance/bank-accounts/${enc(accountId)}/statement-lines`),
  postedBankLedgerLines: (w:string,b:string,accountId:string) => apiClient.get<PostedBankLedgerLine[]>(`${branch(w,b)}/finance/bank-accounts/${enc(accountId)}/posted-ledger-lines`),
  importBankStatement: (w:string,b:string,accountId:string,lines:Array<{transactionDate:string;direction:'credit'|'debit';amountMinor:number;description:string;reference?:string;externalId?:string}>) => apiClient.post<{inserted:number;duplicates:number}>(`${branch(w,b)}/finance/bank-accounts/${enc(accountId)}/statement-lines/import`, {lines}, key()),
  startBankReconciliation: (w:string,b:string,input:{bankAccountId:string;statementDate:string;openingBalanceMinor:number;closingBalanceMinor:number}) => apiClient.post<BankReconciliationRecord>(`${branch(w,b)}/finance/bank-reconciliations`, input, key()),
  matchBankLine: (w:string,b:string,reconciliationId:string,statementLineId:string,journalLineId:string) => apiClient.post(`${branch(w,b)}/finance/bank-reconciliations/${enc(reconciliationId)}/matches`, {statementLineId,journalLineId}, key()),
  completeBankReconciliation: (w:string,b:string,reconciliationId:string) => apiClient.post(`${branch(w,b)}/finance/bank-reconciliations/${enc(reconciliationId)}/complete`, {}, key()),
  costCentres: (w: string, b: string) => apiClient.get<Record<string, unknown>[]>(`${branch(w,b)}/finance/cost-centres`),
  createCostCentre: (w: string, b: string, input: {code:string;name:string;parentId?:string}) => apiClient.post(`${branch(w,b)}/finance/cost-centres`, input, key()),
};
