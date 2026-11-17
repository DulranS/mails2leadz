// Pass 298 (rewritten in Pass 317): one place for invoices, the top-level invoices collection. Nothing reads the old per-customer path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('nothing reads or writes the old per-customer invoice path', () => {
  const hits = execSync("grep -rln \"'users', [^,)]*, 'invoices'\" app lib || true", { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  assert.deepEqual(hits, []);
});

t('automatic invoices are created in the main collection, tagged with the owner', () => {
  const src = fs.readFileSync('lib/server/automation-control.js', 'utf8');
  assert.ok(src.includes("addDoc(collection(db, 'invoices'), { ...built.write, userId: uid,"));
});

t('a stock draw or a Balancr update can only touch the owner\'s own invoice', () => {
  assert.ok(fs.readFileSync('app/api/stock/payment/route.js', 'utf8').includes('inv.userId !== who.uid'));
  assert.ok(fs.readFileSync('lib/server/balancr.js', 'utf8').includes('inv.userId !== uid'));
});

t('billing reads invoices from the main collection', () => {
  const src = fs.readFileSync('lib/client-data.js', 'utf8');
  assert.ok(src.includes("collection(db, 'invoices'), where('userId', '==', uid)"));
});

console.log(`gap-close-298: ${n} checks passed`);
