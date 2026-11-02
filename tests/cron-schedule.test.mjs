// Vercel's Hobby plan allows daily cron jobs only (a job that runs more often fails the deploy). Every scheduled job must run at most once a day.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('every cron is a fixed time of day (minute and hour numbers, every day), so it runs at most once a day', () => {
  assert.ok(Array.isArray(cfg.crons) && cfg.crons.length > 0);
  for (const c of cfg.crons) {
    assert.match(c.schedule, /^\d{1,2} \d{1,2} \* \* \*$/, `${c.path} must be a daily schedule, got "${c.schedule}"`);
    const [min, hour] = c.schedule.split(' ').map(Number);
    assert.ok(min >= 0 && min <= 59 && hour >= 0 && hour <= 23, `${c.path} has a time out of range`);
  }
});

t('the newsletter and reassignment jobs are the ones moved to daily', () => {
  const byPath = Object.fromEntries(cfg.crons.map((c) => [c.path, c.schedule]));
  assert.equal(byPath['/api/cron/broadcasts'], '15 9 * * *');
  assert.equal(byPath['/api/cron/reassign'], '40 5 * * *');
});

console.log(`\n${n} passed`);
