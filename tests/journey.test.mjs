// Journeys (Pass 214): steps read safely; a step is due only after its wait; a reply stops the journey; due steps are listed, never sent by the module.
import assert from 'node:assert/strict';
import { parseJourney, dueStep, journeyActions } from '../lib/journey.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000, now = Date.parse('2026-11-06T12:00:00Z');
const journey = { id: 'j1', name: 'Welcome', steps: [{ waitDays: 0, channel: 'email', text: 'Thanks for getting in touch.' }, { waitDays: 3, channel: 'email', text: 'Did you get a chance to look?' }] };

t('steps are read from lines; bad ones are skipped and counted; eight at most', () => {
  const r = parseJourney('0 | email | Hello there friend\nx | email | bad wait\n3 | fax | wrong channel\n5 | sms | Quick check-in');
  assert.equal(r.steps.length, 2);
  assert.equal(r.skipped, 2);
  assert.equal(parseJourney(Array(12).fill('1 | email | Message here').join('\n')).steps.length, 8);
});

t('the first step is due at once; the next waits its days', () => {
  const e = { journeyId: 'j1', stepIndex: 0, enrolledAt: new Date(now).toISOString() };
  assert.equal(dueStep(e, journey, now).stepIndex, 0);
  const second = { journeyId: 'j1', stepIndex: 1, lastStepAt: new Date(now - 2 * DAY).toISOString() };
  assert.equal(dueStep(second, journey, now), null, 'two of three days waited');
  assert.equal(dueStep({ ...second, lastStepAt: new Date(now - 4 * DAY).toISOString() }, journey, now).stepIndex, 1);
});

t('a reply stops the journey for that person, and a finished journey has nothing due', () => {
  assert.equal(dueStep({ journeyId: 'j1', stepIndex: 0, replied: true, enrolledAt: new Date(now).toISOString() }, journey, now), null);
  assert.equal(dueStep({ journeyId: 'j1', stepIndex: 2, enrolledAt: new Date(now).toISOString() }, journey, now), null);
});

t('the due list names the journey and the person, and does not send anything itself', () => {
  const list = journeyActions([{ id: 'e1', journeyId: 'j1', email: 'ann@x.com', stepIndex: 0, enrolledAt: new Date(now).toISOString() }], [journey], now);
  assert.equal(list.length, 1);
  assert.equal(list[0].email, 'ann@x.com');
  assert.equal(list[0].journey, 'Welcome');
});

console.log(`\n${n} passed`);
