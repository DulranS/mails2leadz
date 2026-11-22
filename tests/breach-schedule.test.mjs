// v350: the DPA draft's Schedule I fields on a breach record (lib/breach-register.js). Pure. Run: node --test tests/breach-schedule.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBreach, missingSchedule1, riskAdvice, optionalCount, RISK_LEVELS } from '../lib/breach-register.js';

const base = { description: 'A laptop with customer names was stolen from a car.', discoveredOn: '2026-11-20', today: '2026-11-22' };

test('the new fields are kept, with blanks as null or unknown', () => {
  const b = sanitizeBreach({ ...base, dataCategories: 'names, phone numbers', recordsAffected: '120', likelyConsequences: 'phishing calls', riskLevel: 'high', dpoContact: 'owner@example.com', certifiedBy: 'Owner', certifiedOn: '2026-11-22' }, { today: '2026-11-22' });
  assert.equal(b.dataCategories, 'names, phone numbers');
  assert.equal(b.recordsAffected, 120);
  assert.equal(b.likelyConsequences, 'phishing calls');
  assert.equal(b.riskLevel, 'high');
  assert.equal(b.certifiedOn, '2026-11-22');
});

test('a risk decision outside low, high or unknown is stored as unknown', () => {
  assert.equal(sanitizeBreach({ ...base, riskLevel: 'medium' }, { today: '2026-11-22' }).riskLevel, 'unknown');
  assert.equal(sanitizeBreach({ ...base }, { today: '2026-11-22' }).riskLevel, 'unknown');
});

test('records affected is a whole number or null, never 0 for a blank', () => {
  assert.equal(optionalCount(''), null);
  assert.equal(optionalCount(undefined), null);
  assert.equal(optionalCount('12.5'), null);
  assert.equal(optionalCount('-3'), null);
  assert.equal(optionalCount('0'), 0);
  assert.equal(optionalCount('7'), 7);
});

test('a new record lists every Schedule I item as blank', () => {
  const b = sanitizeBreach({ ...base }, { today: '2026-11-22' });
  const missing = missingSchedule1(b);
  for (const label of ['Categories of personal data', 'Number of records affected', 'Likely consequences', 'Risk decision', 'Measures taken', 'Contact for the Authority', 'Certified by']) {
    assert.ok(missing.includes(label), `expected "${label}" to be listed as blank`);
  }
  assert.ok(!missing.includes('What happened'), 'the description is filled, so it is not blank');
});

test('a complete record lists nothing as blank', () => {
  const b = sanitizeBreach({
    ...base,
    peopleAffected: '30',
    containment: 'Remote wipe done',
    dataCategories: 'names',
    recordsAffected: '30',
    likelyConsequences: 'spam',
    riskLevel: 'low',
    dpoContact: 'owner',
    certifiedBy: 'Owner',
  }, { today: '2026-11-22' });
  assert.deepEqual(missingSchedule1(b), []);
});

test('an unknown risk decision still counts as blank even if other fields are filled', () => {
  const b = sanitizeBreach({ ...base, peopleAffected: '3', containment: 'x', dataCategories: 'names', recordsAffected: '3', likelyConsequences: 'x', dpoContact: 'x', certifiedBy: 'x' }, { today: '2026-11-22' });
  assert.deepEqual(missingSchedule1(b), ['Risk decision']);
});

test('older records without the new fields read as blank, not as errors', () => {
  const old = { description: 'old', discoveredAt: '2026-01-01T00:00:00.000Z', containment: '', peopleAffected: 5 };
  const missing = missingSchedule1(old);
  assert.ok(missing.includes('Categories of personal data'));
  assert.ok(missing.includes('Risk decision'));
});

test('the risk advice follows the draft rules, in plain words', () => {
  assert.match(riskAdvice({ riskLevel: 'low' }), /not needed when a breach is unlikely to result in a risk/);
  assert.match(riskAdvice({ riskLevel: 'high' }), /at the same time as the Authority notice/);
  assert.match(riskAdvice({ riskLevel: 'unknown' }), /Decide the risk before the Authority deadline/);
  assert.deepEqual(RISK_LEVELS, ['low', 'high', 'unknown']);
});
