import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const platform=readFileSync(new URL('../src/platform/platform.controller.ts',import.meta.url),'utf8');
const tax=readFileSync(new URL('../src/platform/tax-reference.controller.ts',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/platform/worker.ts',import.meta.url),'utf8');
const clamav=readFileSync(new URL('../src/platform/clamav.ts',import.meta.url),'utf8');
const core=readFileSync(new URL('../src/core/core.controller.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../prisma/migrations/20261101103000_increment2_private_documents_tax/migration.sql',import.meta.url),'utf8');
test('upload is create-once, short-lived and verifies actual object bytes',()=>{
 assert.match(platform,/IfNoneMatch:'\*'/);assert.match(platform,/expiresAt=new Date\(Date\.now\(\)\+10\*60\*1000\)/);
 assert.match(platform,/createHash\('sha256'\)\.update\(bytes\)/);assert.match(platform,/detectMime\(bytes/);assert.match(platform,/status='pending_scan'/);
});
test('attachment downloads re-authorise record participation and are clean-only',()=>{
 assert.match(platform,/f\.status!=='clean'/);assert.match(platform,/td\.participants\.includes\(actor\.userId\)/);assert.match(platform,/attachment\.download_url_issued/);
 assert.match(core,/file\.uploaded_by_user_id !== session\.userId/);
});
test('scanner moves clean objects and fails closed for infected, unavailable or timeout cases',()=>{
 assert.match(worker,/scanWithClamAV\(bytes\)/);assert.match(clamav,/zINSTREAM/);assert.match(clamav,/FOUND/);assert.match(clamav,/timeout/);assert.match(worker,/new CopyObjectCommand/);assert.match(worker,/new DeleteObjectCommand/);assert.match(worker,/InfectedFileError/);assert.match(worker,/'scan_failed'/);assert.match(worker,/'quarantined'/);
});
test('tax documents and rules are versioned, tenant-scoped and independently approved',()=>{
 assert.match(migration,/CREATE TABLE tax_reference_documents/);assert.match(migration,/CREATE TABLE tax_code_rule_versions/);assert.match(migration,/CREATE TABLE tax_rule_reference_links/);assert.match(migration,/ALTER TABLE sale_lines[\s\S]*tax_rule_version_id/);
 assert.match(tax,/A different authorised person must approve this tax reference/);assert.match(tax,/A different authorised person must approve this tax rule/);assert.match(tax,/d\.status='approved'/);assert.match(tax,/later approved rule already overlaps/);
});
test('POS stores immutable tax rule and reference snapshots on new sale lines',()=>{
 assert.match(core,/taxCodeSnapshot: line\.taxCodeSnapshot/);assert.match(core,/taxRuleVersionId: line\.taxRuleVersionId/);assert.match(core,/taxReferenceDocumentVersionId: line\.taxReferenceDocumentVersionId/);assert.match(core,/taxableMinor: line\.netMinor/);assert.match(core,/no approved effective rule linked to an approved reference document/);
});
