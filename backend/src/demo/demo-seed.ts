import { randomUUID } from 'node:crypto';
import { DEMO_SAMPLE_VERSION } from './demo-policy';

/** Versioned fictional records. No customer snapshots, emails or production IDs. */
export const DEMO_NAME = 'LEXA Demo Traders';
export const DEMO_INDUSTRIES = [
  'retail_trade','wholesale_distribution','electronics','mobile_phones','fashion_beauty',
  'perfumes_cosmetics','food_hospitality','bakery','construction','household_goods',
  'repair_services','education','other',
] as const;

const productNames = [
  'Wireless Mouse','Laptop Bag','Laptop Stand','Office Keyboard','USB-C Charger',
  'Bluetooth Speaker','Desk Lamp','Notebook A5','Ballpoint Pens','Office Chair',
  'Wireless Headphones','Extension Cable','Portable Power Bank','HDMI Cable','Monitor 24 inch',
  'Paper Ream A4','Printer Cartridge','USB Flash Drive','Desk Organizer','Smartphone Case',
  'Laptop Sleeve','Screen Cleaner','Ethernet Cable','Wi-Fi Router','Network Switch',
  'Packing Tape','Shipping Box','Protective Gloves','Barcode Scanner','Receipt Paper',
  'Office Desk','Tablet Cover','Water Bottle','Stapler','File Folder',
  'Calculator','Security Camera','Phone Tripod','Wall Charger','LED Bulb',
  'Mouse Pad','Display Adapter','Label Rolls','Headset','Cable Organizer',
  'Whiteboard','Marker Set','Power Adapter'
];
// Whole-shilling sample amounts by catalogue position (UGX has no fractional minor unit).
const retailPricesUGX = [
  40_000, 75_000, 65_000, 60_000, 55_000, 120_000, 65_000, 7_000,
  5_000, 450_000, 90_000, 25_000, 100_000, 23_000, 750_000, 28_000,
  125_000, 40_000, 30_000, 25_000, 60_000, 18_000, 15_000, 220_000,
  180_000, 10_000, 8_000, 17_000, 250_000, 14_000, 650_000, 40_000,
  20_000, 15_000, 4_000, 50_000, 210_000, 45_000, 35_000, 18_000,
  12_000, 40_000, 16_000, 75_000, 12_000, 185_000, 15_000, 45_000,
] as const;

const customerNames = ['Acacia Café','Kampala Books','Pearl Office Solutions','Cedar Logistics', 'Nile Design Studio', 'Tamarind Schools','Lakeview Hardware','Maple Repairs'];
const supplierNames = ['Demo Eastern Supplies','Sample Lakeside Distribution','Fictional Electronics Hub','Mock Central Wholesalers'];
export const DEMO_MODULES = [
  'customers','leads','opportunities','contacts','campaigns','sales-teams','sales-orders',
  'quotations','price-lists','suppliers','purchase-requests','rfqs','supplier-quotes',
  'purchases','purchase-returns','expenses','cash-sessions','money-accounts','payments',
  'cost-centers','budgets','assets','employees','attendance','leave','timesheets','payroll',
  'work-orders','boms','job-cards','quality','projects','tasks','support','deliveries','packages',
  'stock-counts','batches','replenishment','stock-transfers','warehouses','picklists','item-bundles'
] as const;

// Realistic fictional work items used by the same module-record screens as customer accounts.
const demoRecordLabels: Readonly<Record<string,readonly string[]>> = {
  'customers': ["Acacia Café", "Kampala Books", "Pearl Office Solutions"],
  'leads': ["Acacia office supplies inquiry", "Bookshelf order inquiry", "Café receipt printer inquiry"],
  'opportunities': ["School supply order", "Office desk replacement", "Barcode equipment supply"],
  'contacts': ["Shop manager", "Accounts contact", "Receiving officer"],
  'campaigns': ["Back-to-school offers", "Office supplies week", "Printer consumables outreach"],
  'sales-teams': ["Shop counter team", "Wholesale accounts", "Regional customer visits"],
  'sales-orders': ["School paper and stationery", "Office chairs for delivery", "Router and cabling order"],
  'quotations': ["Acacia shelving estimate", "Pearl laptop accessories", "Kampala Books supply quote"],
  'price-lists': ["Retail counter prices", "Registered wholesale prices", "School accounts prices"],
  'suppliers': ["Demo Eastern Supplies", "Sample Lakeside Distribution", "Fictional Electronics Hub"],
  'purchase-requests': ["Restock A4 paper", "Replace stockroom scanner", "Order laptop chargers"],
  'rfqs': ["Office chairs pricing", "Networking equipment quote", "Printer cartridges quote"],
  'supplier-quotes': ["A4 paper supply offer", "Wireless mouse batch offer", "Delivery cartons offer"],
  'purchases': ["Stationery restock order", "Electronics parts order", "Packing supplies order"],
  'purchase-returns': ["Damaged adapter return", "Incorrect charger shipment", "Damaged cartons return"],
  'expenses': ["Shop rent - sample", "Delivery fuel - sample", "Internet subscription - sample"],
  'cash-sessions': ["Morning checkout shift", "Afternoon checkout shift", "Weekend cash-up"],
  'money-accounts': ["Cash at counter", "Petty cash float", "Sample bank account"],
  'payments': ["Paper order settlement", "Sample POS card collection", "Supplier invoice allocation"],
  'cost-centers': ["Main shop operations", "Wholesale sales", "Delivery costs"],
  'budgets': ["Shop operating budget", "Inventory purchase budget", "Quarterly delivery budget"],
  'assets': ["Office counter computer", "Warehouse shelving", "Delivery motorcycle"],
  'employees': ["Counter cashier", "Inventory coordinator", "Office administrator"],
  'attendance': ["Counter shift - Monday", "Store opening shift", "Stockroom shift"],
  'leave': ["Annual leave request", "Family leave request", "Medical leave request"],
  'timesheets': ["Shop counter hours", "Stock count hours", "Delivery coordination hours"],
  'payroll': ["Counter team payroll", "Store team payroll", "Office team payroll"],
  'work-orders': ["Label shelf units", "Assemble office desks", "Test returned power adapters"],
  'boms': ["Desk assembly materials", "Packing kit components", "Display shelf components"],
  'job-cards': ["Repair a receipt printer", "Service stockroom scanner", "Inspect returned monitor"],
  'quality': ["Check received adapters", "Monitor packaging inspection", "Stockroom safety review"],
  'projects': ["Refit shopfront display", "Set up branch stockroom", "Replace POS equipment"],
  'tasks': ["Review stock discrepancies", "Prepare supplier payment file", "Check late customer invoices"],
  'support': ["Receipt reprint request", "Supplier delivery query", "Warranty check inquiry"],
  'deliveries': ["Kampala Books delivery", "Pearl office desk delivery", "Acacia stationery delivery"],
  'packages': ["Stationery carton 001", "Accessories parcel 002", "Office supplies box 003"],
  'stock-counts': ["Monthly accessories count", "Office supplies shelf count", "Printer supplies count"],
  'batches': ["A4 paper incoming lot", "Printer consumables lot", "Packing materials lot"],
  'replenishment': ["Low-stock adapters", "Paper re-order list", "Packing tape request"],
  'stock-transfers': ["Front counter restock", "Warehouse shelf transfer", "Demo storeroom transfer"],
  'warehouses': ["Main stockroom", "Shop display shelves", "Receiving area"],
  'picklists': ["School delivery picklist", "Office chair picklist", "Accessories delivery picklist"],
  'item-bundles': ["Office starter set", "Desk cable kit", "Packing supplies bundle"],
};

export type DemoSeedScope = { tenantId: string; userId: string; branchId: string };

function atDaysAgo(days: number): Date { return new Date(Date.now() - days * 86_400_000); }

/** All modules share the same CRUD services as real businesses. Avoid fake API fixtures. */
export async function seedDemoBusiness(tx: any, scope: DemoSeedScope): Promise<void> {
  const { tenantId, branchId } = scope;
  const now = new Date();
  await tx.businessProfile.create({ data: {
    tenantId, tradingName:DEMO_NAME,legalName:'LEXA Demo Traders (Fictional)',city:'Kampala',
    district:'Central',country:'UG', industry:'retail_trade',industries:[...DEMO_INDUSTRIES],
    offeringsDescription:'Fictional sample inventory and services for product demonstrations.',
    sellingChannels:['shop','online'],businessModels:['retail','wholesale'],offeringTypes:['physical_goods','services'],setupStep:3,completedAt:now,
  }});
  const categories = ['Electronics','Office Supplies','Accessories','Furniture','Packing'];
  const ids = categories.map(() => randomUUID());
  await tx.category.createMany({data:categories.map((name,i)=>({id:ids[i],tenantId,name}))});
  const productRows = productNames.map((name,i) => ({
    id:randomUUID(),tenantId,name,sku:`DEMO-${String(i+1).padStart(4,'0')}`,
    categoryId:ids[i%ids.length],costPriceMinor:Math.round(retailPricesUGX[i] * 0.72 / 100) * 100,
    sellingPriceMinor:retailPricesUGX[i],
    lowStockThreshold:5,trackStock:true,active:true,
  }));
  await tx.product.createMany({data:productRows});
  await tx.stockMovement.createMany({data:productRows.map((p,i)=>({
    id:randomUUID(),tenantId,branchId,productId:p.id,type:'opening',
    quantityDelta:120+i%25,unitCostMinor:p.costPriceMinor,reason:'Fictional opening stock · demo only',createdAt:atDaysAgo(80),
  }))});
  // Real sale, line, payment and stock-movement relations. Dashboards use actual
  // backend queries; the totals are not hard-coded in frontend components.
  const sales: any[]=[];const lines: any[]=[];const payments: any[]=[];const movements: any[]=[];
  for(let i=0;i<42;i++){
    const p1=productRows[(i*3)%productRows.length];
    const p2=productRows[(i*3+1)%productRows.length];
    const saleId=randomUUID();const qty1=1+(i%3),qty2=1+(i%2);
    const total=p1.sellingPriceMinor*qty1+p2.sellingPriceMinor*qty2;
    const date=atDaysAgo(70-((i*7)%70));
    sales.push({id:saleId,tenantId,branchId,receiptNumber:`DEMO-SALE-${String(i+1).padStart(5,'0')}`,customerName:customerNames[i%customerNames.length],totalMinor:total,status:'completed',createdAt:date});
    for (const [p,qty] of [[p1,qty1],[p2,qty2]] as const) {
      lines.push({id:randomUUID(),tenantId,saleId,productId:p.id,productNameSnapshot:p.name,skuSnapshot:p.sku,quantity:qty,unitCostMinor:p.costPriceMinor,unitPriceMinor:p.sellingPriceMinor,lineTotalMinor:p.sellingPriceMinor*qty});
      movements.push({id:randomUUID(),tenantId,branchId,productId:p.id,type:'sale',quantityDelta:-qty,unitCostMinor:p.costPriceMinor,reason:'Demo receipt',sourceId:saleId,createdAt:date});
    }
    payments.push({id:randomUUID(),tenantId,saleId,kind:'receipt',method:'cash',methodCategory:'cash',amountMinor:total,notes:'Simulated demo payment — no funds transferred',recordedAt:date,createdAt:date});
  }
  await tx.sale.createMany({data:sales});
  await tx.saleLine.createMany({data:lines});
  await tx.salePayment.createMany({data:payments});
  await tx.stockMovement.createMany({data:movements});
  const records: any[]=[];
  for(const [i,moduleId] of DEMO_MODULES.entries()){
    for(let j=0;j<3;j++){
      const id=`DEMO-${moduleId.toUpperCase()}-${j+1}`;
      const date=atDaysAgo((i+j*5)%60);
      const contact=customerNames[(i+j)%customerNames.length];
      const supplier=supplierNames[(i+j)%supplierNames.length];
      const data={
        id,status:'Active',updatedAt:date.toISOString(),createdAt:date.toISOString(),
        name:demoRecordLabels[moduleId]?.[j] ?? `Demo entry ${j+1}`,
        customer:contact,supplier,description:'Fictional record in LEXA Demo Traders. No outside party is involved.',
        reference:id,customerCode:`C-${i+1}${j}`,supplierCode:`S-${i+1}${j}`,
        invoiceNumber:id,orderNumber:id,poNumber:id,quoteNumber:id,projectName:`Project ${j+1}`,
        phone:'+256700000000',email:`sample${i}${j}@demo.invalid`,total:(j+1)*125000,
        issueDate:date.toISOString().slice(0,10),orderDate:date.toISOString().slice(0,10),
        amount:25000*(j+1),employeeNumber:`EMP-${i}${j}`,paymentTerms:'30 days',
      };
      records.push({id:randomUUID(),tenantId,branchId,moduleId,recordId:id,data,createdAt:date,updatedAt:date});
    }
  }
  await tx.moduleRecord.createMany({data:records});
  await tx.auditEvent.create({ data:{tenantId,actorUserId:scope.userId,action:'demo.seed.created',resourceType:'demo',resourceId:String(DEMO_SAMPLE_VERSION),metadata:{version:DEMO_SAMPLE_VERSION,products:productRows.length,sales:sales.length,moduleRecords:records.length}}});
}
