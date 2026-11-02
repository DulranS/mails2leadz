// Lead pipeline rules: a lead with a phone number only is recognised by its digits, and phone lookups ignore formatting.
import assert from 'node:assert/strict';
import { inboxKey, sanitizeLead } from '../lib/lead-inbox.js';

// The same person, written three ways, is one lead.
const a = sanitizeLead({ business_name: 'Cafe Lanka', email: 'Owner@Cafe.lk ' });
assert.equal(a.ok, true);
assert.equal(inboxKey(a.lead), 'e:owner@cafe.lk', 'email is lower-cased, so the same address always gives the same key');

// A phone-only lead keys on its digits, so +94 77 123 4567 and 94771234567 are one lead.
const p1 = sanitizeLead({ business_name: 'Salon', whatsapp_number: '+94 77 123 4567' });
const p2 = sanitizeLead({ business_name: 'Salon', whatsapp_number: '94771234567' });
assert.equal(p1.ok, true);
assert.equal(inboxKey(p1.lead), inboxKey(p2.lead), 'formatting does not make a second lead');
assert.equal(String(p1.lead.whatsapp_number).replace(/\D/g, ''), '94771234567');

// A lead with neither an address nor a number is refused.
assert.equal(sanitizeLead({ business_name: 'Nobody' }).ok, false);

console.log('lead-pipeline tests: all passed');
