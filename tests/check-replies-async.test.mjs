// Pass 366: the reply-check cron answers at once and runs the check after the response. Checked against the source, the way the other cron tests are.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../app/api/cron/check-replies/route.js', import.meta.url), 'utf8');
const get = src.slice(src.indexOf('export async function GET'));
assert.ok(/import \{[^}]*\bafter\b[^}]*\} from 'next\/server'/.test(src), 'after() is imported from next/server');
assert.ok(get.indexOf('CRON_SECRET') < get.indexOf('after(('), 'the secret is checked before any work is scheduled');
assert.ok(get.indexOf('Not allowed.') < get.indexOf('after(('), 'a wrong secret is refused before the check is scheduled');
assert.ok(/status: 202/.test(get), 'the response is 202 (accepted)');
assert.ok(/after\(\(\) => runReplyCheck\(/.test(get), 'the check itself runs inside after()');
assert.ok(/async function runReplyCheck\(db, secret\)/.test(src), 'the whole check lives in runReplyCheck');
assert.ok(/console\.log\('\[cron check-replies\] done'/.test(src), 'the result is logged, since the caller no longer receives it');
console.log('check-replies answers at once and runs in after(): all checks pass');
