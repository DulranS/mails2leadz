import test from 'node:test';
import assert from 'node:assert/strict';
import { selectForInbox, nameKey } from '../lib/lead-finder.js';

const lead = (name, email) => ({ business_name: name, email_primary: email, lead_quality_score: 90, website: 'https://biz.example' });

test('company suffixes and punctuation do not make a different spelling of the same business', () => {
  assert.equal(nameKey('Kandy Dental Ltd.'), nameKey('kandy dental'));
  assert.equal(nameKey('The Kandy Dental (Pvt) Ltd'), 'kandydental');
  assert.equal(nameKey('Ace'), '', 'too short to match safely');
});

test('a lead whose business is already a deal under another email is not put in the inbox again', () => {
  const rows = [lead('Kandy Dental Ltd', 'info@kandy.example'), lead('Galle Bakery', 'hi@galle.example')];
  const { ready, reasons } = selectForInbox(rows, { minScore: 0, existingNames: new Set([nameKey('Kandy Dental')]) });
  assert.deepEqual(ready.map((r) => r.business_name), ['Galle Bakery']);
  assert.equal(reasons.already_in_crm, 1);
});
