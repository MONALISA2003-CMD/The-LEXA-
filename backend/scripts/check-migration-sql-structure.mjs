#!/usr/bin/env node
/**
 * Basic PostgreSQL SQL structural guard for immutable migration scripts.
 * This is not a substitute for applying migrations to a throwaway PostgreSQL
 * database, but it catches the unmatched ')' that caused Render P3009 on 7 Nov.
 * Ignores SQL/PLpgSQL content inside string literals, dollar-quoted blocks and
 * nested comments so that policy expressions are checked accurately.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function checkSqlStructure(source, name = 'migration.sql') {
  const stack = [];
  let line = 1;
  let blockDepth = 0;
  let state = 'code';
  let tag = '';
  let startLine = 1;
  for (let i = 0; i < source.length;) {
    const ch = source[i], next = source[i + 1];
    if (ch === '\n') line++;
    if (state === 'line') { if (ch === '\n') state = 'code'; i++; continue; }
    if (state === 'block') {
      if (ch === '/' && next === '*') { blockDepth++; i += 2; continue; }
      if (ch === '*' && next === '/') { blockDepth--; i += 2; if (!blockDepth) state = 'code'; continue; }
      i++; continue;
    }
    if (state === 'single') {
      if (ch === "'" && next === "'") { i += 2; continue; }
      if (ch === '\\' && next === "'") { i += 2; continue; }
      if (ch === "'") state = 'code';
      i++; continue;
    }
    if (state === 'double') {
      if (ch === '"' && next === '"') { i += 2; continue; }
      if (ch === '"') state = 'code';
      i++; continue;
    }
    if (state === 'dollar') {
      if (source.startsWith(tag, i)) { i += tag.length; state = 'code'; continue; }
      i++; continue;
    }
    if (ch === '-' && next === '-') { state = 'line'; i += 2; continue; }
    if (ch === '/' && next === '*') { state = 'block'; blockDepth = 1; startLine = line; i += 2; continue; }
    if (ch === "'") { state = 'single'; startLine = line; i++; continue; }
    if (ch === '"') { state = 'double'; startLine = line; i++; continue; }
    if (ch === '$') {
      const matched = source.slice(i).match(/^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/);
      if (matched) { tag = matched[0]; state = 'dollar'; startLine = line; i += tag.length; continue; }
    }
    if (ch === '(') stack.push(line);
    if (ch === ')') {
      if (!stack.length) throw new Error(`${name}:${line}: unexpected ')' (SQL parentheses are unbalanced)`);
      stack.pop();
    }
    i++;
  }
  if (state !== 'code' && state !== 'line') throw new Error(`${name}:${startLine}: unfinished ${state} literal/comment`);
  if (stack.length) throw new Error(`${name}:${stack.at(-1)}: unterminated '(' (SQL parentheses are unbalanced)`);
}

if (process.argv[1]?.endsWith('check-migration-sql-structure.mjs')) {
  const root = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
  const folders = readdirSync(root, { withFileTypes: true }).filter(x => x.isDirectory());
  let count = 0;
  for (const folder of folders) {
    const file = join(root, folder.name, 'migration.sql');
    checkSqlStructure(readFileSync(file, 'utf8'), file);
    count++;
  }
  console.log(`Migration SQL structural check passed: ${count} migrations.`);
}
