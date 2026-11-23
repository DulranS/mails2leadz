// A second CSV import used to be refused while the first import was still "running" (paused by the daily allowance or a timed-out step),
// and the first import's unread businesses were stranded. A paused import now carries on; an active search is still refused.
import assert from 'node:assert/strict';
import { startImport } from '../lib/server/lead-finder-job.js';
import { mapImportRows } from '../lib/lead-import.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };

const rowsFor = (names) => names.map((name) => ({ 'Business Name': name, Website: `https://${name.toLowerCase().replace(/\s+/g, '')}.example` }));

// Stub storage: `previous` is what the job store returns; the job startImport saves is kept in `saved`.
const store = (previous) => {
  const s = { saved: null };
  s.deps = { load: async () => previous, save: async (_uid, job) => { s.saved = job; }, markFinderUser: async () => {} };
  return s;
};

const pausedPrevious = () => ({
  status: 'running', source: 'import-list', candidates: mapImportRows(rowsFor(['Alpha Cafe', 'Bravo Store', 'Charlie Gym', 'Delta Print'])).candidates,
  cursor: 1, seen: [], usage: null,
});

await t('a paused import carries its unread businesses into the next import (none refused)', async () => {
  const s = store(pausedPrevious());
  const job = await startImport({}, 'u1', { label: 'Second file', rows: rowsFor(['Echo Tailors', 'Foxtrot Books']) }, { deps: s.deps });
  assert.equal(job, s.saved);
  assert.equal(job.status, 'running');
  assert.equal(job.source, 'import-list');
});

await t('the carried set is exactly the unread businesses plus the new ones (Alpha was read before the pause)', async () => {
  const s = store(pausedPrevious());
  const job = await startImport({}, 'u1', { label: 'Second file', rows: rowsFor(['Echo Tailors', 'Foxtrot Books']) }, { deps: s.deps });
  const names = job.candidates.map((c) => c.business_name).sort();
  assert.deepEqual(names, ['Bravo Store', 'Charlie Gym', 'Delta Print', 'Echo Tailors', 'Foxtrot Books'].sort());
});

await t('a search that is still running is still refused (a new queue would replace it)', async () => {
  const previous = { status: 'running', source: 'manual', candidates: mapImportRows(rowsFor(['Alpha Cafe', 'Bravo Store'])).candidates, cursor: 0, seen: [] };
  const s = store(previous);
  await assert.rejects(
    () => startImport({}, 'u1', { label: 'x', rows: rowsFor(['Echo Tailors']) }, { deps: s.deps }),
    (e) => e.code === 'JOB_RUNNING',
  );
});

await t('after a finished import, the same file again reports every business already imported (no refusal)', async () => {
  const done = mapImportRows(rowsFor(['Alpha Cafe', 'Bravo Store'])).candidates;
  const previous = { status: 'done', source: 'import-list', candidates: done, cursor: done.length, seen: done.map((c) => c.place_id), usage: null };
  const s = store(previous);
  const job = await startImport({}, 'u1', { label: 'Again', rows: rowsFor(['Alpha Cafe', 'Bravo Store']) }, { deps: s.deps });
  assert.equal(job.status, 'done');
  assert.equal(job.candidates.length, 0);
  assert.match(job.note, /already imported/);
});

await t('a carried import never queues more than the import limit in one job', async () => {
  const many = Array.from({ length: 600 }, (_, i) => ({ 'Business Name': `Shop ${i}`, Website: `https://shop${i}.example` }));
  const previous = { status: 'running', source: 'import-list', candidates: mapImportRows(many.slice(0, 500)).candidates, cursor: 0, seen: [], usage: null };
  const s = store(previous);
  const job = await startImport({}, 'u1', { label: 'Big', rows: many.slice(500) }, { deps: s.deps });
  assert.ok(job.candidates.length <= 500);
});

console.log(`import-resume: ${n} passed`);
