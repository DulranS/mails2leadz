import assert from 'node:assert/strict';
import { sanitizeLead, inboxKey, summarizeInbox, leadsToCsv, INBOX_FIELDS, MAX_BATCH } from '../lib/lead-inbox.js';
import { generateIngestKey, parseIngestKey, verifySecret, hashSecret, inboxDocId } from '../lib/server/ingest-key.js';
import { parseCsvRow } from '../lib/dashboard-utils.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('a lead needs a name and a way to reach it; junk fields are dropped and text is cleaned', () => {
  assert.equal(sanitizeLead(null).ok, false);
  assert.equal(sanitizeLead({ business_name: 'X' }).ok, false);
  assert.equal(sanitizeLead({ email: 'a@b.com' }).ok, false);
  assert.equal(sanitizeLead({ business_name: 'X', email: 'not-an-email' }).ok, false);
  const r = sanitizeLead({ business_name: ' Acme\n\tLtd ', email: ' INFO@Acme.com ', whatsapp_number: '+94 11 234 5678', evil: '<script>', lead_quality: 'hot', lead_quality_score: '99.6' });
  assert.equal(r.ok, true);
  assert.equal(r.lead.business_name, 'Acme Ltd');
  assert.equal(r.lead.email, 'info@acme.com');
  assert.equal(r.lead.lead_quality, 'HOT');
  assert.equal(r.lead.lead_quality_score, '100');
  assert.equal(r.lead.evil, undefined);
  assert.deepEqual(Object.keys(r.lead).sort(), Object.keys(INBOX_FIELDS).sort());
});
t('phone-only leads are valid; a bad phone alone is not; unknown quality becomes COLD', () => {
  assert.equal(sanitizeLead({ business_name: 'X', whatsapp_number: '+94112345678' }).lead.lead_quality, 'COLD');
  assert.equal(sanitizeLead({ business_name: 'X', whatsapp_number: '123' }).ok, false);
  assert.equal(sanitizeLead({ business_name: 'X', email: 'a@b.co', whatsapp_number: '12' }).lead.whatsapp_number, '');
});
t('text is length-capped', () => {
  const r = sanitizeLead({ business_name: 'x'.repeat(1000), email: 'a@b.co' });
  assert.equal(r.lead.business_name.length, INBOX_FIELDS.business_name);
});
t('identity prefers email, then place id, then phone; doc ids are stable and per owner', () => {
  assert.equal(inboxKey({ email: 'a@b.co', place_id: 'P' }), 'e:a@b.co');
  assert.equal(inboxKey({ email: '', place_id: 'P' }), 'p:P');
  assert.equal(inboxKey({ email: '', place_id: '', whatsapp_number: '+94 11 2' }), 't:94112');
  assert.equal(inboxDocId('u1', 'e:a@b.co'), inboxDocId('u1', 'e:a@b.co'));
  assert.notEqual(inboxDocId('u1', 'e:a@b.co'), inboxDocId('u2', 'e:a@b.co'));
  assert.match(inboxDocId('u1', 'x'), /^u1_[a-f0-9]{24}$/);
});
t('ingest key: only the hash is stored, verification is exact, malformed headers are refused', () => {
  const { key, hash, last4 } = generateIngestKey('user123ABC');
  assert.match(key, /^user123ABC\.[a-f0-9]{48}$/);
  assert.equal(last4, key.slice(-4));
  const p = parseIngestKey(`Bearer ${key}`);
  assert.equal(p.uid, 'user123ABC');
  assert.equal(verifySecret(hash, p.secret), true);
  assert.equal(verifySecret(hash, 'a'.repeat(48)), false);
  assert.equal(verifySecret('', p.secret), false);
  assert.equal(hash, hashSecret(p.secret));
  assert.notEqual(hash, p.secret);
  for (const bad of ['', 'Bearer', 'Bearer nodot', 'Bearer a.b', 'Bearer ../x.' + 'a'.repeat(48), null, undefined]) assert.equal(parseIngestKey(bad), null, String(bad));
  assert.notEqual(generateIngestKey('u').key, generateIngestKey('u').key);
});
t('summary counts quality and contact type', () => {
  const s = summarizeInbox([{ lead_quality: 'HOT', email: 'a@b.co' }, { lead_quality: 'COLD', email: '' }, { lead_quality: 'HOT', email: 'c@d.co' }]);
  assert.deepEqual(s, { total: 3, HOT: 2, WARM: 0, COLD: 1, withEmail: 2, phoneOnly: 1 });
  assert.equal(MAX_BATCH, 300);
});
t('CSV matches what the sender import expects: same column count on every row, quotes and commas survive', () => {
  const a = sanitizeLead({ business_name: 'Acme, "Best" Plumbing', email: 'a@b.co', address: '1 Main St, Colombo', lead_quality: 'HOT', lead_quality_score: 80 }).lead;
  const b = sanitizeLead({ business_name: 'Phone Only', whatsapp_number: '+94112345678' }).lead;
  const lines = leadsToCsv([a, b]).split('\n');
  const headers = parseCsvRow(lines[0]);
  assert.equal(lines.length, 3);
  for (const line of lines.slice(1)) assert.equal(parseCsvRow(line).length, headers.length);
  const row = Object.fromEntries(headers.map((h, i) => [h, parseCsvRow(lines[1])[i]]));
  assert.equal(row.email, 'a@b.co');
  assert.equal(row.address, '1 Main St, Colombo');
  assert.equal(row.business_name, "Acme, 'Best' Plumbing");
  assert.equal(row.lead_quality, 'HOT');
});
console.log(`\n${n} passed`);
