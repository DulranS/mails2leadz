// Scheduled jobs on the free plan: Vercel Hobby allows up to 100 cron jobs per project, each once a day at most. Only jobs that never send e-mail
// are scheduled. The queued-search sweep (v393) is the third: it reads queues and adds leads to the inbox, and sends no e-mail.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

const ALLOWED = new Set(['/api/cron/check-replies', '/api/cron/prepare-drafts', '/api/cron/worker-queue']);
const dailyOnce = (s) => { const f = s.trim().split(/\s+/); return f.length === 5 && /^\d+$/.test(f[0]) && /^\d+$/.test(f[1]) && f[2] === '*' && f[3] === '*' && f[4] === '*'; };

t('the free-plan timetable runs only the three jobs that never send e-mail, each once a day', () => {
  const jobs = read('vercel.daily.json').crons;
  assert.equal(jobs.length, 3);
  for (const j of jobs) {
    assert.ok(ALLOWED.has(j.path), j.path);
    assert.ok(dailyOnce(j.schedule), j.schedule);
  }
});
t('vercel.json runs the same timetable the owner chose', () => {
  assert.deepEqual(read('vercel.json').crons, read('vercel.daily.json').crons);
});
t('the hourly timetable stays empty, since it needs a paid plan', () => {
  assert.deepEqual(read('vercel.hourly.json').crons, []);
});
t('no job that sends e-mail or texts is on any timetable', () => {
  for (const p of ['vercel.json', 'vercel.daily.json', 'vercel.hourly.json']) {
    for (const j of read(p).crons) assert.ok(!/autosend|broadcast|pipeline|daily-ops|reassign|balancr-sync/.test(j.path), j.path);
  }
});

console.log(`\n${n} passed`);
