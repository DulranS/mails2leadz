import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWhyChosen, computeAwayCheck, winReasonLabel, WIN_REASON_IDS } from '../lib/independence.js';
import { sanitizeSops, computeSopCoverage, starterSops, isHanded, PROCESSES } from '../lib/sops.js';
import { buildDealWrite } from '../lib/deal-utils.js';

const won = (winReason) => ({ stage: 'closed_won', winReason });

test('why customers chose you: nothing is claimed with too little data', () => {
  assert.match(computeWhyChosen([]).verdict, /first win/);
  const few = computeWhyChosen([won('price'), won('trust'), won('')]);
  assert.equal(few.enough, false);
  assert.equal(few.recorded, 2);
  assert.equal(few.missing, 1);
  assert.match(few.verdict, /2 of 3 done/);
});

test('winning mostly on price is called out; sticky reasons are recognised', () => {
  const price = computeWhyChosen([won('price'), won('price'), won('price'), won('quality'), won('trust')]);
  assert.equal(price.pricePct, 60);
  assert.match(price.verdict, /undercut/);
  const sticky = computeWhyChosen([won('convenience'), won('only_option'), won('identity'), won('trust'), won('price')]);
  assert.equal(sticky.stickyPct, 80);
  assert.match(sticky.verdict, /hard to copy/);
  assert.equal(computeWhyChosen([{ stage: 'closed_lost', winReason: 'price' }]).recorded, 0);
  assert.equal(computeWhyChosen([won('nonsense')]).recorded, 0);
  assert.ok(winReasonLabel('convenience'));
  assert.equal(winReasonLabel('zzz'), '');
});

test('sops: sanitised, and only a documented step list that someone else owns counts as handed over', () => {
  const list = sanitizeSops([
    { title: '  Billing  ', process: 'billing', owner: 'team', steps: ['a real step one', 'two two', 'three three', ''] },
    { title: '', steps: ['x'] }, null, 'junk',
    { title: 'Thin', process: 'nope', owner: 'robot', steps: ['only one'] },
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0].steps.length, 3);
  assert.equal(list[1].process, 'delivery');
  assert.equal(list[1].owner, 'me');
  assert.equal(isHanded(list[0]), true);
  assert.equal(isHanded({ ...list[0], owner: 'me' }), false);
  assert.equal(isHanded(list[1]), false);
  const cov = computeSopCoverage(list);
  assert.equal(cov.byProcess.billing.handed, true);
  assert.equal(cov.byProcess.delivery.documented, false);
  assert.equal(cov.handedProcesses, 1);
  assert.equal(starterSops().length, PROCESSES.length);
  assert.ok(starterSops().every((s) => s.steps.length >= 3 && s.owner === 'me'));
});

test('absence check: a one-person business with nothing written down is a job; automation and handover change it', () => {
  const bare = computeAwayCheck({ waiting: 2, overdueCount: 1 });
  assert.equal(bare.needsYou, 6);
  assert.match(bare.verdict, /still a job/);
  assert.match(bare.rows.find((r) => r.id === 'sales').detail, /2 reply or enquiry waiting/);
  const covered = computeSopCoverage(starterSops().map((s) => ({ ...s, owner: 'team' })));
  const run = computeAwayCheck({ autopilotOn: true, coverage: covered });
  assert.equal(run.needsYou, 0);
  assert.equal(run.rows.find((r) => r.id === 'outreach').state, 'runs');
  assert.match(run.verdict, /mostly runs/);
  const some = computeAwayCheck({ autopilotOn: true, coverage: computeSopCoverage([{ ...starterSops()[1], owner: 'team' }, { ...starterSops()[4], owner: 'team' }]) });
  assert.equal(some.needsYou, 3);
  assert.match(some.verdict, /partly/);
});

test('scale figures: per person, only with real numbers', () => {
  const a = computeAwayCheck({ people: 2, customers: 9, revenue90: 6000 });
  assert.equal(a.customersPerPerson, 4.5);
  assert.equal(a.revenuePerPerson90, 3000);
  const b = computeAwayCheck({});
  assert.equal(b.customersPerPerson, null);
  assert.equal(b.revenuePerPerson90, null);
  assert.equal(b.people, 1);
});

test('deal write keeps only a known win reason', () => {
  const base = { uid: 'u', email: 'a@x.com', stage: 'closed_won' };
  assert.equal(buildDealWrite({ ...base, winReason: 'convenience' }).winReason, 'convenience');
  assert.equal(buildDealWrite({ ...base, winReason: 'bogus' }).winReason, null);
  assert.equal(buildDealWrite({ ...base, winReason: '' }).winReason, null);
  assert.equal('winReason' in buildDealWrite(base), false);
  assert.ok(WIN_REASON_IDS.includes('only_option'));
});
