// Pass 315: AutoLeads matches Balancr's leads the way Balancr v285 publishes them (lead id, external id, and a free-text contact).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitContact, matchDealByContact, matchDealForLead, BALANCR_STAGES } from '../lib/balancr.js';
import { balancrInboxRow } from '../lib/balancr-inbox.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a combined contact "phone · email" is split into both parts', () => {
  assert.deepEqual(splitContact('0771234567 · Jane@X.com'), { email: 'jane@x.com', phone: '0771234567' });
  assert.deepEqual(splitContact('jane@x.com'), { email: 'jane@x.com', phone: '' });
  assert.deepEqual(splitContact('+94 77 123 4567'), { email: '', phone: '+94 77 123 4567' });
  assert.deepEqual(splitContact(''), { email: '', phone: '' });
});

t('a combined contact matches the deal by its e-mail', () => {
  assert.equal(matchDealByContact('0771234567 · jane@x.com', [{ id: 'c', email: 'jane@x.com' }]).id, 'c');
});

t('a lead matches by Balancr\'s lead id first, then by our external id, then by contact', () => {
  const deals = [{ id: 'a', balancrLeadId: 'L9', email: 'x@y.com' }, { id: 'b', email: 'jane@x.com' }];
  assert.equal(matchDealForLead({ id: 'L9', contact: 'jane@x.com' }, deals).id, 'a');
  assert.equal(matchDealForLead({ id: 'L7', externalId: 'autoleads:b', contact: 'nobody@x.com' }, deals).id, 'b');
  assert.equal(matchDealForLead({ id: 'L8', contact: 'jane@x.com' }, deals).id, 'b');
  assert.equal(matchDealForLead({ id: 'L8', contact: 'someone@else.com' }, deals), null);
});

t('a Balancr lead with both a phone and an e-mail keeps both in the inbox', () => {
  const row = balancrInboxRow('u1', { id: 'L3', name: 'Jane', contact: '0771234567 · Jane@X.com' }, 0);
  assert.equal(row.email, 'jane@x.com');
  assert.equal(row.phone, '0771234567');
  assert.equal(row.balancrId, 'L3');
});

t('the stage list is the one Balancr v285 accepts', () => {
  assert.deepEqual(BALANCR_STAGES, ['new', 'contacted', 'qualified', 'follow_up', 'proposal_sent', 'won', 'lost']);
});

t('the stage webhook uses the new matching, and the contract is written down', () => {
  const src = fs.readFileSync('lib/server/balancr.js', 'utf8');
  assert.ok(src.includes('matchDealForLead(payload?.lead, deals)'));
  assert.equal(src.includes('matchDealByContact(payload?.lead?.contact'), false);
  const doc = fs.readFileSync('BALANCR_CONTRACT.md', 'utf8');
  assert.ok(doc.includes('v285'));
  assert.ok(doc.includes('autoleads:<deal id>'));
});

console.log(`gap-close-315: ${n} checks passed`);
