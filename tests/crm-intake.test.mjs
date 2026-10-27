import test from 'node:test';
import assert from 'node:assert/strict';
import { selectForInbox } from '../lib/lead-finder.js';

const lead = (email) => ({ business_name: `Biz ${email}`, email_primary: email, lead_quality_score: 90, website: 'https://biz.example' });

test('a lead whose email is already in the CRM is not put in the inbox again, and is counted', () => {
  const rows = [lead('owner@shop.example'), lead('new@cafe.example')];
  const { ready, reasons } = selectForInbox(rows, { minScore: 0, existing: new Set(['owner@shop.example']) });
  assert.deepEqual(ready.map((r) => r.email_primary), ['new@cafe.example']);
  assert.equal(reasons.already_in_crm, 1);
});

test('with no CRM emails supplied, nothing is skipped (the old behaviour)', () => {
  const rows = [lead('owner@shop.example')];
  const { ready } = selectForInbox(rows, { minScore: 0 });
  assert.equal(ready.length, 1);
});
