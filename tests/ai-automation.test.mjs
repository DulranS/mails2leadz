// Weekly action list and call summaries (Pass 162): built from the owner's records, checked before they are kept.
import assert from 'node:assert/strict';
import { buildActionList, actionText } from '../lib/action-list.js';
import { parseCallSummary, callSummaryPrompt } from '../lib/call-summary.js';
import { alertsDigest } from '../lib/pipeline-alerts.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const now = Date.parse('2026-11-03T10:00:00Z');
const daysAgo = (d) => new Date(now - d * 86400000).toISOString();

t('the action list puts overdue follow-ups and invoices first, then stalled deals and quotes with no answer', () => {
  const list = buildActionList({
    now,
    tasks: [{ status: 'pending', leadEmail: 'ann@x.com', scheduledFor: daysAgo(3) }],
    invoices: [{ status: 'open', dueAt: daysAgo(5), number: 'INV-1', businessName: 'Bob Ltd' }],
    deals: [{ email: 'cy@x.com', stage: 'proposal', businessName: 'Cy Co', stageTimes: { proposal: daysAgo(20) } }],
    quotes: [{ status: 'sent', sentAt: daysAgo(10), title: 'Website' }],
  });
  assert.deepEqual(list.map((a) => a.kind), ['overdue_followup', 'overdue_invoice', 'stalled_deal', 'quote_no_reply']);
  assert.match(actionText(list)[1], /Collect INV-1 from Bob Ltd \(5 days overdue\)/);
});

t('paid, closed and recent items do not appear in the list', () => {
  const list = buildActionList({
    now,
    invoices: [{ status: 'paid', dueAt: daysAgo(9) }],
    deals: [{ email: 'd@x.com', stage: 'closed_won', stageTimes: { closed_won: daysAgo(40) } }, { email: 'e@x.com', stage: 'qualified', stageTimes: { qualified: daysAgo(2) } }],
    quotes: [{ status: 'sent', sentAt: daysAgo(2) }],
  });
  assert.equal(list.length, 0);
});

t('the list is capped, so a week never shows more than the limit', () => {
  const deals = Array.from({ length: 20 }, (_, i) => ({ email: `p${i}@x.com`, stage: 'proposal', stageTimes: { proposal: daysAgo(30) } }));
  assert.equal(buildActionList({ now, deals, limit: 5 }).length, 5);
});

t('a call summary is kept only if it has a real summary; unsafe fields are cleaned or dropped', () => {
  assert.match(parseCallSummary({ summary: 'short' }).error, /empty/);
  const r = parseCallSummary({ summary: 'Ann wants a demo next week and asked about pricing tiers.', nextStep: 'Send demo times', dueDate: '2026-11-10', objections: ['price', '', 'timing'], sentiment: 'excited' });
  assert.equal(r.value.dueDate, '2026-11-10');
  assert.equal(r.value.sentiment, 'neutral');
  assert.deepEqual(r.value.objections, ['price', 'timing']);
  assert.equal(parseCallSummary({ summary: 'A long enough note here.', dueDate: 'next Friday' }).value.dueDate, '');
});

t('the prompt uses the transcript only, and caps its length', () => {
  assert.match(callSummaryPrompt('hello there'), /^Transcript:\nhello there/);
  assert.equal(callSummaryPrompt('x'.repeat(30000)).length <= 'Transcript:\n'.length + 20000, true);
});

t('the Monday digest carries the week\'s actions, and no action means no section', () => {
  const d = alertsDigest({ actions: ['- Collect INV-1 from Bob Ltd (2 days overdue)'], senderName: 'Shop' });
  assert.match(d.text, /This week's actions:/);
  assert.match(d.text, /Collect INV-1/);
  assert.equal(alertsDigest({ actions: [] }), null);
});

console.log(`\n${n} passed`);
