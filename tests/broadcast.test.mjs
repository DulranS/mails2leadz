// Newsletters: the draft rules, names, the daily cap, batching that never sends twice, and the lead magnet link rules.
import assert from 'node:assert/strict';
import { sanitizeBroadcast, fillBroadcast, consentLine, nextBatch, todaysSends, BROADCAST_LIMITS, validSchedule, isDue, roundRobin, CRON_BATCH_BUDGET } from '../lib/broadcast.js';
import { sanitizeMagnet } from '../lib/signup.js';

// Drafts: a subject and a real message, with the length limits enforced; line breaks kept, control characters removed.
assert.match(sanitizeBroadcast({ subject: '   ', body: 'Hello there, friend' }).error, /subject/);
assert.match(sanitizeBroadcast({ subject: 'x'.repeat(151), body: 'Hello there, friend' }).error, /longer than 150/);
assert.match(sanitizeBroadcast({ subject: 'Hi', body: 'short' }).error, /at least 10/);
assert.match(sanitizeBroadcast({ subject: 'Hi', body: 'x'.repeat(5001) }).error, /longer than 5000/);
const d = sanitizeBroadcast({ subject: 'News', body: 'Hello\u0007 there\r\nSecond line' });
assert.equal(d.ok, true);
assert.equal(d.value.body, 'Hello there\nSecond line', 'line breaks kept, control characters removed');

// Names: {{name}} becomes the first name, or "there"; other text is left alone.
assert.equal(fillBroadcast('Hi {{name}}, {{ NAME }}, {{other}}', { name: 'Ana Silva' }), 'Hi Ana, Ana, {{other}}');
assert.equal(fillBroadcast('Hi {{name}}', {}), 'Hi there');

// Every email says why it is being sent.
assert.ok(consentLine('Acme').includes('Acme'));
assert.ok(consentLine('').includes('us'));

// Batches: at most 10 a call, never past the list, and the whole list is covered exactly once.
const people = Array.from({ length: 25 }, (_, i) => `c${i}`);
let cursor = 0; const sent = []; let calls = 0;
while (true) {
  const b = nextBatch({ recipients: people, cursor, sentToday: 0 });
  sent.push(...b.ids); cursor = b.nextCursor; calls++;
  assert.ok(b.ids.length <= BROADCAST_LIMITS.batchMax, 'a batch is at most 10');
  if (b.done) break;
  assert.ok(calls < 10, 'it finishes');
}
assert.deepEqual(sent, people, 'every person is sent to exactly once, in order');
assert.equal(calls, 3, '25 people take 3 batches');

// The daily cap: what is left of today's allowance limits the batch; at the cap nothing is sent.
assert.equal(nextBatch({ recipients: people, cursor: 0, sentToday: 495 }).ids.length, 5, 'only 5 left today');
const atCap = nextBatch({ recipients: people, cursor: 0, sentToday: BROADCAST_LIMITS.dailyMax });
assert.equal(atCap.ids.length, 0, 'at the daily cap nothing is sent');
assert.equal(atCap.nextCursor, 0, 'and the place is kept for tomorrow');
assert.equal(nextBatch({ recipients: [], cursor: 0, sentToday: 0 }).done, true, 'an empty list is finished at once');
assert.equal(BROADCAST_LIMITS.dailyMax, 500);
assert.equal(BROADCAST_LIMITS.recipientsMax, 5000);

// The daily count resets each day.
const now = new Date('2026-06-02T10:00:00Z');
assert.equal(todaysSends({ date: '2026-06-02', count: 42 }, now), 42);
assert.equal(todaysSends({ date: '2026-06-01', count: 42 }, now), 0, 'yesterday does not count today');
assert.equal(todaysSends(null, now), 0);

// Lead magnet: only a plain https address; a login in the address is refused; the title is tidied.
assert.equal(sanitizeMagnet({ url: 'http://x.com/f.pdf' }).ok, false, 'plain http refused');
assert.equal(sanitizeMagnet({ url: 'https://user:pw@x.com/f.pdf' }).ok, false, 'a login in the address refused');
assert.equal(sanitizeMagnet({ url: 'not a link' }).ok, false);
const m = sanitizeMagnet({ url: 'https://x.com/guide.pdf', title: '  Pricing\nGuide  ' });
assert.equal(m.ok, true);
assert.equal(m.value.magnetTitle, 'Pricing Guide');
assert.equal(sanitizeMagnet({ url: 'https://x.com/a.pdf' }).value.magnetTitle, 'your download', 'default title');

// Scheduling: at least 5 minutes ahead, no more than 90 days; a past time is refused.
const t0 = Date.parse('2026-06-02T10:00:00Z');
assert.equal(validSchedule('2026-06-02T09:00:00Z', t0).ok, false, 'a past time is refused');
assert.equal(validSchedule('2026-06-02T10:03:00Z', t0).ok, false, 'too soon is refused');
assert.equal(validSchedule('2026-09-30T10:00:00Z', t0).ok, false, 'more than 90 days ahead is refused');
assert.equal(validSchedule('not a date', t0).ok, false);
assert.equal(validSchedule('2026-06-03T10:00:00Z', t0).iso, '2026-06-03T10:00:00.000Z');
assert.equal(isDue({ status: 'scheduled', scheduledFor: '2026-06-02T09:59:00Z' }, t0), true);
assert.equal(isDue({ status: 'scheduled', scheduledFor: '2026-06-02T10:30:00Z' }, t0), false, 'not yet due');
assert.equal(isDue({ status: 'draft', scheduledFor: '2026-06-02T09:59:00Z' }, t0), false, 'a draft is never due');

// Fairness: one account with a long newsletter does not take every slot; the budget is respected.
assert.deepEqual(roundRobin([['a1', 'a2', 'a3'], ['b1']], 3), ['a1', 'b1', 'a2'], 'turns taken across accounts');
assert.deepEqual(roundRobin([['a1', 'a2'], ['b1', 'b2']], 10), ['a1', 'b1', 'a2', 'b2'], 'stops when every queue is empty');
assert.deepEqual(roundRobin([['a1']], 0), [], 'no budget, no sends');
assert.deepEqual(roundRobin([], 5), []);
assert.equal(CRON_BATCH_BUDGET, 12);

console.log('broadcast tests: all passed');
