// Balancr sync rules (Pass 247): deals and leads map both ways; a repeat never makes a second lead; a lead matches back to the right deal; only a paid invoice is marked paid.
import assert from 'node:assert/strict';
import { toBalancrStage, fromBalancrStage, leadBodyFor, matchDealByContact, invoicePaidState } from '../lib/balancr.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };

t('deal stages map to Balancr stages and back', () => {
  assert.equal(toBalancrStage('closed_won'), 'won');
  assert.equal(toBalancrStage('negotiation'), 'proposal_sent');
  assert.equal(fromBalancrStage('won'), 'closed_won');
  assert.equal(fromBalancrStage('lost'), 'closed_lost');
  assert.equal(fromBalancrStage('nonsense'), null);
});

t('a deal becomes a lead with an external id; consent is only what the owner recorded', () => {
  const b = leadBodyFor({ id: 'd1', businessName: 'Ann Clinic', email: 'Ann@x.com', marketingConsent: true });
  assert.equal(b.externalId, 'autoleads:d1');
  assert.equal(b.email, 'ann@x.com');
  assert.equal(b.consentToContact, true);
  assert.equal(leadBodyFor({ id: 'd2', businessName: 'Bo', email: 'bo@x.com' }).consentToContact, false);
  assert.equal(leadBodyFor({ id: 'd3', businessName: 'No contact' }), null);
});

t('a lead from Balancr matches the right deal by e-mail, or by the last nine digits of the phone', () => {
  const deals = [{ id: 'a', email: 'ann@x.com' }, { id: 'b', phone: '+94 77 123 4567' }];
  assert.equal(matchDealByContact('ANN@x.com', deals).id, 'a');
  assert.equal(matchDealByContact('0771234567', deals).id, 'b');
  assert.equal(matchDealByContact('someone@else.com', deals), null);
});

t('only a fully paid invoice is marked paid', () => {
  assert.equal(invoicePaidState('paid'), 'paid');
  assert.equal(invoicePaidState('overdue'), 'overdue');
  assert.equal(invoicePaidState('outstanding'), 'open');
});

console.log(`\n${n} passed`);
