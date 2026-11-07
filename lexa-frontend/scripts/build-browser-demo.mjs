/**
 * Build three separate entrypoints for the one verified Vercel project:
 *  /index.html        → marketing on lexaaamaal.com
 *  /app.html          → authenticated customer application
 *  /demo/index.html   → browser-only LEXA sample, no backend credentials
 *
 * The second Vite compilation is deliberately opt-in; it cannot enable local
 * persistence in the production customer bundle by toggling a URL or cookie.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (!existsSync(vite)) throw new Error('Vite must be installed before building the browser demonstration.');

const result = spawnSync(process.execPath, [vite, 'build', '--base', '/demo/', '--outDir', 'dist/demo', '--emptyOutDir', 'false'], {
  cwd: root,
  env: { ...process.env, VITE_LEXA_BROWSER_DEMO: 'true', VITE_LEXA_DEMO: 'false', VITE_DATA_PROVIDER: 'local', VITE_API_BASE_URL: '' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

const output = join(root, 'dist');
const appShell = join(output, 'index.html');
const website = join(output, 'lexa.html');
const browserDemo = join(output, 'demo', 'index.html');
if (!existsSync(appShell) || !existsSync(website) || !existsSync(browserDemo)) {
  throw new Error('Missing one of the three production entrypoints: private app, public website or isolated demo.');
}
const demoHTML = readFileSync(browserDemo, 'utf8');
if (!demoHTML.includes('/demo/assets/') || !demoHTML.includes('noindex')) {
  throw new Error('Browser demo was not built with isolated /demo/ assets and private metadata.');
}
if (!readFileSync(appShell, 'utf8').includes('id="root"')) {
  throw new Error('Vite customer application HTML has no React root.');
}
if (!readFileSync(website, 'utf8').includes('Business areas')) {
  throw new Error('The marketing HTML is missing the current business-area landing page.');
}
// Vercel serves an existing /index.html before some rewrites. We therefore
// put the marketing page there physically, not only behind a rewrite rule.
copyFileSync(appShell, join(output, 'app.html'));
copyFileSync(website, appShell);
if (!readFileSync(appShell, 'utf8').includes('Business areas') ||
    !readFileSync(join(output, 'app.html'), 'utf8').includes('id="root"')) {
  throw new Error('The marketing page and private app build outputs were not separated.');
}
console.log('LEXA release: /index.html public website, /app.html customer app, /demo/index.html isolated browser demo.');
