// Subject access (Pass 248): a person's copy lists what was found, says what is kept, and uses a normalised address.
import assert from 'node:assert/strict';
import { packageExport } from '../lib/contact-export.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

t('a person\'s copy lists what was found by place, with a count, the address and the reason invoices are kept', () => {
  const p = packageExport({ email: '  Ann@X.com ', found: { deals: [{ id: 'a' }], sent_emails: [{ id: 'b' }, { id: 'c' }] }, now: new Date('2026-11-06T12:00:00Z') });
  assert.equal(p.email, 'ann@x.com');
  assert.deepEqual(p.summary, { deals: 1, sent_emails: 2 });
  assert.match(p.note, /tax and accounting records/);
  assert.equal(p.exportedAt, '2026-11-06T12:00:00.000Z');
});

console.log(`\n${n} passed`);
