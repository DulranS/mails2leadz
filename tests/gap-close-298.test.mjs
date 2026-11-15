// Pass 298: one place for invoices (the top-level invoices collection). Older invoices are copied across once; readers and writers use that place.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { legacyToMove } from '../lib/invoice-store-rules.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = '2026-11-15T06:00:00.000Z';

t('a legacy invoice is copied with its id, stamped with the owner and when it moved', () => {
  const rows = [{ id: 'inv_a', number: 'INV-1', total: 80, userId: 'old' }];
  const out = legacyToMove(rows, new Set(), 'owner_1', NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'inv_a');
  assert.equal(out[0].data.userId, 'owner_1');
  assert.equal(out[0].data.number, 'INV-1');
  assert.equal(out[0].data.movedFromLegacyAt, NOW);
  assert.equal(out[0].data.id, undefined, 'the id is the document name, not a field');
});

t('an invoice already in the main collection is never overwritten', () => {
  const out = legacyToMove([{ id: 'inv_a' }, { id: 'inv_b' }], new Set(['inv_a']), 'owner_1', NOW);
  assert.deepEqual(out.map((x) => x.id), ['inv_b']);
});

t('bad rows are skipped, not copied', () => {
  assert.deepEqual(legacyToMove([null, {}, { id: '' }, undefined], new Set(), 'o', NOW), []);
  assert.deepEqual(legacyToMove(null, new Set(), 'o', NOW), []);
});

t('the migration uses only Firestore helpers the adapter exports', () => {
  const adapter = fs.readFileSync('lib/server-firestore.js', 'utf8');
  for (const name of ['collection', 'doc', 'getDoc', 'getDocs', 'setDoc', 'query', 'limit', 'where']) {
    assert.ok(new RegExp(`export (async )?(function|const) ${name}\\b|export \\{[^}]*\\b${name}\\b`).test(adapter), `adapter exports ${name}`);
  }
});

t('nothing reads or writes the old per-customer invoice path, except the one-time copy', () => {
  const hits = execSync("grep -rln \"'users', [^,)]*, 'invoices'\" app lib || true", { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  assert.deepEqual(hits, ['lib/server/invoice-store.js']);
});

t('automatic invoices are created in the main collection, tagged with the owner', () => {
  const src = fs.readFileSync('lib/server/automation-control.js', 'utf8');
  assert.ok(src.includes("addDoc(collection(db, 'invoices'), { ...built.write, userId: uid,"));
});

t('a stock draw or a Balancr update can only touch the owner\'s own invoice', () => {
  assert.ok(fs.readFileSync('app/api/stock/payment/route.js', 'utf8').includes('inv.userId !== who.uid'));
  assert.ok(fs.readFileSync('lib/server/balancr.js', 'utf8').includes('inv.userId !== uid'));
});

t('the daily job copies older invoices once, before it reads the invoices', () => {
  const src = fs.readFileSync('lib/server/daily-ops.js', 'utf8');
  const move = src.indexOf('moveLegacyInvoices(db, uid');
  const money = src.indexOf('// ---- money ----');
  assert.ok(move > 0 && money > move, 'the copy runs before the money section');
  assert.ok(src.includes('moveLegacyInvoices'));
});

console.log(`gap-close-298: ${n} checks passed`);
