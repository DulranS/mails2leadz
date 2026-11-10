// Quick links (Pass 219): every outside tool is a real secure link; the palette search finds by label or group.
import assert from 'node:assert/strict';
import { EXTERNAL_LINKS, INTERNAL_LINKS, searchLinks } from '../lib/quick-links.js';
import fs from 'node:fs';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('every outside tool is a secure address, with a unique id and a group', () => {
  const ids = new Set();
  for (const l of EXTERNAL_LINKS) {
    assert.match(l.url, /^https:\/\//, l.id);
    assert.ok(l.label && l.group, l.id);
    assert.ok(!ids.has(l.id), `duplicate ${l.id}`);
    ids.add(l.id);
  }
});

t('every screen the palette links to exists in the app', () => {
  for (const l of INTERNAL_LINKS) {
    const dir = l.url.replace(/^\//, '');
    assert.ok(fs.existsSync(`app/${dir}/page.js`), `missing screen ${l.url}`);
  }
});

t('search finds a tool by a word in its label or group, and every word must match', () => {
  assert.ok(searchLinks('stripe').some((l) => l.id === 'stripe'));
  assert.ok(searchLinks('ads').some((l) => l.id === 'google-ads'));
  assert.equal(searchLinks('stripe zzzz').length, 0);
  assert.equal(searchLinks('').length, INTERNAL_LINKS.length + EXTERNAL_LINKS.length);
});

console.log(`\n${n} passed`);
