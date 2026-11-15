// Pass 295: one customer's history across emails, quotes, invoices, bookings and support (spec 2.3).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { customerTimeline, TIMELINE_MAX } from '../lib/customer-timeline.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const src = {
  email: 'Buyer@Acme.co',
  sentEmails: [{ to: 'buyer@acme.co', subject: 'Quote follow-up', sentAt: '2026-11-11T09:00:00Z' }, { to: 'other@acme.co', subject: 'Not theirs', sentAt: '2026-11-12T09:00:00Z' }],
  quotes: [{ customerEmail: 'buyer@acme.co', title: 'Website', total: 500, currency: 'USD', sentAt: '2026-11-09T09:00:00Z', acceptedAt: '2026-11-13T09:00:00Z' }],
  invoices: [{ email: 'BUYER@acme.co', number: 'INV-9', total: 500, emailedAt: '2026-11-14T09:00:00Z', paidAt: '2026-11-15T08:00:00Z' }],
  bookings: [{ email: 'buyer@acme.co', serviceName: 'Site visit', startIso: '2026-11-16T10:00:00Z', status: 'confirmed' }],
  tickets: [{ customerEmail: 'buyer@acme.co', kind: 'question', summary: 'Do you do hosting?', openedAt: '2026-11-10T09:00:00Z', resolvedAt: '2026-11-10T12:00:00Z' }],
};

t('every source is merged into one list, newest first', () => {
  const ev = customerTimeline(src);
  assert.deepEqual(ev.map((e) => e.kind), ['booking', 'invoice.paid', 'invoice.sent', 'quote.accepted', 'email.sent', 'ticket.resolved', 'ticket.opened', 'quote.sent']);
  assert.equal(ev[0].kind, 'booking');
  assert.equal(ev.length, 8);
  for (let i = 1; i < ev.length; i += 1) assert.ok(ev[i - 1].at >= ev[i].at, 'sorted');
});

t('only this customer\'s records appear; the match ignores case', () => {
  const ev = customerTimeline(src);
  assert.ok(!ev.some((e) => e.label.includes('Not theirs')));
  assert.ok(ev.some((e) => e.label === 'Invoice emailed: INV-9'), 'uppercase invoice email matched');
});

t('a record with no usable time is left out rather than shown wrongly', () => {
  const ev = customerTimeline({ email: 'buyer@acme.co', sentEmails: [{ to: 'buyer@acme.co', subject: 'Undated' }] });
  assert.deepEqual(ev, []);
});

t('an empty email gives an empty history', () => {
  assert.deepEqual(customerTimeline({ email: '', sentEmails: src.sentEmails }), []);
});

t('the history is capped', () => {
  const many = Array.from({ length: TIMELINE_MAX + 40 }, (_, i) => ({ to: 'a@b.co', subject: `m${i}`, sentAt: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString() }));
  assert.equal(customerTimeline({ email: 'a@b.co', sentEmails: many }).length, TIMELINE_MAX);
});

t('text is shortened, and a line break in a subject cannot break the list', () => {
  const ev = customerTimeline({ email: 'a@b.co', sentEmails: [{ to: 'a@b.co', subject: 'Hi\nthere' + 'x'.repeat(300), sentAt: '2026-11-01T00:00:00Z' }] });
  assert.ok(!ev[0].label.includes('\n'));
  assert.ok(ev[0].label.length <= 160);
});

t('the route checks the email before it searches, and the loader reads only this owner\'s records', () => {
  const r = fs.readFileSync('app/api/timeline/route.js', 'utf8');
  assert.ok(r.includes('identify(request, null)') && r.includes('EMAIL_RE.test(email)'));
  const l = fs.readFileSync('lib/server/customer-timeline.js', 'utf8');
  assert.ok(l.includes("where('userId', '==', uid)"));
  assert.ok(l.includes("collection(db, 'users', uid, 'quotes')"));
  assert.ok(!/setDoc|updateDoc|addDoc|deleteDoc/.test(l) && !/setDoc|updateDoc|addDoc|deleteDoc/.test(r));
});

t('the history page reads through the route and is in the menu', () => {
  const p = fs.readFileSync('app/history/page.js', 'utf8');
  assert.ok(p.includes('fetch(`/api/timeline?email='));
  assert.ok(!/dangerouslySetInnerHTML/.test(p));
  assert.ok(fs.readFileSync('lib/app-routes.js', 'utf8').includes("href: '/history'"));
});

console.log(`\n${n} passed`);
