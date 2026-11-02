import test from 'node:test';
import assert from 'node:assert/strict';
import { AiRouterService } from '../src/ai/ai-router.service.ts';

const keys = [
  'LEXA_AI_ENABLED', 'LEXA_AI_PAID_TIER_ENABLED', 'GEMINI_FREE_API_KEY', 'GEMINI_API_KEY',
  'OPENROUTER_API_KEY', 'GROQ_API_KEY', 'GROQ_FREE_MODEL', 'NVIDIA_NIM_API_KEY', 'OPENAI_API_KEY', 'GEMINI_FREE_MODEL', 'NVIDIA_NIM_MODEL',
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
function clear() { for (const key of keys) delete process.env[key]; }
test.afterEach(() => {
  clear();
  for (const [key, value] of Object.entries(original)) if (value !== undefined) process.env[key] = value;
  globalThis.fetch = originalFetch;
});
const originalFetch = globalThis.fetch;

test('does not enable the router without eligible provider credentials', () => {
  clear();
  process.env.LEXA_AI_ENABLED = 'true';
  process.env.LEXA_AI_PAID_TIER_ENABLED = 'false';
  process.env.OPENAI_API_KEY = 'paid-only-key';
  process.env.GEMINI_API_KEY = 'paid-gemini-key';
  const router = new AiRouterService();
  assert.equal(router.status().configured, false);
  assert.deepEqual(router.status().providers, []);
});

test('routes across configured free providers and falls back on a rate limit', async () => {
  clear();
  process.env.LEXA_AI_ENABLED = 'true';
  process.env.LEXA_AI_PAID_TIER_ENABLED = 'false';
  process.env.GEMINI_FREE_API_KEY = 'gemini-free-test-key';
  process.env.GROQ_API_KEY = 'groq-test-key';
  process.env.OPENROUTER_API_KEY = 'openrouter-test-key';
  process.env.NVIDIA_NIM_API_KEY = 'nvidia-test-key';
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('generativelanguage.googleapis.com') || String(url).includes('api.groq.com')) return new Response('{}', { status: 429 });
    return new Response(JSON.stringify({
      model: 'free-test-model',
      choices: [{ message: { content: 'Review sales, stock cover, and overdue receivables.' } }],
      usage: { prompt_tokens: 21, completion_tokens: 13 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const router = new AiRouterService();
  const result = await router.complete({
    requestId: 'b', question: 'What should I review?', scope: 'overview', currency: 'UGX',
    facts: { sales: { count: 4 } },
  });
  assert.equal(result.provider, 'OpenRouter');
  assert.match(calls[0], /generativelanguage\.googleapis\.com/);
  assert.match(calls[1], /api\.groq\.com/);
  assert.match(calls[2], /openrouter\.ai/);
  assert.equal(result.model, 'free-test-model');
  assert.equal(result.inputTokens, 21);
  assert.equal(result.outputTokens, 13);
  assert.equal(result.costMicros, 0);
  assert.equal(calls.length, 3);
});

test('paid provider keys remain excluded from the development router', () => {
  clear();
  process.env.LEXA_AI_ENABLED = 'true';
  process.env.LEXA_AI_PAID_TIER_ENABLED = 'true';
  process.env.GEMINI_FREE_API_KEY = 'free-google-key';
  process.env.GEMINI_API_KEY = 'paid-google-key';
  process.env.OPENAI_API_KEY = 'paid-openai-key';
  const router = new AiRouterService();
  assert.deepEqual(router.status().providers, ['Google Gemini']);
  assert.equal(router.status().paidTierEnabled, false);
});
