// Pass 308: the owner logs a call, meeting or note by hand, and AI call summaries join the customer's history (spec 2.3).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanActivity, ACTIVITY_TYPES } from '../lib/deal-activity.js';
import { customerTimeline } from '../lib/customer-timeline.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-11-15T12:00:00Z');

t('a call, meeting or note is accepted with a clean email, type and summary', () => {
  const r = cleanActivity({ email: '  Buyer@Example.com ', type: 'call', summary: 'Asked about the   spring price.\nWants a quote.', nextStep: 'Send quote' }, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.value.email, 'buyer@example.com');
  assert.equal(r.value.summary, 'Asked about the spring price. Wants a quote.');
  assert.equal(r.value.at, new Date(NOW).toISOString());
  assert.deepEqual(ACTIVITY_TYPES, ['call', 'meeting', 'note']);
});

t('a bad email, an unknown type, or an empty summary is refused', () => {
  assert.ok(cleanActivity({ email: 'nope', type: 'call', summary: 'Spoke today' }, NOW).error);
  assert.ok(cleanActivity({ email: 'a@b.com', type: 'sms', summary: 'Spoke today' }, NOW).error);
  assert.ok(cleanActivity({ email: 'a@b.com', type: 'call', summary: 'x' }, NOW).error);
});

t('a call that happened earlier is kept at its own time, but a future time is refused', () => {
  const past = Date.parse('2026-11-10T09:00:00Z');
  assert.equal(cleanActivity({ email: 'a@b.com', type: 'meeting', summary: 'Site visit', at: new Date(past).toISOString() }, NOW).value.at, new Date(past).toISOString());
  assert.ok(cleanActivity({ email: 'a@b.com', type: 'meeting', summary: 'Site visit', at: new Date(NOW + 3 * 86400000).toISOString() }, NOW).error);
  assert.ok(cleanActivity({ email: 'a@b.com', type: 'meeting', summary: 'Site visit', at: 'soon' }, NOW).error);
});

t('logged entries and call summaries join the history for that customer only', () => {
  const events = customerTimeline({
    email: 'buyer@example.com',
    activities: [
      { email: 'buyer@example.com', type: 'call', at: '2026-11-10T09:00:00Z', summary: 'Asked about price' },
      { email: 'other@example.com', type: 'note', at: '2026-11-11T09:00:00Z', summary: 'Not theirs' },
    ],
    callNotes: [
      { email: 'BUYER@example.com', createdAt: '2026-11-12T09:00:00Z', summary: 'Wants the bigger plan' },
    ],
  });
  const kinds = events.map((e) => e.kind);
  assert.ok(kinds.includes('call.logged'));
  assert.ok(kinds.includes('call.summarised'));
  assert.equal(events.some((e) => e.detail === 'Not theirs'), false);
  assert.equal(events[0].kind, 'call.summarised', 'newest first');
});

t('the history route saves an entry for the owner only, and the screen can log one', () => {
  const route = fs.readFileSync('app/api/deal-activity/route.js', 'utf8');
  assert.ok(route.includes('guardTenant(db, who.uid)'));
  assert.ok(route.includes("collection(db, 'deal_activity')"));
  assert.ok(route.includes('userId: who.uid'));
  const page = fs.readFileSync('app/history/page.js', 'utf8');
  assert.ok(page.includes('/api/deal-activity'));
  assert.ok(page.includes('aria-label="Log a call, meeting or note"'));
});

t('the server loader reads logged entries and call summaries', () => {
  const src = fs.readFileSync('lib/server/customer-timeline.js', 'utf8');
  assert.ok(src.includes("collection(db, 'deal_activity')"));
  assert.ok(src.includes("collection(db, 'users', uid, 'call_notes')"));
});

console.log(`gap-close-308: ${n} checks passed`);
