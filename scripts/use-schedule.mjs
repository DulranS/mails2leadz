#!/usr/bin/env node
// Switch the scheduled jobs between the timetables. "daily" works on Vercel Hobby (the default). "hourly" needs Vercel Pro.
// Usage: npm run schedule:daily   |   npm run schedule:hourly    (then redeploy)
import fs from 'node:fs';
const mode = process.argv[2];
if (!['daily', 'hourly'].includes(mode)) {
  console.error('Usage: node scripts/use-schedule.mjs daily|hourly');
  process.exit(1);
}
fs.copyFileSync(`vercel.${mode}.json`, 'vercel.json');
console.log(`vercel.json now uses the ${mode} timetable. Redeploy to apply. ${mode === 'hourly' ? 'Needs Vercel Pro.' : 'Works on Vercel Hobby.'}`);
