import assert from 'node:assert/strict';
import { WORKER_SEARCH_TERMS, cleanLocation, searchCommand, addCommand, validateTargets } from '../lib/worker-categories.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('vocabulary is unique, lowercase and non-empty', () => {
  assert.equal(new Set(WORKER_SEARCH_TERMS).size, WORKER_SEARCH_TERMS.length);
  assert.ok(WORKER_SEARCH_TERMS.length >= 60);
  assert.ok(WORKER_SEARCH_TERMS.every((x) => x === x.toLowerCase() && x.length >= 2));
});
t('location text cannot smuggle shell characters into the copy-paste command', () => {
  assert.equal(cleanLocation('Colombo, Sri Lanka'), 'Colombo, Sri Lanka');
  assert.equal(cleanLocation('Leeds"; rm -rf / #$(x)`'), 'Leeds rm -rf x');
  assert.equal(cleanLocation('São Paulo, Brasil'), 'São Paulo, Brasil');
  assert.equal(cleanLocation(null), '');
  assert.ok(cleanLocation('x'.repeat(500)).length <= 80);
});
t('search command is the documented worker syntax', () => {
  assert.equal(searchCommand('plumber', 'Colombo, Sri Lanka'), 'python autoleads_worker.py find -q "plumber" --location "Colombo, Sri Lanka"');
  assert.equal(searchCommand('dentist', ''), 'python autoleads_worker.py find -q "dentist"');
});
t('AI answer: unknown terms, duplicates, junk and instructions are dropped; capped; text clipped', () => {
  const r = validateTargets({
    customerProfile: '  A small clinic\nowner  ',
    targets: [
      { term: 'Dentist', why: 'They lose patients to no-shows.' },
      { term: 'dentist', why: 'dup' },
      { term: 'hedge fund', why: 'not in the vocabulary' },
      { term: 'plumber; rm -rf /', why: 'injection attempt' },
      null, 42, { why: 'no term' },
      { term: 'salon', why: 'x'.repeat(1000) },
      { term: 'gym' }, { term: 'cafe' }, { term: 'bakery' }, { term: 'florist' }, { term: 'yoga' },
    ],
  }, 'Leeds, UK');
  assert.deepEqual(r.targets.map((x) => x.term), ['dentist', 'salon', 'gym', 'cafe', 'bakery', 'florist']);
  assert.equal(r.customerProfile, 'A small clinic owner');
  assert.ok(r.targets[1].why.length <= 220);
  assert.equal(r.targets[0].command, 'python autoleads_worker.py find -q "dentist" --location "Leeds, UK"');
});
t('daily-routine command: documented syntax, needs a place, only real search words', () => {
  assert.equal(addCommand(['dentist', 'optician'], 'Leeds, UK'), 'python autoleads_worker.py add -q "dentist, optician" --location "Leeds, UK"');
  assert.equal(addCommand('dentist', 'Leeds, UK'), 'python autoleads_worker.py add -q "dentist" --location "Leeds, UK"');
  assert.equal(addCommand(['dentist'], ''), '');                       // the worker would refuse it, so none is offered
  assert.equal(addCommand(['hedge fund', 'dentist; rm -rf /'], 'Leeds'), '');
  assert.equal(addCommand(['dentist', 'hedge fund'], 'Leeds'), 'python autoleads_worker.py add -q "dentist" --location "Leeds"');
  const r = validateTargets({ targets: [{ term: 'dentist', why: 'a' }, { term: 'salon', why: 'b' }] }, 'Leeds, UK');
  assert.equal(r.targets[0].addCommand, 'python autoleads_worker.py add -q "dentist" --location "Leeds, UK"');
  assert.equal(r.addAllCommand, 'python autoleads_worker.py add -q "dentist, salon" --location "Leeds, UK"');
  assert.equal(validateTargets({ targets: [{ term: 'dentist' }] }, '').addAllCommand, '');
});
t('garbage in, nothing out (never throws)', () => {
  for (const bad of [null, undefined, 'x', {}, { targets: 'nope' }, { targets: [] }]) assert.deepEqual(validateTargets(bad).targets, []);
});
console.log(`\n${n} worker-categories tests ok`);
