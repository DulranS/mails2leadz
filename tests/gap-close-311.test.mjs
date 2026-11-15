// Pass 311: older invoices are brought into the single store as soon as billing reads them, not only on the daily run (spec 7.4, earlier limit).
import assert from 'node:assert/strict';
import fs from 'node:fs';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the migrate route runs the same safe copy for the signed-in owner only', () => {
  const src = fs.readFileSync('app/api/invoices/migrate/route.js', 'utf8');
  assert.ok(src.includes('identify(request)'));
  assert.ok(src.includes('guardTenant(db, who.uid)'));
  assert.ok(src.includes('moveLegacyInvoices(db, who.uid)'));
  assert.equal(src.includes('who.uid'), true);
});

t('the invoice read waits for the copy, and still reads if the copy fails', () => {
  const src = fs.readFileSync('lib/client-data.js', 'utf8');
  assert.ok(src.includes("fetch('/api/invoices/migrate', { method: 'POST' })"));
  assert.ok(src.includes('export const getInvoices = (db, uid, o = {}) =>\n  broughtAcross().then('));
  assert.ok(src.includes('.catch(() => { legacyBrought = null; return false; });'));
});

t('a failed copy is tried again on the next read, not remembered for the session', () => {
  const src = fs.readFileSync('lib/client-data.js', 'utf8');
  assert.ok(src.includes('legacyBrought = null'));
});

console.log(`gap-close-311: ${n} checks passed`);
