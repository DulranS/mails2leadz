import assert from 'node:assert/strict';
import { parseServiceAccount, normalizeServiceAccount, serviceAccountProblem, projectMismatch } from '../lib/service-account.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n';
const account = { type: 'service_account', project_id: 'my-proj', client_email: 'svc@my-proj.iam.gserviceaccount.com', private_key: KEY };
const json = JSON.stringify(account);

t('plain JSON, pretty-printed JSON and one-line JSON are read', () => {
  assert.equal(parseServiceAccount(json).project_id, 'my-proj');
  assert.equal(parseServiceAccount(JSON.stringify(account, null, 2)).client_email, account.client_email);
  assert.equal(parseServiceAccount(`  ${json}\n`).project_id, 'my-proj');
});
t('base64 (even wrapped over several lines) is read', () => {
  const b64 = Buffer.from(json).toString('base64');
  assert.equal(parseServiceAccount(b64).project_id, 'my-proj');
  assert.equal(parseServiceAccount(b64.replace(/(.{40})/g, '$1\n')).project_id, 'my-proj');
});
t('JSON wrapped in quotes by the host is read (plain quotes and escaped-JSON-string form)', () => {
  assert.equal(parseServiceAccount(`'${json}'`).project_id, 'my-proj');
  assert.equal(parseServiceAccount(`"${json}"`).project_id, 'my-proj');
  assert.equal(parseServiceAccount(JSON.stringify(json)).project_id, 'my-proj');
});
t('nonsense is not read (null, never a throw)', () => {
  for (const bad of ['', '   ', undefined, null, 'hello', '{not json', 'AAAA', '[]']) assert.equal(parseServiceAccount(bad), null);
});
t('a private key with literal \\n is repaired', () => {
  const flat = JSON.parse(JSON.stringify({ ...account, private_key: KEY.replace(/\n/g, '\\n') }));
  assert.equal(normalizeServiceAccount(flat).private_key, KEY.trim());
  assert.equal(serviceAccountProblem(normalizeServiceAccount(flat)), '');
});
t('a good key has no problem; damaged or incomplete keys say why', () => {
  assert.equal(serviceAccountProblem(normalizeServiceAccount(account)), '');
  assert.match(serviceAccountProblem({ ...account, private_key: 'abc' }), /damaged/);
  assert.match(serviceAccountProblem({ ...account, client_email: '' }), /missing client_email/);
  assert.match(serviceAccountProblem({ ...account, type: 'authorized_user' }), /not a service-account key/);
  assert.match(serviceAccountProblem(null), /not a JSON object/);
});
t('a key from another Firebase project is flagged', () => {
  assert.deepEqual(projectMismatch(account, 'other-proj'), { key: 'my-proj', app: 'other-proj' });
  assert.equal(projectMismatch(account, 'my-proj'), null);
  assert.equal(projectMismatch(account, ''), null);
});
console.log(`service-account: ${n} passed`);
