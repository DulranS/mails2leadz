import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeKit, parsePackages, kitLines, packagesBlock, preemptLine, eligibleAngleIds, playbookStrength, KIT_LIMITS } from '../lib/sales-kit.js';
import { ANGLES, ANGLE_IDS, GATED_ANGLES, pickAngle, isAngleId } from '../lib/angles.js';
import { sanitizeEnquiry, sanitizeIntake, intakeToQualification, intakeFit, intakeLines, enquiryContext, INTAKE_OPTIONS } from '../lib/inbound.js';
import { SALES_GUARDRAILS } from '../lib/ai-client.js';
import { buildDealWrite } from '../lib/deal-utils.js';

const kit = (o = {}) => sanitizeKit(o, { validAngleIds: ANGLE_IDS });

test('offers: at most three, real prices, one highlighted only if the owner marked it', () => {
  const p = parsePackages('Starter | 15000 | 8 posts\nGrowth | 30000 | 16 posts and a report | best\nPartner | 60000 | all of it *\nExtra | 90000 | a fourth line');
  assert.equal(p.length, 3);
  assert.deepEqual(p.map((x) => x.name), ['Starter', 'Growth', 'Partner']);
  assert.deepEqual(p.map((x) => x.recommended), [false, true, false]); // only the first one marked is highlighted
  assert.equal(parsePackages('Basic | 100 | x\nPro | 200 | y').some((x) => x.recommended), false);   // never chosen for the owner
  assert.deepEqual(parsePackages('just words\nNo price |\n | 5 | x'), []);
  assert.equal(parsePackages('A very long package name that goes on and on and on forever | 5').length, 1);
  assert.equal(parsePackages('Starter | 15000').pop().includes, '');
});

test('the levers are cleaned, limited, and appear in the AI profile only when typed', () => {
  const k = kit({ guarantee: ' Full refund   in 14 days ', firstStep: 'x'.repeat(500), costOfInaction: '', packagesText: 'Basic | 1 | x\nPro | 2 | y | best', intakeQuestions: true });
  assert.equal(k.guarantee, 'Full refund in 14 days');
  assert.equal(k.firstStep.length, KIT_LIMITS.line);
  assert.equal(k.packages.length, 2);
  assert.equal(k.intake, true);
  assert.equal(kit({}).intake, false);
  const lines = kitLines(k).join('\n');
  assert.match(lines, /smallest first step/);
  assert.match(lines, /Full refund in 14 days/);
  assert.match(lines, /never turn it into a promise of results/);
  assert.doesNotMatch(lines, /costs the buyer/);        // not typed, not mentioned
  assert.doesNotMatch(lines, /availability/i);
  const all = kitLines(kit({ availability: 'Two places left for November', honestLimit: 'We are a small team' })).join('\n');
  assert.match(all, /ONLY scarcity or deadline you may mention; never invent any/);
  assert.match(all, /small team/);
});

test('packages for proposals say present only these, with the highlighted one', () => {
  const b = packagesBlock(kit({ packagesText: 'Starter | 15000 | 8 posts\nGrowth | 30000 | 16 posts | best' }));
  assert.match(b, /Present only these \(at most 2\)/);
  assert.match(b, /Growth: 30000\. Includes: 16 posts \[the sender recommends this one: highlight it as the best value\]/);
  assert.match(b, /invent no other option, price, discount or original price/);
  assert.equal(packagesBlock(kit({})), '');
});

test('the first email pre-empts the likeliest worry with the owner\'s own answer', () => {
  const k = kit({ objectionsText: 'It is too expensive = We start with a small fixed-price pilot\nWe already have someone = Fine: we complement them' });
  const l = preemptLine(k);
  assert.match(l, /ONE short sentence/);
  assert.match(l, /too expensive/);
  assert.match(l, /small fixed-price pilot/);
  assert.doesNotMatch(l, /already have someone/);       // only the first one
  assert.equal(preemptLine(kit({})), '');
});

test('lever angles only run once the real material exists, and the rotation stays fair', () => {
  assert.ok(['lose_by_waiting', 'proof_peers', 'before_after'].every((id) => isAngleId(id) && GATED_ANGLES[id]));
  assert.equal(ANGLES.filter((a) => a.gated).length, 3);
  assert.deepEqual(eligibleAngleIds(kit({}), ANGLE_IDS, GATED_ANGLES).filter((id) => GATED_ANGLES[id]), []);
  const rich = eligibleAngleIds(kit({ costOfInaction: 'x', beforeAfter: 'y', proofText: 'Helped 12 cafes cut no-shows by a third' }), ANGLE_IDS, GATED_ANGLES);
  assert.ok(['lose_by_waiting', 'before_after', 'proof_peers'].every((id) => rich.includes(id)));
  assert.deepEqual(eligibleAngleIds(kit({ beforeAfter: 'y' }), ANGLE_IDS, GATED_ANGLES).filter((id) => GATED_ANGLES[id]), ['before_after']);
  // a bare rotation with no pool is the old six, never the gated ones
  const base = eligibleAngleIds(kit({}), ANGLE_IDS, GATED_ANGLES);
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(pickAngle({ uid: 'u', email: `lead${i}@x.com`, pool: base }));
  assert.equal(seen.size, base.length);
  assert.ok([...seen].every((id) => !GATED_ANGLES[id]));
  // the same lead always gets the same angle; a lean angle outside the pool is ignored
  assert.equal(pickAngle({ uid: 'u', email: 'a@x.com', pool: base }), pickAngle({ uid: 'u', email: 'a@x.com', pool: base }));
  assert.ok(base.includes(pickAngle({ uid: 'u', email: 'a@x.com', leanAngle: 'before_after', pool: base })));
});

test('the guardrail forbids invented scarcity, discounts, deadlines, reviews and original prices', () => {
  assert.match(SALES_GUARDRAILS, /no invented scarcity, discounts, deadlines, reviews or original prices/);
  assert.match(SALES_GUARDRAILS, /listed by the sender below is a real policy or fact/);
});

test('the playbook meter says what is missing and why, without scoring up fake claims', () => {
  const empty = playbookStrength(kit({}));
  assert.deepEqual([empty.done, empty.total], [0, 10]);
  assert.equal(empty.next.length, 2);
  assert.ok(empty.next.every((n) => n.why.length > 20));
  const full = playbookStrength(kit({ bookingLink: 'https://cal.com/a', firstStep: 'a', proofText: 'Helped 12 cafes cut no-shows by a third', guarantee: 'g', objectionsText: 'It is too expensive = We start with a small fixed-price pilot', costOfInaction: 'c', beforeAfter: 'b', honestLimit: 'h', packagesText: 'Basic | 1 | x\nPro | 2 | y', availability: 'two left' }));
  assert.deepEqual([full.done, full.next.length], [10, 0]);
  assert.equal(playbookStrength(kit({ packagesText: 'Basic | 1 | x' })).items.find((i) => i.id === 'packages').ok, false); // one offer is not a choice
});

test('intake answers: only known options, mapped to the deal qualification honestly', () => {
  assert.equal(sanitizeIntake({}), null);
  assert.deepEqual(sanitizeIntake({ budget: 'yes', authority: 'hack', timeline: 'soon' }), { budget: 'yes', timeline: 'soon' });
  const q = intakeToQualification({ budget: 'no', authority: 'shared', timeline: 'later' });
  assert.deepEqual(q, { budget: 'no', authority: 'unknown', need: 'unknown', timeline: 'no' });
  assert.deepEqual(intakeToQualification({ budget: 'yes', authority: 'yes', timeline: 'now' }), { budget: 'yes', authority: 'yes', need: 'unknown', timeline: 'yes' });
  assert.deepEqual(intakeToQualification(null), { budget: 'unknown', authority: 'unknown', need: 'unknown', timeline: 'unknown' });
});

test('fit: no budget or not ready means a light, warm reply; a ready buyer gets a quick next step', () => {
  assert.equal(intakeFit(null).level, 'unknown');
  const light = intakeFit({ budget: 'no', authority: 'yes', timeline: 'now' });
  assert.equal(light.level, 'light');
  assert.match(light.note, /no budget yet/);
  assert.match(light.note, /do not push for a sale/);
  assert.equal(intakeFit({ budget: 'yes', authority: 'yes', timeline: 'later' }).level, 'light');
  assert.equal(intakeFit({ budget: 'yes', authority: 'no', timeline: 'soon' }).level, 'mixed');
  assert.equal(intakeFit({ budget: 'yes', authority: 'yes', timeline: 'soon' }).level, 'ready');
  assert.equal(intakeLines({ budget: 'yes', timeline: 'soon' }).length, 2);
  assert.match(intakeLines({ budget: 'yes' })[0], /Do you have a budget set aside for this\? Yes, there is a budget/);
  assert.ok(Object.keys(INTAKE_OPTIONS).every((k) => INTAKE_OPTIONS[k].length === 3));
});

test('the enquiry carries the answers through, and the owner sees them with the message', () => {
  const r = sanitizeEnquiry({ email: 'a@b.co', name: 'Nimal', message: 'We need help with our posts', budget: 'yes', authority: 'yes', timeline: 'soon' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.enquiry.intake, { budget: 'yes', authority: 'yes', timeline: 'soon' });
  assert.match(enquiryContext(r.enquiry), /Said: .*budget/);
  const plain = sanitizeEnquiry({ email: 'a@b.co', name: 'Nimal', message: 'Hello' });
  assert.equal('intake' in plain.enquiry, false);
  assert.doesNotMatch(enquiryContext(plain.enquiry), /Said:/);
  const write = buildDealWrite({ uid: 'u', email: 'a@b.co', stage: 'new', source: 'inbound', qualification: { ...intakeToQualification(r.enquiry.intake) } });
  assert.equal(write.qualification.budget, 'yes');
});
