import assert from 'node:assert/strict';
import { buildMorningBrief } from '../lib/owner-report.js';
import { autoLeanPick } from '../lib/angles.js';
import { computeAngleStats } from '../lib/attribution.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-10-20T05:00:00Z');
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
const biz = { currency: 'USD', profile: { businessName: 'Studio', offer: 'Websites' } };
const healthy = { settings: biz, today: '2026-10-20', now: NOW, sentRows: Array.from({ length: 12 }, (_, i) => ({ to: `l${i}@x.lk`, sentAt: ago(3 + i), replied: false })) };

t('brief: nothing needs the owner -> quiet (no email)', () => {
  const b = buildMorningBrief(healthy);
  assert.equal(b.quiet, true); assert.equal(b.count, 0);
});
t('brief: a stopped Autosend leads the email, with the reason and a link', () => {
  const b = buildMorningBrief({ ...healthy, baseUrl: 'https://app.example.com/', autopilot: { settings: { autoSend: true, autoSendPaused: true, autoSendPauseReason: '6 of the last 100 emails bounced' } } });
  assert.equal(b.quiet, false); assert.equal(b.subject, '1 thing needs you today - Studio');
  assert.match(b.body, /1\. Autosend stopped itself/); assert.match(b.body, /6 of the last 100/); assert.match(b.body, /https:\/\/app\.example\.com\/account\n/);
});
t('brief: replies with no deal, due follow-ups, hot inbox leads and posts due are all counted from the raw rows', () => {
  const b = buildMorningBrief({
    ...healthy,
    sentRows: [...healthy.sentRows, { to: 'hot@x.lk', businessName: 'Hot Co', sentAt: ago(2), replied: true }],
    tasks: [{ status: 'pending', leadEmail: 'a@x.lk', scheduledFor: ago(1) }, { status: 'pending', leadEmail: 'hot@x.lk', scheduledFor: ago(1) }, { status: 'pending', leadEmail: 'later@x.lk', scheduledFor: new Date(NOW + 86400000).toISOString() }],
    inbox: [{ status: 'new', lead_quality: 'HOT', email: 'h@x.lk' }, { status: 'new', lead_quality: 'COLD', email: 'c@x.lk' }],
    posts: [{ platform: 'linkedin', status: 'scheduled', scheduledFor: '2026-10-20' }],
  });
  assert.match(b.body, /1 person has replied and no deal exists yet/);
  assert.match(b.body, /1 follow-up is due/); // the replied lead's follow-up and the future one do not count
  assert.match(b.body, /1 post is due to go out today/);
  assert.ok(b.count <= 5);
});
t('brief: money owed shows up, informational items do not', () => {
  const overdue = [{ _id: 'i1', email: 'c@x.lk', businessName: 'Cust', amount: 500, number: 'INV-1', issuedAt: ago(40), dueAt: ago(10), status: 'sent' }];
  const b = buildMorningBrief({ ...healthy, invoices: overdue });
  assert.equal(b.quiet, false); assert.match(b.body, /1 invoice is overdue: \$500/);
  assert.ok(!/renew|referral/i.test(b.body));
});

t('learning: a clear winner is chosen; thin data, no gap or an unknown id changes nothing', () => {
  const rows = (angle, leads, replies) => Array.from({ length: leads }, (_, i) => ({ to: `${angle}${i}@x.lk`, angle, replied: i < replies, t: i }));
  const clear = computeAngleStats({ emails: [...rows('save_time', 16, 1), ...rows('question', 16, 7)] });
  assert.deepEqual(autoLeanPick(clear, ''), { angle: 'question', changed: true, gapPoints: 38 });
  assert.equal(autoLeanPick(clear, 'question').changed, false); // already favoured: no churn
  assert.equal(autoLeanPick(clear, 'bogus').changed, true); // a junk stored value is ignored
  const thin = computeAngleStats({ emails: [...rows('save_time', 5, 0), ...rows('question', 5, 5)] });
  assert.deepEqual(autoLeanPick(thin, 'save_time'), { angle: 'save_time', changed: false, gapPoints: 0 }); // keeps what it had
  const flat = computeAngleStats({ emails: [...rows('save_time', 16, 4), ...rows('question', 16, 5)] });
  assert.equal(autoLeanPick(flat, '').angle, '');
  assert.equal(autoLeanPick(null, '').changed, false);
  const unknown = computeAngleStats({ emails: [...rows('made_up', 16, 12), ...rows('question', 16, 2)] });
  assert.equal(autoLeanPick(unknown, '').angle, ''); // only angles the app knows can be favoured
});
console.log(`\n${n} owner-report tests ok`);
