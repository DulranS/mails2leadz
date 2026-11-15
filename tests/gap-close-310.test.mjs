// Pass 310: the full deal history, edit and delete of logged entries, a resubscribed deal goes back to its open stage,
// and a journey's win is dated from the day the deal was won.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reopenStageFor } from '../lib/deal-utils.js';
import { dealHistory } from '../lib/deal-history.js';
import { cleanEdit } from '../lib/deal-activity.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a deal that was opted out goes back to the open stage it was in just before', () => {
  const deal = {
    stage: 'closed_lost', lostReason: 'unsubscribed', unsubscribedAt: '2026-11-10T09:00:00Z',
    stageTimes: { contacted: '2026-11-01T09:00:00Z', demo: '2026-11-05T09:00:00Z', closed_lost: '2026-11-10T09:00:00Z' },
  };
  assert.equal(reopenStageFor(deal), 'demo');
});

t('with no stage times to go on, the deal goes back to new', () => {
  assert.equal(reopenStageFor({ stage: 'closed_lost', lostReason: 'unsubscribed' }), 'new');
});

t('a stage time after the opt-out is not used to reopen', () => {
  const deal = { unsubscribedAt: '2026-11-10T09:00:00Z', stageTimes: { proposal: '2026-11-12T09:00:00Z', contacted: '2026-11-01T09:00:00Z' } };
  assert.equal(reopenStageFor(deal), 'contacted');
});

t('the deal history lists its steps oldest first, and says how it ended', () => {
  const won = dealHistory({ stage: 'closed_won', value: 1200, stageTimes: { closed_won: '2026-11-09T09:00:00Z', contacted: '2026-11-01T09:00:00Z' } });
  assert.equal(won.outcome, 'won');
  assert.equal(won.value, 1200);
  assert.deepEqual(won.steps.map((s) => s.label), ['Contacted', 'Won']);
  const lost = dealHistory({ stage: 'closed_lost', lostReason: 'unsubscribed' });
  assert.equal(lost.outcome, 'lost');
  assert.equal(lost.lostReason, 'Opted out of emails');
  const open = dealHistory({ stage: 'proposal', value: 0 });
  assert.equal(open.outcome, 'open');
  assert.equal(open.value, null);
  assert.equal(dealHistory(null), null);
});

t('an edit must keep a real summary, and the next step is optional', () => {
  assert.ok(cleanEdit({ summary: 'x' }).error);
  assert.deepEqual(cleanEdit({ summary: '  Agreed the price  ' }).value, { summary: 'Agreed the price', nextStep: '' });
});

t('the entry route edits and deletes only the owner\'s own entries', () => {
  const src = fs.readFileSync('app/api/deal-activity/route.js', 'utf8');
  assert.ok(src.includes('export async function PATCH('));
  assert.ok(src.includes('export async function DELETE('));
  assert.ok(src.includes('snap.data().userId === uid'));
  assert.ok(src.includes("status: 404") || src.includes('404'));
});

t('the history screen shows the deal, and lets the owner edit and delete entries', () => {
  const page = fs.readFileSync('app/history/page.js', 'utf8');
  assert.ok(page.includes('aria-label="Deal"'));
  assert.ok(page.includes('aria-label="Edit this entry"'));
  assert.ok(page.includes('Delete this entry from the history?'));
  assert.ok(page.includes("method: \"PATCH\"") || page.includes("method: 'PATCH'"));
});

t('the timeline route returns the deal with the events, and the loader reads the latest deal', () => {
  const route = fs.readFileSync('app/api/timeline/route.js', 'utf8');
  assert.ok(route.includes('loadDealHistory'));
  assert.ok(route.includes('{ email, events, deal }'));
  const loader = fs.readFileSync('lib/server/customer-timeline.js', 'utf8');
  assert.ok(loader.includes('export async function loadDealHistory('));
});

t('resubscribing reopens the deal in the same step', () => {
  const src = fs.readFileSync('lib/server/suppress.js', 'utf8');
  assert.ok(src.includes('reopenStageFor(d.data())'));
  assert.ok(src.includes("d.data().lostReason === 'unsubscribed'"));
});

t('a journey win is dated from when the deal was won, not its last update', () => {
  const src = fs.readFileSync('lib/journey-triggers.js', 'utf8');
  assert.ok(src.includes('d.stageTimes?.closed_won || d.closedAt || d.lastUpdate'));
});

console.log(`gap-close-310: ${n} checks passed`);
