#!/usr/bin/env python3
"""Apply the idempotent LEXA design-token and module-accent layer before tests/build."""
from __future__ import annotations
import json
import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
SRC = FRONTEND / 'src'
MAIN = SRC / 'main.tsx'
INDEX = SRC / 'styles/index.css'
BRAND = SRC / 'styles/lexa-brand.css'
AUTHORITY = SRC / 'styles/lexa-brand-authority.css'
SHELL = SRC / 'app/layouts/AppShell.tsx'
OPS = SRC / 'modules/operations/OperationsWorkspacePage.tsx'
DASH = SRC / 'modules/dashboard/DashboardPage.tsx'
CORE = {
    SRC / 'modules/products/ProductsPage.tsx': ('/products', '<div className="page-stack">', 'page-stack'),
    SRC / 'modules/inventory/InventoryPage.tsx': ('/inventory', '<div className="page-stack">', 'page-stack'),
    SRC / 'modules/checkout/CheckoutPage.tsx': ('/checkout', '<div className="page-stack checkout-page">', 'page-stack checkout-page'),
    SRC / 'modules/sales/SalesPage.tsx': ('/sales', '<div className="page-stack">', 'page-stack'),
}
MARKER = '/* LEXA-CANONICAL-PALETTE-V1 */'

LIGHT_TOKENS = r'''/* LEXA-CANONICAL-PALETTE-V1 */
:root{color-scheme:light;
--lexa-navy:#06132f;--lexa-navy-2:#0d2042;--lexa-blue:#075cf5;--lexa-blue-hover:#064bd0;--lexa-cyan:#08bdeb;--lexa-cyan-dark:#047fba;--lexa-emerald:#00bd83;--lexa-emerald-dark:#087953;--lexa-gold:#f5c84b;--lexa-gold-dark:#825a00;--lexa-orange:#ff9b18;--lexa-orange-dark:#8a4300;--lexa-red:#f52235;--lexa-red-dark:#b51b2b;--lexa-cloud:#f4f7fc;
--color-bg-canvas:#f4f7fc;--color-surface:#ffffff;--color-surface-raised:#ffffff;--color-surface-muted:#f0f4fa;
--color-text-primary:#17243b;--color-text-secondary:#52647c;--color-text-muted:#52647c;--color-text-on-dark:#eef4ff;
--color-border:#dce5f0;--color-border-strong:#7b8da6;--color-border-control:#7b8da6;
--color-primary:#075cf5;--color-primary-strong:#0752ce;--color-primary-hover:#064bd0;--color-primary-soft:#e7efff;--color-on-primary:#ffffff;
--color-secondary:#244a83;--color-secondary-soft:#edf4ff;--color-secondary-border:#c5d9f5;--color-focus:#047fba;--color-focus-ring:rgba(8,189,235,.38);
--color-success:#087953;--color-success-accent:#00bd83;--color-success-soft:#e2f8ef;--color-success-border:#a7e7ce;
--color-warning:#825a00;--color-warning-accent:#f5c84b;--color-warning-soft:#fff3ce;--color-warning-border:#edcf74;
--color-danger:#b51b2b;--color-danger-accent:#f52235;--color-danger-soft:#ffe7e9;--color-danger-border:#f4a3ab;
--color-info:#0752ce;--color-info-soft:#e7efff;--color-info-border:#c5d9ff;--color-disabled-text:#52647c;--color-disabled-bg:#e8edf4;--color-disabled-border:#d6deea;
--brand-primary:var(--color-primary);--brand-primary-hover:var(--color-primary-hover);--brand-highlight:var(--lexa-cyan);--brand-positive:var(--lexa-emerald);--brand-warning:var(--lexa-gold);--brand-orange:var(--lexa-orange);--brand-danger:var(--lexa-red);
--shadow-card:0 8px 30px rgba(6,19,47,.055);--shadow-popover:0 18px 54px rgba(6,19,47,.18);
--navy:var(--lexa-navy);--navy-2:var(--lexa-navy-2);--blue:var(--color-primary);--blue-light:var(--color-primary-soft);--cyan:var(--lexa-cyan);--green:var(--lexa-emerald);--gold:var(--lexa-gold);--red:var(--lexa-red);--text:var(--color-text-primary);--muted:var(--color-text-secondary);--line:var(--color-border);--canvas:var(--color-bg-canvas);--surface:var(--color-surface);--shadow:var(--shadow-card)}'''
DARK_TOKENS = r''':root[data-theme=dark]{color-scheme:dark;
--color-bg-canvas:#071328;--color-surface:#0c1d3a;--color-surface-raised:#102647;--color-surface-muted:#142e53;
--color-text-primary:#edf4ff;--color-text-secondary:#c5d5ed;--color-text-muted:#a6b7d0;--color-text-on-dark:#edf4ff;
--color-border:#263b5d;--color-border-strong:#6f86a6;--color-border-control:#6f86a6;
--color-primary:#78a9ff;--color-primary-strong:#a8caff;--color-primary-hover:#9bbfff;--color-primary-soft:#142e53;--color-on-primary:#06132f;
--color-secondary:#c8dcff;--color-secondary-soft:#102647;--color-secondary-border:#365276;--color-focus:#08bdeb;--color-focus-ring:rgba(8,189,235,.46);
--color-success:#78e4ba;--color-success-accent:#00bd83;--color-success-soft:#103c37;--color-success-border:#286c59;
--color-warning:#ffe08a;--color-warning-accent:#f5c84b;--color-warning-soft:#423719;--color-warning-border:#806a32;
--color-danger:#ffadb4;--color-danger-accent:#f52235;--color-danger-soft:#451f31;--color-danger-border:#82404d;
--color-info:#8bc3ff;--color-info-soft:#142e53;--color-info-border:#365276;--color-disabled-text:#a6b7d0;--color-disabled-bg:#172944;--color-disabled-border:#2c405c;
--brand-primary:var(--color-primary);--brand-primary-hover:var(--color-primary-hover);--brand-highlight:var(--lexa-cyan);--brand-positive:var(--lexa-emerald);--brand-warning:var(--lexa-gold);--brand-orange:var(--lexa-orange);--brand-danger:var(--lexa-red);
--shadow-card:0 8px 28px rgba(0,0,0,.2);--shadow-popover:0 18px 54px rgba(0,0,0,.42);
--navy:var(--lexa-navy);--navy-2:var(--lexa-navy-2);--blue:var(--color-primary);--blue-light:var(--color-primary-soft);--cyan:var(--lexa-cyan);--green:var(--lexa-emerald);--gold:var(--lexa-gold);--red:var(--lexa-red);--text:var(--color-text-primary);--muted:var(--color-text-secondary);--line:var(--color-border);--canvas:var(--color-bg-canvas);--surface:var(--color-surface);--shadow:var(--shadow-card)}'''

ACCENT_SOURCE = '''/** Explicit LEXA module accent metadata; never inferred from URL substrings. */
export type ModuleAccentKey = 'navy' | 'blue' | 'cyan' | 'emerald' | 'gold' | 'orange';
const forPaths = (accent: ModuleAccentKey, paths: string[]) => Object.fromEntries(paths.map((path) => [path, accent])) as Record<string, ModuleAccentKey>;
export const MODULE_ACCENTS_BY_PATH: Readonly<Record<string, ModuleAccentKey>> = Object.freeze({
  ...forPaths('navy', ['/', '/workspace', '/modules', '/modules/', '/settings', '/modules/projects', '/modules/team', '/modules/audit']),
  ...forPaths('blue', ['/checkout', '/sales', '/modules/sales-orders', '/modules/sales-invoices', '/modules/quotations', '/modules/price-lists', '/modules/sales-returns', '/modules/cash-sessions']),
  ...forPaths('emerald', ['/modules/leads', '/modules/opportunities', '/modules/contacts', '/modules/campaigns', '/modules/sales-teams', '/modules/customers', '/modules/employees', '/modules/attendance', '/modules/payroll', '/modules/leave', '/modules/timesheets', '/modules/support']),
  ...forPaths('cyan', ['/products', '/inventory', '/modules/receiving', '/modules/stock-counts', '/modules/stock-transfers', '/modules/warehouses', '/modules/picklists', '/modules/item-bundles', '/modules/work-orders', '/modules/quality', '/modules/batches', '/modules/replenishment', '/modules/deliveries', '/modules/packages', '/modules/tasks', '/modules/integrations']),
  ...forPaths('orange', ['/modules/purchase-requests', '/modules/rfqs', '/modules/supplier-quotes', '/modules/suppliers', '/modules/purchases', '/modules/purchase-invoices', '/modules/purchase-returns', '/modules/boms', '/modules/job-cards']),
  ...forPaths('gold', ['/modules/expenses', '/modules/money-accounts', '/modules/payments', '/modules/accounting', '/modules/chart-of-accounts', '/modules/tax-codes', '/modules/bank-reconciliation', '/modules/assets', '/modules/cost-centers', '/modules/budgets', '/modules/tax-documents', '/modules/reports', '/modules/recurring-invoices']),
});
export const MODULE_ACCENTS_BY_GROUP: Readonly<Record<string, ModuleAccentKey>> = Object.freeze({
  WORKSPACE:'navy','CRM & GROWTH':'emerald',SELLING:'blue',INVENTORY:'cyan',LOGISTICS:'cyan',PROCUREMENT:'orange',FINANCE:'gold','PEOPLE & PAYROLL':'emerald','INTEGRATION & CONTROL':'cyan',INSIGHTS:'gold',ADMINISTRATION:'navy',
});
export function moduleAccentForPath(path: string): ModuleAccentKey { return MODULE_ACCENTS_BY_PATH[path] ?? 'navy'; }
export function moduleAccentForGroup(group: string): ModuleAccentKey { return MODULE_ACCENTS_BY_GROUP[group.trim().toUpperCase()] ?? 'navy'; }
'''

ACCENT_TEST = '''import { describe, expect, it } from 'vitest';
import { EXISTING_MODULE_LINKS, MODULE_CATALOG, PHASE_TWO_LINKS } from '../../modules/operations/moduleCatalog';
import { MODULE_ACCENTS_BY_PATH, moduleAccentForGroup, moduleAccentForPath, type ModuleAccentKey } from './moduleAccents';
const allowed: ModuleAccentKey[] = ['navy','blue','cyan','emerald','gold','orange'];
describe('LEXA module accents', () => {
  it('covers every existing and Phase 2 directory link', () => { for (const link of [...EXISTING_MODULE_LINKS, ...PHASE_TWO_LINKS]) expect(MODULE_ACCENTS_BY_PATH[link.to], link.to).toBeDefined(); });
  it('covers every operational catalogue module', () => { for (const module of MODULE_CATALOG) expect(MODULE_ACCENTS_BY_PATH['/modules/' + module.id], module.id).toBeDefined(); });
  it('uses only approved accents', () => { for (const [path, accent] of Object.entries(MODULE_ACCENTS_BY_PATH)) expect(allowed, path).toContain(accent); });
  it('assigns semantic colours to representative families', () => { expect(moduleAccentForPath('/checkout')).toBe('blue'); expect(moduleAccentForPath('/modules/receiving')).toBe('cyan'); expect(moduleAccentForPath('/modules/purchases')).toBe('orange'); expect(moduleAccentForPath('/modules/accounting')).toBe('gold'); expect(moduleAccentForPath('/modules/leads')).toBe('emerald'); expect(moduleAccentForPath('/modules/recurring-invoices')).toBe('gold'); });
  it('uses explicit group metadata and a safe default', () => { expect(moduleAccentForGroup('CRM & GROWTH')).toBe('emerald'); expect(moduleAccentForGroup('PROCUREMENT')).toBe('orange'); expect(moduleAccentForGroup('FINANCE')).toBe('gold'); expect(moduleAccentForGroup('INTEGRATION & CONTROL')).toBe('cyan'); expect(moduleAccentForGroup('unknown group')).toBe('navy'); expect(moduleAccentForPath('/modules/not-real')).toBe('navy'); });
});
'''

COLOR_TEST = '''import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const css = readFileSync(new URL('./lexa-brand.css', import.meta.url), 'utf8');
type Theme = 'light' | 'dark';
function themeBlock(theme: Theme): string { const pattern = theme === 'light' ? /:root\\{color-scheme:light;[\\s\\S]*?\\}/ : /:root\\[data-theme=['\"]?dark['\"]?\\]\\{color-scheme:dark;[\\s\\S]*?\\}/; const m = css.match(pattern); if (!m) throw new Error('Missing token block ' + theme); return m[0]; }
function declarations(theme: Theme): Map<string,string> { const a = [...themeBlock('light').matchAll(/(--[a-z0-9-]+):([^;]+);/g)].map(m=>[m[1]!,m[2]!] as const); const b = theme === 'dark' ? [...themeBlock('dark').matchAll(/(--[a-z0-9-]+):([^;]+);/g)].map(m=>[m[1]!,m[2]!] as const) : []; return new Map([...a,...b]); }
function resolve(name:string,theme:Theme,seen=new Set<string>()):string { if(seen.has(name)) throw new Error('Circular token '+name); seen.add(name); const v=declarations(theme).get(name); if(!v) throw new Error('Missing token '+name); const r=v.match(/var\\((--[a-z0-9-]+)\\)/); if(r) return resolve(r[1]!,theme,seen); if(!/^#[0-9a-f]{6}$/i.test(v.trim())) throw new Error('Expected hex token '+name+': '+v); return v.trim(); }
function lum(h:string):number { const c=h.slice(1).match(/.{2}/g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4); return .2126*c[0]!+.7152*c[1]!+.0722*c[2]!; }
function ratio(theme:Theme,fg:string,bg:string):number { const p=[lum(resolve(fg,theme)),lum(resolve(bg,theme))].sort((a,b)=>b-a); return (p[0]!+.05)/(p[1]!+.05); }
describe('LEXA semantic colour tokens',()=>{
  it.each(['light','dark'] as const)('%s text, action, status and disabled pairs meet WCAG AA',theme=>{const pairs=[['--color-text-primary','--color-bg-canvas'],['--color-text-secondary','--color-surface'],['--color-text-muted','--color-bg-canvas'],['--color-primary','--color-on-primary'],['--color-success','--color-success-soft'],['--color-warning','--color-warning-soft'],['--color-danger','--color-danger-soft'],['--color-info','--color-info-soft'],['--color-disabled-text','--color-disabled-bg']] as const; for(const [fg,bg] of pairs) expect(ratio(theme,fg,bg),fg+' / '+bg).toBeGreaterThanOrEqual(4.5);});
  it.each(['light','dark'] as const)('%s focus and control borders meet 3:1',theme=>{expect(ratio(theme,'--color-focus','--color-surface')).toBeGreaterThanOrEqual(3);expect(ratio(theme,'--color-border-control','--color-surface')).toBeGreaterThanOrEqual(3);});
  it('defines the semantic roles in both theme token blocks',()=>{for(const role of ['--color-primary','--color-primary-hover','--color-secondary','--color-text-primary','--color-text-secondary','--color-bg-canvas','--color-surface','--color-border','--color-focus','--color-success','--color-warning','--color-danger','--color-disabled-text','--color-disabled-bg']){expect(themeBlock('light')).toContain(role+':');expect(themeBlock('dark')).toContain(role+':');}});
});
'''

COMPONENT_STYLES = r'''
/* LEXA semantic controls: tokens replace arbitrary non-status colours. */
body{background:var(--color-bg-canvas);color:var(--color-text-primary)}:focus-visible{outline:3px solid var(--color-focus);outline-offset:3px}
button:disabled,input:disabled,select:disabled,textarea:disabled{cursor:not-allowed}button:disabled{color:var(--color-disabled-text);background:var(--color-disabled-bg);border-color:var(--color-disabled-border);box-shadow:none}
.button-primary{color:var(--color-on-primary);background:var(--color-primary);border-color:var(--color-primary)}.button-primary:hover:not(:disabled){color:var(--color-on-primary);background:var(--color-primary-hover);border-color:var(--color-primary-hover)}
.button-secondary{color:var(--color-text-primary);background:var(--color-surface);border-color:var(--color-border-control)}.button-quiet{color:var(--color-text-secondary);background:var(--color-surface-muted);border-color:var(--color-border)}.button-danger-soft{color:var(--color-danger);background:var(--color-danger-soft);border-color:var(--color-danger-border)}
.section-card,.mini-metric,.metric-card,.operational-panel,.table-card,.phase-two-launch-card,.quick-actions-card,.data-integrity-card,.receipt-summary,.phase-modal{background:var(--color-surface);border-color:var(--color-border);color:var(--color-text-primary)}
.section-card-heading h3,.table-toolbar h3,.checkout-section-heading h3,.phase-two-launch-heading h3,.dashboard-section-title h3{color:var(--color-text-primary)}.section-card-heading p,.table-toolbar p,.checkout-section-heading p,.page-heading-row p,.dashboard-section-title p{color:var(--color-text-secondary)}
.field-label,.phase-field{color:var(--color-text-secondary)}.field-label input,.field-label select,.field-label textarea,.phase-field input,.phase-field select,.phase-field textarea,.search-field,.phase-two-search,.phase-filter-select,.phase-date-filter{color:var(--color-text-primary);background:var(--color-surface);border-color:var(--color-border-control)}
.field-label input:focus,.field-label select:focus,.field-label textarea:focus,.phase-field input:focus-visible,.phase-field select:focus-visible,.phase-field textarea:focus-visible,.search-field:focus-within,.phase-two-search:focus-within,.phase-filter-select:focus-within,.phase-date-filter:focus-within{border-color:var(--color-focus);box-shadow:0 0 0 3px var(--color-focus-ring);outline-color:var(--color-focus)}
.field-label input:disabled,.field-label select:disabled,.field-label textarea:disabled,.phase-field input:disabled,.phase-field select:disabled,.phase-field textarea:disabled{color:var(--color-disabled-text);background:var(--color-disabled-bg);border-color:var(--color-disabled-border)}input::placeholder,textarea::placeholder{color:var(--color-text-muted);opacity:1}
.data-table thead th{color:var(--color-text-secondary);background:var(--color-surface-muted);border-color:var(--color-border)}.data-table tbody td{color:var(--color-text-secondary);border-color:var(--color-border)}.data-table tbody tr:hover{background:var(--color-primary-soft)}.data-table tfoot td{color:var(--color-text-primary);background:var(--color-surface-muted);border-color:var(--color-border)}
.product-cell strong,.amount-cell,.stock-number{color:var(--color-text-primary)!important}.empty-state h3{color:var(--color-text-primary)}.empty-state p,.loading-state{color:var(--color-text-secondary)}
.status-good,.module-state-existing{color:var(--color-success);background:var(--color-success-soft);border-color:var(--color-success-border)}.status-warning{color:var(--color-warning);background:var(--color-warning-soft);border-color:var(--color-warning-border)}.status-danger,.status-error{color:var(--color-danger);background:var(--color-danger-soft);border-color:var(--color-danger-border)}.status-info,.module-state-preview{color:var(--color-info);background:var(--color-info-soft);border-color:var(--color-info-border)}.status-muted{color:var(--color-text-secondary);background:var(--color-surface-muted);border-color:var(--color-border)}
[data-sonner-toast]{color:var(--color-text-primary);background:var(--color-surface-raised);border-color:var(--color-border)}[data-sonner-toast][data-type=success]{border-left:3px solid var(--color-success-accent)}[data-sonner-toast][data-type=warning]{border-left:3px solid var(--color-warning-accent)}[data-sonner-toast][data-type=error]{border-left:3px solid var(--color-danger-accent)}[data-sonner-toast] [data-title]{color:var(--color-text-primary)}[data-sonner-toast] [data-description]{color:var(--color-text-secondary)}
/* Typed module accent contract. */
[data-module-accent]{--module-accent:var(--lexa-navy);--module-accent-strong:var(--lexa-navy-2);--module-accent-soft:#e8edf4;--module-accent-border:#c3cedd;--module-nav-accent:#aabde0;--module-nav-wash:rgba(170,189,224,.12)}
[data-module-accent=blue]{--module-accent:var(--lexa-blue);--module-accent-strong:#0752ce;--module-accent-soft:#e7efff;--module-accent-border:#c5d9ff;--module-nav-accent:#68b8ff;--module-nav-wash:rgba(7,92,245,.28)}
[data-module-accent=cyan]{--module-accent:var(--lexa-cyan);--module-accent-strong:var(--lexa-cyan-dark);--module-accent-soft:#e5f8ff;--module-accent-border:#9fe6f6;--module-nav-accent:#32d1f5;--module-nav-wash:rgba(8,189,235,.18)}
[data-module-accent=emerald]{--module-accent:var(--lexa-emerald);--module-accent-strong:var(--lexa-emerald-dark);--module-accent-soft:#e2f8ef;--module-accent-border:#a7e7ce;--module-nav-accent:#35d5a1;--module-nav-wash:rgba(0,189,131,.16)}
[data-module-accent=gold]{--module-accent:var(--lexa-gold);--module-accent-strong:var(--lexa-gold-dark);--module-accent-soft:#fff3ce;--module-accent-border:#edcf74;--module-nav-accent:#f5c84b;--module-nav-wash:rgba(245,200,75,.18)}
[data-module-accent=orange]{--module-accent:var(--lexa-orange);--module-accent-strong:var(--lexa-orange-dark);--module-accent-soft:#fff0d9;--module-accent-border:#ffca83;--module-nav-accent:#ffb14e;--module-nav-wash:rgba(255,155,24,.16)}
:root[data-theme=dark] [data-module-accent=navy]{--module-accent:#aabde0;--module-accent-strong:#d5e2fa;--module-accent-soft:#142e53;--module-accent-border:#365276;--module-nav-accent:#aabde0;--module-nav-wash:rgba(170,189,224,.15)}
:root[data-theme=dark] [data-module-accent=blue]{--module-accent:#78a9ff;--module-accent-strong:#a8caff;--module-accent-soft:#142e53;--module-accent-border:#365276;--module-nav-accent:#78a9ff;--module-nav-wash:rgba(7,92,245,.28)}
:root[data-theme=dark] [data-module-accent=cyan]{--module-accent:#32d1f5;--module-accent-strong:#7de4fa;--module-accent-soft:#103044;--module-accent-border:#285d71;--module-nav-accent:#32d1f5;--module-nav-wash:rgba(8,189,235,.18)}
:root[data-theme=dark] [data-module-accent=emerald]{--module-accent:#35d5a1;--module-accent-strong:#78e4ba;--module-accent-soft:#103c37;--module-accent-border:#286c59;--module-nav-accent:#35d5a1;--module-nav-wash:rgba(0,189,131,.18)}
:root[data-theme=dark] [data-module-accent=gold]{--module-accent:#f5c84b;--module-accent-strong:#ffe08a;--module-accent-soft:#423719;--module-accent-border:#806a32;--module-nav-accent:#f5c84b;--module-nav-wash:rgba(245,200,75,.18)}
:root[data-theme=dark] [data-module-accent=orange]{--module-accent:#ffad4a;--module-accent-strong:#ffd19a;--module-accent-soft:#4a2b15;--module-accent-border:#80502b;--module-nav-accent:#ffad4a;--module-nav-wash:rgba(255,155,24,.18)}
.nav-link-active[data-module-accent],.nav-link-active[data-module-accent]:hover{background:linear-gradient(90deg,var(--module-nav-wash),rgba(8,189,235,.02));border-color:var(--module-accent-border);box-shadow:inset 3px 0 var(--module-nav-accent)}.nav-link-active[data-module-accent] svg{color:var(--module-nav-accent)}
.nav-section[data-module-accent] .nav-section-title::before{content:"";display:inline-block;width:5px;height:5px;margin-right:7px;border-radius:50%;background:var(--module-nav-accent)}
.module-group[data-module-accent] .module-group-heading>span:first-child{color:var(--module-accent-strong)}.module-group[data-module-accent] .module-group-heading>span:first-child::before{content:"";display:inline-block;width:6px;height:6px;margin:0 7px 1px 0;border-radius:50%;background:var(--module-accent)}
.module-directory-card[data-module-accent]{border-left:3px solid var(--module-accent-soft)}.module-directory-card[data-module-accent]:hover{border-color:var(--module-accent-border);border-left-color:var(--module-accent);box-shadow:0 9px 25px rgba(6,19,47,.09)}
.module-directory-card[data-module-accent] .module-directory-icon,.quick-action-icon[data-module-accent],.metric-icon[data-module-accent]{color:var(--module-accent-strong);background:var(--module-accent-soft)}.module-directory-card[data-module-accent] .module-directory-arrow{color:var(--module-accent-strong)}.quick-action-icon[data-module-accent]{border:1px solid var(--module-accent-border)}
.page-stack[data-module-accent]>.page-heading-row .eyebrow-blue{color:var(--module-accent-strong)}.page-stack[data-module-accent]>.page-heading-row h2{text-decoration:underline;text-decoration-color:var(--module-accent);text-decoration-thickness:2px;text-underline-offset:6px}.phase-two-page[data-module-accent] .phase-two-heading .eyebrow-blue{color:var(--module-accent-strong)}.phase-two-page[data-module-accent] .module-workflow-strip{border-left:3px solid var(--module-accent)}.phase-two-page[data-module-accent] .module-workflow-icon{color:var(--module-accent-strong);background:var(--module-accent-soft);border-color:var(--module-accent-border)}.phase-two-page[data-module-accent] .phase-calculated-panel{border-color:var(--module-accent-border)}
:root[data-theme=dark] body,:root[data-theme=dark] .main-panel{background:var(--color-bg-canvas);color:var(--color-text-primary)}:root[data-theme=dark] .topbar{background:rgba(8,24,51,.94);color:var(--color-text-primary);border-color:var(--color-border)}:root[data-theme=dark] .topbar-title h1,:root[data-theme=dark] .page-heading-row h2{color:var(--color-text-primary)!important}
:root[data-theme=dark] .section-card,:root[data-theme=dark] .mini-metric,:root[data-theme=dark] .metric-card,:root[data-theme=dark] .operational-panel,:root[data-theme=dark] .phase-two-launch-card,:root[data-theme=dark] .quick-actions-card,:root[data-theme=dark] .data-integrity-card,:root[data-theme=dark] .receipt-summary,:root[data-theme=dark] .module-directory-card,:root[data-theme=dark] .phase-modal{background:var(--color-surface);border-color:var(--color-border);color:var(--color-text-primary);box-shadow:none}
:root[data-theme=dark] .page-heading-row p,:root[data-theme=dark] .section-card-heading p,:root[data-theme=dark] .table-toolbar p,:root[data-theme=dark] .checkout-section-heading p,:root[data-theme=dark] .module-directory-copy small{color:var(--color-text-secondary)!important}:root[data-theme=dark] input,:root[data-theme=dark] select,:root[data-theme=dark] textarea{background:var(--color-surface-muted);color:var(--color-text-primary);border-color:var(--color-border-control)}:root[data-theme=dark] option{background:var(--color-surface-muted);color:var(--color-text-primary)}
@media(max-width:760px){.topbar{padding:12px 15px;gap:9px}.topbar-actions{gap:5px}.topbar-title h1{font-size:17px}.theme-toggle{width:34px;height:34px}.page-content{padding:18px 13px 20px}.local-status-banner{padding:9px 13px;align-items:flex-start}.local-status-banner button{white-space:normal}}
@media(max-width:640px){.module-directory-grid{grid-template-columns:1fr}.module-directory-card{min-height:108px}.phase-two-launch-grid{grid-template-columns:1fr}}
'''


def fail(msg: str) -> None:
    raise SystemExit('LEXA palette prebuild failed safely: ' + msg)


def read(path: Path) -> str:
    if not path.is_file():
        fail(f'missing expected file {path.relative_to(FRONTEND)}')
    return path.read_text(encoding='utf-8')


def write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_text(encoding='utf-8') != value:
        path.write_text(value, encoding='utf-8')


def replace_idempotent(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        fail(f'{label}: expected one source anchor, found {count}')
    return text.replace(old, new, 1)


def add_root_attribute(text: str, start: str, end: str | None, attribute: str, label: str) -> str:
    a = text.find(start)
    if a < 0:
        fail(f'{label}: function marker missing')
    b = text.find(end, a + len(start)) if end else -1
    z = b if b >= 0 else len(text)
    part = text[a:z]
    old = '<div className="page-stack phase-two-page">'
    new = '<div className="page-stack phase-two-page" ' + attribute + '>'
    if new in part:
        return text
    if part.count(old) != 1:
        fail(f'{label}: page root anchor expected once, found {part.count(old)}')
    return text[:a] + part.replace(old, new, 1) + text[z:]


def merge_stylesheets() -> None:
    css = read(BRAND)
    if MARKER not in css:
        previous_authority = read(AUTHORITY)
        # Remove the old top-level token blocks, then place one canonical light/dark token source first.
        css = re.sub(r':root\s*\{[^{}]*\}', '', css, count=1)
        previous_authority = re.sub(r':root\s*\{[^{}]*\}', '', previous_authority, count=1)
        merged = LIGHT_TOKENS + '\n' + DARK_TOKENS + '\n' + css + '\n/* merged former authority styles */\n' + previous_authority + '\n' + COMPONENT_STYLES
        write(BRAND, merged)
    # Avoid a second permanent CSS layer in the deployed build. The source repo keeps the file for rollback.
    main = read(MAIN)
    authority_import = "import './styles/lexa-brand-authority.css';\n"
    if authority_import in main:
        main = main.replace(authority_import, '')
        write(MAIN, main)
    AUTHORITY.unlink(missing_ok=True)
    # Keep the legacy root aliases semantic in base CSS so old components inherit the canonical pairings.
    index = read(INDEX)
    if '--color-bg-canvas' not in index.split(':root', 1)[1].split('}', 1)[0]:
        block = ''' :root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--color-text-primary); background: var(--color-bg-canvas);
  font-synthesis: none; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased;
  --navy:var(--lexa-navy);--navy-2:var(--lexa-navy-2);--blue:var(--color-primary);--blue-light:var(--color-primary-soft);
  --cyan:var(--lexa-cyan);--green:var(--lexa-emerald);--gold:var(--lexa-gold);--red:var(--lexa-red);
  --text:var(--color-text-primary);--muted:var(--color-text-secondary);--line:var(--color-border);--canvas:var(--color-bg-canvas);--surface:var(--color-surface);--shadow:var(--shadow-card);
}'''.strip()
        index, count = re.subn(r':root\s*\{[^{}]*\}', block, index, count=1)
        if count != 1:
            fail('index.css: canonical alias block could not be installed')
        index = index.replace(':focus-visible { outline: 3px solid rgba(7, 95, 232, .34); outline-offset: 2px; }', ':focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }')
        write(INDEX, index)


def wire_accent_metadata() -> None:
    shell = read(SHELL)
    shell = replace_idempotent(shell,
        "import type { Branch, Workspace } from '../../domain/shared/types';",
        "import type { Branch, Workspace } from '../../domain/shared/types';\nimport { moduleAccentForGroup, moduleAccentForPath } from '../../domain/shared/moduleAccents';",
        'AppShell metadata import')
    shell = replace_idempotent(shell, '<div className="nav-section" key={section.title}>', '<div className="nav-section" key={section.title} data-module-accent={moduleAccentForGroup(section.title)}>', 'sidebar group accent')
    old_link = "return <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>"
    new_link = "return <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false} data-module-accent={moduleAccentForPath(item.to)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>"
    shell = replace_idempotent(shell, old_link, new_link, 'sidebar item accents')
    old_settings = '<NavLink to="/settings" className={({ isActive }) => `nav-link settings-link ${isActive ? \'nav-link-active\' : \'\'}`}>'
    new_settings = '<NavLink to="/settings" data-module-accent={moduleAccentForPath(\'/settings\')} className={({ isActive }) => `nav-link settings-link ${isActive ? \'nav-link-active\' : \'\'}`}>'
    if old_settings in shell or 'data-module-accent={moduleAccentForPath(\'/settings\')}' in shell:
        shell = replace_idempotent(shell, old_settings, new_settings, 'settings link accent')
    write(SHELL, shell)

    ops = read(OPS)
    ops = replace_idempotent(ops, "import type { PreviewScope } from '../../data/contracts/previewData';", "import type { PreviewScope } from '../../data/contracts/previewData';\nimport { moduleAccentForGroup, moduleAccentForPath } from '../../domain/shared/moduleAccents';", 'module workspace metadata import')
    ops = replace_idempotent(ops, '<section className="module-group" key={group}>', '<section className="module-group" key={group} data-module-accent={moduleAccentForGroup(group)}>', 'module group accent')
    ops = replace_idempotent(ops, '<Link className="module-directory-card" to={item.to} key={item.to}>', '<Link className="module-directory-card" data-module-accent={moduleAccentForPath(item.to)} to={item.to} key={item.to}>', 'directory card accent')
    ops = add_root_attribute(ops, 'function ModuleManager(', 'function ReportsPage(', 'data-module-accent={moduleAccentForPath("/modules/" + module.id)}', 'module manager')
    ops = add_root_attribute(ops, 'function ReportsPage(', None, 'data-module-accent={moduleAccentForPath("/modules/reports")}', 'reports page')
    write(OPS, ops)

    dashboard = read(DASH)
    dashboard = replace_idempotent(dashboard, "import { PHASE_TWO_LINKS } from '../operations/moduleCatalog';", "import { PHASE_TWO_LINKS } from '../operations/moduleCatalog';\nimport { moduleAccentForPath } from '../../domain/shared/moduleAccents';", 'dashboard metadata import')
    dashboard = replace_idempotent(dashboard, '<div className="page-stack dashboard-page">', '<div className="page-stack dashboard-page" data-module-accent={moduleAccentForPath("/")}>', 'dashboard page accent')
    for old, new, label in [
        ('className="metric-icon blue-metric"', 'className="metric-icon blue-metric" data-module-accent={moduleAccentForPath("/sales")}', 'sales metric accent'),
        ('className="metric-icon green-metric"', 'className="metric-icon green-metric" data-module-accent={moduleAccentForPath("/modules/payments")}', 'payment metric accent'),
        ('className="metric-icon amber-metric"', 'className="metric-icon amber-metric" data-module-accent={moduleAccentForPath("/modules/sales-invoices")}', 'invoice metric accent'),
        ('className="metric-icon purple-metric"', 'className="metric-icon purple-metric" data-module-accent={moduleAccentForPath("/inventory")}', 'inventory metric accent'),
        ('className="quick-action-icon quick-blue"><Icon', 'className="quick-action-icon quick-blue" data-module-accent={moduleAccentForPath(item.to)}><Icon', 'dashboard shortcut accent'),
        ('className="quick-action-icon quick-blue"><ShoppingCart', 'className="quick-action-icon quick-blue" data-module-accent={moduleAccentForPath("/checkout")}><ShoppingCart', 'checkout shortcut accent'),
        ('className="quick-action-icon quick-purple"><Package', 'className="quick-action-icon quick-purple" data-module-accent={moduleAccentForPath("/products")}><Package', 'product shortcut accent'),
        ('className="quick-action-icon quick-green"><ArrowDownRight', 'className="quick-action-icon quick-green" data-module-accent={moduleAccentForPath("/inventory")}><ArrowDownRight', 'stock shortcut accent'),
    ]:
        if old in dashboard:
            dashboard = dashboard.replace(old, new)
        elif new not in dashboard and label in ('sales metric accent','payment metric accent','invoice metric accent','inventory metric accent'):
            # A source structure change is safer than silently leaving a requested metric uncoloured.
            fail(label + ': anchor not found')
    write(DASH, dashboard)

    for path, (route, root, class_name) in CORE.items():
        content = read(path)
        rel_import = "import { moduleAccentForPath } from '../../domain/shared/moduleAccents';"
        if rel_import not in content:
            content = rel_import + '\n' + content
        replacement = '<div className="' + class_name + '" data-module-accent={moduleAccentForPath("' + route + '")}>'
        if replacement not in content:
            if content.count(root) != 1:
                fail(f'{path.name}: expected one page root matching {root!r}, found {content.count(root)}')
            content = content.replace(root, replacement, 1)
        write(path, content)

    write(SRC / 'domain/shared/moduleAccents.ts', ACCENT_SOURCE)
    write(SRC / 'domain/shared/moduleAccents.test.ts', ACCENT_TEST)
    write(SRC / 'styles/lexa-brand.test.ts', COLOR_TEST)


def validate_manifest() -> None:
    # Fail the build if metadata gets out of sync with the generated catalogue or sidebar.
    catalog = read(SRC / 'modules/operations/moduleCatalog.ts')
    shell = read(SHELL)
    accent_source = read(SRC / 'domain/shared/moduleAccents.ts')
    module_ids = re.findall(r"id:\s*'([^']+)',\s*title:", catalog)
    paths = set(re.findall(r"to:\s*'([^']+)'", shell))
    missing = [module_id for module_id in module_ids if f"'/modules/{module_id}'" not in accent_source]
    missing_routes = [route for route in paths if f"'{route}'" not in accent_source]
    if missing or missing_routes:
        fail('module accent coverage gaps: ids=' + ','.join(missing) + ' routes=' + ','.join(missing_routes))
    if shell.count("title: '") < 9:
        fail('expected the existing nine sidebar groups to remain present')


def main() -> None:
    merge_stylesheets()
    wire_accent_metadata()
    validate_manifest()
    print('LEXA design system: canonical tokens merged; explicit module accents wired; contrast and coverage tests installed.')

if __name__ == '__main__':
    main()
