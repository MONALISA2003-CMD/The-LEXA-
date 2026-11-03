
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('six Customer Rose routes share one authoritative customer directory',()=>{
 const routes=read('../../lexa-frontend/src/app/router.tsx');
 const page=read('../../lexa-frontend/src/modules/customer-growth/CustomerGrowthPage.tsx');
 for(const id of ['leads','opportunities','contacts','campaigns','sales-teams','customers']){
  assert.match(routes,new RegExp("path: 'modules/"+id+"'"));
  assert.match(page,new RegExp("id:'"+id+"'"));
 }
 assert.match(page,/apiCustomerGrowth\.summary/);
 assert.match(page,/apiCustomerGrowth\.activities/);
 assert.match(page,/apiCustomerGrowth\.convert/);
});
test('CRM links are tenant scoped, audited and status gated, with safe repeat conversions',()=>{
 const src=read('../src/customer-growth/customer-growth.controller.ts');
 assert.match(src,/runWithTenantContext/);
 assert.match(src,/crm\.write/);
 assert.match(src,/module_record_links/);
 assert.match(src,/if\(existing\.length\)return/);
 assert.match(src,/crm\.record\.converted/);
 assert.match(src,/Contact or qualify the lead/);
 assert.match(src,/Only a won opportunity/);
 assert.match(src,/customer with this name already exists/);
 assert.match(src,/crm\.activity\.recorded/);
});
test('customer and opportunity IDs are explicitly verified when a sale is completed',()=>{
 const core=read('../src/core/core.controller.ts');
 const migration=read('../prisma/migrations/20261104030000_customer_growth_linked_records/migration.sql');
 assert.match(core,/customerRecordId\?await tx\.moduleRecord\.findUnique/);
 assert.match(core,/opportunityRecordId\?await tx\.moduleRecord\.findUnique/);
 assert.match(core,/salespersonEmployeeId\?await tx\.hrEmployee\.findFirst/);
 assert.match(core,/customerRecordId:customerRecordId/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS customer_record_id/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS opportunity_record_id/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS salesperson_employee_id/);
 assert.doesNotMatch(migration,/\bDROP\b/i);
});
test('campaigns only count explicit links and cannot send promotional messages',()=>{
 const src=read('../src/customer-growth/customer-growth.controller.ts');
 assert.match(src,/safe\(lead\.campaignRecordId\)/);
 assert.match(src,/safe\(deal\.campaignRecordId\)/);
 assert.match(src,/salesByOpportunity/);
 assert.doesNotMatch(src,/sendEmail|sendWhatsApp|sendSMS|fetch\(/);
 const moduleCatalog=read('../../lexa-frontend/src/modules/operations/moduleCatalog.ts');
 assert.match(moduleCatalog,/marketingConsent/);
 assert.match(moduleCatalog,/marketingOptOut/);
 assert.match(moduleCatalog,/consentSource/);
});
test('customer relationship history is preserved in protected backups and RLS',()=>{
 const sql=read('../prisma/migrations/20261104030000_customer_growth_linked_records/migration.sql');
 const inventory=JSON.parse(read('../backup/authoritative-inventory.json'));
 assert.ok(inventory.some(x=>x.table==='crm_activities'&&x.disposition==='authoritative'));
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/app\.tenant_id/);
});
test('My Business speaks in owner-friendly language',()=>{
 const s=read('../../lexa-frontend/src/modules/workspace/WorkspacePage.tsx');
 assert.match(s,/Your business is protected/);
 assert.match(s,/Each employee has their own secure account/);
 assert.match(s,/One business, fully under your control/);
 assert.doesNotMatch(s,/Membership and permissions are checked by the backend/);
 assert.doesNotMatch(s,/internal accounting location for record compatibility/);
});

