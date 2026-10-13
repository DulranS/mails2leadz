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
console.log(`\n${n} next-actions tests ok`);
