#!/usr/bin/env node
// npm run setup:status - prints which optional features are on, partly set, or off, and the keys each one still needs.
import { featureStatus } from '../lib/setup-status.js';
const rows = featureStatus(process.env);
for (const r of rows) {
  const tag = r.status === 'on' ? 'ON     ' : r.status === 'partial' ? 'PARTIAL' : 'OFF    ';
  console.log(`${tag} ${r.label}${r.missing.length ? `  (needs: ${r.missing.join(', ')})` : ''}`);
}
const on = rows.filter((r) => r.status === 'on').length;
console.log(`\n${on} of ${rows.length} optional features are on. Features are off until their keys are set; nothing else is needed.`);
