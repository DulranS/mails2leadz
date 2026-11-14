// Help centre (Pass 275): nothing is shown until the owner publishes; once published, only clean question-and-answer pairs are shown.
import assert from 'node:assert/strict';
import { publicHelpEntries } from '../lib/help-center.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const lib = [{ q: 'Opening hours?', a: 'Mon to Fri, 9 to 5.' }, { q: '', a: 'no question' }, { q: 'Delivery?', a: '' }];

t('nothing is shown until the owner publishes the help centre', () => {
  assert.deepEqual(publicHelpEntries(lib, false), []);
  assert.deepEqual(publicHelpEntries(lib, undefined), []);
});

t('once published, only complete question-and-answer pairs are shown', () => {
  assert.deepEqual(publicHelpEntries(lib, true), [{ question: 'Opening hours?', answer: 'Mon to Fri, 9 to 5.' }]);
});

console.log(`\n${n} passed`);
