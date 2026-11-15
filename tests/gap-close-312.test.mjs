// Pass 312: the owner offers a monthly membership and records members. Nothing here takes payment (scope: upselling and recurring revenue).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanPlan, cleanMember, membershipOffer } from '../lib/membership.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a plan needs a name and a monthly price above zero, rounded to pence', () => {
  assert.ok(cleanPlan({ name: 'A', monthlyPrice: 10 }).error);
  assert.ok(cleanPlan({ name: 'Gold', monthlyPrice: 0 }).error);
  assert.ok(cleanPlan({ name: 'Gold', monthlyPrice: 'lots' }).error);
  const r = cleanPlan({ name: ' Gold  Club ', monthlyPrice: 19.999, includes: 'Priority booking', currency: 'usd' });
  assert.equal(r.ok, true);
  assert.equal(r.value.name, 'Gold Club');
  assert.equal(r.value.monthlyPrice, 20);
  assert.equal(r.value.currency, 'USD');
});

t('a member needs a real email address', () => {
  assert.ok(cleanMember({ email: 'nope' }).error);
  assert.deepEqual(cleanMember({ email: ' Member@Example.com ', businessName: 'Acme' }).value, { email: 'member@example.com', businessName: 'Acme' });
});

t('the offer only says what the owner entered, with the price and the terms they gave', () => {
  const text = membershipOffer({ name: 'Gold Club', monthlyPrice: 20, currency: 'USD', includes: 'Priority booking' }, 'Acme');
  assert.ok(text.includes('Acme offers a monthly membership: Gold Club, 20 USD a month.'));
  assert.ok(text.includes('It includes: Priority booking.'));
  assert.equal(/free|discount|guarantee/i.test(text), false);
  assert.ok(membershipOffer({ name: 'Basic', monthlyPrice: 5 }).includes('We offer a monthly membership'));
});

t('the membership route is owner-only, and a won customer keeps their stage when a member is added', () => {
  const src = fs.readFileSync('app/api/membership/route.js', 'utf8');
  assert.ok(src.includes('guardTenant(db, who.uid)'));
  assert.ok(src.includes("stage: existing ? existing.stage : 'proposal'"));
  assert.ok(src.includes('recurringMonthly: plan.monthlyPrice'));
  assert.ok(src.includes('Save the membership first.'));
});

t('the membership panel is on the CRM screen, with copy and add-member controls', () => {
  const crm = fs.readFileSync('app/crm/page.js', 'utf8');
  assert.ok(crm.includes('<MembershipPanel />'));
  const panel = fs.readFileSync('app/components/MembershipPanel.js', 'utf8');
  assert.ok(panel.includes('Copy offer'));
  assert.ok(panel.includes('aria-label="Add member"'));
});

console.log(`gap-close-312: ${n} checks passed`);
