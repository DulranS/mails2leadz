// Scheduled jobs: vercel.json must be one of the two timetables. The daily one works on Vercel Hobby (the default); the hourly one
// needs Vercel Pro and is switched on with one command (npm run schedule:hourly). Nothing may run more often than its timetable says.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const current = read('vercel.json');
const daily = read('vercel.daily.json');
const hourly = read('vercel.hourly.json');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const SCHEDULE = /^\d{1,2} \d{1,2} \* \* \*$/;       // once a day, at a fixed time
const HOURLY = /^\d{1,2} \* \* \* \*$/;              // once an hour, at a fixed minute

t('vercel.json is exactly one of the two timetables (the default is the Hobby-safe daily one)', () => {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  assert.ok(same(current, daily) || same(current, hourly), 'vercel.json must match vercel.daily.json or vercel.hourly.json');
  assert.ok(same(current, daily), 'the committed default must be the daily timetable');
});

t('the daily timetable runs every job at most once a day', () => {
  for (const c of daily.crons) assert.match(c.schedule, SCHEDULE, `${c.path} must be daily, got "${c.schedule}"`);
  const byPath = Object.fromEntries(daily.crons.map((c) => [c.path, c.schedule]));
  assert.equal(byPath['/api/cron/broadcasts'], '15 9 * * *');
  assert.equal(byPath['/api/cron/reassign'], '40 5 * * *');
  assert.equal(byPath['/api/cron/pipeline'], '45 5 * * *');
});

t('the hourly timetable runs each job at most once an hour, at a fixed minute', () => {
  for (const c of hourly.crons) assert.ok(HOURLY.test(c.schedule) || SCHEDULE.test(c.schedule), `${c.path} must be hourly or daily at a fixed time, got "${c.schedule}"`);
  const byPath = Object.fromEntries(hourly.crons.map((c) => [c.path, c.schedule]));
  assert.equal(byPath['/api/cron/pipeline'], '5 * * * *');
  assert.equal(byPath['/api/cron/autosend'], '0 * * * *');
  assert.equal(byPath['/api/cron/daily-ops'], '30 5 * * *', 'invoices and the daily run stay once a day');
});

t('the two timetables cover the same jobs', () => {
  assert.deepEqual(daily.crons.map((c) => c.path).sort(), hourly.crons.map((c) => c.path).sort());
});

console.log(`\n${n} passed`);
