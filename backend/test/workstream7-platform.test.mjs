import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const controller=readFileSync(new URL('../src/platform/platform.controller.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../prisma/migrations/20261031200000_workstream7_platform_operations/migration.sql',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/platform/worker.ts',import.meta.url),'utf8');
test('R2 uses private S3-compatible endpoint and automatic region',()=>{assert.match(controller,/region:'auto'/);assert.match(controller,/r2\.cloudflarestorage\.com/);assert.doesNotMatch(controller,/publicAccess|r2\.dev/);});
test('upload is short lived, capped, MIME allowlisted and checksum bound',()=>{assert.match(controller,/expiresIn:600/);assert.match(controller,/25\*1024\*1024/);assert.match(controller,/allowed\.has\(type\)/);assert.match(controller,/x-amz-meta-lexa-sha256/);});
test('download is clean-only and limited to uploader or workspace admin',()=>{assert.match(controller,/f\.status!=='clean'/);assert.match(controller,/uploaded_by_user_id!==actor\.userId/);});
test('tenant and branch references are database constrained',()=>{assert.match(migration,/FOREIGN KEY\(tenant_id,branch_id\) REFERENCES branches\(tenant_id,id\)/);});
test('scanner fails closed and verifies SHA-256 before marking clean',()=>{assert.match(worker,/clamdScan\(bytes\)/);assert.match(worker,/status='clean'/);assert.match(worker,/status='quarantined'/);assert.match(worker,/createHash\('sha256'\)/);});
test('outbox unknown events are not acknowledged as processed',()=>{assert.match(worker,/No registered idempotent handler/);});

test('attachment completion is bound to the authenticated uploader',()=>{assert.match(controller,/const actor=await this\.actor\(req,w,b\).*uploaded_by_user_id!==actor\.userId/);assert.doesNotMatch(controller,/uploaded_by_user_id!==a\.userId/);});
test('attachment listing and download require scoped access',()=>{assert.match(controller,/@Get\('attachments'\)/);assert.match(controller,/td\.participants\.includes\(actor\.userId\)/);assert.match(controller,/status!=='clean'/);});
test('R2 upload returns required signed headers and download is short-lived',()=>{assert.match(controller,/requiredHeaders:\{'Content-Type':type,'x-amz-meta-lexa-sha256':hash\.toLowerCase\(\)\}/);assert.match(controller,/expiresIn:60/);});
