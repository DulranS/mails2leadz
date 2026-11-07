// Efficiency (Pass 184): the composite indexes the narrowed daily queries need are declared in the repo.
import assert from 'node:assert/strict';
import fs from 'node:fs';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
t('the index file lists the owner-and-stage index the daily deal queries need', () => {
  const idx = JSON.parse(fs.readFileSync('firestore.indexes.json', 'utf8'));
  const deals = idx.indexes.find((i) => i.collectionGroup === 'deals');
  assert.deepEqual(deals.fields.map((f) => f.fieldPath), ['userId', 'stage']);
  assert.equal(JSON.parse(fs.readFileSync('firebase.json', 'utf8')).firestore.indexes, 'firestore.indexes.json');
});
console.log(`\n${n} passed`);
