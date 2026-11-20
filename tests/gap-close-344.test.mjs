// Pass 344: CVs for candidate profiles. Cleaning, the save and removal rule, the approach gate, retention, and erasure and export reach.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeCv, cvPatch, sanitizeCandidate, canApproach, cvPastRetention, CV_MAX } from '../lib/candidates.js';
import { SCAN_SUBCOLLECTIONS, holdsEmail } from '../lib/erase-contact.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };
const NOW = new Date('2026-11-20T08:00:00Z');

t('sanitizeCv keeps line breaks and removes control characters and runs of spaces', () => {
  const cv = sanitizeCv('Jane Doe\r\n\r\n\r\n\r\nSkills:\u0007  Next.js\t\tAWS\n');
  assert.equal(cv, 'Jane Doe\n\nSkills: Next.js AWS');
});

t('sanitizeCv caps the text at CV_MAX characters and treats nothing as empty', () => {
  assert.equal(sanitizeCv('a'.repeat(CV_MAX + 500)).length, CV_MAX);
  assert.equal(sanitizeCv('   \n  '), '');
  assert.equal(sanitizeCv(undefined), '');
});

t('cvPatch saves the text with the time it was added', () => {
  const p = cvPatch('Jane Doe, engineer', NOW, 'jane@example.com');
  assert.equal(p.cv, 'Jane Doe, engineer');
  assert.equal(p.cvAddedAt, NOW.toISOString());
});

t('cvPatch with empty text removes the CV', () => {
  assert.deepEqual(cvPatch('   ', NOW), { cv: '', cvAddedAt: null });
});

t('a new profile has no CV until one is added', () => {
  const p = sanitizeCandidate({ name: 'Jane Doe', email: 'jane@example.com' }, { now: NOW });
  assert.equal(p.cv, '');
  assert.equal(p.cvAddedAt, null);
});

t('a profile with no name is still refused', () => {
  assert.equal(sanitizeCandidate({ name: '  ' }, { now: NOW }), null);
});

t('approach is allowed only when the owner recorded agreement and when', () => {
  assert.equal(canApproach({ consentToContact: true, consentAt: NOW.toISOString() }), true);
  assert.equal(canApproach({ consentToContact: true, consentAt: null }), false);
  assert.equal(canApproach({ consentToContact: false, consentAt: NOW.toISOString() }), false);
  assert.equal(canApproach({}), false);
  assert.equal(canApproach(undefined), false);
});

t('a CV past the retention date is flagged only while the CV is held', () => {
  const past = { cv: 'x', retainUntil: '2026-10-01T00:00:00.000Z' };
  assert.equal(cvPastRetention(past, NOW), true);
  assert.equal(cvPastRetention({ ...past, cv: '' }, NOW), false);
  assert.equal(cvPastRetention({ cv: 'x', retainUntil: '2027-01-01T00:00:00.000Z' }, NOW), false);
});

t('erasure and export reach the candidates subcollection', () => {
  assert.ok(SCAN_SUBCOLLECTIONS.includes('candidates'));
});

t('a candidate profile holding the person\'s email matches the erase scan, so its CV goes with it', () => {
  const profile = sanitizeCandidate({ name: 'Jane Doe', email: 'jane@example.com', consentToContact: true }, { now: NOW });
  profile.cv = 'Jane Doe, CV text';
  assert.equal(holdsEmail(profile, 'Jane@Example.com'), true);
});

t('the CV page can add, save, remove and flag CVs, and it keeps the owner-only collection', () => {
  const src = fs.readFileSync(new URL('../app/candidates/page.js', import.meta.url), 'utf8');
  assert.ok(src.includes('cvPatch(text'));
  assert.ok(src.includes('Save CV'));
  assert.ok(src.includes('Remove CV'));
  assert.ok(src.includes('CV past retention'));
  assert.ok(src.includes('canApproach(r)'));
  assert.ok(src.includes('"candidates"'));
  assert.ok(src.includes('is included in any access request or erasure'));
});

console.log(`gap-close-344: ${n} checks passed`);
