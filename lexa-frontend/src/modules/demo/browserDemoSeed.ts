/**
 * Fictional, browser-contained LEXA business. This is deliberately separate
 * from the server-backed `seedDemoBusiness`: it never creates a tenant or
 * contacts a production API. The real LEXA routes and local repositories are
 * used to inspect and change these sample records in one visitor's browser.
 *
 * The 48-product and 42-sale dataset is linked: receipt lines reference
 * products, payments reference receipts, and sold quantities create stock
 * movements. The remaining business-area registers use named fictional
 * examples rather than empty screens or fabricated dashboard totals.
 */
import { db } from '../../data/local/database';
import { localWorkspaceRepository } from '../../data/local/workspaces';
import { localModuleRecordService } from '../../data/local/moduleRecords';
import { MODULE_CATALOG, type ModuleField, type PreviewRecord } from '../operations/moduleCatalog';
import type { ModuleRecordScope } from '../../data/contracts/previewData';
import type { Category, Product, StockMovement, Sale, SaleLine, PaymentRecord } from '../../domain/shared/types';
import { createId } from '../../domain/shared/ids';
import { isBrowserDemoBuild } from '../../data/remote/runtimeConfig';

export const BROWSER_DEMO_BUSINESS = 'LEXA Demo Traders';
export const BROWSER_DEMO_EXPIRY_KEY = 'lexa.demo.browser.expiresAt';
export const BROWSER_DEMO_READY_KEY = 'lexa.demo.browser.ready.v1';
export const BROWSER_DEMO_DURATION_MS = 2 * 60 * 60 * 1000;
export const BROWSER_DEMO_MODULE_PREFIX = 'lexa.demo.module-records.v1';

const customerNames = [
  'Kampala Books', 'Acacia Café', 'Maple Repairs', 'Nakasero Office Supplies',
  'Cityline Pharmacy', 'Pearl Stationery', 'Mengo Home Store', 'Kira Food Mart',
  'Bukoto Creative Studio', 'Banda Tech Workshop', 'Kawanda Schools', 'Wandegeya Traders',
];
const supplierNames = ['Kampala Distribution House', 'Nile Office Wholesale', 'Pearl Coast Supplies', 'Lakeview Imports', 'Bugolobi Electronics Depot'];
const sampleProducts: ReadonlyArray<readonly [string,string,number,number]> = [
  ['A4 copy paper, 500 sheets','Stationery',13500,18500], ['Blue ballpoint pen pack','Stationery',8200,14000],
  ['A5 ruled notebook','Stationery',3200,5500], ['Permanent marker set','Stationery',6000,9500],
  ['Stapler with staples','Stationery',13000,21000], ['Document folder, clear','Stationery',1100,2200],
  ['Desk diary','Stationery',9500,17000], ['Envelope pack','Stationery',4500,8000],
  ['Packing tape roll','Stationery',4200,7500], ['Thermal receipt paper','Stationery',6500,10000],
  ['USB-C charging cable','Electronics',9500,18000], ['20W phone charger','Electronics',26500,42000],
  ['Wireless mouse','Electronics',28000,45000], ['USB 32 GB flash drive','Electronics',19000,32000],
  ['Bluetooth earbuds','Electronics',48000,85000], ['Laptop sleeve 14-inch','Electronics',37000,59000],
  ['Screen protector, universal','Electronics',5500,12000], ['HDMI cable 2m','Electronics',16500,29000],
  ['Laptop stand','Electronics',39000,69000], ['Extension cable 4-way','Electronics',24500,43000],
  ['Rice 5 kg bag','Groceries',17500,25500], ['Sugar 2 kg bag','Groceries',6900,10500],
  ['Cooking oil 1 litre','Groceries',6200,10500], ['Tea leaves 250 g','Groceries',4300,7500],
  ['Coffee, ground 250 g','Groceries',13500,20000], ['Bottled water 500 ml','Groceries',800,1600],
  ['Biscuits variety pack','Groceries',4200,7200], ['Dry beans 2 kg','Groceries',7800,14000],
  ['Salt 1 kg','Groceries',1300,2600], ['Maize flour 2 kg','Groceries',4700,7500],
  ['Hand wash 500 ml','Home & care',6500,10500], ['Laundry powder 1 kg','Home & care',5500,9500],
  ['Dishwashing liquid 750 ml','Home & care',5600,9500], ['Toilet tissue 10-pack','Home & care',12500,19000],
  ['AA battery 4-pack','Home & care',4800,9000], ['Microfiber cloth set','Home & care',5600,9800],
  ['Floor cleaner 1 litre','Home & care',7600,13000], ['LED bulb 12W','Home & care',6500,12000],
  ['Reusable shopping bag','Home & care',3800,7000], ['Storage basket','Home & care',9500,17000],
  ['Canvas tote bag','Accessories',11000,22000], ['Notebook gift set','Accessories',16000,30000],
  ['Stainless water bottle','Accessories',24000,44000], ['Phone stand','Accessories',6500,12000],
  ['Umbrella, compact','Accessories',13500,25000], ['Canvas pouch','Accessories',8500,15500],
  ['Travel adaptor','Accessories',19500,34000], ['Desk organizer','Accessories',14200,26000],
];

/** Intentionally specific labels, shared across related registers. */
const namesByArea: Readonly<Record<string, readonly string[]>> = {
  customers: customerNames, suppliers: supplierNames,
  'sales-orders': ['Acacia Café office order','Kampala Books stationery restock','Mengo Home Store accessory order'],
  'sales-invoices': ['Acacia Café account invoice','Kampala Books monthly statement','Maple Repairs accessories invoice'],
  quotations: ['Nakasero School stationery quotation','Kira Food Mart display quotation','Maple Repairs equipment quotation'],
  purchases: ['Pearl Coast monthly replenishment','Nile Office stationery purchase','Lakeview electronics replenishment'],
  'purchase-invoices': ['Pearl Coast supply invoice','Nile Office trade bill','Lakeview Imports purchase bill'],
  receiving: ['Pearl Coast delivery GRN','Nile Office paper delivery','Lakeview charger delivery'],
  expenses: ['Electricity for Kampala branch','Shop rent for November','Motorbike delivery fuel','Internet subscription'],
  'money-accounts': ['Main cash drawer','Business bank account','Mobile Money collections'],
  payments: ['Acacia Café account receipt','Kampala Books invoice settlement','Pearl Coast supplier payment'],
  accounting: ['November sales journal','Shop rent expense journal','Opening cash balance'],
  assets: ['Shop counter and fittings','Office laptop','Receipt printer'],
  'stock-counts': ['November stationery count','Electronics shelf check','Weekly grocery stocktake'],
  'tax-documents': ['October VAT draft','Supplier input tax review','November sales tax summary'],
  'stock-transfers': ['Stationery to Entebbe pickup','Electronics to storage room','Storefront shelf replenishment'],
  team: ['Amina Nsubuga – sales','Patrick Muwonge – inventory','Sarah Akello – accounts'],
  'price-lists': ['Retail shelf prices','Wholesale customer rates','Staff purchase rates'],
  deliveries: ['Acacia Café city delivery','Kampala Books parcel dispatch','Maple Repairs collection'],
  warehouses: ['Kampala shop floor','Back-store room','Entebbe collection point'],
  employees: ['Amina Nsubuga','Patrick Muwonge','Sarah Akello','Daniel Kato'],
  attendance: ['Amina – morning shift','Patrick – afternoon shift','Sarah – accounts shift'],
  payroll: ['October payroll register','November payroll draft','Sales commission review'],
  'chart-of-accounts': ['Cash on hand','Trade receivables','Inventory on hand','Trade payables'],
  'tax-codes': ['VAT Standard','VAT Zero rated','VAT Exempt'],
  'bank-reconciliation': ['October bank statement review','Mobile Money reconciliation','November cashbook matching'],
  'purchase-requests': ['Thermal paper reorder','Charging cable restock','Office consumables request'],
  rfqs: ['Stationery wholesale quotes','Phone accessories supplier inquiry','Cleaning supplies inquiry'],
  'supplier-quotes': ['Nile Office November quotation','Lakeview Imports accessories quote','Pearl Coast pantry supply quote'],
  opportunities: ['Cityline Pharmacy annual supply','Nakasero School stationery contract','Bukoto Studio devices'],
  'sales-returns': ['Incorrect cable refund','Damaged notebook return','Wrong size adaptor exchange'],
  'purchase-returns': ['Damaged chargers returned','Incorrect paper lot returned','Packing tape short delivery'],
  projects: ['New shop shelf installation','November stocktake preparation','Wholesale catalogue refresh'],
  tasks: ['Follow up Acacia Café invoice','Count electronics shelf','Confirm supplier delivery'],
  support: ['Customer reported charging issue','Wholesale invoice clarification','Receipt reprint request'],
  'work-orders': ['Assemble gift stationery packs','Prepare store display kits','Pack corporate stationery orders'],
  quality: ['Incoming charger inspection','Paper damage check','Gift pack seal inspection'],
  batches: ['Copy paper lot N24','Cooking oil batch U118','Receipt roll carton R66'],
  leads: ['Kawanda Schools purchasing desk','Bugolobi Traders branch','Bukoto Creative Studio'],
  'cash-sessions': ['Kampala morning cash-up','Saturday checkout close','Weekend shift reconciliation'],
  boms: ['Office stationery gift kit','Retail receipt starter kit','Home desk setup bundle'],
  'job-cards': ['Assemble gift packs – 20 units','Price shelf labels','Office starter kit packing'],
  leave: ['Amina annual leave request','Patrick medical appointment','Daniel family leave'],
  replenishment: ['Receipt paper below reorder','USB-C cable reorder','Bottled water weekend restock'],
  packages: ['Acacia Café delivery carton','Kampala Books stationery parcel','Maple Repairs accessory pouch'],
  contacts: ['Grace – Acacia Café','Moses – Kampala Books','Naomi – Pearl Coast Supplies'],
  campaigns: ['Back-to-school stationery','November tech accessories','Local wholesale outreach'],
  'sales-teams': ['Kampala counter team','Wholesale accounts team','Field sales territory'],
  'item-bundles': ['Office starter stationery kit','Mobile charging essentials','Household cleaning set'],
  picklists: ['Acacia Café order pick','Kampala Books parcel pick','Maple Repairs accessories pick'],
  'cost-centers': ['Retail shop','Wholesale orders','Delivery operations'],
  budgets: ['Shop operating budget','November procurement budget','Customer growth budget'],
  'recurring-invoices': ['Acacia Café monthly supply','Kampala Books service fee','Cityline Pharmacy stationery'],
  timesheets: ['Shelf installation hours','Wholesale packing shift','Monthly stocktake hours'],
};

const dateFields = /date|period|due|start|end|expiry|valid|payday|birth|attendance|shift|timestamp|issued/i;
const priceFields = /total|amount|cost|price|balance|budget|credit|limit|rate|value|gross|net|taxable|paid|received|salary|wage|allowance|payable|receivable/i;
const codeFields = /reference|number|code|sku|serial|batch|identifier|ref$/i;
const textNameFields = /name|description|title|subject|customer|supplier|employee|vendor|contact|product|project|company|lead|opportunity/i;

function dateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0,10);
}
function fakeField(field: ModuleField, moduleId: string, index: number, label: string): string {
  const key = field.key;
  if (key === 'status') return field.options?.[(index === 0 ? 0 : index % (field.options?.length ?? 1))] ?? 'Active';
  if (key.toLowerCase().includes('email')) return `sample${index+1}.${moduleId.replace(/[^a-z]/g,'')}@example.invalid`;
  if (/phone|mobile/i.test(key)) return `+256 700 000 ${String(index+1).padStart(3,'0')}`;
  if (field.kind === 'select') return field.options?.[index % (field.options?.length || 1)] ?? '';
  if (field.kind === 'date' || dateFields.test(key)) return dateDaysAgo(index * 4 + 1);
  if (field.kind === 'number' || priceFields.test(key)) {
    if (/quantity|qty|units|hours|days|headcount|attendance|percent|rate|life|numberOf/i.test(key)) return String(3 + index * 2);
    return String(65000 + index * 42500 + moduleId.length * 750);
  }
  if (codeFields.test(key)) return `${moduleId.slice(0,4).toUpperCase()}-${String(index+1).padStart(4,'0')}`;
  if (/currency/i.test(key)) return 'UGX';
  if (/address|location|city/i.test(key)) return 'Kampala, Uganda';
  if (/method/i.test(key)) return 'Cash';
  if (textNameFields.test(key)) return label;
  return label;
}

export async function browserDemoExists(): Promise<boolean> {
  if (!isBrowserDemoBuild) return false;
  const expiresAt = Number(window.localStorage.getItem(BROWSER_DEMO_EXPIRY_KEY));
  if (expiresAt && expiresAt <= Date.now()) { await resetBrowserDemo(); return false; }
  const count = await db.workspaces.count();
  // A closed tab during seeding must not leave a half-populated sample business.
  if (count && (!expiresAt || window.localStorage.getItem(BROWSER_DEMO_READY_KEY) !== 'yes')) {
    await resetBrowserDemo();
    return false;
  }
  return count > 0;
}

export async function seedBrowserDemo(): Promise<void> {
  if (!isBrowserDemoBuild) throw new Error('Browser demonstration seeding is unavailable in the customer application.');
  if (await browserDemoExists()) return;
  const workspace = await localWorkspaceRepository.create({
    businessName: BROWSER_DEMO_BUSINESS, businessType: 'retail_trade',
    currency: 'UGX', timezone: 'Africa/Kampala', branchName: 'Kampala Central',
  });
  const branch = (await localWorkspaceRepository.listBranches(workspace.id))[0];
  if (!branch) throw new Error('Sample business branch was not created.');

  const categories: Category[] = [...new Set(sampleProducts.map(row => row[1]))].map(name => ({
    id: createId('cat'), workspaceId: workspace.id, name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }));
  const categoryId = new Map(categories.map(category => [category.name, category.id]));
  const products: Product[] = sampleProducts.map(([name,cat,cost,price],i)=>({
    id: createId('prd'), workspaceId:workspace.id, name, sku:`DEMO-${String(i+1).padStart(4,'0')}`,
    categoryId: categoryId.get(cat)!, costPriceMinor:cost, sellingPriceMinor:price,
    lowStockThreshold:8, trackStock:true, active:true,
    createdAt:dateDaysAgo(80), updatedAt:new Date().toISOString(),
  }));
  const movements: StockMovement[] = products.map((product,i)=>({
    id:createId('mov'), workspaceId:workspace.id, branchId:branch.id, productId:product.id,
    type:'opening', quantityDelta:i%13===0?7:55+(i*11)%70,
    reason:'Fictional opening quantity',createdAt:new Date(Date.now()-80*86_400_000).toISOString(),
  }));
  const sales: Sale[] = [];
  const lines: SaleLine[] = [];
  const payments: PaymentRecord[] = [];
  for(let i=0;i<42;i++){
    const saleId=createId('sale');
    const createdAt=new Date(Date.now()-(i%33)*86_400_000-(i%11)*1_200_000).toISOString();
    const selected=[products[(i*5)%products.length]!,products[(i*7+11)%products.length]!];
    let totalMinor=0;
    selected.forEach((product,index)=>{
      const quantity=index+1;
      const lineTotalMinor=quantity*product.sellingPriceMinor;
      totalMinor+=lineTotalMinor;
      lines.push({id:createId('line'),workspaceId:workspace.id,saleId,productId:product.id,
        productNameSnapshot:product.name,skuSnapshot:product.sku,quantity,
        unitPriceMinor:product.sellingPriceMinor,lineTotalMinor});
      movements.push({id:createId('mov'),workspaceId:workspace.id,branchId:branch.id,productId:product.id,
        type:'sale',quantityDelta:-quantity,sourceId:saleId,reason:`Sample receipt ${String(i+1).padStart(5,'0')}`,createdAt});
    });
    sales.push({id:saleId,receiptNumber:`DEMO-SALE-${String(i+1).padStart(5,'0')}`,workspaceId:workspace.id,
      branchId:branch.id,customerName:customerNames[i%customerNames.length]!,totalMinor,status:'completed',createdAt});
    payments.push({id:createId('payment'),workspaceId:workspace.id,saleId,kind:'receipt',
      method:i%4===0?'mobile_money':'cash',amountMinor:totalMinor,
      notes:'Fictional payment; no money was transferred',createdAt});
  }
  await db.transaction('rw',[db.categories,db.products,db.stockMovements,db.sales,db.saleLines,db.payments],async()=>{
    await db.categories.bulkAdd(categories);
    await db.products.bulkAdd(products);
    await db.stockMovements.bulkAdd(movements);
    await db.sales.bulkAdd(sales);
    await db.saleLines.bulkAdd(lines);
    await db.payments.bulkAdd(payments);
  });
  const scope:ModuleRecordScope={workspaceId:workspace.id,branchId:branch.id};
  for(const module of MODULE_CATALOG){
    const labels=namesByArea[module.id] ?? [
      `${module.title} – Kampala Central`, `${module.title} – November review`, `${module.title} – branch follow-up`,
    ];
    const rows:PreviewRecord[]=labels.slice(0,5).map((label,index)=>{
      const record:PreviewRecord={id:`demorec-${module.id}-${index+1}`,updatedAt:new Date().toISOString(),
        status:module.fields.find(field=>field.key==='status')?.options?.[index % (module.fields.find(field=>field.key==='status')?.options?.length || 1)] ?? 'Active'};
      for(const field of module.fields){
        record[field.key]=fakeField(field,module.id,index,label);
      }
      if(module.dateKey && !record[module.dateKey])record[module.dateKey]=dateDaysAgo(index*3+1);
      if(module.amountKey && !record[module.amountKey])record[module.amountKey]=String(85000+index*35000);
      if(!record.name)record.name=label;
      return record;
    });
    await localModuleRecordService.replace(scope,module.id,rows);
  }
  window.localStorage.setItem(BROWSER_DEMO_EXPIRY_KEY,String(Date.now()+BROWSER_DEMO_DURATION_MS));
  window.localStorage.setItem('lexa.demo.ui.activeWorkspaceId',workspace.id);
  window.localStorage.setItem('lexa.demo.ui.activeBranchId',branch.id);
  // Completion is written last, after all sample records exist.
  window.localStorage.setItem(BROWSER_DEMO_READY_KEY,'yes');
}

export async function resetBrowserDemo():Promise<void>{
  if(!isBrowserDemoBuild)throw new Error('Demo reset must never run in the customer application.');
  await db.transaction('rw',db.tables,async()=>{
    for(const table of db.tables)await table.clear();
  });
  for(let i=window.localStorage.length-1;i>=0;i--){
    const key=window.localStorage.key(i);
    if(key?.startsWith(BROWSER_DEMO_MODULE_PREFIX+':')||key===BROWSER_DEMO_EXPIRY_KEY||key===BROWSER_DEMO_READY_KEY||key==='lexa.demo.ui.activeWorkspaceId'||key==='lexa.demo.ui.activeBranchId'){
      if(key)window.localStorage.removeItem(key);
    }
  }
}
