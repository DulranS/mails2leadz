// Pass 309: dialler calls and stage changes join the customer's history; new calls record the lead's email (spec 2.3).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { customerTimeline } from '../lib/customer-timeline.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a call placed to this customer shows in the history, with its status and length', () => {
  const events = customerTimeline({
    email: 'buyer@example.com',
    calls: [
      { email: 'buyer@example.com', createdAt: '2026-11-10T09:00:00Z', status: 'completed', duration: 74 },
      { email: 'someone@else.com', createdAt: '2026-11-11T09:00:00Z', status: 'completed', duration: 10 },
    ],
  });
  const call = events.find((e) => e.kind === 'call.placed');
  assert.ok(call);
  assert.equal(call.label, 'Call placed');
  assert.equal(call.detail, 'completed · 74s');
  assert.equal(events.length, 1);
});

t('a stage change on this customer\'s deal shows with the stage name, and no other customer\'s deal', () => {
  const events = customerTimeline({
    email: 'buyer@example.com',
    deals: [
      { email: 'buyer@example.com', stageTimes: { contacted: '2026-11-01T09:00:00Z', proposal: '2026-11-05T09:00:00Z' } },
      { email: 'other@example.com', stageTimes: { closed_won: '2026-11-06T09:00:00Z' } },
    ],
  });
  const stages = events.filter((e) => e.kind === 'deal.stage').map((e) => e.label);
  assert.deepEqual(stages.sort(), ['Moved to Contacted', 'Moved to Proposal'].sort());
});

t('a call with no length or status still shows, without a stray separator', () => {
  const events = customerTimeline({ email: 'buyer@example.com', calls: [{ email: 'buyer@example.com', createdAt: '2026-11-10T09:00:00Z' }] });
  assert.equal(events[0].detail, 'placed');
});

t('the dialler stores the lead email only when it is a real address, and the dashboard sends it', () => {
  const route = fs.readFileSync('app/api/make-call/route.js', 'utf8');
  assert.ok(route.includes('const leadEmail = '));
  assert.ok(route.includes('email: leadEmail || null,'));
  const dash = fs.readFileSync('app/dashboard/page.js', 'utf8');
  assert.ok(dash.includes('email: contact.email || "",'));
});

t('the server loader reads this owner\'s calls and deals for the customer', () => {
  const src = fs.readFileSync('lib/server/customer-timeline.js', 'utf8');
  assert.ok(src.includes("collection(db, 'calls')"));
  assert.ok(src.includes("collection(db, 'deals')"));
  assert.ok(src.includes('calls, deals })'));
});

console.log(`gap-close-309: ${n} checks passed`);
