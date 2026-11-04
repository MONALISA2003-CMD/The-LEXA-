#!/usr/bin/env node
/**
 * Before/after source-preservation gate. Works on a read-only tenant snapshot.
 * Captures deterministic hashes of every original catalogue, inventory and
 * commerce row, excluding expected business-industry reclassification fields.
 * No raw customer, serial, pricing, or other business data is exported.
 *
 *   AUDIT_DATABASE_URL=... AUDIT_TENANT_ID=<uuid> node scripts/capture-catalog-history.mjs capture before.json
 *   ... run approved migration/rehearsal with writes frozen ...
 *   AUDIT_DATABASE_URL=... AUDIT_TENANT_ID=<uuid> node scripts/capture-catalog-history.mjs capture after.json
 *   node scripts/capture-catalog-history.mjs compare before.json after.json
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const TABLES = [
 'business_profiles','categories','products','product_variants',
 'inventory_lots','inventory_serials','stock_movements','stock_reservations',
 'sale_lines','sales','sale_returns','sale_return_lines','warehouses',
 'unit_of_measures',
];
const checksum = value=>createHash('sha256').update(value).digest('hex');
const file=process.argv[3];
const op=process.argv[2];
if(!['capture','compare'].includes(op)||!file|| (op==='compare'&&!process.argv[4])){
 console.error('Usage: capture <snapshot.json> | compare <before.json> <after.json>');process.exit(2);
}
if(op==='compare'){
 const before=JSON.parse(readFileSync(file,'utf8')),after=JSON.parse(readFileSync(process.argv[4],'utf8'));
 if(before.schemaVersion!==1||after.schemaVersion!==1||before.tenantHash!==after.tenantHash)throw Error('Snapshots are not for the same business / schema.');
 for(const table of TABLES){
  const a=before.tables[table],b=after.tables[table];
  if(!a||!b||a.count!==b.count||a.sha256!==b.sha256)throw Error(`Historical business data changed in ${table}. Stop release and investigate before cutover.`);
 }
 console.log(`Historical retention PASS: ${TABLES.length} tables unchanged; catalogue, stock, sales and unit identities preserved.`);
 process.exit(0);
}
const tenant=process.env.AUDIT_TENANT_ID;
const connectionString=process.env.AUDIT_DATABASE_URL;
if(!tenant||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(tenant)||!connectionString)throw Error('Set AUDIT_TENANT_ID and AUDIT_DATABASE_URL for read-only audited business.');
const {Pool}=await import('pg');
const pool=new Pool({connectionString,max:1});
const client=await pool.connect();
const snapshot={schemaVersion:1,tenantHash:checksum(tenant),tables:{}};
try{
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await client.query("SET LOCAL statement_timeout = '120s'");
 for(const table of TABLES){
  const digest=createHash('sha256');let last='';let count=0;
  const primary=table==='business_profiles'?'tenant_id':'id';
  // business_profiles.industry/industries are the only fields permitted to
  // change during retirement; metadata and all other rows must remain stable.
  const rowJson=table==='business_profiles'?"(to_jsonb(t) - 'updated_at' - 'industry' - 'industries')":"(to_jsonb(t) - 'updated_at')";
  while(true){
   const q=await client.query(`SELECT ${primary}::text AS id, ${rowJson}::text AS content FROM "${table}" t WHERE tenant_id=$1::uuid AND ${primary}::text>$2 ORDER BY ${primary}::text LIMIT 500`,[tenant,last]);
   if(!q.rows.length)break;
   for(const row of q.rows){digest.update(String(row.id)).update('\0').update(String(row.content)).update('\n');count++;}
   last=String(q.rows.at(-1).id);
  }
  snapshot.tables[table]={count,sha256:digest.digest('hex')};
 }
 await client.query('COMMIT');
 writeFileSync(file,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(`Captured ${TABLES.length} tenant-scoped table checksums in ${file}; no underlying business records exported.`);
}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
finally{client.release();await pool.end();}
