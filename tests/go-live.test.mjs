// Go-live checklist (Pass 277): it reports from presence only, marks what is still needed, and calls the email records a manual check until they are ticked.
import assert from 'node:assert/strict';
import { goLiveChecklist } from '../lib/go-live.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

t('an empty account reports the essential steps as needed', () => {
  const c = goLiveChecklist({});
  assert.equal(c.ready, false);
  assert.equal(c.items.find((i) => i.id === 'dns').status, 'needs');
  assert.equal(c.items.find((i) => i.id === 'catalogue').status, 'needs');
});

t('when everything is in place, the checklist is ready', () => {
  const c = goLiveChecklist({ googleConnected: true, ga4PropertyId: true, aiKey: true, catalogueItems: 3, libraryItems: 2, helpPublished: true, routineChosen: true, dnsChecked: true, balancr: true, twilio: true, places: true });
  assert.equal(c.ready, true);
  assert.equal(c.needs, 0);
});

t('optional connections do not block the checklist', () => {
  const c = goLiveChecklist({ googleConnected: true, ga4PropertyId: true, aiKey: true, catalogueItems: 1, routineChosen: true, dnsChecked: true, balancr: false });
  assert.equal(c.ready, true);
});

console.log(`\n${n} passed`);
