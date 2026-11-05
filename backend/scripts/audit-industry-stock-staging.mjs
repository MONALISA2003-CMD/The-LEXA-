#!/usr/bin/env node
/**
 * READ-ONLY tenant-scoped staging inventory audit. This is NOT a migration,
 * repair script, or proof of passing 13 production journeys.
 * Run with LEXA_STAGING_AUDIT=YES NODE_ENV=staging LEXA_AUDIT_TENANT_ID=<uuid>
 * and DATABASE_URL_UNPOOLED pointing to an isolated staging database.
 */
import pg from 'pg';
const tenant=process.env.LEXA_AUDIT_TENANT_ID;
if(process.env.LEXA_STAGING_AUDIT!=='YES'||process.env.NODE_ENV!=='staging'||!tenant||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(tenant)){
 console.error('Refusing audit: staging flag, NODE_ENV=staging and explicit tenant UUID are required.');process.exit(2);
}
const url=process.env.DATABASE_URL_UNPOOLED;
if(!url){console.error('Refusing audit: DATABASE_URL_UNPOOLED is required.');process.exit(2);}
const db=new pg.Client({connectionString:url,connectionTimeoutMillis:12000,query_timeout:20000,application_name:'lexa-read-only-inventory-audit'});
const checks=[
 ['negative-stock',`SELECT count(*)::int AS problems FROM (
   SELECT product_id,variant_id,branch_id,warehouse_id FROM stock_movements
   WHERE tenant_id=$1 GROUP BY product_id,variant_id,branch_id,warehouse_id
   HAVING SUM(quantity_delta)<-0.0005) invalid`],
 ['invalid-lot-allocations',`SELECT count(*)::int AS problems FROM inventory_lots
   WHERE tenant_id=$1 AND (quantity_on_hand<0 OR quantity_reserved<0 OR quantity_quarantined<0
   OR quantity_reserved+quantity_quarantined>quantity_on_hand+0.0005)`],
 ['duplicate-primary-or-secondary-identifiers',`WITH identifiers AS (
   SELECT upper(btrim(serial_number)) AS ident FROM inventory_serials WHERE tenant_id=$1
   UNION ALL SELECT upper(btrim(identifiers->>'imei2')) AS ident FROM inventory_serials
   WHERE tenant_id=$1 AND nullif(btrim(identifiers->>'imei2'),'') IS NOT NULL)
   SELECT count(*)::int AS problems FROM (SELECT ident FROM identifiers GROUP BY ident HAVING count(*)>1) collisions`],
 ['orphan-serial-product-or-variant',`SELECT count(*)::int AS problems FROM inventory_serials s
   LEFT JOIN products p ON p.tenant_id=s.tenant_id AND p.id=s.product_id
   LEFT JOIN product_variants v ON v.tenant_id=s.tenant_id AND v.id=s.variant_id AND v.product_id=s.product_id
   WHERE s.tenant_id=$1 AND (p.id IS NULL OR (s.variant_id IS NOT NULL AND v.id IS NULL))`],
 ['orphan-stock-variant',`SELECT count(*)::int AS problems FROM stock_movements m
   LEFT JOIN product_variants v ON v.tenant_id=m.tenant_id AND v.id=m.variant_id AND v.product_id=m.product_id
   WHERE m.tenant_id=$1 AND m.variant_id IS NOT NULL AND v.id IS NULL`],
 ['orphan-lot-variant',`SELECT count(*)::int AS problems FROM inventory_lots l
   LEFT JOIN product_variants v ON v.tenant_id=l.tenant_id AND v.id=l.variant_id AND v.product_id=l.product_id
   WHERE l.tenant_id=$1 AND l.variant_id IS NOT NULL AND v.id IS NULL`],
 ['orphan-or-invalid-packaging',`SELECT count(*)::int AS problems FROM product_packages pp
   LEFT JOIN products p ON p.tenant_id=pp.tenant_id AND p.id=pp.product_id
   LEFT JOIN product_variants v ON v.tenant_id=pp.tenant_id AND v.id=pp.variant_id AND v.product_id=pp.product_id
   WHERE pp.tenant_id=$1 AND (p.id IS NULL OR (pp.variant_id IS NOT NULL AND v.id IS NULL)
   OR units_per_package<=0 OR base_unit IS DISTINCT FROM coalesce(p.unit_of_measure,'Each'))`],
 ['orphan-receipt-variant',`SELECT count(*)::int AS problems FROM commerce_goods_receipt_lines l
   LEFT JOIN product_variants v ON v.tenant_id=l.tenant_id AND v.id=l.variant_id AND v.product_id=l.product_id
   WHERE l.tenant_id=$1 AND l.variant_id IS NOT NULL AND v.id IS NULL`],
 ['orphan-transfer-variant',`SELECT count(*)::int AS problems FROM inventory_transfer_lines l
   LEFT JOIN product_variants v ON v.tenant_id=l.tenant_id AND v.id=l.variant_id AND v.product_id=l.product_id
   WHERE l.tenant_id=$1 AND l.variant_id IS NOT NULL AND v.id IS NULL`],
];
let started=false,failed=0;
try{
 await db.connect();await db.query('BEGIN READ ONLY');started=true;
 await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
 for(const [name,sql] of checks){const result=await db.query(sql,[tenant]);const count=Number(result.rows[0]?.problems??-1);console.log(`${name}: ${count===0?'PASS':`FAIL (${count} problems)`}`);if(count!==0)failed++;}
 console.log(`Staging inventory audit: ${checks.length-failed}/${checks.length} passed. No rows modified.`);
}catch(err){console.error('Staging audit could not complete safely:',err instanceof Error?err.message:'unknown error');failed++;}
finally{if(started)await db.query('ROLLBACK').catch(()=>{});await db.end().catch(()=>{});}
if(failed)process.exitCode=1;
