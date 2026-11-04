#!/usr/bin/env node
/** Fail before deployment if two Nest controllers claim the same Fastify route. */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verbs = new Map([
  ['Get', ['GET']], ['Post', ['POST']], ['Put', ['PUT']],
  ['Patch', ['PATCH']], ['Delete', ['DELETE']], ['Options', ['OPTIONS']],
  ['Head', ['HEAD']], ['All', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']],
]);

function decoratorCall(decorator) {
  const expr = decorator.expression;
  if (!ts.isCallExpression(expr) || !ts.isIdentifier(expr.expression)) return null;
  return { name: expr.expression.text, args: expr.arguments };
}

function staticPath(args, sourceName, decoratorName) {
  if (args.length === 0) return '';
  const value = args[0];
  if (value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))) {
    return value.text;
  }
  // A computed path needs runtime validation, rather than a false safety claim.
  throw new Error(`${sourceName}: @${decoratorName} must use a literal path for route uniqueness validation`);
}

function normalizedPath(controller, action) {
  const path = '/' + [controller, action].filter(Boolean).map(p => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
  // Fastify treats '/:recordId' and '/:id' as the same route registration.
  return path.replace(/:[A-Za-z_][A-Za-z_0-9]*/g, ':param').replace(/\/{2,}/g, '/');
}

export function routesFromSource(source, filename = '<memory>') {
  const syntax = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (syntax.parseDiagnostics.length) {
    throw new Error(`${filename}: TypeScript source cannot be parsed`);
  }
  const routes = [];
  for (const node of syntax.statements) {
    if (!ts.isClassDeclaration(node)) continue;
    const controller = (ts.getDecorators(node) ?? []).map(decoratorCall).find(d => d?.name === 'Controller');
    if (!controller) continue;
    const prefix = staticPath(controller.args, filename, 'Controller');
    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      for (const decorator of ts.getDecorators(member) ?? []) {
        const call = decoratorCall(decorator);
        if (!call || !verbs.has(call.name)) continue;
        const url = normalizedPath(prefix, staticPath(call.args, filename, call.name));
        const handler = member.name?.getText(syntax) ?? '<unknown method>';
        const line = syntax.getLineAndCharacterOfPosition(decorator.getStart(syntax)).line + 1;
        for (const method of verbs.get(call.name)) {
          routes.push({ method, url, handler, filename, line });
        }
      }
    }
  }
  return routes;
}

export function duplicatesFromRoutes(routes) {
  const seen = new Map();
  const duplicates = [];
  for (const route of routes) {
    const key = `${route.method} ${route.url}`;
    const prior = seen.get(key);
    if (prior) duplicates.push({ key, first: prior, second: route });
    else seen.set(key, route);
  }
  return duplicates;
}

function controllerFiles(folder) {
  const found = [];
  for (const item of readdirSync(folder, { withFileTypes: true })) {
    const filename = join(folder, item.name);
    if (item.isDirectory()) found.push(...controllerFiles(filename));
    else if (item.isFile() && item.name.endsWith('.controller.ts')) found.push(filename);
  }
  return found.sort();
}

export function validateRoutes(root = backendRoot) {
  const files = controllerFiles(join(root, 'src'));
  const routes = files.flatMap(file => routesFromSource(readFileSync(file, 'utf8'), relative(root, file)));
  const duplicates = duplicatesFromRoutes(routes);
  if (duplicates.length) {
    const details = duplicates.map(d => `${d.key}\n  first: ${d.first.filename}:${d.first.line} (${d.first.handler})\n  again: ${d.second.filename}:${d.second.line} (${d.second.handler})`).join('\n');
    throw new Error(`Duplicated NestJS/Fastify routes detected before deployment:\n${details}`);
  }
  return { routes: routes.length, controllers: files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateRoutes();
    console.log(`Fastify route uniqueness passed: ${result.routes} registrations across ${result.controllers} controllers.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
