import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const css = readFileSync(resolvePath(process.cwd(), 'src/styles/lexa-executive-premium.css'), 'utf8');

describe('Bright Executive Blue design', () => {
  it('keeps the approved accessible base palette', () => {
    expect(css).toContain('#f6f9ff');
    expect(css).toContain('#075cf5');
    expect(css).toContain('#17243b');
    expect(css).toContain('#087953');
  });

  it('styles overview, business and owner-access surfaces with responsive fallbacks', () => {
    expect(css).toContain('.modern-overview .overview-kpi-grid');
    expect(css).toContain('.my-business-page .my-business-hero');
    expect(css).toContain('.team-access-workspace');
    expect(css).toContain('@media (max-width: 520px)');
    expect(css).toContain('prefers-reduced-motion');
  });
});
