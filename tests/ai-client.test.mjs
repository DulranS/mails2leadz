import assert from 'node:assert/strict';
import { parseJsonLoose, aiConfig, AiError, callAI } from '../lib/ai-client.js';
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };

await t('parses clean and fenced JSON, rejects garbage', () => {
  assert.deepEqual(parseJsonLoose('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonLoose('Sure!\n```json\n{"a":{"b":2}}\n```'), { a: { b: 2 } });
  assert.equal(parseJsonLoose('no json here'), null);
  assert.equal(parseJsonLoose(''), null);
});
await t('defaults to cheap models and conservative caps', () => {
  delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.CLAUDE_API_KEY;
  process.env.OPENAI_API_KEY = 'x';
  const c = aiConfig();
  assert.equal(c.models.fast, 'gpt-4o-mini');
  assert.equal(c.dailyCallLimit, 60);
  assert.equal(c.monthlyBudgetUsd, 5);
  delete process.env.OPENAI_API_KEY; process.env.CLAUDE_API_KEY = 'y';
  assert.equal(aiConfig().provider, 'anthropic');
  assert.match(aiConfig().models.fast, /haiku/);
});
await t('no key -> clear 503, not a crash', async () => {
  delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.CLAUDE_API_KEY;
  await assert.rejects(callAI({ uid: 'u', feature: 'x', system: 's', prompt: 'p' }), (e) => e instanceof AiError && e.code === 'AI_NOT_CONFIGURED' && e.status === 503);
});
await t('daily cap blocks BEFORE spending money; identical request is served from cache', async () => {
  process.env.OPENAI_API_KEY = 'k'; process.env.AI_DAILY_CALL_LIMIT = '2';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }) }; };
  const a = await callAI({ uid: 'cap', feature: 'f', system: 's', prompt: 'one' });
  assert.equal(a.data.ok, true); assert.equal(a.cached, false);
  assert.ok(a.costUsd > 0 && a.costUsd < 0.001);          // 100 in + 50 out on gpt-4o-mini
  const again = await callAI({ uid: 'cap', feature: 'f', system: 's', prompt: 'one' });
  assert.equal(again.cached, true); assert.equal(calls, 1); // cache hit costs nothing
  await callAI({ uid: 'cap', feature: 'f', system: 's', prompt: 'two' });
  await assert.rejects(callAI({ uid: 'cap', feature: 'f', system: 's', prompt: 'three' }), (e) => e.code === 'AI_DAILY_LIMIT' && e.status === 429);
  assert.equal(calls, 2);                                   // third never reached the provider
});

await t('DeepSeek is the default provider when its key is set; others become backups; AI_PROVIDER can override', () => {
  for (const k of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'AI_PROVIDER']) delete process.env[k];
  process.env.DEEPSEEK_API_KEY = 'd'; process.env.OPENAI_API_KEY = 'o';
  let c = aiConfig();
  assert.equal(c.provider, 'deepseek');
  assert.equal(c.models.fast, 'deepseek-flash');
  assert.deepEqual(c.providers.map((p) => p.name), ['deepseek', 'openai']);
  process.env.AI_PROVIDER = 'openai';
  assert.equal(aiConfig().provider, 'openai');
  delete process.env.AI_PROVIDER; delete process.env.OPENAI_API_KEY;
});
await t('DeepSeek call: thinking off, JSON mode on, cached input billed at the cache price', async () => {
  for (const k of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'AI_PROVIDER']) delete process.env[k];
  process.env.DEEPSEEK_API_KEY = 'd'; process.env.AI_DAILY_CALL_LIMIT = '50';
  let sent;
  globalThis.fetch = async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":1}' } }], usage: { prompt_tokens: 1000, prompt_cache_hit_tokens: 800, completion_tokens: 100 } }) }; };
  const r = await callAI({ uid: 'ds', feature: 'f', system: 's', prompt: 'p-ds' });
  assert.equal(sent.url, 'https://api.deepseek.com/chat/completions');
  assert.deepEqual(sent.body.thinking, { type: 'disabled' });
  assert.deepEqual(sent.body.response_format, { type: 'json_object' });
  assert.equal(r.model, 'deepseek-flash');
  // 200 miss * 0.3 + 800 hit * 0.006 + 100 out * 1.2 = 60 + 4.8 + 120 = 184.8 per 1M
  assert.ok(Math.abs(r.costUsd - 184.8 / 1e6) < 1e-9, String(r.costUsd));
});
await t('falls back to the next provider when the first one is down', async () => {
  for (const k of ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'AI_PROVIDER']) delete process.env[k];
  process.env.DEEPSEEK_API_KEY = 'd'; process.env.OPENAI_API_KEY = 'o';
  const hosts = [];
  globalThis.fetch = async (url) => {
    hosts.push(new URL(url).host);
    if (url.includes('deepseek')) return { ok: false, status: 503, json: async () => ({ error: { message: 'busy' } }) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":2}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
  };
  const r = await callAI({ uid: 'fb', feature: 'f', system: 's', prompt: 'p-fb' });
  assert.deepEqual(hosts, ['api.deepseek.com', 'api.openai.com']);
  assert.equal(r.model, 'gpt-4o-mini');
  assert.equal(r.data.ok, 2);
});
await t('retries once without "thinking" if the model rejects the field', async () => {
  for (const k of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'AI_PROVIDER']) delete process.env[k];
  process.env.DEEPSEEK_API_KEY = 'd';
  const bodies = [];
  globalThis.fetch = async (_u, init) => {
    const b = JSON.parse(init.body); bodies.push(b);
    if (b.thinking) return { ok: false, status: 400, json: async () => ({ error: { message: 'Unknown parameter: thinking' } }) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":3}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
  };
  const r = await callAI({ uid: 'th', feature: 'f', system: 's', prompt: 'p-th' });
  assert.equal(bodies.length, 2); assert.equal('thinking' in bodies[1], false);
  assert.equal(r.data.ok, 3);
});
await t('DeepSeek: an unknown model name falls back to another current name, remembers it, and bills at the Flash rate', async () => {
  process.env.DEEPSEEK_API_KEY = 'dk'; delete process.env.AI_PROVIDER; delete process.env.AI_MODEL_FAST_DEEPSEEK; process.env.AI_DAILY_CALL_LIMIT = '50';
  const seen = [];
  globalThis.fetch = async (_u, init) => {
    const m = JSON.parse(init.body).model; seen.push(m);
    if (m === 'deepseek-flash') return { ok: false, status: 400, json: async () => ({ error: { message: 'Model Not Exist' } }) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }) };
  };
  const r = await callAI({ uid: 'fb', feature: 'f', system: 's', prompt: 'x1' });
  assert.equal(r.data.ok, true); assert.equal(r.model, 'deepseek-v4-flash');
  assert.deepEqual(seen, ['deepseek-flash', 'deepseek-v4-flash']);
  assert.ok(r.costUsd < 0.001);                         // known price, not the conservative unknown-model default
  seen.length = 0;
  await callAI({ uid: 'fb', feature: 'f', system: 's', prompt: 'x2' });
  assert.deepEqual(seen, ['deepseek-v4-flash']);        // remembered: no wasted failed call
});
await t('DeepSeek: other errors (bad key, outage) are not retried with other model names', async () => {
  const seen = [];
  globalThis.fetch = async (_u, init) => { seen.push(JSON.parse(init.body).model); return { ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }) }; };
  await assert.rejects(callAI({ uid: 'fb2', feature: 'f', system: 's', prompt: 'y' }), (e) => e.code === 'AI_AUTH');
  assert.equal(seen.length, 1);
});
console.log(`\n${n} passed`);
