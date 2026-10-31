#!/usr/bin/env python3
"""Apply reviewed LEXA Workstream 4 + current build fixes to a clean repository checkout.

Run this script with the repository root as the current working directory. It checks
Git blob hashes for every edited source file and aborts before writing on any drift.
"""
from __future__ import annotations
from pathlib import Path
from hashlib import sha1
import sys

ROOT = Path.cwd()
PATCH = Path(__file__).resolve().parent


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def read(rel: str) -> str:
    path = ROOT / rel
    if not path.is_file():
        fail(f"Required repository file is missing: {rel}")
    return path.read_text(encoding="utf-8")


def git_blob_sha(content: str) -> str:
    raw = content.encode("utf-8")
    return sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


EXPECTED_BLOBS = {
    "backend/src/finance/finance-operations.controller.ts": "a66ae048b3a77aedf05d83cba2e3441ce0a10f3c",
    "backend/prisma/migrations/20261030320000_platform_catalog_finance_rls/migration.sql": "e1cbc94605ccb2d76abb9998c8b5940d60d49005",
    "backend/prisma/schema.prisma": "a502e5700a00171a712e2fd9f24ed78bc3308e9c",
    "backend/src/commerce/commerce.controller.ts": "9f8c44dd8912d9a7c28a22887f7e8971c7b2bbdd",
    "backend/src/core/core.controller.ts": "a0c2c6d3e0137b00d4d20f5e239ce53abfd3c10e",
    "backend/src/receivables/receivables.controller.ts": "cb0ba9590dbc894c7daa7803e5b8834cc6f07075",
    "backend/scripts/verify-ledger-posting-coverage.mjs": "9c55793074ca56c71f3a5342856303747b36ddb9",
    "lexa-frontend/src/data/remote/apiCommerce.ts": "c57ef614ddff62c22d129af46ec9585f548f046e",
    "lexa-frontend/src/modules/operations/CommerceWorkflowPanel.tsx": "8ae3f3cf2a500ad1293ee176399000c23790e3cf",
    "lexa-frontend/src/modules/operations/OperationsWorkspacePage.tsx": "fa9a0512ee5ec571a68ba7044648456c9862b0c6",
}

for rel, expected in EXPECTED_BLOBS.items():
    actual = git_blob_sha(read(rel))
    if actual != expected:
        fail(f"Source drift in {rel}: expected Git blob {expected}, found {actual}. Rebase/review the patch before applying.")

# Stage all edits in memory first so a drift check cannot leave a half-applied patch.
finance_rel = "backend/src/finance/finance-operations.controller.ts"
finance = read(finance_rel)
finance_old = "entryDate:new Date(period.startDate).toISOString().slice(0,10)"
finance_new = "entryDate:new Date(period.startsOn).toISOString().slice(0,10)"
if finance.count(finance_old) != 1:
    fail("Finance controller startDate typo anchor is not unique; inspect before applying.")
finance = finance.replace(finance_old, finance_new, 1)

migration_rel = "backend/prisma/migrations/20261030320000_platform_catalog_finance_rls/migration.sql"
migration = read(migration_rel)
statement_lines_old = """ external_id text, reconciliation_status text NOT NULL DEFAULT 'unmatched' CHECK(reconciliation_status IN ('unmatched','matched','ignored')),
 FOREIGN KEY(tenant_id,bank_account_id) REFERENCES bank_accounts(tenant_id,id) ON DELETE CASCADE
);"""
statement_lines_new = """ external_id text, reconciliation_status text NOT NULL DEFAULT 'unmatched' CHECK(reconciliation_status IN ('unmatched','matched','ignored')),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,bank_account_id) REFERENCES bank_accounts(tenant_id,id) ON DELETE CASCADE
);"""
recon_old = """ status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_progress','completed','voided')), completed_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT, completed_at timestamptz,
 FOREIGN KEY(tenant_id,bank_account_id) REFERENCES bank_accounts(tenant_id,id) ON DELETE RESTRICT
);"""
recon_new = """ status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_progress','completed','voided')), completed_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT, completed_at timestamptz,
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,bank_account_id) REFERENCES bank_accounts(tenant_id,id) ON DELETE RESTRICT
);"""
for old, label in [(statement_lines_old, "bank_statement_lines unique target"), (recon_old, "bank_reconciliations unique target")]:
    if migration.count(old) != 1:
        fail(f"{migration_rel}: {label} anchor missing or ambiguous.")
migration = migration.replace(statement_lines_old, statement_lines_new, 1)
migration = migration.replace(recon_old, recon_new, 1)

schema_rel = "backend/prisma/schema.prisma"
schema = read(schema_rel)
sale_model_marker = "  customerName        String?         @map(\"customer_name\")\n"
if schema.count(sale_model_marker) != 1:
    fail("Prisma Sale.customerName anchor missing or ambiguous.")
schema = schema.replace(
    sale_model_marker,
    sale_model_marker +
    "  customerRecordId    String?         @map(\"customer_record_id\")\n" +
    "  crmCustomerId       String?         @map(\"crm_customer_id\") @db.Uuid\n",
    1,
)
sale_line_model_marker = "model SaleLine {\n  id                  String   @id @default(uuid()) @db.Uuid\n  tenantId            String   @map(\"tenant_id\") @db.Uuid\n"
if schema.count(sale_line_model_marker) != 1:
    fail("Prisma SaleLine model anchor missing or ambiguous.")
schema = schema.replace(sale_line_model_marker, sale_line_model_marker +
    "  branchId           String   @map(\"branch_id\") @db.Uuid\n" +
    "  sourceOrderLineId  String?  @map(\"source_order_line_id\") @db.Uuid\n", 1)
price_model_start = schema.find("model PriceList {\n")
if price_model_start < 0:
    fail("Prisma PriceList model is missing.")
price_model_end = schema.find("\n}", price_model_start)
price_model = schema[price_model_start:price_model_end + 2]
price_model_marker = "  active Boolean @default(true)\n  @@unique([tenantId, code])\n"
if price_model.count(price_model_marker) != 1:
    fail("Prisma PriceList active/code fields anchor missing or ambiguous.")
price_model = price_model.replace(price_model_marker, "  active Boolean @default(true)\n  recordId String? @map(\"record_id\")\n  appliesTo String? @map(\"applies_to\")\n  customerRecordId String? @map(\"customer_record_id\")\n  snapshot Json @default(\"{}\")\n  @@unique([tenantId, code])\n", 1)
schema = schema[:price_model_start] + price_model + schema[price_model_end + 2:]
if "model CrmCustomer {" in schema:
    fail("CRM Prisma models already exist; refusing to append duplicates.")
crm_models = r'''

// Workstream 4 — normalized CRM domain projections. SQL migration owns the composite
// tenant/branch foreign keys; the generic module_records rows remain the API compatibility layer.
model CrmCustomer {
  id                 String   @id @default(uuid()) @db.Uuid
  tenantId           String   @map("tenant_id") @db.Uuid
  branchId           String   @map("branch_id") @db.Uuid
  moduleId           String   @default("customers") @map("module_id")
  recordId           String   @map("record_id")
  customerCode       String?  @map("customer_code")
  name               String
  customerType       String?  @map("customer_type")
  phone              String?
  email              String?
  tin                String?
  status             String   @default("Active")
  sourceLeadRecordId String?  @map("source_lead_record_id")
  snapshot           Json     @default("{}")
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime @default(now()) @map("updated_at") @db.Timestamptz(6)
  @@unique([tenantId, branchId, id])
  @@unique([tenantId, branchId, recordId])
  @@map("crm_customers")
}

model CrmSupplier {
  id           String   @id @default(uuid()) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  branchId     String   @map("branch_id") @db.Uuid
  moduleId     String   @default("suppliers") @map("module_id")
  recordId     String   @map("record_id")
  supplierCode String?  @map("supplier_code")
  name         String
  phone        String?
  email        String?
  tin          String?
  status       String   @default("Active")
  snapshot     Json     @default("{}")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime @default(now()) @map("updated_at") @db.Timestamptz(6)
  @@unique([tenantId, branchId, id])
  @@unique([tenantId, branchId, recordId])
  @@map("crm_suppliers")
}

model CrmContact {
  id              String   @id @default(uuid()) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  branchId        String   @map("branch_id") @db.Uuid
  moduleId        String   @default("contacts") @map("module_id")
  recordId        String   @map("record_id")
  contactCode     String?  @map("contact_code")
  partyType       String?  @map("party_type")
  partyRecordId   String?  @map("party_record_id")
  customerEntityId String? @map("customer_entity_id") @db.Uuid
  supplierEntityId String? @map("supplier_entity_id") @db.Uuid
  leadEntityId    String?  @map("lead_entity_id") @db.Uuid
  name            String
  jobTitle        String?  @map("job_title")
  email           String?
  phone           String?
  preferredChannel String? @map("preferred_channel")
  status          String   @default("Active")
  snapshot        Json     @default("{}")
  @@unique([tenantId, branchId, id])
  @@unique([tenantId, branchId, recordId])
  @@map("crm_contacts")
}

model CrmLead {
  id                 String   @id @default(uuid()) @db.Uuid
  tenantId           String   @map("tenant_id") @db.Uuid
  branchId           String   @map("branch_id") @db.Uuid
  moduleId           String   @default("leads") @map("module_id")
  recordId           String   @map("record_id")
  leadCode           String?  @map("lead_code")
  company            String?
  contactName        String?  @map("contact_name")
  email              String?
  phone              String?
  source             String?
  owner              String?
  estimatedValue     Decimal  @default(0) @map("estimated_value") @db.Decimal(18, 2)
  probability        Decimal  @default(0) @db.Decimal(7, 4)
  campaignRecordId   String?  @map("campaign_record_id")
  campaignEntityId   String?  @map("campaign_entity_id") @db.Uuid
  ownerTeamId        String?  @map("owner_team_id") @db.Uuid
  status             String   @default("New")
  convertedCustomerId String? @map("converted_customer_id") @db.Uuid
  snapshot           Json     @default("{}")
  @@unique([tenantId, branchId, id])
  @@unique([tenantId, branchId, recordId])
  @@map("crm_leads")
}

model CrmOpportunity {
  id               String   @id @default(uuid()) @db.Uuid
  tenantId         String   @map("tenant_id") @db.Uuid
  branchId         String   @map("branch_id") @db.Uuid
  moduleId         String   @default("opportunities") @map("module_id")
  recordId         String   @map("record_id")
  opportunityCode  String?  @map("opportunity_code")
  leadRecordId     String?  @map("lead_record_id")
  customerRecordId String?  @map("customer_record_id")
  customerEntityId String?  @map("customer_entity_id") @db.Uuid
  campaignRecordId String?  @map("campaign_record_id")
  campaignEntityId String?  @map("campaign_entity_id") @db.Uuid
  company          String?
  owner            String?
  amountMinor      BigInt   @default(0) @map("amount_minor")
  probability      Decimal  @default(0) @db.Decimal(7, 4)
  expectedCloseDate DateTime? @map("expected_close_date") @db.Date
  status           String   @default("New")
  snapshot         Json     @default("{}")
  @@unique([tenantId, branchId, id])
  @@unique([tenantId, branchId, recordId])
  @@map("crm_opportunities")
}

model CrmCampaign {
  id             String   @id @default(uuid()) @db.Uuid
  tenantId       String   @map("tenant_id") @db.Uuid
  branchId       String   @map("branch_id") @db.Uuid
  moduleId       String   @default("campaigns") @map("module_id")
  recordId       String   @map("record_id")
  campaignCode   String?  @map("campaign_code")
  name           String
  channel        String?
  owner          String?
  startsOn       DateTime? @map("starts_on") @db.Date
  endsOn         DateTime? @map("ends_on") @db.Date
  budgetMinor    BigInt   @default(0) @map("budget_minor")
  actualSpendMinor BigInt @default(0) @map("actual_spend_minor")
  status         String   @default("Draft")
  snapshot       Json     @default("{}")
  @@unique([tenantId, branchId, id])
  @@unique([tenantId, branchId, recordId])
  @@map("crm_campaigns")
}

model CrmTerritory {
  id       String  @id @default(uuid()) @db.Uuid
  tenantId String  @map("tenant_id") @db.Uuid
  branchId String  @map("branch_id") @db.Uuid
  name     String
  active   Boolean @default(true)
  @@unique([tenantId, branchId, id])
  @@unique([tenantId, branchId, name])
  @@map("crm_territories")
}

model CrmSalesTeam {
  id               String   @id @default(uuid()) @db.Uuid
  tenantId         String   @map("tenant_id") @db.Uuid
  branchId         String   @map("branch_id") @db.Uuid
  moduleId         String   @default("sales-teams") @map("module_id")
  recordId         String   @map("record_id")
  salespersonCode  String?  @map("salesperson_code")
  salesperson      String
  email            String?
  territoryId      String?  @map("territory_id") @db.Uuid
  salesTargetMinor BigInt   @default(0) @map("sales_target_minor")
  salesAchievedMinor BigInt @default(0) @map("sales_achieved_minor")
  status           String   @default("Active")
  snapshot         Json     @default("{}")
  @@unique([tenantId, branchId, id])
  @@unique([tenantId, branchId, recordId])
  @@map("crm_sales_teams")
}

model CrmQuotation {
  id               String   @id @default(uuid()) @db.Uuid
  tenantId         String   @map("tenant_id") @db.Uuid
  branchId         String   @map("branch_id") @db.Uuid
  moduleId         String   @default("quotations") @map("module_id")
  recordId         String   @map("record_id")
  quoteNumber      String?  @map("quote_number")
  customerRecordId String?  @map("customer_record_id")
  customerEntityId String?  @map("customer_entity_id") @db.Uuid
  customerSnapshot Json     @default("{}") @map("customer_snapshot")
  sourceOpportunityRecordId String? @map("source_opportunity_record_id")
  sourceLeadRecordId String? @map("source_lead_record_id")
  issueDate        DateTime? @map("issue_date") @db.Date
  validUntil       DateTime? @map("valid_until") @db.Date
  currency         String   @default("UGX") @db.Char(3)
  subtotalMinor    BigInt   @default(0) @map("subtotal_minor")
  taxMinor         BigInt   @default(0) @map("tax_minor")
  totalMinor       BigInt   @default(0) @map("total_minor")
  status           String   @default("Draft")
  acceptedOrderId  String?  @map("accepted_order_id") @db.Uuid
  snapshot         Json     @default("{}")
  @@unique([tenantId, branchId, id])
  @@unique([tenantId, branchId, recordId])
  @@map("crm_quotations")
}

model CrmQuotationLine {
  id                String   @id @default(uuid()) @db.Uuid
  tenantId          String   @map("tenant_id") @db.Uuid
  branchId          String   @map("branch_id") @db.Uuid
  quotationId       String   @map("quotation_id") @db.Uuid
  quoteRecordId     String   @map("quote_record_id")
  sourceLineKey     String   @map("source_line_key")
  productId         String?  @map("product_id") @db.Uuid
  productNameSnapshot String @map("product_name_snapshot")
  quantity          Decimal  @db.Decimal(12, 3)
  unitPriceMinor    BigInt   @map("unit_price_minor")
  lineTotalMinor    BigInt   @map("line_total_minor")
  lineSnapshot      Json     @default("{}") @map("line_snapshot")
  @@unique([tenantId, branchId, id])
  @@unique([tenantId, branchId, quoteRecordId, sourceLineKey])
  @@map("crm_quotation_lines")
}
'''
schema = schema.rstrip() + crm_models + "\n"

# Commerce controller: branch-scoped sales order lines must populate the new composite key.
commerce_rel = "backend/src/commerce/commerce.controller.ts"
commerce = read(commerce_rel)
old_line_insert = """for (const line of values.lines) await tx.$executeRaw`INSERT INTO commerce_sales_order_lines (id,tenant_id,order_id,product_id,product_name_snapshot,sku_snapshot,quantity,unit_price_minor,line_total_minor)
        VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${id}::uuid,${line.product.id}::uuid,${line.product.name},${line.product.sku},${String(line.quantity)}::numeric,${line.product.sellingPriceMinor},${line.lineTotal})`;"""
new_line_insert = """for (const line of values.lines) await tx.$executeRaw`INSERT INTO commerce_sales_order_lines (id,tenant_id,branch_id,order_id,product_id,product_name_snapshot,sku_snapshot,quantity,unit_price_minor,line_total_minor,unit_cost_minor)
        VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${branchId}::uuid,${id}::uuid,${line.product.id}::uuid,${line.product.name},${line.product.sku},${String(line.quantity)}::numeric,${line.product.sellingPriceMinor},${line.lineTotal},${line.product.costPriceMinor})`;"""
if commerce.count(old_line_insert) != 1:
    fail("Commerce sales-order line insert anchor missing or ambiguous.")
commerce = commerce.replace(old_line_insert, new_line_insert, 1)

# Use immutable order-line price snapshots when fulfilling (not today's catalogue price).
old_total = "const total=fulfilLines.reduce((sum,x)=>sum+Math.round(x.product.sellingPriceMinor*x.qty),0); money(total,'Fulfilment total');"
new_total = "const total=fulfilLines.reduce((sum,x)=>sum+Math.round(Number(x.line.line_total_minor)*x.qty/Number(x.line.quantity)),0); money(total,'Fulfilment total');"
old_sale = "const sale=await tx.sale.create({data:{tenantId:workspaceId,branchId,receiptNumber:doc('LX'),customerName:order.customer_name,totalMinor:total,status:'completed'}});"
new_sale = "const sale=await tx.sale.create({data:{tenantId:workspaceId,branchId,receiptNumber:doc('LX'),customerName:order.customer_name,customerRecordId:order.customer_record_id??null,crmCustomerId:order.crm_customer_id??null,totalMinor:total,status:'completed'}});"
old_item = "const lineTotal=Math.round(item.product.sellingPriceMinor*item.qty);\n        await tx.saleLine.create({data:{tenantId:workspaceId,saleId:sale.id,productId:item.product.id,productNameSnapshot:item.product.name,quantity:String(item.qty),unitPriceMinor:item.product.sellingPriceMinor,lineTotalMinor:lineTotal}});"
new_item = "const lineTotal=Math.round(Number(item.line.line_total_minor)*item.qty/Number(item.line.quantity));\n        const taxMinor=Math.round(Number(item.line.tax_minor??0)*item.qty/Number(item.line.quantity));\n        const unitPriceMinor=Math.round((Number(item.line.line_total_minor)-Number(item.line.tax_minor??0))/Number(item.line.quantity));\n        await tx.saleLine.create({data:{tenantId:workspaceId,branchId,sourceOrderLineId:item.line.id,saleId:sale.id,productId:item.product.id,productNameSnapshot:item.line.product_name_snapshot,quantity:String(item.qty),unitCostMinor:Number(item.line.unit_cost_minor??item.product.costPriceMinor),taxMinor,unitPriceMinor,lineTotalMinor:lineTotal}});"
for old, new, label in [(old_total,new_total,"fulfilment sale total"),(old_sale,new_sale,"sale customer identity"),(old_item,new_item,"fulfilment line snapshot")]:
    if commerce.count(old) != 1:
        fail(f"Commerce controller {label} anchor missing or ambiguous.")
    commerce = commerce.replace(old,new,1)

post_anchor = """      }
      const remaining=await tx.$queryRaw<Array<{qty:any}>>`SELECT COALESCE(SUM(quantity-quantity_fulfilled),0) AS qty FROM commerce_sales_order_lines WHERE order_id=${orderId}::uuid`;"""
post_new = """      }
      const outputTaxMinor=fulfilLines.reduce((sum,x)=>sum+Math.round(Number(x.line.tax_minor??0)*x.qty/Number(x.line.quantity)),0);
      const netSalesMinor=total-outputTaxMinor;
      const costOfGoodsMinor=fulfilLines.filter(x=>x.product.trackStock).reduce((sum,x)=>sum+Math.round(Number(x.line.unit_cost_minor??x.product.costPriceMinor)*x.qty),0);
      if(total>0){
        const journalLines:Array<{accountKey:string;debitMinor?:number;creditMinor?:number;description?:string}>=[
          {accountKey:'accounts_receivable',debitMinor:total,description:`Sales order ${order.order_number}`},
          {accountKey:'sales_revenue',creditMinor:netSalesMinor,description:`Net sales - ${order.order_number}`},
        ];
        if(outputTaxMinor>0) journalLines.push({accountKey:'tax_payable',creditMinor:outputTaxMinor,description:`Output tax - ${order.order_number}`});
        if(costOfGoodsMinor>0){journalLines.push({accountKey:'cost_of_goods_sold',debitMinor:costOfGoodsMinor,description:`Cost of goods sold - ${order.order_number}`});journalLines.push({accountKey:'inventory',creditMinor:costOfGoodsMinor,description:`Inventory relieved - ${order.order_number}`});}
        await postLedgerJournal(tx,{tenantId:workspaceId,branchId,actorUserId:actor.userId,sourceType:'sale_completed',sourceId:sale.id,memo:`Sales order ${order.order_number}`,lines:journalLines});
      }
      const remaining=await tx.$queryRaw<Array<{qty:any}>>`SELECT COALESCE(SUM(quantity-quantity_fulfilled),0) AS qty FROM commerce_sales_order_lines WHERE order_id=${orderId}::uuid`;"""
if commerce.count(post_anchor) != 1:
    fail("Sales-order fulfilment GL-posting anchor missing or ambiguous.")
commerce = commerce.replace(post_anchor, post_new, 1)

# Quote acceptance is a server transaction, guarded by a row lock + unique source-quote key.
quote_endpoint = r'''
  @Post('crm/quotations/:quoteRecordId/accept-to-order')
  @UseGuards(CsrfGuard)
  async acceptQuotationToOrder(@Param('workspaceId') workspaceId:string,@Param('branchId') branchId:string,@Param('quoteRecordId') quoteRecordId:string,@Req() req:FastifyRequest) {
    const actor=await this.access(req,workspaceId,branchId);
    const quoteKey=text(quoteRecordId,'Quotation record ID',160)!;
    return this.prisma.$transaction(async(tx)=>{
      const existing=await tx.$queryRaw<any[]>`SELECT id,order_number,status,total_minor FROM commerce_sales_orders WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND source_quote_record_id=${quoteKey} LIMIT 1`;
      if(existing.length) return {id:String(existing[0].id),orderNumber:existing[0].order_number,status:existing[0].status,totalMinor:Number(existing[0].total_minor),alreadyConverted:true};
      const quotes=await tx.$queryRaw<any[]>`SELECT q.*,c.record_id AS customer_record_ref,c.name AS customer_name,c.status AS customer_status,c.snapshot AS customer_snapshot FROM crm_quotations q LEFT JOIN crm_customers c ON c.id=q.customer_entity_id AND c.tenant_id=q.tenant_id AND c.branch_id=q.branch_id WHERE q.tenant_id=${workspaceId}::uuid AND q.branch_id=${branchId}::uuid AND q.record_id=${quoteKey} FOR UPDATE OF q`;
      const quote=quotes[0];
      if(!quote) throw new NotFoundException('Quotation was not found in this branch.');
      const raced=await tx.$queryRaw<any[]>`SELECT id,order_number,status,total_minor FROM commerce_sales_orders WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND source_quote_record_id=${quoteKey} LIMIT 1`;
      if(raced.length) return {id:String(raced[0].id),orderNumber:raced[0].order_number,status:raced[0].status,totalMinor:Number(raced[0].total_minor),alreadyConverted:true};
      if(quote.status!=='Accepted') throw new ConflictException('Only an accepted quotation can be converted to a sales order.');
      if(quote.valid_until && new Date(quote.valid_until).toISOString().slice(0,10)<new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Kampala'}).format(new Date())) throw new ConflictException('This quotation has expired.');
      if(!quote.customer_entity_id || !quote.customer_record_ref || quote.customer_status!=='Active') throw new ConflictException('Link this quotation to an active customer before accepting it.');
      const lines=await tx.$queryRaw<any[]>`SELECT id,source_line_key,product_id,product_name_snapshot,quantity,unit_price_minor,line_total_minor,line_snapshot FROM crm_quotation_lines WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND quotation_id=${quote.id} ORDER BY source_line_key`;
      if(!lines.length) throw new ConflictException('Add at least one priced line before accepting this quotation.');
      if(lines.some((line:any)=>!line.product_id)) throw new ConflictException('Every quotation line must resolve to one active catalogue product before it can become an order.');
      const totalMinor=Number(quote.total_minor);
      const baseMinor=lines.reduce((sum:number,line:any)=>sum+Number(line.line_total_minor),0);
      if(!Number.isSafeInteger(totalMinor)||totalMinor<=0||baseMinor<=0) throw new ConflictException('The quotation total or line subtotal is invalid.');
      const id=randomUUID(),orderNumber=doc('SO'),createdAt=new Date().toISOString();
      await tx.$executeRaw`INSERT INTO commerce_sales_orders (id,tenant_id,branch_id,order_number,customer_record_id,customer_name,crm_customer_id,quotation_id,source_quote_record_id,status,total_minor,created_by_user_id) VALUES (${id}::uuid,${workspaceId}::uuid,${branchId}::uuid,${orderNumber},${quote.customer_record_ref},${quote.customer_name},${quote.customer_entity_id}::uuid,${quote.id}::uuid,${quoteKey},'draft',${totalMinor},${actor.userId}::uuid)`;
      const totalTaxMinor=Math.max(0,Number(quote.tax_minor??0));
      let allocated=0,allocatedTax=0;
      for(let index=0;index<lines.length;index+=1){
        const line=lines[index];
        const grossLineMinor=index===lines.length-1?totalMinor-allocated:Math.round(Number(line.line_total_minor)*totalMinor/baseMinor);
        const lineTaxMinor=index===lines.length-1?totalTaxMinor-allocatedTax:Math.round(totalTaxMinor*Number(line.line_total_minor)/baseMinor);
        allocated+=grossLineMinor; allocatedTax+=lineTaxMinor;
        if(lineTaxMinor>grossLineMinor) throw new ConflictException('Quotation tax allocation exceeds the line total.');
        const quantity=Number(line.quantity);
        const product=await tx.product.findFirst({where:{id:String(line.product_id),tenantId:workspaceId,active:true},select:{sku:true,costPriceMinor:true}});
        if(!product) throw new ConflictException('A quoted product is no longer active in the catalogue.');
        await tx.$executeRaw`INSERT INTO commerce_sales_order_lines (id,tenant_id,branch_id,order_id,product_id,product_name_snapshot,sku_snapshot,quantity,unit_price_minor,line_total_minor,tax_minor,unit_cost_minor,source_quote_line_id) VALUES (${randomUUID()}::uuid,${workspaceId}::uuid,${branchId}::uuid,${id}::uuid,${line.product_id}::uuid,${line.product_name_snapshot},${product.sku},${String(quantity)}::numeric,${Math.round((grossLineMinor-lineTaxMinor)/quantity)},${grossLineMinor},${lineTaxMinor},${product.costPriceMinor},${line.id}::uuid)`;
      }
      const orderData={id,orderNumber,customer:quote.customer_name,customerRecordId:quote.customer_record_ref,quotationRecordId:quoteKey,sourceQuoteRecordId:quoteKey,orderDate:createdAt.slice(0,10),itemSummary:lines.map((line:any)=>line.product_name_snapshot).join('; '),quantity:String(lines.reduce((sum:number,line:any)=>sum+Number(line.quantity),0)),total:String(totalMinor),totalMinor:String(totalMinor),currency:quote.currency,status:'Draft',createdAt};
      await this.moduleRecord(tx,workspaceId,branchId,'sales-orders',id,orderData);
      await this.link(tx,workspaceId,branchId,'quotations',quoteKey,'sales-orders',id,actor.userId);
      await this.link(tx,workspaceId,branchId,'customers',String(quote.customer_record_ref),'sales-orders',id,actor.userId);
      await tx.$executeRaw`UPDATE crm_quotations SET accepted_order_id=${id}::uuid,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND id=${quote.id}::uuid`;
      await tx.$executeRaw`UPDATE module_records SET data=jsonb_set(jsonb_set(data,'{status}','"Accepted"'::jsonb),'{acceptedOrderId}',to_jsonb(${id}::text)),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND module_id='quotations' AND record_id=${quoteKey}`;
      await this.event(tx,workspaceId,branchId,'quotations',quoteKey,'quotation.accepted_to_order',{orderId:id,orderNumber,customerRecordId:quote.customer_record_ref,totalMinor},actor.userId,`quote-accepted-order:${quoteKey}`);
      await this.event(tx,workspaceId,branchId,'sales-orders',id,'sales_order.created_from_quote',{quoteRecordId:quoteKey,customerRecordId:quote.customer_record_ref,totalMinor},actor.userId,`sales-order-from-quote:${quoteKey}`);
      await this.audit(tx,workspaceId,actor.userId,'quotation.accepted_to_order','sales_order',id);
      return {id,orderNumber,status:'draft',totalMinor,alreadyConverted:false,quotationRecordId:quoteKey,customerRecordId:quote.customer_record_ref};
    },{isolationLevel:'Serializable'});
  }

'''
insert_before = "  @Post('crm/leads/:leadRecordId/convert')"
if commerce.count(insert_before) != 1:
    fail("Commerce controller lead conversion route anchor missing or ambiguous.")
commerce = commerce.replace(insert_before, quote_endpoint + insert_before, 1)

# Lead conversion locks the source record and requires qualification before conversion.
old_lead_query = "const lead=await this.moduleRecordExists(tx,workspaceId,branchId,'leads',leadRecordId);const existing=await tx.$queryRaw<any[]>`SELECT target_record_id FROM module_record_links"
new_lead_query = "const leadRows=await tx.$queryRaw<any[]>`SELECT data FROM module_records WHERE tenant_id=${workspaceId}::uuid AND branch_id=${branchId}::uuid AND module_id='leads' AND record_id=${leadRecordId} FOR UPDATE`;if(!leadRows.length)throw new NotFoundException('Lead not found.');const lead=leadRows[0].data as Obj;const existing=await tx.$queryRaw<any[]>`SELECT target_record_id FROM module_record_links"
if commerce.count(old_lead_query) != 1:
    fail("Lead-conversion source-lock anchor missing or ambiguous.")
commerce = commerce.replace(old_lead_query,new_lead_query,1)
old_lead_name = "if(existing.length)return{customerRecordId:existing[0].target_record_id,alreadyConverted:true};const name=text(lead.company||lead.name||lead.contactName||lead.leadName,'Lead / business name',180)!;"
new_lead_name = "if(existing.length)return{customerRecordId:existing[0].target_record_id,alreadyConverted:true};if(lead.status!=='Qualified')throw new ConflictException('Qualify this lead before converting it to a customer.');const name=text(lead.company||lead.name||lead.contactName||lead.leadName,'Lead / business name',180)!;"
if commerce.count(old_lead_name) != 1:
    fail("Lead-conversion qualification anchor missing or ambiguous.")
commerce = commerce.replace(old_lead_name,new_lead_name,1)

# Sale-line branch identity is populated explicitly for POS and also guarded in SQL for restores.
core_rel = "backend/src/core/core.controller.ts"
core = read(core_rel)
core_sale_line_old = "await tx.saleLine.create({ data: { tenantId: workspaceId, saleId: sale.id, productId: line.product.id, variantId: line.variant?.id ?? null"
core_sale_line_new = "await tx.saleLine.create({ data: { tenantId: workspaceId, branchId, saleId: sale.id, productId: line.product.id, variantId: line.variant?.id ?? null"
if core.count(core_sale_line_old) != 1:
    fail("Core POS sale-line create anchor missing or ambiguous.")
core = core.replace(core_sale_line_old, core_sale_line_new, 1)
core_backup_old = """    const saleIds = new Set(sales.map((r) => r.id));
    if (saleIds.size !== sales.length) throw new BadRequestException('Backup contains duplicate sale IDs.');
    const saleLines = rawSaleLines.map((r) => {
      if (r.tenantId !== workspaceId || !saleIds.has(String(r.saleId)) || !productIds.has(String(r.productId))) throw new BadRequestException('Backup sale line references missing business records.');
      return { id: backupUuid(r.id, 'saleLine.id'), tenantId: workspaceId, saleId: String(r.saleId), productId: String(r.productId), productNameSnapshot: requiredString(r.productNameSnapshot, 'saleLine.productNameSnapshot', 180), quantity: String(positiveQuantity(r.quantity)), unitPriceMinor: moneyMinor(r.unitPriceMinor, 'saleLine.unitPriceMinor'), lineTotalMinor: moneyMinor(r.lineTotalMinor, 'saleLine.lineTotalMinor') };
    });"""
core_backup_new = """    const saleIds = new Set(sales.map((r) => r.id));
    if (saleIds.size !== sales.length) throw new BadRequestException('Backup contains duplicate sale IDs.');
    const saleBranchById = new Map(sales.map((sale) => [sale.id, sale.branchId]));
    const saleLines = rawSaleLines.map((r) => {
      if (r.tenantId !== workspaceId || !saleIds.has(String(r.saleId)) || !productIds.has(String(r.productId))) throw new BadRequestException('Backup sale line references missing business records.');
      return { id: backupUuid(r.id, 'saleLine.id'), tenantId: workspaceId, branchId: saleBranchById.get(String(r.saleId))!, sourceOrderLineId: null, saleId: String(r.saleId), productId: String(r.productId), productNameSnapshot: requiredString(r.productNameSnapshot, 'saleLine.productNameSnapshot', 180), quantity: String(positiveQuantity(r.quantity)), unitPriceMinor: moneyMinor(r.unitPriceMinor, 'saleLine.unitPriceMinor'), lineTotalMinor: moneyMinor(r.lineTotalMinor, 'saleLine.lineTotalMinor') };
    });"""
if core.count(core_backup_old) != 1:
    fail("Workspace backup restore sale-line branch mapping anchor missing or ambiguous.")
core = core.replace(core_backup_old, core_backup_new, 1)

# AR invoice creation keeps the CRM customer ID and quote source-line ID from its sale.
receivables_rel = "backend/src/receivables/receivables.controller.ts"
receivables = read(receivables_rel)
old_sale_select = """SELECT s.*, t.currency,
                 (SELECT o.customer_record_id FROM commerce_fulfilments f
                   JOIN commerce_sales_orders o ON o.id = f.order_id
                  WHERE f.sale_id = s.id ORDER BY f.created_at DESC LIMIT 1) AS customer_record_id"""
new_sale_select = """SELECT s.*, t.currency,
                 (SELECT o.customer_record_id FROM commerce_fulfilments f
                   JOIN commerce_sales_orders o ON o.id = f.order_id
                  WHERE f.sale_id = s.id ORDER BY f.created_at DESC LIMIT 1) AS order_customer_record_id"""
if receivables.count(old_sale_select) != 1:
    fail("Receivables customer-source SELECT anchor missing or ambiguous.")
receivables = receivables.replace(old_sale_select,new_sale_select,1)
old_invoice_insert = """(id, tenant_id, branch_id, invoice_number, source_sale_id, customer_record_id, customer_name,
           customer_phone, currency, status, subtotal_minor, tax_minor, total_minor, issue_date,
           due_date, notes, created_by_user_id)
          VALUES (${invoiceId}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${invoiceNumber},
           ${saleId}::uuid, ${sale.customer_record_id ?? null}, ${String(sale.customer_name)},
           ${sale.customer_phone ?? null}, ${String(sale.currency ?? actor.currency)}, 'draft',"""
new_invoice_insert = """(id, tenant_id, branch_id, invoice_number, source_sale_id, customer_record_id, crm_customer_id, customer_name,
           customer_phone, currency, status, subtotal_minor, tax_minor, total_minor, issue_date,
           due_date, notes, created_by_user_id)
          VALUES (${invoiceId}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${invoiceNumber},
           ${saleId}::uuid, ${sale.customer_record_id ?? sale.order_customer_record_id ?? null}, ${sale.crm_customer_id ?? null}::uuid, ${String(sale.customer_name)},
           ${sale.customer_phone ?? null}, ${String(sale.currency ?? actor.currency)}, 'draft',"""
if receivables.count(old_invoice_insert) != 1:
    fail("Receivables invoice insert anchor missing or ambiguous.")
receivables = receivables.replace(old_invoice_insert,new_invoice_insert,1)
old_line_query = """SELECT sl.id, sl.product_id, sl.product_name_snapshot, sl.quantity, sl.unit_price_minor, sl.line_total_minor
          FROM sale_lines sl WHERE sl.tenant_id = ${workspaceId}::uuid AND sl.sale_id = ${saleId}::uuid ORDER BY sl.id"""
new_line_query = """SELECT sl.id, sl.product_id, sl.product_name_snapshot, sl.quantity, sl.unit_price_minor, sl.line_total_minor,
                 sol.source_quote_line_id
          FROM sale_lines sl
          LEFT JOIN commerce_sales_order_lines sol ON sol.tenant_id=sl.tenant_id AND sol.branch_id=sl.branch_id AND sol.id=sl.source_order_line_id
          WHERE sl.tenant_id = ${workspaceId}::uuid AND sl.sale_id = ${saleId}::uuid ORDER BY sl.id"""
if receivables.count(old_line_query) != 1:
    fail("Receivables invoice-line source SELECT anchor missing or ambiguous.")
receivables = receivables.replace(old_line_query,new_line_query,1)
old_ar_line_insert = """(id, tenant_id, branch_id, invoice_id, source_sale_line_id, product_id,
             product_name_snapshot, quantity, unit_price_minor, line_total_minor)
            VALUES (${randomUUID()}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${invoiceId}::uuid,
             ${line.id}::uuid, ${line.product_id}::uuid, ${line.product_name_snapshot},
             ${String(line.quantity)}::numeric, ${Number(line.unit_price_minor)}, ${Number(line.line_total_minor)})"""
new_ar_line_insert = """(id, tenant_id, branch_id, invoice_id, source_sale_line_id, source_quote_line_id, product_id,
             product_name_snapshot, quantity, unit_price_minor, line_total_minor)
            VALUES (${randomUUID()}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${invoiceId}::uuid,
             ${line.id}::uuid, ${line.source_quote_line_id ?? null}::uuid, ${line.product_id}::uuid, ${line.product_name_snapshot},
             ${String(line.quantity)}::numeric, ${Number(line.unit_price_minor)}, ${Number(line.line_total_minor)})"""
if receivables.count(old_ar_line_insert) != 1:
    fail("Receivables invoice-line insert anchor missing or ambiguous.")
receivables = receivables.replace(old_ar_line_insert,new_ar_line_insert,1)
old_ar_totals = "const lineTotal = lines.reduce((sum, line) => sum + Number(line.line_total_minor), 0);"
new_ar_totals = old_ar_totals + "\n        const taxTotal = lines.reduce((sum, line) => sum + Number(line.tax_minor ?? 0), 0);\n        const netSubtotal = lineTotal - taxTotal;"
if receivables.count(old_ar_totals) != 1:
    fail("Receivables invoice tax totals anchor missing or ambiguous.")
receivables = receivables.replace(old_ar_totals,new_ar_totals,1)
old_ar_values = "${lineTotal}, 0, ${lineTotal}, ${issueDate}::date, ${dueDate}::date, ${notes}, ${actor.userId}::uuid)"
new_ar_values = "${netSubtotal}, ${taxTotal}, ${lineTotal}, ${issueDate}::date, ${dueDate}::date, ${notes}, ${actor.userId}::uuid)"
if receivables.count(old_ar_values) != 1:
    fail("Receivables invoice amount values anchor missing or ambiguous.")
receivables = receivables.replace(old_ar_values,new_ar_values,1)
old_ar_tax_select = "SELECT sl.id, sl.product_id, sl.product_name_snapshot, sl.quantity, sl.unit_price_minor, sl.line_total_minor,\n                 sol.source_quote_line_id"
new_ar_tax_select = "SELECT sl.id, sl.product_id, sl.product_name_snapshot, sl.quantity, sl.unit_price_minor, sl.line_total_minor, sl.tax_minor,\n                 sol.source_quote_line_id"
if receivables.count(old_ar_tax_select) != 1:
    fail("Receivables invoice-line tax SELECT anchor missing or ambiguous.")
receivables = receivables.replace(old_ar_tax_select,new_ar_tax_select,1)
old_ar_tax_insert = "(id, tenant_id, branch_id, invoice_id, source_sale_line_id, source_quote_line_id, product_id,\n             product_name_snapshot, quantity, unit_price_minor, line_total_minor)\n            VALUES (${randomUUID()}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${invoiceId}::uuid,\n             ${line.id}::uuid, ${line.source_quote_line_id ?? null}::uuid, ${line.product_id}::uuid, ${line.product_name_snapshot},\n             ${String(line.quantity)}::numeric, ${Number(line.unit_price_minor)}, ${Number(line.line_total_minor)})"
new_ar_tax_insert = "(id, tenant_id, branch_id, invoice_id, source_sale_line_id, source_quote_line_id, product_id,\n             product_name_snapshot, quantity, unit_price_minor, line_total_minor, tax_minor)\n            VALUES (${randomUUID()}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${invoiceId}::uuid,\n             ${line.id}::uuid, ${line.source_quote_line_id ?? null}::uuid, ${line.product_id}::uuid, ${line.product_name_snapshot},\n             ${String(line.quantity)}::numeric, ${Number(line.unit_price_minor)}, ${Number(line.line_total_minor)}, ${Number(line.tax_minor ?? 0)})"
if receivables.count(old_ar_tax_insert) != 1:
    fail("Receivables invoice-line tax INSERT anchor missing or ambiguous.")
receivables = receivables.replace(old_ar_tax_insert,new_ar_tax_insert,1)

# AR receipts carry the same CRM identity as the invoices they settle.
old_pos_receipt = """      await tx.$executeRaw`INSERT INTO ar_customer_receipts
        (id, tenant_id, branch_id, receipt_number, customer_name, payment_date, kind, method,
         reference, amount_minor, source, source_sale_payment_id, created_by_user_id, created_at)
        SELECT sp.id, sp.tenant_id, s.branch_id,
          'POS-' || upper(substr(replace(sp.id::text, '-', ''), 1, 12)), i.customer_name,
          sp.created_at::date, 'receipt', sp.method, sp.reference, sp.amount_minor,
          'sale_payment', sp.id, ${actor.userId}::uuid, sp.created_at
        FROM sale_payments sp"""
new_pos_receipt = """      await tx.$executeRaw`INSERT INTO ar_customer_receipts
        (id, tenant_id, branch_id, receipt_number, customer_name, customer_record_id, crm_customer_id, payment_date, kind, method,
         reference, amount_minor, source, source_sale_payment_id, created_by_user_id, created_at)
        SELECT sp.id, sp.tenant_id, s.branch_id,
          'POS-' || upper(substr(replace(sp.id::text, '-', ''), 1, 12)), i.customer_name, i.customer_record_id, i.crm_customer_id,
          sp.created_at::date, 'receipt', sp.method, sp.reference, sp.amount_minor,
          'sale_payment', sp.id, ${actor.userId}::uuid, sp.created_at
        FROM sale_payments sp"""
if receivables.count(old_pos_receipt) != 1:
    fail("Receivables pre-invoice POS receipt projection anchor missing or ambiguous.")
receivables = receivables.replace(old_pos_receipt, new_pos_receipt, 1)
old_receipt_customer_check = """const customerNames = new Set(invoiceRows.map((row) => String(row.customer_name).trim().toLowerCase()));
      if (customerNames.size !== 1) throw new BadRequestException('A single receipt can only allocate to invoices for the same customer.');"""
new_receipt_customer_check = """const customerIds = new Set(invoiceRows.map((row) => row.crm_customer_id ?? row.customer_record_id ?? `name:${String(row.customer_name).trim().toLowerCase()}`));
      if (customerIds.size !== 1) throw new BadRequestException('A single receipt can only allocate to invoices for the same customer account.');
      const customerNames = new Set(invoiceRows.map((row) => String(row.customer_name).trim().toLowerCase()));
      if (customerNames.size !== 1) throw new BadRequestException('A single receipt can only allocate to invoices for the same customer.');"""
if receivables.count(old_receipt_customer_check) != 1:
    fail("Receivables customer receipt allocation identity guard anchor missing or ambiguous.")
receivables = receivables.replace(old_receipt_customer_check, new_receipt_customer_check, 1)
old_receipt_insert = """      await tx.$executeRaw`INSERT INTO ar_customer_receipts
        (id, tenant_id, branch_id, receipt_number, customer_name, payment_date, kind, method,
         reference, amount_minor, source, idempotency_key, request_hash, created_by_user_id)
        VALUES (${receiptId}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${receiptNumber},
         ${customerName}, ${paymentDate}::date, 'receipt', ${method}, ${reference}, ${amountMinor},
         'accounts_receivable', ${idempotencyKey}, ${requestHash}, ${actor.userId}::uuid)`;"""
new_receipt_insert = """      await tx.$executeRaw`INSERT INTO ar_customer_receipts
        (id, tenant_id, branch_id, receipt_number, customer_name, customer_record_id, crm_customer_id, payment_date, kind, method,
         reference, amount_minor, source, idempotency_key, request_hash, created_by_user_id)
        VALUES (${receiptId}::uuid, ${workspaceId}::uuid, ${branchId}::uuid, ${receiptNumber},
         ${customerName}, ${invoiceRows[0]!.customer_record_id ?? null}, ${invoiceRows[0]!.crm_customer_id ?? null}::uuid, ${paymentDate}::date, 'receipt', ${method}, ${reference}, ${amountMinor},
         'accounts_receivable', ${idempotencyKey}, ${requestHash}, ${actor.userId}::uuid)`;"""
if receivables.count(old_receipt_insert) != 1:
    fail("Receivables customer receipt INSERT anchor missing or ambiguous.")
receivables = receivables.replace(old_receipt_insert, new_receipt_insert, 1)

# Enforce source-to-ledger coverage for sales-order fulfilment as well as POS.
ledger_verify_rel = "backend/scripts/verify-ledger-posting-coverage.mjs"
ledger_verify = read(ledger_verify_rel)
ledger_verify_anchor = "  ['core', 'sale_completed'],\n"
if ledger_verify.count(ledger_verify_anchor) != 1:
    fail("Ledger posting coverage verifier anchor missing or ambiguous.")
ledger_verify = ledger_verify.replace(ledger_verify_anchor, ledger_verify_anchor + "  ['commerce', 'sale_completed'],\n", 1)

# Frontend API method for the accepted-quotation command.
api_rel = "lexa-frontend/src/data/remote/apiCommerce.ts"
api = read(api_rel)
api_anchor = "  async convertLead(scope: CommerceScope, leadRecordId: string) { return record<{ customerRecordId: string; alreadyConverted?: boolean }>(await apiClient.post(`${base(scope)}/crm/leads/${enc(leadRecordId)}/convert`, {}), 'lead conversion'); },\n"
api_new = api_anchor + "  async acceptQuotation(scope: CommerceScope, quoteRecordId: string) { return record<{ id: string; orderNumber: string; status: string; totalMinor: number; alreadyConverted?: boolean; quotationRecordId?: string; customerRecordId?: string }>(await apiClient.post(`${base(scope)}/crm/quotations/${enc(quoteRecordId)}/accept-to-order`, {}), 'accepted quotation order'); },\n"
if api.count(api_anchor) != 1:
    fail("apiCommerce lead conversion method anchor missing or ambiguous.")
api = api.replace(api_anchor,api_new,1)

# Wire the existing visible 
# Leads register: expose conversion only after qualification; backend checks status too.
panel_rel = "lexa-frontend/src/modules/operations/CommerceWorkflowPanel.tsx"
panel = read(panel_rel)
old_lead_button = "{lead.status!=='Converted' && <button className=\"button button-primary button-small\" disabled={busy} onClick={()=>void runAction(()=>apiCommerce.convertLead(scope,lead.id),'Lead converted to a customer account') }><UserRoundCheck size={14}/> Convert to customer</button>}"
new_lead_button = "{lead.status==='Qualified' && <button className=\"button button-primary button-small\" disabled={busy} onClick={()=>void runAction(()=>apiCommerce.convertLead(scope,lead.id),'Lead converted to a customer account') }><UserRoundCheck size={14}/> Convert to customer</button>}{lead.status!=='Qualified' && lead.status!=='Converted' && <span className=\"commerce-action-note\">Qualify this lead before conversion</span>}"
if panel.count(old_lead_button) != 1:
    fail("Visible Leads conversion button anchor missing or ambiguous.")
panel = panel.replace(old_lead_button,new_lead_button,1)

# Accepted quotation -> order action uses the authoritative API command, not the generic draft hand-off.
page_rel = "lexa-frontend/src/modules/operations/OperationsWorkspacePage.tsx"
page = read(page_rel)
page_import_anchor = "import CommerceWorkflowPanel from './CommerceWorkflowPanel';\n"
if page.count(page_import_anchor) != 1:
    fail("Operations workspace CommerceWorkflowPanel import anchor missing or ambiguous.")
page = page.replace(page_import_anchor,page_import_anchor + "import { apiCommerce } from '../../data/remote/apiCommerce';\n",1)
create_anchor = """  async function createRelatedRecord(targetId: string, source: PreviewRecord) {
    const target = getModuleDefinition(targetId);
    if (!target) { toast.error('The destination module is unavailable.'); return; }
"""
create_add = create_anchor + """    if (isApiProvider && module.id === 'quotations' && targetId === 'sales-orders') {
      try {
        const result = await apiCommerce.acceptQuotation(recordScope, source.id);
        void queryClient.invalidateQueries({ queryKey: ['module-register', workspace.id, branch.id] });
        void queryClient.invalidateQueries({ queryKey: ['commerce-sales-orders', workspace.id, branch.id] });
        setDetail(null);
        toast.success(result.alreadyConverted ? 'Quotation already has an order' : 'Accepted quotation converted to sales order', { description: `${result.orderNumber} · ${money(result.totalMinor, workspace.currency)}` });
        navigate('/modules/sales-orders');
      } catch (error) {
        toast.error('Quotation was not converted', { description: error instanceof Error ? error.message : 'Review the quote and try again.' });
      }
      return;
    }
"""
if page.count(create_anchor) != 1:
    fail("createRelatedRecord function anchor missing or ambiguous.")
page = page.replace(create_anchor,create_add,1)

# Write files only after all base-file anchors have been validated.
(ROOT / finance_rel).write_text(finance, encoding="utf-8")
(ROOT / migration_rel).write_text(migration, encoding="utf-8")
new_migration_rel = "backend/prisma/migrations/20261030330000_crm_first_class_entities_and_quote_acceptance/migration.sql"
new_migration_src = PATCH / new_migration_rel
if not new_migration_src.is_file():
    fail(f"Reviewed CRM migration is missing from the patch package: {new_migration_rel}")
new_migration_dst = ROOT / new_migration_rel
new_migration_dst.parent.mkdir(parents=True, exist_ok=True)
new_migration_dst.write_text(new_migration_src.read_text(encoding="utf-8"), encoding="utf-8")
(ROOT / schema_rel).write_text(schema, encoding="utf-8")
(ROOT / commerce_rel).write_text(commerce, encoding="utf-8")
(ROOT / api_rel).write_text(api, encoding="utf-8")
(ROOT / panel_rel).write_text(panel, encoding="utf-8")
(ROOT / page_rel).write_text(page, encoding="utf-8")
(ROOT / core_rel).write_text(core, encoding="utf-8")
(ROOT / receivables_rel).write_text(receivables, encoding="utf-8")
(ROOT / ledger_verify_rel).write_text(ledger_verify, encoding="utf-8")

print("\nLEXA reviewed source patch applied. Next run Prisma validate/generate, backend tests/build, frontend tests/build and migration validation on an isolated Neon branch.")
