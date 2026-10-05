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
console.log(`\n${n} passed`);
