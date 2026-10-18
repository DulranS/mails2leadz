import assert from 'node:assert/strict';
import {
  AUTOSEND_DEFAULTS, AUTOSEND_PER_DAY_MAX, sanitizeAutoSend, inSendWindow, sendRoom, planAutosend, shouldPause, classifyGmailError,
  pauseBetweenSendsMs, autosendStatusLine, localParts,
} from '../lib/autosend.js';
import { sanitizeAutopilotSettings } from '../lib/draft-queue.js';
import { buildRawEmail } from '../lib/raw-email.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const b64 = (raw) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
// Mon 2026-10-19 10:30 in Colombo (UTC+5:30) = 05:00 UTC
const MON_10 = Date.parse('2026-10-19T05:00:00Z');

t('defaults: everything automatic is OFF until the owner switches it on', () => {
  assert.equal(AUTOSEND_DEFAULTS.autoSend, false); assert.equal(AUTOSEND_DEFAULTS.autoBilling, false); assert.equal(AUTOSEND_DEFAULTS.autoContent, false); assert.equal(AUTOSEND_DEFAULTS.weeklyReport, false);
  assert.equal(sanitizeAutopilotSettings({}).autoSend, false);
});
t('sanitize: numbers clamped, junk dropped, window always has a length, platforms restricted', () => {
  const s = sanitizeAutoSend({ autoSend: true, autoSendPerDay: 9999, sendHourStart: 20, sendHourEnd: 5, tzOffsetMin: 99999, contentPlatforms: ['X', 'myspace', 'tiktok', 'x'], bogus: 1 });
  assert.equal(s.autoSendPerDay, AUTOSEND_PER_DAY_MAX);
  assert.ok(s.sendHourEnd > s.sendHourStart);
  assert.equal(s.tzOffsetMin, 840);
  assert.deepEqual(s.contentPlatforms, ['x', 'tiktok']);
  assert.equal('bogus' in s, false);
  assert.equal(sanitizeAutoSend({ autoSendPerDay: 0 }).autoSendPerDay, 1);
  assert.equal(sanitizeAutoSend({ autoSendPerDay: 'abc' }).autoSendPerDay, 15);
});
t('sanitize: resuming clears the pause reason; pausing keeps a one-line reason', () => {
  const paused = sanitizeAutoSend({ autoSendPaused: true, autoSendPauseReason: 'too many\nbounces' });
  assert.equal(paused.autoSendPauseReason, 'too many bounces');
  const resumed = sanitizeAutoSend({ autoSendPaused: false }, paused);
  assert.equal(resumed.autoSendPaused, false); assert.equal(resumed.autoSendPauseReason, '');
  assert.equal(sanitizeAutoSend({ autoSend: false }, paused).autoSendPaused, true); // switching off does not silently un-pause
});
t('window: weekdays 09-17 local; weekends and off-hours wait; local time uses the owner offset', () => {
  const s = sanitizeAutoSend({});
  assert.deepEqual(localParts(MON_10, 330), { dow: 1, hour: 10, dateKey: '2026-10-19' });
  assert.equal(inSendWindow(MON_10, s).ok, true);
  assert.equal(inSendWindow(Date.parse('2026-10-19T02:00:00Z'), s).why, 'before_window'); // 07:30 Colombo
  assert.equal(inSendWindow(Date.parse('2026-10-19T12:00:00Z'), s).why, 'after_window'); // 17:30 Colombo
  assert.equal(inSendWindow(Date.parse('2026-10-18T05:00:00Z'), s).why, 'weekend'); // Sunday
  assert.equal(inSendWindow(Date.parse('2026-10-18T05:00:00Z'), { ...s, weekdaysOnly: false }).ok, true);
});
t('room: the lowest of owner cap, platform cap and per-run cap; never negative', () => {
  assert.equal(sendRoom({ autoSentToday: 5, sentToday: 5, perDay: 15 }), 10);
  assert.equal(sendRoom({ autoSentToday: 0, sentToday: 495, perDay: 40, platformCap: 500 }), 5);
  assert.equal(sendRoom({ autoSentToday: 0, sentToday: 0, perDay: 50 }), 25); // one run never sends more than 25
  assert.equal(sendRoom({ autoSentToday: 20, sentToday: 20, perDay: 15 }), 0);
});
t('plan: inbound replies first, then follow-ups, then cold first emails best-first; one per address; only ready drafts', () => {
  const q = (email, o = {}) => ({ status: 'ready', email, subject: 's', body: 'b', kind: 'first', score: 50, createdAt: '2026-10-18T00:00:00Z', ...o });
  const ready = [q('cold-low@x.lk', { score: 40 }), q('cold-high@x.lk', { score: 90 }), q('fu@x.lk', { kind: 'followup' }), q('in@x.lk', { inbound: true, score: 100 }), q('dup@x.lk'), q('DUP@x.lk'), q('sent@x.lk', { status: 'sent' }), q('', {}), q('nobody@x.lk', { body: '' })];
  assert.deepEqual(planAutosend(ready, 10).map((x) => x.email), ['in@x.lk', 'fu@x.lk', 'cold-high@x.lk', 'dup@x.lk', 'cold-low@x.lk']); // dup (score 50) outranks cold-low (40); its second copy is dropped
  assert.deepEqual(planAutosend(ready, 2).map((x) => x.email), ['in@x.lk', 'fu@x.lk']);
  assert.deepEqual(planAutosend(ready, 0), []);
});
t('pause: only on a meaningful bounce rate (enough sends AND >= 5%)', () => {
  assert.equal(shouldPause({ sent7: 10, bounced7: 5 }).pause, false); // too few sends to judge
  assert.equal(shouldPause({ sent7: 100, bounced7: 4 }).pause, false);
  const v = shouldPause({ sent7: 100, bounced7: 5 });
  assert.equal(v.pause, true); assert.match(v.reason, /5 of the last 100/);
});
t('gmail errors: auth ends the run and pauses; rate limits stop for the day; the rest count as a failure', () => {
  assert.equal(classifyGmailError({ message: 'invalid_grant' }).kind, 'auth');
  assert.equal(classifyGmailError({ code: 401 }).kind, 'auth');
  assert.equal(classifyGmailError({ code: 403, message: 'Request had insufficient authentication scopes' }).kind, 'auth');
  assert.equal(classifyGmailError({ code: 429 }).kind, 'limit');
  assert.equal(classifyGmailError({ message: 'User-rate limit exceeded' }).kind, 'limit');
  assert.equal(classifyGmailError({ message: 'socket hang up' }).kind, 'other');
});
t('pace: 6-15 seconds between sends, deterministic', () => {
  for (let i = 0; i < 200; i++) { const ms = pauseBetweenSendsMs(i); assert.ok(ms >= 6000 && ms <= 15000); assert.equal(ms, pauseBetweenSendsMs(i)); }
  assert.ok(new Set(Array.from({ length: 20 }, (_, i) => pauseBetweenSendsMs(i))).size > 10); // not a fixed beat
});
t('status line tells the truth in each state', () => {
  const on = sanitizeAutoSend({ autoSend: true });
  assert.match(autosendStatusLine(sanitizeAutoSend({})), /^Off/);
  assert.match(autosendStatusLine({ ...on, autoSendPaused: true, autoSendPauseReason: 'bounces' }), /^Paused. bounces/);
  assert.match(autosendStatusLine(on, { connected: false }), /not connected/);
  assert.match(autosendStatusLine(on, { connected: true, canSend: false }), /reading only/);
  assert.match(autosendStatusLine(on, { connected: true, canSend: true, now: MON_10 }), /^On: up to 15 a day, inside 09:00-17:00, weekdays\.$/);
  assert.match(autosendStatusLine(on, { connected: true, canSend: true, now: Date.parse('2026-10-18T05:00:00Z') }), /waits/);
});
t('raw email: one-line headers (no injection), UTF-8 subject, CRLF body, opt-out headers included', () => {
  const raw = buildRawEmail({ from: 'me@x.com', fromName: 'Sam "the" <Boss>', to: 'a@x.lk\r\nBcc: evil@x.com', subject: 'Hello\nBcc: evil@x.com', body: 'Line 1\nLine 2', extraHeaders: 'List-Unsubscribe: <https://x/u>\r\n' });
  const m = b64(raw);
  assert.doesNotMatch(raw, /[+/=]/); // base64url
  assert.equal(m.split('\r\n').filter((l) => /^Bcc:/i.test(l)).length, 0);
  assert.match(m, /^From: Sam the Boss <me@x\.com>\r\n/);
  assert.match(m, /List-Unsubscribe: <https:\/\/x\/u>\r\n/);
  assert.match(m, /\r\n\r\nLine 1\r\nLine 2\r\n$/);
  assert.match(b64(buildRawEmail({ to: 'a@x.lk', subject: 'Café ☕', body: 'x' })), /Subject: =\?utf-8\?B\?[A-Za-z0-9+/=]+\?=/);
  assert.doesNotMatch(b64(buildRawEmail({ to: 'a@x.lk', subject: 's', body: 'x' })), /^From:/); // no address -> Gmail uses the account
});
console.log(`${n} autosend tests passed`);
