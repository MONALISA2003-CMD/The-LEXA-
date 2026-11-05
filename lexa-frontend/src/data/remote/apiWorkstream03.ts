import { apiClient } from './apiClient';
const enc = (v: string) => encodeURIComponent(v);
const tenant = (w: string) => `/workspaces/${enc(w)}`;
const branch = (w: string, b: string) => `${tenant(w)}/branches/${enc(b)}`;
const key = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `lexa-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type ElectronicsReceiptUnit = {serialNumber:string;imei2?:string;extraImeis?:string[];condition?:'new'|'open_box'|'used_good'|'used_fair'|'refurbished'|'damaged';notes?:string};
export type ElectronicsProductAlias = {id:string;aliasType:string;aliasValue:string;normalizedValue:string};
export type ElectronicsPackageRevision = {id:string;version:number;unitsPerPackage:string;effectiveAt:string;createdAt:string};
export type ElectronicsProductBundle = {id:string;productId:string;mode:'sealed_kit'|'assembled_kit';status:'draft'|'active'|'archived'};
export type ElectronicsFitment = {id:string;deviceModelId:string;verifiedAt:string|null;fitmentNotes:string|null;compatibilityKind:string;reviewState:string;revokedAt:string|null};
export const apiCatalogInventory = {
  searchProductsByIdentity:(w:string,q:string)=>apiClient.get<import('../../domain/shared/types').Product[]>(`${tenant(w)}/catalog/products/search`,{q}),
  productAliases:(w:string,p:string)=>apiClient.get<ElectronicsProductAlias[]>(`${tenant(w)}/products/${enc(p)}/search-aliases`),
  createProductAlias:(w:string,p:string,aliasType:string,aliasValue:string)=>apiClient.post<ElectronicsProductAlias>(`${tenant(w)}/products/${enc(p)}/search-aliases`,{aliasType,aliasValue},key()),
  receiveSerializedStock:(w:string,b:string,input:{productId:string;warehouseId:string;variantId?:string;reference:string;sourceKind:'approved_opening';unitCostMinor:number;units:ElectronicsReceiptUnit[]},idempotencyKey:string)=>apiClient.post<{id:string;accepted:number;alreadyPosted:boolean}>(`${branch(w,b)}/inventory/receipts/serialized`,input,idempotencyKey),
  lookupPhysicalIdentity:(w:string,b:string,identifier:string)=>apiClient.get<{id:string;productId:string;variantId:string|null;status:string;identifierType:string}>(`${branch(w,b)}/inventory/identifiers/lookup`,{identifier}),
  reconcilePhysicalUnits:(w:string,b:string)=>apiClient.get<{items:Array<{productId:string;name:string;ledgerUnits:number;registeredUnits:number;delta:number;balanced:boolean}>;hasMismatch:boolean}>(`${branch(w,b)}/inventory/units/reconciliation`),
  packageConversionHistory:(w:string,p:string,pack:string)=>apiClient.get<ElectronicsPackageRevision[]>(`${tenant(w)}/products/${enc(p)}/packages/${enc(pack)}/conversions`),
  revisePackageConversion:(w:string,p:string,pack:string,unitsPerPackage:number,effectiveAt:string)=>apiClient.post<ElectronicsPackageRevision>(`${tenant(w)}/products/${enc(p)}/packages/${enc(pack)}/conversions`,{unitsPerPackage,effectiveAt},key()),
  reviewAccessoryFit:(w:string,id:string,input:{outcome:'verified'|'rejected'|'revoked';compatibilityKind:'physical'|'electrical'|'protocol'|'consumable';evidenceReference:string;confirmedElectricalSafety:boolean;voltageRange?:string;currentAmps?:number;connectorType?:string})=>apiClient.post<ElectronicsFitment>(`${tenant(w)}/catalog/compatibilities/${enc(id)}/review`,input,key()),
  availableCompatibleAccessories:(w:string,b:string,model:string)=>apiClient.get<Array<{product:import('../../domain/shared/types').Product;variantId:string|null;available:number;fitment:Array<{id:string;kind:string}>}>>(`${branch(w,b)}/catalog/device-models/${enc(model)}/available-accessories`),
  productBundle:(w:string,p:string)=>apiClient.get<ElectronicsProductBundle|null>(`${tenant(w)}/products/${enc(p)}/bundle`),
  createProductBundle:(w:string,p:string,input:{mode:'sealed_kit'|'assembled_kit';components:Array<{productId:string;variantId?:string;quantity:number}>})=>apiClient.post<ElectronicsProductBundle>(`${tenant(w)}/products/${enc(p)}/bundle`,input,key()),
  activateProductBundle:(w:string,p:string)=>apiClient.post<ElectronicsProductBundle>(`${tenant(w)}/products/${enc(p)}/bundle/activate`,{},key()),
  assembleProductBundle:(w:string,b:string,p:string,input:{warehouseId:string;quantity:number},idempotencyKey:string)=>apiClient.post<{batchId:string;quantity:number;alreadyPosted:boolean}>(`${branch(w,b)}/products/${enc(p)}/bundle/assemble`,input,idempotencyKey),
  catalogBrands:(w:string)=>apiClient.get<Array<{id:string;tenantId:string;name:string;normalizedName:string}>>(`${tenant(w)}/catalog/brands`),
  createCatalogBrand:(w:string,name:string)=>apiClient.post<{id:string;name:string}>(`${tenant(w)}/catalog/brands`,{name},key()),
  catalogDeviceModels:(w:string)=>apiClient.get<Array<{id:string;tenantId:string;brandId:string;name:string;productType:string;manufacturerCode:string|null}>>(`${tenant(w)}/catalog/device-models`),
  createCatalogDeviceModel:(w:string,input:{brandId:string;name:string;productType:string;manufacturerCode?:string})=>apiClient.post<{id:string;brandId:string;name:string;productType:string}>(`${tenant(w)}/catalog/device-models`,input,key()),
  accessoryFits:(w:string,productId:string)=>apiClient.get<ElectronicsFitment[]>(`${tenant(w)}/products/${enc(productId)}/compatible-models`),
  linkAccessoryFit:(w:string,productId:string,input:{deviceModelId:string;fitmentNotes?:string})=>apiClient.post(`${tenant(w)}/products/${enc(productId)}/compatible-models`,input,key()),
  verifyAccessoryFit:(w:string,id:string)=>apiClient.post(`${tenant(w)}/catalog/compatibilities/${enc(id)}/verify`,{},key()),
  verifiedAccessories:(w:string,modelId:string)=>apiClient.get<Array<import('../../domain/shared/types').Product>>(`${tenant(w)}/catalog/device-models/${enc(modelId)}/compatible-accessories`),
  unitLifecycle:(w:string,b:string,serialId:string)=>apiClient.get<{unit:{id:string;serialNumber:string;productId:string;status:string};movements:Array<{id:string;type:string;createdAt:string;reason:string}>;inspections:Array<{id:string;condition:string;createdAt:string}>;sales:Array<{id:string;saleId:string;sale:{receiptNumber:string;createdAt:string}}> ;returns:Array<{id:string;disposition:string;returnRecord:{returnNumber:string;createdAt:string}}>}>(`${branch(w,b)}/inventory/serials/${enc(serialId)}/history`),
  unitInspections:(w:string,b:string,serialId:string)=>apiClient.get<Array<{id:string;condition:string;batteryHealthPercent:number|null;notes:string|null;createdAt:string}>>(`${branch(w,b)}/inventory/serials/${enc(serialId)}/inspections`),
  addUnitInspection:(w:string,b:string,serialId:string,input:{condition:string;batteryHealthPercent?:number;notes?:string})=>apiClient.post(`${branch(w,b)}/inventory/serials/${enc(serialId)}/inspections`,input,key()),
  industryConfig: (w:string)=>apiClient.get<{schemaVersion:number;industries:string[];subActivityCodes:string[];activityRevision:number;policyHash:string;recommendedProductTypes:string[];availableSpecialties:Array<{code:string;industryCode:string;label:string;packCode:string;recommendedProductTypes:string[]}>;supportedIndustries:Array<{code:string;label:string}>;categoryPaths:Record<string,string[][]>;productPolicies:Record<string,unknown>}>(`${tenant(w)}/catalog/industry-config`),
  ensureCategoryPath: (w:string,path:readonly string[])=>apiClient.post<{categoryId:string;path:string[]}>(`${tenant(w)}/categories/ensure-path`,{path:[...path]},key()),
  productPackages:(w:string,p:string)=>apiClient.get<Array<{id:string;tenantId:string;productId:string;variantId:string|null;code:string;name:string;unitsPerPackage:string;baseUnit:string;active:boolean}>>(`${tenant(w)}/products/${enc(p)}/packages`),
  allProductPackages:(w:string)=>apiClient.get<Array<{id:string;tenantId:string;productId:string;variantId:string|null;code:string;name:string;unitsPerPackage:string;baseUnit:string;active:boolean}>>(`${tenant(w)}/catalog/packages`),
  createProductPackage:(w:string,p:string,input:{code:string;name:string;unitsPerPackage:number;variantId?:string})=>apiClient.post(`${tenant(w)}/products/${enc(p)}/packages`,input,key()),
  categories: (w:string)=>apiClient.get<import('../../domain/shared/types').Category[]>(`${tenant(w)}/categories`),
  createCategory: (w:string,input:{name:string;parentId?:string;templateKey?:string;attributeSchema?:unknown[]})=>apiClient.post<import('../../domain/shared/types').Category>(`${tenant(w)}/categories`,input,key()),
  updateCategory: (w:string,id:string,input:Record<string,unknown>)=>apiClient.patch<import('../../domain/shared/types').Category>(`${tenant(w)}/categories/${enc(id)}`,input),
  allVariants:(w:string)=>apiClient.get<Array<{id:string;productId:string;sku:string;barcode:string|null;attributes:Record<string,string|number|boolean>;costPriceMinor:number;sellingPriceMinor:number;active:boolean}>>(`${tenant(w)}/catalog/variants`),
  variantBalances:(w:string,b:string)=>apiClient.get<Array<{productId:string;variantId:string|null;quantity:number}>>(`${branch(w,b)}/inventory/variant-balances`),
  availableLots:(w:string,b:string,p:string,variantId?:string)=>apiClient.get<Array<{id:string;lotNumber:string;expiryDate:string|null;available:number;variantId:string|null}>>(`${branch(w,b)}/inventory/lots/available`,{productId:p,...(variantId?{variantId}:{})}),
  variants: (w:string,p:string)=>apiClient.get<Array<{id:string;productId:string;sku:string;barcode:string|null;attributes:Record<string,string|number|boolean>;costPriceMinor:number;sellingPriceMinor:number;active:boolean}>>(`${tenant(w)}/products/${enc(p)}/variants`),
  createVariant: (w:string,p:string,input:Record<string,unknown>)=>apiClient.post(`${tenant(w)}/products/${enc(p)}/variants`,input,key()),
  createVariantBatch: (w:string,p:string,variants:Array<{sku:string;barcode?:string;gtin?:string;attributes:Record<string,string>;costPriceMinor:number;sellingPriceMinor:number}>)=>apiClient.post<{created:number}>(`${tenant(w)}/products/${enc(p)}/variants/bulk`,{variants},key()),
  lookupSerial:(w:string,b:string,identifier:string)=>apiClient.get<{id:string;productId:string;variantId:string|null;lotId:string|null;serialNumber:string;identifiers?:{imei2?:string};status:string}>(`${branch(w,b)}/inventory/serials/lookup`,{identifier}),
  availableSerials:(w:string,b:string,p:string,variantId?:string)=>apiClient.get<Array<{id:string;serialNumber:string;identifiers?:{imei2?:string};lotId:string|null;variantId:string|null}>>(`${branch(w,b)}/inventory/serials`,{productId:p,...(variantId?{variantId}:{})}),
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
  createSerial: (w: string, b: string, lotId: string, serialNumber: string, imei2?: string) => apiClient.post(`${branch(w,b)}/inventory/lots/${enc(lotId)}/serials`, {serialNumber,...(imei2?{imei2}:{})}, key()),
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
