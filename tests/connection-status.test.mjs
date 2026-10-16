import assert from 'node:assert/strict';
import { storageProblem } from '../lib/connection-status.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('all good, or unrelated checks failing: no banner', () => {
  assert.equal(storageProblem({ checks: [{ id: 'database', ok: true }, { id: 'admin', ok: true }] }), null);
  assert.equal(storageProblem({ checks: [{ id: 'ai', ok: false, detail: 'No AI key' }, { id: 'database', ok: true }] }), null);
});
t('server not allowed to write: banner with the cause and the fix', () => {
  const p = storageProblem({ checks: [{ id: 'database', ok: false, detail: 'The server is not allowed to write.', fix: 'Set FIREBASE_SERVICE_ACCOUNT_JSON.' }, { id: 'gmail', ok: true }] });
  assert.deepEqual(p, { detail: 'The server is not allowed to write.', fix: 'Set FIREBASE_SERVICE_ACCOUNT_JSON.' });
});
t('running without server credentials is a problem too', () => {
  assert.ok(storageProblem({ checks: [{ id: 'database', ok: true }, { id: 'admin', ok: false, detail: 'Running without server credentials.', fix: 'Add the key.' }] }));
});
t('an unusable answer never raises a false alarm', () => {
  for (const bad of [null, undefined, {}, { checks: 'x' }, { error: 'Please sign in again.' }, { checks: [null] }]) assert.equal(storageProblem(bad), null);
});
console.log(`connection-status: ${n} passed`);
