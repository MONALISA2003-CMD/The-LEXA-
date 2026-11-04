import { spawn } from 'node:child_process';
import { join } from 'node:path';

/** Python calculates from authorised, aggregate-only records. No access to ERP writes. */
export async function quickOperationalAnswer(input: { question: string; scope: string; facts: Record<string, unknown>; currency: string }): Promise<string | null> {
  const q = input.question.toLowerCase().trim();
  const eligible = /\b(how many|how much|stock level|reorder level|outstanding balance|sales total|sales count|current stock)\b/.test(q);
  if (!eligible || !['inventory', 'sales', 'finance'].includes(input.scope)) return null;
  if (!input.facts || typeof input.facts !== 'object') return null;
  return new Promise((resolve) => {
    let settled = false;
    const python = spawn('python3', [join(process.cwd(), 'analytics', 'operations_intelligence.py')], {
      stdio: ['pipe','pipe','pipe'], shell: false,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' },
    });
    let output = '';
    const finish = (answer: string | null) => { if (settled) return; settled = true; clearTimeout(timer); resolve(answer); };
    const timer = setTimeout(() => { python.kill('SIGKILL'); finish(null); }, 1500);
    python.on('error', () => finish(null));
    python.stdin.on('error', () => finish(null));
    python.stderr.resume();
    python.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); if (output.length > 8192) { python.kill(); finish(null); } });
    python.on('close', (code) => { if (code !== 0) { finish(null); return; } try { const parsed = JSON.parse(output); finish(typeof parsed.answer === 'string' ? parsed.answer : null); } catch { finish(null); } });
    python.stdin.end(JSON.stringify({ version:1, scope:input.scope, facts:input.facts, currency:input.currency }));
  });
}
