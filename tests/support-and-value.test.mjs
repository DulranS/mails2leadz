// Support and re-engagement (Pass 186): complaints are recognised and their wait is alerted; valuable quiet customers are named.
import assert from 'node:assert/strict';
import { quickIntent, INTENTS } from '../lib/reply-intents.js';
import { planSupportAlerts } from '../lib/support-alerts.js';
import { quietValuable, buildActionList } from '../lib/action-list.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000;
const now = Date.parse('2026-11-05T12:00:00Z');

t('a complaint is recognised from plain wording, and a quoted old message does not count', () => {
  assert.ok(INTENTS.includes('complaint') && INTENTS.includes('support_request'));
  assert.equal(quickIntent('The order arrived broken and I want a refund.'), 'complaint');
  assert.equal(quickIntent('Thanks, see you Tuesday.'), null);
  assert.equal(quickIntent('Sounds good.\n\nOn Mon, Ann wrote:\n> my order arrived broken and I want a refund'), null);
});

t('a complaint waiting two hours raises one alert; a fresh one, a closed one or an already-alerted one does not', () => {
  const rows = [
    { id: 'a', to: 'ann@x.com', replyIntent: 'complaint', replyTriagedAt: new Date(now - 3 * 3600000).toISOString() },
    { id: 'b', to: 'bob@x.com', replyIntent: 'complaint', replyTriagedAt: new Date(now - 1 * 3600000).toISOString() },
    { id: 'c', to: 'cy@x.com', replyIntent: 'interested', replyTriagedAt: new Date(now - 9 * 3600000).toISOString() },
    { id: 'd', to: 'dee@x.com', replyIntent: 'support_request', replyTriagedAt: new Date(now - 5 * 3600000).toISOString() },
  ];
  assert.deepEqual(planSupportAlerts(rows, new Set(), now).map((x) => x.stageKey), ['support:a', 'support:d']);
  assert.deepEqual(planSupportAlerts(rows, new Set(['support:a', 'support:d']), now), []);
});

t('the valuable customers who have gone quiet are named; recent ones are not', () => {
  const deals = [
    { email: 'big@x.com', businessName: 'Big Co', stage: 'closed_won', value: 9000, lastUpdate: new Date(now - 200 * DAY).toISOString() },
    { email: 'new@x.com', businessName: 'New Co', stage: 'closed_won', value: 8000, lastUpdate: new Date(now - 5 * DAY).toISOString() },
    { email: 'small@x.com', businessName: 'Small Co', stage: 'closed_won', value: 100, lastUpdate: new Date(now - 300 * DAY).toISOString() },
  ];
  const q = quietValuable(deals, now);
  assert.deepEqual(q.map((x) => x.email), ['big@x.com']);
  assert.equal(q[0].idleDays, 200);
  const list = buildActionList({ deals, now });
  assert.ok(list.some((a) => a.kind === 'reengage' && /Big Co/.test(a.title)));
});

console.log(`\n${n} passed`);
