import assert from 'node:assert/strict';
import { pickEmailsToCheck, REPLY_CHECK_BATCH } from '../lib/reply-sync.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-10-14T10:00:00Z');
const day = (d) => new Date(NOW - d * 86400000).toISOString();
const mk = (i, o = {}) => ({ id: `e${i}`, sentAt: day(1 + (i % 20)), ...o });

t('the old bug: with 200 unreplied emails, every call used to see the same 50. Now repeated calls cover all of them', () => {
  let items = Array.from({ length: 200 }, (_, i) => mk(i));
  const seen = new Set();
  for (let round = 0; round < 4; round++) {
    const { picked } = pickEmailsToCheck(items, NOW + round * 60000);
    assert.equal(picked.length, REPLY_CHECK_BATCH);
    for (const p of picked) seen.add(p.id);
    const stamp = new Date(NOW + round * 60000).toISOString();
    items = items.map((it) => (picked.some((p) => p.id === it.id) ? { ...it, replyCheckedAt: stamp } : it)); // what the route now writes
  }
  assert.equal(seen.size, 200);
});
t('never-checked first and newest first, so a reply to yesterday\'s email is found on the very next call', () => {
  const items = [mk(1, { id: 'old-checked', replyCheckedAt: day(0.5), sentAt: day(3) }), mk(2, { id: 'new-fresh', sentAt: day(0.1) }), mk(3, { id: 'older-fresh', sentAt: day(9) })];
  assert.deepEqual(pickEmailsToCheck(items, NOW, { max: 3 }).picked.map((p) => p.id), ['new-fresh', 'older-fresh', 'old-checked']);
});
t('among already-checked emails the one checked longest ago goes first', () => {
  const items = [mk(1, { id: 'b', replyCheckedAt: day(1) }), mk(2, { id: 'a', replyCheckedAt: day(5) }), mk(3, { id: 'c', replyCheckedAt: day(0.2) })];
  assert.deepEqual(pickEmailsToCheck(items, NOW, { max: 3 }).picked.map((p) => p.id), ['a', 'b', 'c']);
});
t('dead leads (older than the window) are skipped; unreadable dates are still checked, last', () => {
  const items = [mk(1, { id: 'dead', sentAt: day(90) }), mk(2, { id: 'live', sentAt: day(5) }), mk(3, { id: 'nodate', sentAt: undefined }), mk(4, { id: 'garbage', sentAt: 'not a date' })];
  const r = pickEmailsToCheck(items, NOW);
  assert.deepEqual(r.picked.map((p) => p.id), ['live', 'nodate', 'garbage']);
  assert.equal(r.eligible, 3);
});
t('reports how many are still waiting, and handles Firestore-style timestamps and empty input', () => {
  const items = Array.from({ length: 7 }, (_, i) => mk(i, { sentAt: { toMillis: () => NOW - (i + 1) * 3600000 } }));
  const r = pickEmailsToCheck(items, NOW, { max: 5 });
  assert.equal(r.picked.length, 5); assert.equal(r.waiting, 2);
  assert.equal(r.picked[0].id, 'e0'); // newest
  assert.deepEqual(pickEmailsToCheck([], NOW), { picked: [], eligible: 0, waiting: 0 });
  assert.deepEqual(pickEmailsToCheck(null, NOW), { picked: [], eligible: 0, waiting: 0 });
});
console.log(`\n${n} reply-check-order tests ok`);
