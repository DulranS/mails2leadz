// Sales signals (Pass 164): new leads waiting for a first reply, discount-code results, and owners and due dates on actions.
import assert from 'node:assert/strict';
import { staleNewLeads } from '../lib/speed-to-lead.js';
import { promoResults, promoText } from '../lib/promo-results.js';
import { buildActionList, actionText } from '../lib/action-list.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const now = Date.parse('2026-11-03T12:00:00Z');
const at = (h) => new Date(now - h * 3600000).toISOString();

t('a new inbound lead waiting over an hour for a first reply is flagged; replied or fresh leads are not', () => {
  const r = staleNewLeads([
    { id: 'a', email: 'Ann@x.com', status: 'new', receivedAt: at(3) },
    { id: 'b', email: 'bob@x.com', status: 'new', receivedAt: at(0.5) },
    { id: 'c', email: 'cy@x.com', status: 'replied', receivedAt: at(9) },
  ], now, 1);
  assert.deepEqual(r, [{ id: 'a', email: 'ann@x.com', hoursWaiting: 3 }]);
});

t('discount codes report uses, revenue and discount for the month, biggest first', () => {
  const invoices = [
    { promoCode: 'spring10', amount: 90, discount: 10, issuedAt: '2026-10-05T10:00:00Z' },
    { promoCode: 'SPRING10', amount: 180, discount: 20, issuedAt: '2026-10-20T10:00:00Z' },
    { promoCode: 'vip', amount: 500, discount: 50, issuedAt: '2026-10-09T10:00:00Z' },
    { promoCode: 'spring10', amount: 99, discount: 10, issuedAt: '2026-11-01T10:00:00Z' },
    { amount: 40, issuedAt: '2026-10-09T10:00:00Z' },
  ];
  const rows = promoResults(invoices, 2026, 10);
  assert.deepEqual(rows.map((r) => [r.code, r.uses, r.revenue, r.discount]), [['VIP', 1, 500, 50], ['SPRING10', 2, 270, 30]]);
  assert.match(promoText(rows)[1], /SPRING10: 2 used, 270\.00 revenue, 30\.00 discount given/);
});

t('each action names an owner and a due date when the record gives them', () => {
  const list = buildActionList({
    now,
    members: [{ id: 'm1', name: 'Ann' }],
    deals: [{ email: 'cy@x.com', businessName: 'Cy Co', stage: 'proposal', ownerId: 'm1', stageTimes: { proposal: at(24 * 20) } }],
    invoices: [{ status: 'open', dueAt: at(48), number: 'INV-9', businessName: 'Bob Ltd' }],
  });
  const stalled = list.find((a) => a.kind === 'stalled_deal');
  assert.equal(stalled.owner, 'Ann');
  assert.ok(stalled.dueBy, 'stalled deals get a due date');
  const line = actionText(list).find((x) => x.includes('Move or close'));
  assert.match(line, /owner Ann, by \d{4}-\d{2}-\d{2}\)/);
});

console.log(`\n${n} passed`);
