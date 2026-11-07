import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';

const root=resolve(import.meta.dirname,'../..');
const read=(name)=>readFileSync(resolve(root,name),'utf8');
const frontend=resolve(root,'lexa-frontend/src');
function sourceFiles(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory() ? sourceFiles(resolve(dir,item.name)) : /\.(tsx?|jsx?)$/.test(item.name)?[resolve(dir,item.name)]:[]);
}

test('customer and demo screens use LEXA-owned marks, not third-party icon components',()=>{
  const icons=read('lexa-frontend/src/components/LexaIcon.tsx');
  const names=new Set([...icons.matchAll(/export const (\w+) = createIcon\(/g)].map(match=>match[1]));
  assert.ok(names.size>=110,`Expected the full replacement icon set; got ${names.size}`);
  let replaced=0;
  for(const file of sourceFiles(frontend)) {
    const source=readFileSync(file,'utf8');
    assert.doesNotMatch(source,/['"]lucide-react['"]/,relative(frontend,file));
    for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]*LexaIcon)['"]/gs)) {
      const imports=match[1].split(',').map(x=>x.trim()).filter(Boolean);
      for(const part of imports) {
        const name=part.replace(/^type\s+/,'').split(/\s+as\s+/)[0].trim();
        assert.ok(name==='LexaIcon'||name==='LexaIconProps'||names.has(name),`${relative(frontend,file)}: missing ${name}`);
      }
      assert.ok(resolve(dirname(file),match[2])+'.tsx'===resolve(frontend,'components/LexaIcon.tsx'));
      replaced++;
    }
  }
  assert.ok(replaced>=70,`Expected all existing screens migrated; got ${replaced}`);
  assert.ok(!Object.hasOwn(JSON.parse(read('lexa-frontend/package.json')).dependencies,'lucide-react'));
});

test('marketing pages explain real LEXA work with clean self-canonical addresses',()=>{
  const paths={index:'/',features:'/features',industries:'/industries',pricing:'/pricing',security:'/security',help:'/help'};
  const sitemap=read('lexa-frontend/marketing/sitemap.xml');
  for(const [page,path] of Object.entries(paths)) {
    const html=read(`lexa-frontend/marketing/${page}.html`);
    assert.ok(html.includes(`rel="canonical" href="https://lexaaamaal.com${path}"`),page);
    assert.ok(sitemap.includes(`https://lexaaamaal.com${path}`),page);
    assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1,`One h1 expected: ${page}`);
    assert.match(html,/https:\/\/app\.lexaaamaal\.com\/sign-in/);
    assert.match(html,/https:\/\/demo\.lexaaamaal\.com\/demo/);
    assert.doesNotMatch(html,/seamless|revolutionary|AI-powered|everything your business needs|intelligent workspace/i,page);
  }
  const home=read('lexa-frontend/marketing/index.html');
  assert.match(home,/Know what sold/);
  assert.match(home,/stock movement|stock movements/i);
  assert.match(read('lexa-frontend/marketing/industries.html'),/Bakeries &amp; prepared food/);
  const cfg=JSON.parse(read('lexa-frontend/marketing/vercel.json'));
  assert.equal(cfg.cleanUrls,true);
  assert.ok(cfg.redirects.some(x=>x.source==='/demo'&&x.destination==='https://demo.lexaaamaal.com/demo'));
  assert.ok(cfg.redirects.some(x=>x.source==='/sign-in'&&x.destination==='https://app.lexaaamaal.com/sign-in'));
});

test('demo entry and sample-business guide point to actual workspace routes',()=>{
  const entry=read('lexa-frontend/src/modules/demo/DemoEntryPage.tsx');
  const banner=read('lexa-frontend/src/modules/demo/DemoBanner.tsx');
  const router=read('lexa-frontend/src/app/router.tsx');
  for(const route of ['/checkout','/products','/inventory','/modules/purchases','/reports']) {
    assert.ok(banner.includes(`to="${route}"`),`guide missing ${route}`);
    assert.ok(route.startsWith('/modules/') ? router.includes('modules/:moduleId') : router.includes(route.slice(1)),`route missing from router: ${route}`);
  }
  assert.match(entry,/48 products, 42 sample receipts/);
  assert.match(entry,/TurnstileWidget/);
  assert.match(banner,/apiDemo\.reset\(\)/);
  assert.match(banner,/apiDemo\.end\(\)/);
  assert.match(banner,/https:\/\/app\.lexaaamaal\.com\/create-account/);
});

test('sample business records use grounded product prices and recognizable module-specific work',()=>{
  const seed=read('backend/src/demo/demo-seed.ts');
  assert.match(seed,/const retailPricesUGX = \[/);
  assert.match(seed,/const demoRecordLabels/);
  for(const moduleId of ['payroll','purchases','stock-counts','work-orders','sales-orders','expenses']) {
    assert.ok(seed.includes(`'${moduleId}':`),moduleId);
  }
  assert.doesNotMatch(seed,/name:\s*`Sample \$\{moduleId/);
  assert.match(seed,/tx\.sale\.createMany/);
  assert.match(seed,/tx\.stockMovement\.createMany/);
});

test('public search pages are indexable but business application pages are noindex',()=>{
  assert.match(read('lexa-frontend/marketing/robots.txt'),/Allow: \//);
  const cfg=JSON.parse(read('lexa-frontend/vercel.json'));
  const headers=cfg.headers.find(x=>x.source==='/(.*)').headers;
  assert.ok(headers.some(x=>x.key==='X-Robots-Tag'&&x.value.includes('noindex')));
  assert.match(read('lexa-frontend/index.html'),/noindex,nofollow/);
  const demo=JSON.parse(read('docs/deployment/vercel.demo.json'));
  assert.ok(demo.rewrites.filter(x=>x.source.includes('/api/')).every(x=>x.destination.includes('lexa-demo-api.onrender.com')));
});

test('email, login and legacy deep links stay on the app host after public-site cutover',()=>{
  const marketing=JSON.parse(read('lexa-frontend/marketing/vercel.json'));
  for(const path of ['/verify-email','/reset-password','/accept-invitation','/platform-admin/:path*','/settings/:path*','/modules/:path*','/checkout','/reports']) {
    assert.ok(marketing.redirects.some(r=>r.source===path&&r.destination===`https://app.lexaaamaal.com${path}`),`Missing old-link redirect: ${path}`);
  }
  assert.match(read('render.yaml'),/- key: FRONTEND_PUBLIC_URL\s+value: https:\/\/app\.lexaaamaal\.com/);
  assert.match(read('backend/src/auth/public-registration.controller.ts'),/FRONTEND_PUBLIC_URL \|\| 'https:\/\/app\.lexaaamaal\.com'/);
  assert.match(read('backend/src/main.ts'),/https:\/\/app\.lexaaamaal\.com/);
  assert.match(read('backend/src/auth/turnstile-verification.ts'),/app\.lexaaamaal\.com/);
});
