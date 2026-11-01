import { Client } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for the disposable tenant HTTP test.');
const port = Number(process.env.LEXA_TEST_PORT ?? 11837);
const base = `http://127.0.0.1:${port}`;
const ids = {
  tenantA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userA: '11111111-1111-4111-8111-111111111111', branchA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', productA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
  tenantB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', userB: '22222222-2222-4222-8222-222222222222', branchB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbab', productB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbac',
};
const tokenA = `ci-session-a-${randomUUID()}`;
const tokenB = `ci-session-b-${randomUUID()}`;
const sha = (value) => createHash('sha256').update(value).digest('hex');
let child;
const db = new Client({ connectionString: databaseUrl });

async function seed() {
  await db.connect();
  await db.query('BEGIN');
  try {
    await db.query(`INSERT INTO users(id,email,display_name,password_hash,created_at,updated_at) VALUES
      ($1,'http-a@example.invalid','HTTP tenant A','not-a-login',now(),now()),
      ($2,'http-b@example.invalid','HTTP tenant B','not-a-login',now(),now()) ON CONFLICT(id) DO NOTHING`, [ids.userA, ids.userB]);
    await db.query("SELECT set_config('app.user_id',$1,true)", [ids.userA]);
    await db.query(`INSERT INTO tenants(id,name,slug,updated_at) VALUES
      ($1,'HTTP Tenant A','http-tenant-a',now()),($2,'HTTP Tenant B','http-tenant-b',now()) ON CONFLICT(id) DO NOTHING`, [ids.tenantA, ids.tenantB]);
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [ids.tenantA]);
    await db.query(`INSERT INTO memberships(tenant_id,user_id,role,status,branch_scope_mode,created_at,updated_at)
      VALUES($1,$2,'owner','ACTIVE','all',now(),now()) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role='owner',status='ACTIVE',branch_scope_mode='all',updated_at=now()`, [ids.tenantA,ids.userA]);
    await db.query(`INSERT INTO branches(id,tenant_id,code,name,timezone,currency,created_at,updated_at)
      VALUES($1,$2,'HTTP-A','HTTP Branch A','Africa/Kampala','UGX',now(),now()) ON CONFLICT(id) DO NOTHING`, [ids.branchA,ids.tenantA]);
    await db.query(`INSERT INTO products(id,tenant_id,name,sku,cost_price_minor,selling_price_minor,low_stock_threshold,track_stock,active,created_at,updated_at)
      VALUES($1,$2,'HTTP Product A','HTTP-SKU-A',100,500,0,true,true,now(),now()) ON CONFLICT(id) DO NOTHING`, [ids.productA,ids.tenantA]);
    await db.query(`INSERT INTO stock_movements(id,tenant_id,branch_id,product_id,type,quantity_delta,reason,unit_cost_minor,created_at)
      VALUES($1,$2,$3,$4,'opening',5,'HTTP integration fixture',100,now()) ON CONFLICT(id) DO NOTHING`, [randomUUID(),ids.tenantA,ids.branchA,ids.productA]);

    await db.query("SELECT set_config('app.tenant_id',$1,true)", [ids.tenantB]);
    await db.query(`INSERT INTO memberships(tenant_id,user_id,role,status,branch_scope_mode,created_at,updated_at)
      VALUES($1,$2,'owner','ACTIVE','all',now(),now()) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role='owner',status='ACTIVE',branch_scope_mode='all',updated_at=now()`, [ids.tenantB,ids.userB]);
    await db.query(`INSERT INTO branches(id,tenant_id,code,name,timezone,currency,created_at,updated_at)
      VALUES($1,$2,'HTTP-B','HTTP Branch B','Africa/Kampala','UGX',now(),now()) ON CONFLICT(id) DO NOTHING`, [ids.branchB,ids.tenantB]);
    await db.query(`INSERT INTO products(id,tenant_id,name,sku,cost_price_minor,selling_price_minor,low_stock_threshold,track_stock,active,created_at,updated_at)
      VALUES($1,$2,'HTTP Product B','HTTP-SKU-B',100,500,0,true,true,now(),now()) ON CONFLICT(id) DO NOTHING`, [ids.productB,ids.tenantB]);
    await db.query(`INSERT INTO stock_movements(id,tenant_id,branch_id,product_id,type,quantity_delta,reason,unit_cost_minor,created_at)
      VALUES($1,$2,$3,$4,'opening',5,'HTTP integration fixture',100,now()) ON CONFLICT(id) DO NOTHING`, [randomUUID(),ids.tenantB,ids.branchB,ids.productB]);

    await db.query("SELECT set_config('app.user_id',$1,true)", [ids.userA]);
    await db.query(`INSERT INTO sessions(id,user_id,tenant_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,now()+interval '1 hour',now()) ON CONFLICT(token_hash) DO NOTHING`, [randomUUID(),ids.userA,ids.tenantA,sha(tokenA)]);
    await db.query("SELECT set_config('app.user_id',$1,true)", [ids.userB]);
    await db.query(`INSERT INTO sessions(id,user_id,tenant_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,now()+interval '1 hour',now()) ON CONFLICT(token_hash) DO NOTHING`, [randomUUID(),ids.userB,ids.tenantB,sha(tokenB)]);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

async function request(path, token, csrf, method='GET', body) {
  const headers = { cookie: `lexa_session=${encodeURIComponent(token)}${csrf ? `; lexa_csrf=${encodeURIComponent(csrf)}` : ''}`, accept: 'application/json' };
  if (body !== undefined) { headers['content-type']='application/json'; headers['x-csrf-token']=csrf; headers['idempotency-key']=`ci-${randomUUID()}`; }
  const response = await fetch(`${base}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); let payload; try { payload=JSON.parse(text); } catch { payload=text; }
  return { status: response.status, payload };
}
function assert(condition, message) { if (!condition) throw new Error(message); }
async function waitReady() {
  const until=Date.now()+45_000;
  while(Date.now()<until) { try { const r=await fetch(`${base}/health/ready`); if(r.ok) return; } catch {} await new Promise(r=>setTimeout(r,500)); }
  throw new Error('Nest API did not become ready for tenant HTTP integration tests.');
}

try {
  await seed();
  child = spawn(process.execPath, ['dist/src/main.js'], { cwd: process.cwd(), env: { ...process.env, PORT:String(port), DATABASE_RUNTIME_ROLE:'lexa_app_runtime', FRONTEND_ORIGINS:'http://localhost:5173' }, stdio:'inherit' });
  await waitReady();
  const csrfResponse = await fetch(`${base}/api/v1/auth/csrf`);
  assert(csrfResponse.ok, `CSRF bootstrap failed: ${csrfResponse.status}`);
  const csrf = csrfResponse.headers.get('set-cookie')?.match(/lexa_csrf=([^;]+)/)?.[1];
  assert(csrf, 'CSRF endpoint did not set a CSRF cookie.');

  const tenantAProducts = await request(`/workspaces/${ids.tenantA}/products`,tokenA,csrf);
  assert(tenantAProducts.status===200,`Tenant A product list failed: ${tenantAProducts.status}`);
  const rowsA = Array.isArray(tenantAProducts.payload) ? tenantAProducts.payload : tenantAProducts.payload?.data;
  assert(Array.isArray(rowsA) && rowsA.some(p=>p.id===ids.productA), 'Tenant A cannot read its own product.');
  assert(!rowsA.some(p=>p.id===ids.productB), 'Tenant A received tenant B product data.');

  const tenantBDenied = await request(`/workspaces/${ids.tenantB}/products`,tokenA,csrf);
  assert([403,404].includes(tenantBDenied.status),`Cross-tenant collection IDOR was not denied: ${tenantBDenied.status}`);
  const crossBranch = await request(`/workspaces/${ids.tenantA}/branches/${ids.branchB}/analytics/overview`,tokenA,csrf);
  assert([403,404].includes(crossBranch.status),`Cross-tenant branch IDOR was not denied: ${crossBranch.status}`);
  const crossUpdate = await request(`/workspaces/${ids.tenantB}/products/${ids.productB}`,tokenA,csrf,'PATCH',{name:'IDOR attempt'});
  assert([403,404].includes(crossUpdate.status),`Cross-tenant direct-ID write was not denied: ${crossUpdate.status}`);

  const tenantBProducts = await request(`/workspaces/${ids.tenantB}/products`,tokenB,csrf);
  assert(tenantBProducts.status===200,`Tenant B product list failed: ${tenantBProducts.status}`);
  const rowsB = Array.isArray(tenantBProducts.payload) ? tenantBProducts.payload : tenantBProducts.payload?.data;
  assert(Array.isArray(rowsB) && rowsB.some(p=>p.id===ids.productB), 'Tenant B cannot read its own product.');
  assert(!rowsB.some(p=>p.id===ids.productA), 'Tenant B received tenant A product data.');

  // Execute the complete sale -> receipt -> return -> credit note flow in both workspaces.
  for (const [tenantId,branchId,productId,token] of [[ids.tenantA,ids.branchA,ids.productA,tokenA],[ids.tenantB,ids.branchB,ids.productB,tokenB]]) {
    const openSession = await request(`/workspaces/${tenantId}/branches/${branchId}/finance/cash-sessions`,token,csrf,'POST',{openingFloatMinor:0});
    assert(openSession.status===201 || openSession.status===200,`Cash session open failed in ${tenantId}: ${openSession.status} ${JSON.stringify(openSession.payload)}`);
    const sale = await request(`/workspaces/${tenantId}/branches/${branchId}/sales/complete`,token,csrf,'POST',{items:[{productId,quantity:1}],payments:[{method:'cash',amountMinor:500}]});
    assert(sale.status===201 || sale.status===200,`Sale completion failed in ${tenantId}: ${sale.status} ${JSON.stringify(sale.payload)}`);
    const saleObj=sale.payload?.sale??sale.payload?.data?.sale;
    assert(saleObj?.id,`Sale response did not include a sale ID in ${tenantId}.`);
    const detail=await request(`/workspaces/${tenantId}/sales/${saleObj.id}`,token,csrf);
    assert(detail.status===200,`Sale detail refresh failed in ${tenantId}: ${detail.status}`);
    const detailObj=detail.payload?.sale??detail.payload?.data?.sale??detail.payload?.data;
    const lines=detail.payload?.lines??detail.payload?.data?.lines??detailObj?.lines??[];
    const saleLineId=lines[0]?.id;
    assert(saleLineId,`Sale detail did not expose line IDs in ${tenantId}.`);
    const returned=await request(`/workspaces/${tenantId}/branches/${branchId}/sales/${saleObj.id}/returns`,token,csrf,'POST',{items:[{saleLineId,quantity:1,disposition:'restock'}],reason:'CI return validation',recordRefund:true,refundMethod:'cash'});
    assert(returned.status===201 || returned.status===200,`Return/credit note failed in ${tenantId}: ${returned.status} ${JSON.stringify(returned.payload)}`);
    const credits=await request(`/workspaces/${tenantId}/branches/${branchId}/finance/credit-notes`,token,csrf);
    assert(credits.status===200,`Credit note list failed in ${tenantId}: ${credits.status}`);
    const creditRows=Array.isArray(credits.payload)?credits.payload:credits.payload?.data;
    assert(Array.isArray(creditRows)&&creditRows.length>0,`No credit note was issued for the return in ${tenantId}.`);
  }

  console.log('Tenant HTTP/IDOR integration passed: two tenants, two users, own-record reads, cross-tenant list/direct-ID/branch denial, and per-tenant sale/payment/return/credit-note round trips.');
} finally {
  if (child) { child.kill('SIGTERM'); await new Promise(resolve=>setTimeout(resolve,500)); if (!child.killed) child.kill('SIGKILL'); }
  try { await db.end(); } catch {}
}
