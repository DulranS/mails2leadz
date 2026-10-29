import test from 'node:test';
import assert from 'node:assert/strict';
import { planReminders } from '../lib/billing-automation.js';

test('a reminder for a part-paid invoice quotes what is still owed, not the full amount', () => {
  const now = Date.UTC(2026, 9, 25);
  const invoices = [{
    _id: 'inv_part_1', id: 'inv_part_1', userId: 'u1', email: 'client@example.com', businessName: 'Client Ltd',
    amount: 1000, amountPaid: 400, status: 'partial', number: 'INV-7',
    issuedAt: '2026-09-01T00:00:00Z', dueAt: '2026-10-01T00:00:00Z',
  }];
  const out = planReminders({ invoices, now, currency: 'USD', senderName: 'Me', paymentInfo: '' });
  assert.ok(out.length >= 1, 'a reminder is planned for an overdue part-paid invoice');
  const body = out[0].draft.body + ' ' + out[0].draft.subject;
  assert.ok(body.includes('600.00'), 'the reminder quotes the balance');
  assert.ok(!body.includes('1,000') && !body.includes('1000.00'), 'the reminder does not quote the full amount');
});
