import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { duplicatesFromRoutes, routesFromSource, validateRoutes } from '../scripts/check-route-uniqueness.mjs';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(backend, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

test('all compiled Nest controller routes have unique method and path registrations', () => {
  const checked = validateRoutes(backend);
  assert.ok(checked.controllers >= 20);
  assert.ok(checked.routes >= 390);
});

test('Fastify duplicate route guard catches collisions even with different parameter names', () => {
  const source = `
    @Controller('workspaces/:workspaceId')
    class FirstController { @Get('branches/:branchId/inventory/lots') a() {} }
    @Controller('workspaces/:tenantId/branches/:locationId')
    class SecondController { @Get('inventory/lots') b() {} }
  `;
  const duplicates = duplicatesFromRoutes(routesFromSource(source));
  assert.equal(duplicates.length, 1);
  assert.match(duplicates[0].key, /^GET \/workspaces\/:param\/branches\/:param\/inventory\/lots$/);
});

test('inventory lot register, checkout availability and lot creation use distinct routes', () => {
  const source = read('backend/src/commerce/catalog-inventory.controller.ts');
  const inventory = read('backend/src/supply-chain/inventory-intelligence.controller.ts');
  const frontend = read('lexa-frontend/src/data/remote/apiWorkstream03.ts');
  const contract = read('lexa-frontend/openapi/backend-contract.yaml');
  const commerceRoutes = routesFromSource(source).filter(route => route.handler === 'availableLots' || route.handler === 'createLot');
  const inventoryRoutes = routesFromSource(inventory).filter(route => route.handler === 'lots');
  assert.ok(commerceRoutes.some(route => route.method === 'GET' && route.url.endsWith('/inventory/lots/available')));
  assert.ok(commerceRoutes.some(route => route.method === 'POST' && route.url.endsWith('/inventory/lots')));
  assert.ok(inventoryRoutes.some(route => route.method === 'GET' && route.url.endsWith('/inventory/lots')));
  assert.equal(duplicatesFromRoutes([...commerceRoutes, ...inventoryRoutes]).length, 0);
  assert.match(frontend, /availableLots:[\s\S]*?\/inventory\/lots\/available`,\{productId:p/);
  assert.match(contract, /\/inventory\/lots\/available:\n    get:\n      operationId: listAvailableInventoryLots/);
});
