import assert from 'node:assert/strict';
import { computeBusinessMetrics } from '../lib/business-metrics.js';
import { buildNextActions } from '../lib/next-actions.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const now = Date.parse('2026-10-13T10:00:00Z');
const quiet = computeBusinessMetrics({ deals: [], now });
const busy = computeBusinessMetrics({ deals: [{ email: 'a@x.com', stage: 'proposal', value: 2000, createdAt: new Date(now - 5 * 86400000).toISOString(), lastUpdate: new Date(now - 86400000).toISOString() }], now });
const ids = (list) => list.map((a) => a.id);

t('hot leads waiting in the inbox: urgent when nothing is in play, a normal item otherwise', () => {
  const idle = buildNextActions({ metrics: quiet, inbox: { hotWithEmail: 12 }, sentRecently: 0 });
  const a = idle.find((x) => x.id === 'inbox');
  assert.equal(a.priority, 2);
  assert.equal(a.href, '/inbox');
  assert.match(a.title, /12 hot leads with an email are waiting/);
  const active = buildNextActions({ metrics: busy, inbox: { hotWithEmail: 1 }, sentRecently: 40 }).find((x) => x.id === 'inbox');
  assert.equal(active.priority, 3);
  assert.match(active.title, /1 hot lead with an email is waiting/);
  assert.ok(!ids(buildNextActions({ metrics: quiet, inbox: { hotWithEmail: 0 } })).includes('inbox'));
  assert.ok(!ids(buildNextActions({ metrics: quiet })).includes('inbox')); // optional input
});
t('content: due/overdue posts are listed; an empty calendar only nags people who already use the planner', () => {
  const due = buildNextActions({ metrics: quiet, content: { dueToday: 1, overdue: 2, scheduledNext7: 3, total: 9 } }).find((x) => x.id === 'content');
  assert.match(due.title, /3 posts are due to go out \(2 overdue\)/);
  assert.equal(due.href, '/content');
  assert.ok(ids(buildNextActions({ metrics: quiet, content: { dueToday: 0, overdue: 0, scheduledNext7: 0, total: 9 } })).includes('content-empty'));
  assert.ok(!ids(buildNextActions({ metrics: quiet, content: { dueToday: 0, overdue: 0, scheduledNext7: 0, total: 0 } })).some((i) => i.startsWith('content')));
  assert.ok(!ids(buildNextActions({ metrics: quiet, content: { dueToday: 0, overdue: 0, scheduledNext7: 2, total: 4 } })).some((i) => i.startsWith('content')));
});
t('money already owed still outranks new-lead and content work; list stays at 5', () => {
  const billing = { overdue: { count: 2, amount: 900, oldestDays: 12 } };
  const list = buildNextActions({ metrics: busy, billing, inbox: { hotWithEmail: 5 }, content: { dueToday: 1, overdue: 0, scheduledNext7: 1, total: 3 }, dueFollowUps: 4, sentRecently: 30, hasProfile: false });
  assert.ok(list.length <= 5);
  assert.equal(list[0].priority, 1);
  assert.ok(ids(list).indexOf('overdue') < ids(list).indexOf('inbox') || !ids(list).includes('inbox'));
});
t('a stopped Autosend is never silent: self-paused is urgent, owner-paused is a reminder, blocked sends warn, quiet runs say nothing', () => {
  const on = { autoSend: true };
  const hot = buildNextActions({ metrics: quiet, autopilot: { settings: { ...on, autoSendPaused: true, autoSendPauseReason: '6 of the last 100 emails bounced' } } });
  assert.equal(hot[0].id, 'autosend_paused'); assert.equal(hot[0].priority, 1); assert.equal(hot[0].tone, 'hot'); assert.match(hot[0].detail, /6 of the last 100/);
  const mine = buildNextActions({ metrics: quiet, autopilot: { settings: { ...on, autoSendPaused: true, autoSendPauseReason: 'You paused it.' } } }).find((x) => x.id === 'autosend_paused');
  assert.equal(mine.priority, 3); assert.match(mine.detail, /You paused it/);
  const blocked = buildNextActions({ metrics: quiet, autopilot: { settings: on, lastAutoSend: { at: new Date(Date.now() - 3600000).toISOString(), sent: 0, stopped: 'no_gmail' } } }).find((x) => x.id === 'autosend_blocked');
  assert.match(blocked.detail, /Gmail is not connected/);
  const old = buildNextActions({ metrics: quiet, autopilot: { settings: on, lastAutoSend: { at: new Date(Date.now() - 5 * 86400000).toISOString(), stopped: 'no_gmail' } } });
  assert.ok(!ids(old).includes('autosend_blocked')); // stale news is dropped
  const fine = buildNextActions({ metrics: quiet, autopilot: { settings: on, lastAutoSend: { at: new Date().toISOString(), sent: 12, stopped: '' } } });
  assert.ok(!ids(fine).some((i) => i.startsWith('autosend')));
  assert.ok(!ids(buildNextActions({ metrics: quiet, autopilot: { settings: { autoSendPaused: true } } })).includes('autosend_paused')); // autosend not on: nothing to report
  assert.ok(!ids(buildNextActions({ metrics: quiet })).some((i) => i.startsWith('autosend'))); // optional input
});
console.log(`\n${n} next-actions tests ok`);
