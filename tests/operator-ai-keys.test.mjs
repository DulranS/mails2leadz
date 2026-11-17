// Operator AI keys (pass 325): only the operator's own accounts may use the server's DeepSeek / OpenAI / Anthropic keys in SaaS mode.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { operatorKeysAllowed, operatorUids } from '../lib/server/ai-operator-keys.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const saas = { SAAS_MODE: 'on' };

t('the parser trims ids and drops blanks', () => {
  assert.deepEqual([...operatorUids({ AI_OPERATOR_UIDS: ' a , ,b ' })].sort(), ['a', 'b']);
  assert.equal(operatorUids({}).size, 0);
});

t('in SaaS mode only the listed operator accounts may use the operator keys', () => {
  const env = { ...saas, AI_OPERATOR_UIDS: 'owner1, owner2' };
  assert.equal(operatorKeysAllowed('owner1', env), true);
  assert.equal(operatorKeysAllowed('owner2', env), true);
  assert.equal(operatorKeysAllowed('stranger', env), false);
  assert.equal(operatorKeysAllowed('', env), false);
  assert.equal(operatorKeysAllowed(undefined, env), false);
});

t('with no operator ids set, SaaS mode gives nobody the operator keys', () => {
  assert.equal(operatorKeysAllowed('owner1', saas), false);
});

t('self-hosted (SAAS_MODE off) keeps the install\'s own keys for its owner', () => {
  assert.equal(operatorKeysAllowed('anyone', {}), true);
});

t('the old SAAS_OPERATOR_AI switch is gone from the key lookup', () => {
  const src = fs.readFileSync('lib/server/integration-secrets.js', 'utf8');
  assert.doesNotMatch(src, /SAAS_OPERATOR_AI/);
  assert.match(src, /operatorKeysAllowed\(uid, env, saas\)/);
});

t('callAI never falls back to server keys when there is no database', () => {
  const src = fs.readFileSync('lib/ai-client.js', 'utf8');
  assert.match(src, /aiConfig\(\{ keys: db \? await aiKeysFor\(db, uid\) : \{\} \}\)/);
});

console.log(`  ${n} operator AI key checks passed`);
