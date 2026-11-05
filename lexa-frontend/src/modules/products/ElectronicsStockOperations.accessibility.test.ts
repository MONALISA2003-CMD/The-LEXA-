import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Vitest can transform import.meta asset URLs into non-file schemes. Resolve
// the source from the project working directory, as other LEXA tests do.
const source=readFileSync(resolve(process.cwd(),'src/modules/products/ElectronicsStockOperations.tsx'),'utf8');

describe('Device receiving interaction accessibility contract',()=>{
 it('identifies unposted drafts and explicitly labels server posting',()=>{
  expect(source).toContain('aria-label="Serialized device receiving"');
  expect(source).toContain('role="status"');
  expect(source).toContain('Approve and post');
  expect(source).toContain('These devices are not available to sell until receipt approval');
 });
 it('can remove a specific draft unit via an accessible button',()=>{
  expect(source).toContain('aria-label={`Remove draft unit ${i+1}`}');
  expect(source).toContain('role="alert"');
 });
 it('keeps manufacturer identifiers out of permanent client storage',()=>{
  expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
 });
});
