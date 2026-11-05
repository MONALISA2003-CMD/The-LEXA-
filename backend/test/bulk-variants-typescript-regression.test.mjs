import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const controller = readFileSync(new URL('../src/commerce/catalog-inventory.controller.ts', import.meta.url), 'utf8');

function typeErrors(contents) {
  const virtualPath = '/virtual/lexa-variant-typecheck.ts';
  const options = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => path === virtualPath
    ? ts.createSourceFile(path, contents, languageVersion, true)
    : originalGetSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([virtualPath], options, host);
  return ts.getPreEmitDiagnostics(program)
    .filter(d => d.category === ts.DiagnosticCategory.Error)
    .map(d => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
}

test('bulk-variant input is narrowed once before the async transaction and mapped with inferred SKU types', () => {
  const method = controller.split("@Post('products/:productId/variants/bulk')")[1]?.split("@Get('products/:productId/variants')")[0];
  assert.ok(method, 'Cannot find the bulk variant controller method.');
  assert.match(method, /const variantEntries:\s*unknown\s*=\s*body\.variants\s*;/);
  assert.match(method, /if\s*\(!Array\.isArray\(variantEntries\)/);
  assert.match(method, /const prepared\s*=\s*variantEntries\.map\(\(entry:\s*unknown\)\s*=>/);
  assert.match(method, /prepared\.map\(p\s*=>\s*p\.sku\)/);
  assert.doesNotMatch(method, /body\.variants\.map\(/, 'Using an object property inside the transaction loses type narrowing.');

  // Compile the actual validation/narrowing expression with strict TypeScript.
  // This catches the original TS18046 and the downstream implicit-any TS7006
  // while keeping the test independent of NestJS and database adapters.
  const guard = method.match(/const variantEntries:\s*unknown\s*=\s*body\.variants\s*;[\s\S]*?throw new BadRequestException\('[^']+'\);/);
  assert.ok(guard, 'Cannot find the validated, locally narrowed variants array.');
  const fixture = `
    function parse(body: Record<string, unknown>) {
      ${guard[0].replace('new BadRequestException(', 'new Error(')}
      return Promise.resolve().then(async () => {
        const prepared = variantEntries.map((entry: unknown) => ({sku: String((entry as {sku: string}).sku)}));
        return prepared.map(p => p.sku);
      });
    }
    void parse;
  `;
  assert.deepEqual(typeErrors(fixture), [], 'The validated array must compile under strict TypeScript with no implicit any.');
});
