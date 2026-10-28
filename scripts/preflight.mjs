// Usage: npm run preflight   (reads .env.local; prints names and status only, never values)
import { readFileSync, existsSync } from 'node:fs';
import { checkEnv } from '../lib/preflight.js';

const file = process.argv[2] || '.env.local';
if (!existsSync(file)) {
  console.log(`No ${file} found. Copy .env.example to ${file} and fill it in, then run this again.`);
  process.exit(1);
}
const env = {};
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { items, missingRequired } = checkEnv({ ...process.env, ...env });
let area = '';
for (const i of items) {
  if (i.area !== area) { area = i.area; console.log(`\n${area}`); }
  const mark = i.ok ? 'OK  ' : (i.required ? 'MISS' : 'skip');
  console.log(`  [${mark}] ${i.name}${i.ok ? '' : ` - ${i.note}`}`);
}
console.log(missingRequired
  ? `\n${missingRequired} required setting(s) missing. Fill them in, then run this again.`
  : '\nAll required settings are present. Next: sign in with a new test account and follow the live checks in COMMERCIAL_READINESS.md.');
process.exit(missingRequired ? 1 : 0);
