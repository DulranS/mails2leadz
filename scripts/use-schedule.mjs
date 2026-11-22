#!/usr/bin/env node
// Switch the scheduled jobs between the timetables. "daily" works on Vercel Hobby. "hourly" needs Vercel Pro.
// The daily timetable runs the reply check and the draft preparation, which never send e-mail (pass 364). The hourly timetable is empty until
// it has entries. A timetable with no jobs is refused here, so the switch can never silently remove scheduling that was set up.
// Usage: npm run schedule:daily   |   npm run schedule:hourly    (then redeploy)
import fs from 'node:fs';
const mode = process.argv[2];
if (!['daily', 'hourly'].includes(mode)) {
  console.error('Usage: node scripts/use-schedule.mjs daily|hourly');
  process.exit(1);
}
const timetable = JSON.parse(fs.readFileSync(`vercel.${mode}.json`, 'utf8'));
if (!Array.isArray(timetable.crons) || timetable.crons.length === 0) {
  console.error(`vercel.${mode}.json has no jobs yet, so nothing was changed. Add the job entries to that file first (path and schedule for each job), then run this again.`);
  process.exit(1);
}
fs.copyFileSync(`vercel.${mode}.json`, 'vercel.json');
console.log(`vercel.json now uses the ${mode} timetable. Redeploy to apply. ${mode === 'hourly' ? 'Needs Vercel Pro.' : 'Works on Vercel Hobby.'}`);
