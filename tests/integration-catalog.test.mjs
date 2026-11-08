// Every owner key has a place on the Integrations screen, and the screen shows nothing the server does not store (Pass 201).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATALOG_NAMES } from '../lib/integration-catalog.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const store = fs.readFileSync('lib/server/integration-secrets.js', 'utf8');
const serverNames = new Set();
for (const m of store.matchAll(/export const \w+ = \[([^\]]*)\]/g)) for (const x of m[1].match(/'([A-Z][A-Z0-9_]+)'/g) || []) serverNames.add(x.slice(1, -1));

t('every key the server stores can be entered on the Integrations screen', () => {
  const shown = new Set(CATALOG_NAMES);
  const missing = [...serverNames].filter((k) => !shown.has(k));
  assert.deepEqual(missing, [], 'keys with no place on the screen');
});

t('the screen lists no key the server does not store, and no key twice', () => {
  const extra = CATALOG_NAMES.filter((k) => !serverNames.has(k));
  assert.deepEqual(extra, []);
  assert.equal(new Set(CATALOG_NAMES).size, CATALOG_NAMES.length);
});

console.log(`\n${n} passed`);
