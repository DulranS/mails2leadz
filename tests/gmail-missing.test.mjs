// The Gmail status names exactly what the server lacks (names only, never values). Extracted from the source: the module needs googleapis and Firestore.
import fs from 'node:fs'; import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('..', import.meta.url).pathname + 'lib/server/gmail-offline.js', 'utf8');
const m = src.match(/export function offlineMissing[\s\S]*?\n\}\n/);
assert.ok(m, 'offlineMissing() not found');
const run = (env, vault, db) => new Function('process', 'vaultConfigured', `${m[0].replace('export function', 'function')}; return offlineMissing;`)({ env }, () => vault)(db);
const full = { NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
assert.deepEqual(run(full, true, true), [], 'all set');
assert.deepEqual(run(full, true, false), ['FIREBASE_SERVICE_ACCOUNT_JSON']);
assert.deepEqual(run({ GOOGLE_CLIENT_SECRET: 'secret' }, true, true), ['NEXT_PUBLIC_GOOGLE_CLIENT_ID']);
assert.deepEqual(run({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'id' }, true, true), ['GOOGLE_CLIENT_SECRET']);
assert.deepEqual(run(full, false, true), ['TOKEN_ENC_KEY (64 hex characters)']);
assert.deepEqual(run({}, false, false), ['FIREBASE_SERVICE_ACCOUNT_JSON', 'NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TOKEN_ENC_KEY (64 hex characters)']);
console.log('gmail missing names ok');
