import assert from 'node:assert/strict';
import { pickFirstEmailCandidates, followUpTasksFor, FIRST_EMAIL_BATCH_MAX } from '../lib/first-email-batch.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const csv = [
  'business_name,email,phone,website,category,address,first_name,lead_quality,lead_quality_score',
  'Cold Co,cold@cold.com,,https://cold.com,plumber,"1 Main St, Leeds",,COLD,20',
  'Hot Dental,hot@dental.com,,https://dental.com,dentist,"2 High St, Leeds",Ann,HOT,90',
  'Warm Cafe,warm@cafe.com,0771234567,https://cafe.com,cafe,,,WARM,60',
  'Phone Only,,0771111111,,,,,HOT,95',
  'Already,done@x.com,,,,,,HOT,99',
  'Opted Out,stop@x.com,,,,,,HOT,99',
  'Dup,hot@dental.com,,,,,,HOT,80',
  'Bad Email,not-an-email,,,,,,HOT,99',
].join('\n');

t('email-only leads are included (no phone needed), best first, deduped', () => {
  const { candidates, total } = pickFirstEmailCandidates(csv, { emailed: ['DONE@x.com'], blocked: ['stop@x.com'] });
  assert.deepEqual(candidates.map((c) => c.email), ['hot@dental.com', 'warm@cafe.com', 'cold@cold.com']);
  assert.equal(total, 3);
  assert.equal(candidates[0].category, 'dentist');
  assert.equal(candidates[0].contactName, 'Ann');
  assert.equal(candidates[0].address, '2 High St, Leeds');
});
t('already emailed, blocked, invalid and phone-only rows never appear', () => {
  const all = pickFirstEmailCandidates(csv, { emailed: ['done@x.com'], blocked: ['stop@x.com'] }).candidates.map((c) => c.email);
  for (const bad of ['done@x.com', 'stop@x.com', 'not-an-email']) assert.ok(!all.includes(bad));
});
t('quality filter and the per-run cap are respected', () => {
  assert.deepEqual(pickFirstEmailCandidates(csv, { qualityFilter: 'WARM' }).candidates.map((c) => c.email), ['warm@cafe.com']);
  const big = ['email,business_name'].concat(Array.from({ length: 40 }, (_, i) => `l${i}@x.com,B${i}`)).join('\n');
  const r = pickFirstEmailCandidates(big);
  assert.equal(r.candidates.length, FIRST_EMAIL_BATCH_MAX);
  assert.equal(r.total, 40);
});
t('a CSV with no lead_quality column is not filtered away', () => {
  const r = pickFirstEmailCandidates('email,business_name\na@x.com,A', { qualityFilter: 'HOT' });
  assert.equal(r.candidates.length, 1);
});
t('empty / header-only input is safe', () => {
  assert.deepEqual(pickFirstEmailCandidates('').candidates, []);
  assert.deepEqual(pickFirstEmailCandidates('email').candidates, []);
});

const templates = [
  { id: 'f2', name: 'Follow-Up 2 (Day 5)', enabled: true, delayDays: 5 },
  { id: 'f1', name: 'Follow-Up 1 (Day 2)', enabled: true, delayDays: 2 },
  { id: 'f3', name: 'Follow-Up 3 (Day 10)', enabled: false, delayDays: 10 },
];
t('follow-up tasks: one per ENABLED template, scheduled after the send, in the bulk sender\'s shape', () => {
  const now = new Date('2026-10-13T10:00:00Z');
  const tasks = followUpTasksFor([{ email: ' A@X.com ', name: 'A Co' }], templates, now);
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map((x) => x.templateId), ['f1', 'f2']);
  assert.equal(tasks[0].leadEmail, 'a@x.com');
  assert.equal(tasks[0].channel, 'email');
  assert.equal(tasks[0].scheduledFor, new Date('2026-10-15T10:00:00Z').toISOString());
  assert.equal(tasks[1].scheduledFor, new Date('2026-10-18T10:00:00Z').toISOString());
  assert.deepEqual(followUpTasksFor([], templates), []);
  assert.deepEqual(followUpTasksFor([{ email: 'a@x.com' }], []), []);
});
console.log(`\n${n} first-email-batch tests ok`);
