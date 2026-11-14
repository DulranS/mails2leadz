// No scheduled jobs (free plan): the timetables are empty, and the work runs when the owner opens the app.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

t('no timetable schedules any job, so nothing needs a paid plan', () => {
  for (const p of ['vercel.json', 'vercel.daily.json', 'vercel.hourly.json']) assert.deepEqual(read(p).crons, [], p);
});

console.log(`\n${n} passed`);
