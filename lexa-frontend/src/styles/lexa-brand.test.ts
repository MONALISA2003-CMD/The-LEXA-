import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';
// Resolve from Vite/Vitest's project working directory. import.meta.url may be
// rewritten to a non-file URL by the test transform, which fs cannot read.
const css = readFileSync(resolvePath(process.cwd(), 'src/styles/lexa-brand.css'), 'utf8');
type Theme = 'light' | 'dark';
function themeBlock(theme: Theme): string { const pattern = theme === 'light' ? /:root\{color-scheme:light;[\s\S]*?\}/ : /:root\[data-theme=['"]?dark['"]?\]\{color-scheme:dark;[\s\S]*?\}/; const m = css.match(pattern); if (!m) throw new Error('Missing token block ' + theme); return m[0]; }
function declarations(theme: Theme): Map<string,string> { const a = [...themeBlock('light').matchAll(/(--[a-z0-9-]+):([^;]+);/g)].map(m=>[m[1]!,m[2]!] as const); const b = theme === 'dark' ? [...themeBlock('dark').matchAll(/(--[a-z0-9-]+):([^;]+);/g)].map(m=>[m[1]!,m[2]!] as const) : []; return new Map([...a,...b]); }
function resolve(name:string,theme:Theme,seen=new Set<string>()):string { if(seen.has(name)) throw new Error('Circular token '+name); seen.add(name); const v=declarations(theme).get(name); if(!v) throw new Error('Missing token '+name); const r=v.match(/var\((--[a-z0-9-]+)\)/); if(r) return resolve(r[1]!,theme,seen); if(!/^#[0-9a-f]{6}$/i.test(v.trim())) throw new Error('Expected hex token '+name+': '+v); return v.trim(); }
function lum(h:string):number { const c=h.slice(1).match(/.{2}/g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4); return .2126*c[0]!+.7152*c[1]!+.0722*c[2]!; }
function ratio(theme:Theme,fg:string,bg:string):number { const p=[lum(resolve(fg,theme)),lum(resolve(bg,theme))].sort((a,b)=>b-a); return (p[0]!+.05)/(p[1]!+.05); }
describe('LEXA semantic colour tokens',()=>{
  it.each(['light','dark'] as const)('%s text, action, status and disabled pairs meet WCAG AA',theme=>{const pairs=[['--color-text-primary','--color-bg-canvas'],['--color-text-secondary','--color-surface'],['--color-text-muted','--color-bg-canvas'],['--color-primary','--color-on-primary'],['--color-success','--color-success-soft'],['--color-warning','--color-warning-soft'],['--color-danger','--color-danger-soft'],['--color-info','--color-info-soft'],['--color-disabled-text','--color-disabled-bg']] as const; for(const [fg,bg] of pairs) expect(ratio(theme,fg,bg),fg+' / '+bg).toBeGreaterThanOrEqual(4.5);});
  it.each(['light','dark'] as const)('%s focus and control borders meet 3:1',theme=>{expect(ratio(theme,'--color-focus','--color-surface')).toBeGreaterThanOrEqual(3);expect(ratio(theme,'--color-border-control','--color-surface')).toBeGreaterThanOrEqual(3);});
  it('defines the semantic roles in both theme token blocks',()=>{for(const role of ['--color-primary','--color-primary-hover','--color-secondary','--color-text-primary','--color-text-secondary','--color-bg-canvas','--color-surface','--color-border','--color-focus','--color-success','--color-warning','--color-danger','--color-disabled-text','--color-disabled-bg']){expect(themeBlock('light')).toContain(role+':');expect(themeBlock('dark')).toContain(role+':');}});

  it('keeps module accent text above 4.5:1 contrast in both themes', () => {
    const pairs = [
      ['light navy', '#0d2042', '#e8edf4'], ['light blue', '#0752ce', '#e7efff'],
      ['light cyan', '#036a9b', '#e5f8ff'], ['light emerald', '#087953', '#e2f8ef'],
      ['light gold', '#825a00', '#fff3ce'], ['light orange', '#8a4300', '#fff0d9'],
      ['dark navy', '#d5e2fa', '#142e53'], ['dark blue', '#a8caff', '#142e53'],
      ['dark cyan', '#7de4fa', '#103044'], ['dark emerald', '#78e4ba', '#103c37'],
      ['dark gold', '#ffe08a', '#423719'], ['dark orange', '#ffd19a', '#4a2b15'],
    ] as const;
    for (const [label, foreground, background] of pairs) {
      const values = [lum(foreground), lum(background)].sort((a, b) => b - a);
      expect((values[0]! + 0.05) / (values[1]! + 0.05), label).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('applies module accents to core pages and shared register surfaces', () => {
    const integration = css.split('/* LEXA-MODULE-ACCENT-INTEGRATION-V2 */')[1] ?? '';
    expect(integration.length).toBeGreaterThan(500);
    for (const accent of ['navy','blue','cyan','emerald','gold','orange']) {
      expect(integration).toContain(`[data-module-accent=${accent}]`);
    }
    for (const selector of [
      '.module-heading .eyebrow-blue',
      '.section-card-heading .heading-icon',
      '.module-workflow-strip',
      '.metric-strip > .mini-metric',
      '.data-table thead th',
      '.phase-two-table th',
      '.phase-two-search:focus-within',
    ]) expect(integration).toContain(selector);
    expect(integration).not.toContain('.button-primary');
    expect(integration).not.toContain('.status-good');
    expect(integration).not.toContain('.status-warning');
    expect(integration).not.toContain('.status-danger');
  });

});
