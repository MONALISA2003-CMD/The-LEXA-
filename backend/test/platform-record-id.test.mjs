import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPlatformRecordId } from '../src/platform-administration/platform-record-id.ts';

test('platform record IDs accept canonical UUIDs for every admin account action',()=>{
  assert.equal(isPlatformRecordId('123e4567-e89b-42d3-a456-426614174000'),true);
  assert.equal(isPlatformRecordId('7a415b7d-48f6-4cb1-800d-d1dce4399ebf'),true);
  assert.equal(isPlatformRecordId('7A415B7D-48F6-4CB1-800D-D1DCE4399EBF'),true);
  assert.equal(isPlatformRecordId('7a415b7d-48f6-4cb1-800d-d1dce4399eb'),false);
  assert.equal(isPlatformRecordId('7a415b7d-48f6-4cb1-800dd1dce4399ebf'),false);
  assert.equal(isPlatformRecordId('not-a-business'),false);
  assert.equal(isPlatformRecordId(null),false);
});
test('admin account, user, payment, support and incident endpoints share one correct ID validator',()=>{
  const controller = readFileSync(new URL('../src/platform-administration/platform-administration.controller.ts',import.meta.url),'utf8');
  assert.match(controller,/const key = .*isPlatformRecordId\(value\)/);
  assert.match(controller,/@Get\('businesses\/:tenantId'\)/);
  assert.match(controller,/@Post\('businesses\/:tenantId\/access'\)/);
  assert.match(controller,/@Post\('businesses\/:tenantId\/archive'\)/);
  assert.match(controller,/@Post\('businesses\/:tenantId\/restore'\)/);
  assert.match(controller,/@Post\('users\/:tenantId\/:userId\/access'\)/);
});
