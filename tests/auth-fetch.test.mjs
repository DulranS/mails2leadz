import fs from 'node:fs'; import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('..', import.meta.url).pathname + 'app/components/AuthFetch.js', 'utf8');
const m = src.match(/const readable = async \(response\) => \{[\s\S]*?\n    \};\n/);
assert.ok(m, 'readable() not found');
const readable = new Function('Response', `${m[0]}; return readable;`)(Response);
const mk = (body, status, type) => new Response(body, { status, headers: type ? { 'content-type': type } : {} });
const out = async (r) => { const x = await readable(r); return { status: x.status, body: await x.json() }; };

const a = await out(mk('Internal Server Error', 500, 'text/plain'));
console.log('500 text  ->', a.status, a.body.error);
assert.equal(a.status, 500); assert.match(a.body.error, /server hit an error/i); assert.equal(a.body.code, 'NON_JSON_RESPONSE');
// the exact original failure now parses as JSON instead of throwing
assert.doesNotThrow(() => JSON.parse(JSON.stringify(a.body)));

const b = await out(mk('<html>Gateway Time-out</html>', 504, 'text/html'));
console.log('504 html  ->', b.status, b.body.error.slice(0, 70)); assert.match(b.body.error, /too long/i);
const c = await out(mk('Request Entity Too Large', 413, 'text/plain'));
console.log('413 text  ->', c.status, c.body.error.slice(0, 70)); assert.match(c.body.error, /too large/i);
const d = await out(mk('{"error":"x"}', 400, 'application/json'));
assert.equal(d.body.error, 'x'); console.log('JSON passes through untouched');
const e = await readable(mk(null, 204)); assert.equal(e.status, 204); console.log('204 untouched');
console.log('all ok');

// Session rule: a token error ends the session unless it is a network or rate-limit error that can clear by itself.
const pm = src.match(/const TRANSIENT_TOKEN_ERRORS = [\s\S]*?\n\}\n/);
assert.ok(pm, 'isBrokenSessionError() not found');
const isBroken = new Function(`${pm[0].replace('export function', 'function')}; return isBrokenSessionError;`)();
for (const code of ['auth/user-token-expired', 'auth/invalid-refresh-token', 'auth/internal-error', 'auth/user-not-found', 'auth/user-disabled', 'auth/invalid-user-token', 'auth/user-token-revoked'])
  assert.equal(isBroken({ code }), true, code);
for (const code of ['auth/network-request-failed', 'auth/too-many-requests']) assert.equal(isBroken({ code }), false, code);
assert.equal(isBroken(new Error('boom')), false, 'a plain error is not a session error');
assert.equal(isBroken(undefined), false);
console.log('session rule ok');
