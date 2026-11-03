import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path,import.meta.url),'utf8');

test('receipt is headed by each business, with preserved branding, tax, cashier and payment details',()=>{
 const sale=read('../src/core/core.controller.ts');
 const receipt=read('../../lexa-frontend/src/modules/sales/SaleReceiptDocument.tsx');
 const migration=read('../prisma/migrations/20261104040000_selling_receipts_and_integrity/migration.sql');
 for(const key of ['receiptBusinessSnapshot','cashierUserId','cashTenderedMinor','cashChangeMinor','skuSnapshot','taxMinor'])assert.ok(sale.includes(key),key);
 for(const key of ['businessName','legalName','phone','taxIdentificationNumber','taxMinor','sale.receiptNumber','cashTenderedMinor','cashChangeMinor'])assert.ok(receipt.includes(key),key);
 for(const column of ['receipt_business_snapshot','cashier_user_id','cash_tendered_minor','cash_change_minor','sku_snapshot','barcode_snapshot'])assert.ok(migration.includes(column),column);
 assert.doesNotMatch(migration,/\bDROP\b/i);
});

test('checkout saves a sale, stock movements, payment lines and ledger within one transaction',()=>{
 const core=read('../src/core/core.controller.ts');
 for(const text of ['tx.sale.create','tx.saleLine.create','tx.stockMovement.create','tx.salePayment.create','postLedgerJournal(tx','sale.completed'])assert.ok(core.includes(text),text);
 assert.match(core,/isolationLevel: 'Serializable'/);
 assert.match(core,/Idempotency-Key header is required for completing a sale/);
 assert.match(core,/cashTenderedMinor<appliedCashMinor/);
 assert.match(core,/paidMinor > totalMinor/);
});

test('camera scanning no longer blocked by Vercel permissions policy and works without native BarcodeDetector',()=>{
 const headers=read('../../lexa-frontend/vercel.json');
 const scanner=read('../../lexa-frontend/src/components/barcode/BarcodeCapture.tsx');
 assert.match(headers,/camera=\(self\)/);
 assert.doesNotMatch(headers,/camera=\(\)/);
 assert.match(scanner,/BrowserMultiFormatReader/);
 assert.match(scanner,/decodeFromConstraints/);
 assert.match(scanner,/decodeFromImageUrl/);
 assert.match(scanner,/NotAllowedError/);
 assert.match(scanner,/getUserMedia/);
});

test('approved price lists are effective at checkout and guarded by owner approval',()=>{
 const core=read('../src/core/core.controller.ts');
 const catalog=read('../src/commerce/catalog-inventory.controller.ts');
 const checkout=read('../../lexa-frontend/src/modules/checkout/CheckoutPage.tsx');
 assert.match(core,/priceListItem/);
 assert.match(catalog,/catalog\/price-lists\/active/);
 assert.match(catalog,/catalog\/price-lists\/:priceListId\/activate/);
 assert.match(catalog,/Only the business owner can approve selling prices/);
 assert.match(catalog,/active:false/);
 assert.match(checkout,/priceListId:selectedPriceListId/);
 assert.match(checkout,/cashTenderedMinor/);
});

test('accepted quotations convert to real orders at original agreed prices and prevent duplicates',()=>{
 const commerce=read('../src/commerce/commerce.controller.ts');
 const quote=read('../../lexa-frontend/src/modules/selling/SellingQuotationsPage.tsx');
 assert.match(commerce,/sourceQuotationId/);
 assert.match(commerce,/quote\.status!=='Accepted'/);
 assert.match(commerce,/confirmedTotal/);
 assert.match(commerce,/q\.unitPriceMinor/);
 assert.match(commerce,/source_module_id='quotations'/);
 assert.match(commerce,/An order already exists for this quotation/);
 assert.match(quote,/apiCommerce\.createSalesOrder/);
 assert.match(quote,/customerAcceptanceReference/);
});

test('selling reports derive from tenant-scoped real sale, payment, return and product records',()=>{
 const core=read('../src/core/core.controller.ts');
 const roles=read('../src/authorization/role-policy.ts');
 assert.match(core,/async sellingInsights/);
 assert.match(core,/runWithTenantContext/);
 assert.match(core,/FROM sales s/);
 assert.match(core,/FROM sale_payments p/);
 assert.match(core,/FROM sale_returns r/);
 assert.match(core,/FROM sale_lines l/);
 assert.match(core,/outstandingMinor/);
 assert.match(roles,/selling\\\/insights/);
});

