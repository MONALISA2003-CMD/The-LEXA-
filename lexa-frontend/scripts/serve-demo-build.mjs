/**
 * Test-only static server for the compiled Vercel demo entrypoint.
 * Mirrors the published /demo/:path* rewrite so direct-link reloads can be
 * validated locally. It has no API proxy, cookies or production credentials.
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, join, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const port = 4174;
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json'],
  ['.png', 'image/png'], ['.webp', 'image/webp'], ['.ico', 'image/x-icon'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
]);

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/demo/demo') {
    res.writeHead(308, { Location: '/demo/', 'Cache-Control': 'no-store' }).end();
    return;
  }

  let relative = pathname.replace(/^\/+/, '');
  if (pathname === '/demo' || pathname === '/demo/' || pathname.startsWith('/demo/')) {
    if (!extname(pathname) || pathname === '/demo/index.html') relative = 'demo/index.html';
  } else if (pathname === '/') relative = 'lexa.html';
  const target = resolve(dist, relative);
  if (!target.startsWith(dist + sep)) { res.writeHead(403).end(); return; }

  try {
    if (!statSync(target).isFile()) throw new Error('Not a file');
    res.writeHead(200, {
      'Content-Type': mime.get(extname(target)) ?? 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log('LEXA compiled /demo/ test server listening on 127.0.0.1:' + port);
});
