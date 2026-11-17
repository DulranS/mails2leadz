// Send circuit breaker (pass 326): pauses bulk email when opt-outs and bounces pass 0.3% of recent sends. Pure rule.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { breakerState, BREAKER } from '../lib/send-breaker.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('too small a sample never pauses (no false alarm on 10 emails)', () => {
  assert.equal(breakerState({ sent: 10, stops: 10 }).state, 'ok');
});
t('under the alert level is ok', () => {
  assert.equal(breakerState({ sent: 1000, stops: 0 }).state, 'ok');
});
t('0.1% to under 0.3% alerts but keeps sending', () => {
  assert.equal(breakerState({ sent: 1000, stops: 2 }).state, 'alert');
});
t('0.3% or more pauses with a plain message', () => {
  const s = breakerState({ sent: 1000, stops: 3 });
  assert.equal(s.state, 'paused');
  assert.match(s.message, /paused/);
  assert.match(s.message, /0\.3%/);
});
t('the thresholds are the sourced ones', () => {
  assert.equal(BREAKER.pauseAt, 0.003);
  assert.equal(BREAKER.alertAt, 0.001);
  assert.equal(BREAKER.minSample, 200);
});
t('the route checks the breaker before sending and returns 423', () => {
  const src = fs.readFileSync('app/api/send-email/route.js', 'utf8');
  assert.match(src, /sendBreakerFor\(db, userId\)/);
  assert.match(src, /breaker\.state === 'paused'/);
  assert.match(src, /status: 423/);
});
console.log(`  ${n} send breaker checks passed`);
