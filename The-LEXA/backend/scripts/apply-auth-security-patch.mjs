import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const patchDir = path.join(root, 'scripts/auth-patch');
const controllerPath = path.join(root, 'src/core/core.controller.ts');
const schemaPath = path.join(root, 'prisma/schema.prisma');
const mainPath = path.join(root, 'src/main.ts');

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`LEXA auth patch: required file missing: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

function patchText(source, name) {
  const before = read(path.join(patchDir, `${name}.before`));
  const after = read(path.join(patchDir, `${name}.after`));
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`LEXA auth patch stopped: ${name} expected one matching anchor; found ${count}.`);
  return source.replace(before, after);
}

let controller = read(controllerPath);
let schema = read(schemaPath);

if (!controller.includes('LEXA_AUTH_SECURITY_PATCH:core-v1')) {
  for (const name of [
    '01-imports', '02-constants', '03-password-helpers', '04-csrf-cookie',
    '05-session-cookie', '06-password-core', '07-admin-password', '08-login',
    '09-forgot', '10-reset', '11-marker',
  ]) controller = patchText(controller, name);
  controller = controller.replaceAll('SameSite=None; Max-Age=0', 'SameSite=Lax; Max-Age=0');
  fs.writeFileSync(controllerPath, controller);
}

let main = read(mainPath);
if (!main.includes('trustProxy: true')) {
  main = patchText(main, '13-fastify-trust-proxy');
  fs.writeFileSync(mainPath, main);
}

if (!schema.includes('model AuthRateLimit {')) {
  schema = patchText(schema, '12-schema');
  fs.writeFileSync(schemaPath, schema);
}

console.log('LEXA authentication and account-security patch applied.');
