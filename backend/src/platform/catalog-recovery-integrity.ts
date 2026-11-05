/**
 * Recovery is allowed only when the source archive actually contains the entire
 * authoritative catalog graph. A green restore status must not hide missing
 * variant, serial, batch or financial movement data.
 *
 * This audit is read-only and runs INSIDE the isolated restore transaction.
 */
export const RECOVERY_CATALOG_TABLES = [
 'business_profiles','categories','products','product_variants','product_packages','inventory_lots',
 'inventory_serials','stock_movements','stock_reservations','sale_lines',
 'warehouses','unit_of_measures',
] as const;
export type RecoveryCatalogTable = (typeof RECOVERY_CATALOG_TABLES)[number];
export type BackupPart = { table:string; rows:number; part:number; artifact?:unknown };
export type BackupManifest = { tables:BackupPart[]; complete?:boolean };
export type RecoveryQuery = { query:(sql:string,values:unknown[])=>Promise<{rows:Array<{n:number|string}>}> };

/** Historic snapshots may have zero rows, but cannot omit an entire table. */
export function catalogBackupRowCounts(manifest:BackupManifest):ReadonlyMap<RecoveryCatalogTable,number>{
 if(!manifest||!Array.isArray(manifest.tables))throw new Error('Backup manifest has no table inventory.');
 const counts=new Map<RecoveryCatalogTable,number>();
 const seen=new Set<string>();
 for(const table of RECOVERY_CATALOG_TABLES){
  const parts=manifest.tables.filter(x=>x.table===table);
  if(!parts.length)throw new Error(`Backup omitted authoritative catalogue table: ${table}.`);
  let sum=0;
  if(parts.length>1&&parts.some(part=>part.part===0))throw new Error(`Empty placeholder cannot be mixed with populated backup chunks for ${table}.`);
  const ordered=parts.map(p=>p.part).sort((a,b)=>a-b);
  if(!(ordered.length===1&&ordered[0]===0)&&ordered.some((number,index)=>number!==index+1))throw new Error(`Backup has missing or unordered chunks for ${table}.`);
  for(const part of parts){
   if(!Number.isSafeInteger(part.rows)||part.rows<0||!Number.isSafeInteger(part.part)||part.part<0)throw new Error(`Invalid backup row count or chunk index for ${table}.`);
   const key=`${table}/${part.part}`;
   if(seen.has(key))throw new Error(`Duplicate backup chunk ${key}.`);
   seen.add(key);
   if(part.rows>0&&part.part===0)throw new Error(`Populated backup chunk must start at part 1 for ${table}.`);
   if(part.rows>0&&!part.artifact)throw new Error(`Missing backup artifact for ${key}.`);
   if(part.rows===0&&part.part!==0)throw new Error(`Invalid empty chunk for ${key}.`);
   sum+=part.rows;
   if(!Number.isSafeInteger(sum))throw new Error(`Backup row count overflow for ${table}.`);
  }
  counts.set(table,sum);
 }
 return counts;
}

const REFERENCE_AUDITS = [
 // Product categories and category ancestors must belong to this tenant.
 `SELECT COUNT(*)::int AS n FROM products p LEFT JOIN categories c ON c.id=p.category_id AND c.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND p.category_id IS NOT NULL AND c.id IS NULL`,
 `SELECT COUNT(*)::int AS n FROM categories c LEFT JOIN categories parent ON parent.id=c.parent_id AND parent.tenant_id=c.tenant_id WHERE c.tenant_id=$1 AND c.parent_id IS NOT NULL AND parent.id IS NULL`,
 // Package factors may never point to another business, variant or product.
 `SELECT COUNT(*)::int AS n FROM product_packages pkg LEFT JOIN products p ON p.id=pkg.product_id AND p.tenant_id=pkg.tenant_id LEFT JOIN product_variants v ON v.id=pkg.variant_id AND v.product_id=pkg.product_id AND v.tenant_id=pkg.tenant_id WHERE pkg.tenant_id=$1 AND (p.id IS NULL OR pkg.units_per_package<=0 OR (pkg.variant_id IS NOT NULL AND v.id IS NULL))`,
 // Variant-to-product links were introduced without a Prisma foreign key.
 `SELECT COUNT(*)::int AS n FROM product_variants v LEFT JOIN products p ON p.id=v.product_id AND p.tenant_id=v.tenant_id WHERE v.tenant_id=$1 AND p.id IS NULL`,
 `SELECT COUNT(*)::int AS n FROM inventory_lots l LEFT JOIN products p ON p.id=l.product_id AND p.tenant_id=l.tenant_id LEFT JOIN product_variants v ON v.id=l.variant_id AND v.product_id=l.product_id AND v.tenant_id=l.tenant_id LEFT JOIN warehouses w ON w.id=l.warehouse_id AND w.tenant_id=l.tenant_id AND w.branch_id=l.branch_id WHERE l.tenant_id=$1 AND (p.id IS NULL OR w.id IS NULL OR (l.variant_id IS NOT NULL AND v.id IS NULL))`,
 `SELECT COUNT(*)::int AS n FROM inventory_serials s LEFT JOIN products p ON p.id=s.product_id AND p.tenant_id=s.tenant_id LEFT JOIN product_variants v ON v.id=s.variant_id AND v.product_id=s.product_id AND v.tenant_id=s.tenant_id LEFT JOIN inventory_lots l ON l.id=s.lot_id AND l.product_id=s.product_id AND l.tenant_id=s.tenant_id LEFT JOIN branches b ON b.id=s.branch_id AND b.tenant_id=s.tenant_id WHERE s.tenant_id=$1 AND (p.id IS NULL OR b.id IS NULL OR (s.variant_id IS NOT NULL AND v.id IS NULL) OR (s.lot_id IS NOT NULL AND (l.id IS NULL OR l.branch_id<>s.branch_id)))`,
 `SELECT COUNT(*)::int AS n FROM stock_movements m LEFT JOIN products p ON p.id=m.product_id AND p.tenant_id=m.tenant_id LEFT JOIN product_variants v ON v.id=m.variant_id AND v.product_id=m.product_id AND v.tenant_id=m.tenant_id LEFT JOIN inventory_lots l ON l.id=m.lot_id AND l.product_id=m.product_id AND l.tenant_id=m.tenant_id LEFT JOIN inventory_serials s ON s.id=m.serial_id AND s.product_id=m.product_id AND s.tenant_id=m.tenant_id WHERE m.tenant_id=$1 AND (p.id IS NULL OR (m.variant_id IS NOT NULL AND v.id IS NULL) OR (m.lot_id IS NOT NULL AND l.id IS NULL) OR (m.serial_id IS NOT NULL AND s.id IS NULL))`,
 `SELECT COUNT(*)::int AS n FROM stock_reservations r LEFT JOIN products p ON p.id=r.product_id AND p.tenant_id=r.tenant_id LEFT JOIN product_variants v ON v.id=r.variant_id AND v.product_id=r.product_id AND v.tenant_id=r.tenant_id LEFT JOIN inventory_lots l ON l.id=r.lot_id AND l.product_id=r.product_id AND l.tenant_id=r.tenant_id WHERE r.tenant_id=$1 AND (p.id IS NULL OR (r.variant_id IS NOT NULL AND v.id IS NULL) OR (r.lot_id IS NOT NULL AND l.id IS NULL))`,
 `SELECT COUNT(*)::int AS n FROM sale_lines s LEFT JOIN products p ON p.id=s.product_id AND p.tenant_id=s.tenant_id LEFT JOIN product_variants v ON v.id=s.variant_id AND v.product_id=s.product_id AND v.tenant_id=s.tenant_id WHERE s.tenant_id=$1 AND (p.id IS NULL OR (s.variant_id IS NOT NULL AND v.id IS NULL))`,
 // Quantities cannot be corrupted by a restore or partially-applied stock movement.
 `SELECT COUNT(*)::int AS n FROM inventory_lots WHERE tenant_id=$1 AND (quantity_on_hand<0 OR quantity_reserved<0 OR quantity_quarantined<0 OR quantity_reserved+quantity_quarantined>quantity_on_hand)`,
 // Every physical identifier is unique across BOTH primary and secondary IMEI slots.
 `SELECT COUNT(*)::int AS n FROM (SELECT token FROM (SELECT upper(btrim(serial_number)) AS token FROM inventory_serials WHERE tenant_id=$1 UNION ALL SELECT upper(btrim(identifiers->>'imei2')) AS token FROM inventory_serials WHERE tenant_id=$1 AND nullif(btrim(identifiers->>'imei2'),'') IS NOT NULL) identities WHERE token IS NOT NULL AND token<>'' GROUP BY token HAVING COUNT(*)>1) duplicate_identifiers`,
] as const;

/** Any missing row or broken reference aborts and rolls back the restore. */
export async function assertRestoredCatalogIntegrity(db:RecoveryQuery,tenantId:string,manifest:BackupManifest):Promise<{checkedTables:number;referenceAudits:number}>{
 const counts=catalogBackupRowCounts(manifest);
 for(const [table,expected] of counts){
  // Names come from the fixed compile-time allowlist, never from the manifest.
  const result=await db.query(`SELECT COUNT(*)::int AS n FROM "${table}" WHERE tenant_id=$1`,[tenantId]);
  const actual=Number(result.rows[0]?.n);
  if(!Number.isSafeInteger(actual)||actual!==expected)throw new Error(`Catalogue recovery count mismatch for ${table}: expected ${expected}, found ${actual}.`);
 }
 for(let i=0;i<REFERENCE_AUDITS.length;i++){
  const result=await db.query(REFERENCE_AUDITS[i]!,[tenantId]);
  const broken=Number(result.rows[0]?.n);
  if(!Number.isSafeInteger(broken)||broken!==0)throw new Error(`Catalogue recovery relation audit ${i+1} failed: ${broken} broken links.`);
 }
 return {checkedTables:counts.size,referenceAudits:REFERENCE_AUDITS.length};
}
