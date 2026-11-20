// Pass 343: the breach register (PDPA 2022 s.23 log). Pure rules, the states the owner is shown, and the wiring of the page and route.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { daysBetween, sanitizeBreach, breachState, breachAgeDays, breachesNeedingAttention, REVIEW_PROMPT_HOURS, DATA_AFFECTED } from '../lib/breach-register.js';
import { NAV_ITEMS, SHELL_ROUTES } from '../lib/app-routes.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };
const TODAY = '2026-11-20';

t('daysBetween counts calendar days and refuses non-dates', () => {
  assert.equal(daysBetween('2026-11-17', TODAY), 3);
  assert.equal(daysBetween(TODAY, TODAY), 0);
  assert.equal(daysBetween('2026-11-21', TODAY), -1);
  assert.equal(daysBetween('20-11-2026', TODAY), null);
  assert.equal(daysBetween('2026-13-01', TODAY), null);
  assert.equal(daysBetween(undefined, TODAY), null);
});

t('sanitizeBreach refuses a breach with no description', () => {
  assert.equal(sanitizeBreach({ title: 'x', description: '   ' }, { today: TODAY }), null);
});

t('sanitizeBreach keeps a valid breach and cleans it', () => {
  const b = sanitizeBreach({ title: '  Lost laptop  ', description: 'Laptop\nstolen\tfrom car', discoveredOn: '2026-11-18', dataAffected: 'yes', peopleAffected: '12', containment: 'Remote wipe sent' }, { today: TODAY });
  assert.equal(b.title, 'Lost laptop');
  assert.equal(b.description, 'Laptop stolen from car');
  assert.equal(b.discoveredOn, '2026-11-18');
  assert.equal(b.dataAffected, 'yes');
  assert.equal(b.peopleAffected, 12);
  assert.equal(b.status, 'open');
  assert.equal(b.closedOn, null);
  assert.equal(b.authorityNotifiedOn, null);
});

t('sanitizeBreach falls back to today, unknown data and an untitled name', () => {
  const b = sanitizeBreach({ description: 'Something', discoveredOn: 'nope', dataAffected: 'maybe', peopleAffected: '1.5' }, { today: TODAY });
  assert.equal(b.discoveredOn, TODAY);
  assert.equal(b.dataAffected, 'unknown');
  assert.equal(b.peopleAffected, null);
  assert.equal(b.title, 'Untitled breach');
});

t('sanitizeBreach refuses a negative or empty count and keeps zero', () => {
  assert.equal(sanitizeBreach({ description: 'x', peopleAffected: -1 }, { today: TODAY }).peopleAffected, null);
  assert.equal(sanitizeBreach({ description: 'x', peopleAffected: '' }, { today: TODAY }).peopleAffected, null);
  assert.equal(sanitizeBreach({ description: 'x', peopleAffected: '0' }, { today: TODAY }).peopleAffected, 0);
});

t('the data-affected choices are yes, no and unknown', () => {
  assert.deepEqual(DATA_AFFECTED, ['yes', 'no', 'unknown']);
});

t('breachAgeDays reports days since discovery', () => {
  assert.equal(breachAgeDays({ discoveredOn: '2026-11-17' }, TODAY), 3);
  assert.equal(breachAgeDays({}, TODAY), null);
});

t('a closed breach is closed, whatever else it says', () => {
  assert.equal(breachState({ status: 'closed', dataAffected: 'yes' }, TODAY), 'closed');
});

t('personal data affected and no Authority date: the owner must decide', () => {
  assert.equal(breachState({ status: 'open', dataAffected: 'yes', discoveredOn: TODAY }, TODAY), 'authority_decision');
  assert.equal(breachState({ status: 'open', dataAffected: 'unknown', discoveredOn: TODAY }, TODAY), 'authority_decision');
});

t('a recorded Authority date clears the decision prompt', () => {
  assert.equal(breachState({ status: 'open', dataAffected: 'yes', authorityNotifiedOn: '2026-11-19', discoveredOn: TODAY }, TODAY), 'open');
});

t('no personal data: no decision prompt', () => {
  assert.equal(breachState({ status: 'open', dataAffected: 'no', discoveredOn: TODAY }, TODAY), 'open');
});

t('still open after 72 hours: a review prompt, the threshold is REVIEW_PROMPT_HOURS', () => {
  assert.equal(REVIEW_PROMPT_HOURS, 72);
  assert.equal(breachState({ status: 'open', dataAffected: 'no', discoveredOn: '2026-11-17' }, TODAY), 'review');
  assert.equal(breachState({ status: 'open', dataAffected: 'no', discoveredOn: '2026-11-18' }, TODAY), 'open');
});

t('contained breaches are not put under review by age alone', () => {
  assert.equal(breachState({ status: 'contained', dataAffected: 'no', discoveredOn: '2026-11-01' }, TODAY), 'open');
});

t('attention order: decisions first, then reviews, then the rest, oldest first', () => {
  const list = [
    { title: 'a', status: 'open', dataAffected: 'no', discoveredOn: '2026-11-19' },
    { title: 'b', status: 'open', dataAffected: 'yes', discoveredOn: '2026-11-19' },
    { title: 'c', status: 'open', dataAffected: 'no', discoveredOn: '2026-11-10' },
    { title: 'd', status: 'closed', dataAffected: 'yes', discoveredOn: '2026-11-01' },
  ];
  assert.deepEqual(breachesNeedingAttention(list, TODAY).map((r) => r.title), ['b', 'c', 'a', 'd']);
});

t('the breach register is in the More menu and in the shell route list', () => {
  assert.ok(NAV_ITEMS.some((i) => i.href === '/breaches' && i.group === 'More'));
  assert.ok(SHELL_ROUTES.includes('/breaches'));
});

t('the page is present and uses the lib, the auth gate and the owner-only collection', () => {
  const src = fs.readFileSync(new URL('../app/breaches/page.js', import.meta.url), 'utf8');
  assert.ok(src.includes("from \"../../lib/breach-register.js\""));
  assert.ok(src.includes('"breach_register"'));
  assert.ok(src.includes('useAuthUser'));
  assert.ok(src.includes('Decide, with your adviser'));
});

console.log(`gap-close-343: ${n} checks passed`);
