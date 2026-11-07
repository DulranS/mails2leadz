// Meeting briefs (Pass 182): before each confirmed meeting in the next day, the owner gets what they already know.
import assert from 'node:assert/strict';
import { meetingBriefs } from '../lib/meeting-brief.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const now = Date.parse('2026-11-05T08:00:00Z');
const inHours = (h) => new Date(now + h * 3600000).toISOString();

t('a confirmed meeting in the next day gets a brief from the deal, quote, unpaid invoices and last call', () => {
  const r = meetingBriefs({
    now,
    bookings: [{ status: 'confirmed', email: 'Ann@x.com', name: 'Ann', startIso: inHours(3) }],
    deals: [{ email: 'ann@x.com', stage: 'proposal', value: 900 }],
    quotes: [{ email: 'ann@x.com', status: 'sent', title: 'Website', viewCount: 2 }],
    invoices: [{ email: 'ann@x.com', status: 'open', total: 120 }],
    callNotes: [{ email: 'ann@x.com', createdAt: '2026-11-03T10:00:00Z', summary: 'Wants a demo and a price list.', nextStep: 'Send the price list' }],
  });
  assert.equal(r.length, 1);
  const text = r[0].lines.join(' ');
  assert.match(text, /Deal: proposal, worth 900\.00/);
  assert.match(text, /opened 2 times/);
  assert.match(text, /Unpaid: 1 invoice, 120\.00/);
  assert.match(text, /Agreed next step: Send the price list/);
});

t('meetings outside the day, unconfirmed bookings and past meetings get no brief; a first meeting says so', () => {
  const r = meetingBriefs({
    now,
    bookings: [
      { status: 'confirmed', email: 'late@x.com', startIso: inHours(30) },
      { status: 'requested', email: 'req@x.com', startIso: inHours(2) },
      { status: 'confirmed', email: 'past@x.com', startIso: inHours(-2) },
      { status: 'confirmed', email: 'new@x.com', name: 'New', startIso: inHours(5) },
    ],
  });
  assert.deepEqual(r.map((x) => x.email), ['new@x.com']);
  assert.match(r[0].lines[0], /first meeting/);
});

console.log(`\n${n} passed`);
