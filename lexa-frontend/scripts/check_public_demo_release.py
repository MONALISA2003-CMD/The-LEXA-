#!/usr/bin/env python3
"""Fast Vercel-root preflight. Fail if public marketing or demo assets disappear.
No source rewriting and no network access; safe for every frontend build.
"""
from pathlib import Path
from html.parser import HTMLParser
import json
import re

ROOT = Path(__file__).resolve().parents[1]
class PublicHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.images = []
        self.css = []
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == 'a': self.links.append(d.get('href', ''))
        if tag == 'img': self.images.append(d.get('src', ''))
        if tag == 'link' and d.get('rel') == 'stylesheet': self.css.append(d.get('href', ''))

def expect(condition, message):
    if not condition: raise SystemExit('LEXA public/demo release check: ' + message)

main = ROOT/'public/lexa.html'
site = main.read_text()
parser = PublicHTML();parser.feed(site)
expect('Know what sold.' in site and 'Business areas' in site, 'public hero or area showcase is missing')
expect('https://lexaaamaal.com/' in site, 'missing canonical marketing hostname')
expect(len(re.findall('href="https://lexaaamaal.com/demo/"', site)) >= 4, 'demo CTAs must point to the same-origin /demo/ bundle')
expect('demo.lexaaamaal.com' not in site, 'a public CTA still leads to the unconfigured demo subdomain')
expect(len(re.findall(r'<section\b', site)) >= 10, 'visual marketing sections have disappeared')
expect('class="skip"' in site and 'class="lm-mobile-menu"' in site, 'accessible public navigation is missing')
for path in parser.css+parser.images:
    if not path.startswith('/'): continue
    expect((ROOT/'public'/path.lstrip('/')).is_file(), 'missing public asset ' + path)

for folder in ('public','marketing'):
    root=ROOT/folder
    expect((root/'landing-design.css').exists(), folder + ' is missing the public design system')
    page=root/('lexa.html' if folder == 'public' else 'index.html')
    expect('landing-design.css' in page.read_text(), folder + ' is not using the new design')
    for file in root.glob('*.html'):
        h=PublicHTML();h.feed(file.read_text())
        for src in h.css + h.images:
            if src.startswith('/'):
                expect((root/src.lstrip('/')).exists(), f'{file}: missing asset {src}')

vercel=json.loads((ROOT/'vercel.json').read_text())
rewrite={r['source']:r['destination'] for r in vercel['rewrites']}
expect(rewrite.get('/') == '/lexa.html', 'the public root is not configured for the website')
expect(rewrite.get('/demo/') == '/demo/index.html', 'the demo URL is not routed to the isolated bundle')
expect(rewrite.get('/(.*)') == '/app.html', 'customer application fallback was changed')
script=(ROOT/'scripts/build-browser-demo.mjs').read_text()
for fragment in ('VITE_LEXA_BROWSER_DEMO', "'dist'", "'app.html'", "'demo', 'index.html'", 'copyFileSync(website, appShell)'):
    expect(fragment in script, f'missing demo build isolation step: {fragment}')

runtime=(ROOT/'src/data/remote/runtimeConfig.ts').read_text()
expect("import.meta.env.VITE_LEXA_BROWSER_DEMO === 'true'" in runtime and "import.meta.env.BASE_URL.startsWith('/demo/')" in runtime,
       'browser demo mode lacks the compile-time /demo/ guard')
expect('if (isBrowserDemoBuild) throw new ApiConfigurationError' in (ROOT/'src/data/remote/apiClient.ts').read_text(),
       'browser-only demo no longer blocks production API requests')
expect("'lexa-browser-demo-v1'" in (ROOT/'src/data/local/database.ts').read_text(), 'browser demo storage is not separate')
seed=(ROOT/'src/modules/demo/browserDemoSeed.ts').read_text()
for source in ("'opening'", "type:'sale'", "kind:'receipt'", 'localModuleRecordService.replace', 'BROWSER_DEMO_READY_KEY'):
    expect(source in seed, 'missing linked sample data or transaction-safety safeguard: ' + source)
expect('ModuleManager' in (ROOT/'src/modules/demo/BrowserDemoAreaPage.tsx').read_text(),
       'browser demo is not using the actual LEXA register controls')
print('LEXA public/demo release preflight passed: visual sections, working same-origin links, isolated demo build, data guards and asset paths.')
