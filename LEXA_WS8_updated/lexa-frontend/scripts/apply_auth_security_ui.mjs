import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function patch(file, anchor, replacement, label, marker) {
  const full = path.join(root, file);
  const source = fs.readFileSync(full, 'utf8');
  if (source.includes(marker)) return;
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`LEXA security UI patch stopped at ${label}: expected one anchor, found ${count}.`);
  fs.writeFileSync(full, source.replace(anchor, replacement));
}

patch(
  'src/modules/settings/SettingsPage.tsx',
  "import { apiAuth } from '../../data/remote/apiAuth';",
  "import { apiAuth } from '../../data/remote/apiAuth';\nimport SecurityPanel from '../security/SecurityPanel'; // LEXA_AUTH_SECURITY_UI_PATCH:settings-import-v1",
  'SettingsPage import',
  'LEXA_AUTH_SECURITY_UI_PATCH:settings-import-v1',
);
patch(
  'src/modules/settings/SettingsPage.tsx',
  '      <section className="section-card integration-card">',
  '      {/* LEXA_AUTH_SECURITY_UI_PATCH:security-panel-v1 */}\n      <SecurityPanel />\n\n      <section className="section-card integration-card">',
  'SettingsPage security section',
  'LEXA_AUTH_SECURITY_UI_PATCH:security-panel-v1',
);
patch(
  'src/data/remote/apiClient.ts',
  "if (unsafe && (path.endsWith('/auth/login') || path.endsWith('/auth/logout') || path.endsWith('/auth/password/reset'))) cachedCsrfToken = null;",
  "if (unsafe && (path.endsWith('/auth/login') || path.endsWith('/auth/logout') || path.endsWith('/auth/password/reset') || path.endsWith('/auth/password/change'))) cachedCsrfToken = null; // LEXA_AUTH_SECURITY_UI_PATCH:csrf-refresh-v1",
  'password-change CSRF refresh',
  'LEXA_AUTH_SECURITY_UI_PATCH:csrf-refresh-v1',
);
patch(
  'src/main.tsx',
  "import './styles/backend-status.css';",
  "import './styles/backend-status.css';\nimport './styles/auth.css'; // LEXA_AUTH_SECURITY_UI_PATCH:auth-css-v1",
  'global auth stylesheet',
  'LEXA_AUTH_SECURITY_UI_PATCH:auth-css-v1',
);
patch(
  'index.html',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <meta name="referrer" content="no-referrer" /> <!-- LEXA_AUTH_SECURITY_UI_PATCH:referrer-v1 -->',
  'password reset referrer policy',
  'LEXA_AUTH_SECURITY_UI_PATCH:referrer-v1',
);

console.log('LEXA modern authentication and security UI applied.');
