import assert from 'node:assert/strict';
import { validDomain, parseHunterDomain } from '../lib/server/enrich.js';
import { inboundGreetingFor, systemPromptFor, buildTwiml } from '../lib/server/voice-agent.js';
import { ENRICH_NAMES, SECRET_NAMES } from '../lib/server/integration-secrets.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('only a real company domain is looked up; a URL with a path or junk is refused', () => {
  assert.equal(validDomain('example.com'), true);
  assert.equal(validDomain('shop.example.co.uk'), true);
  assert.equal(validDomain('not a domain'), false);
  assert.equal(validDomain('localhost'), false);
  assert.equal(validDomain('example.com/path'), false);
  assert.equal(validDomain(''), false);
});

t('Hunter contacts are cleaned, sorted by confidence, and any line without a valid email is dropped', () => {
  const out = parseHunterDomain({ data: { emails: [
    { value: 'Low@Example.com', first_name: 'Ann', last_name: 'Lee', position: 'Clerk', confidence: 40 },
    { value: 'bad-email', confidence: 99 },
    { value: 'boss@example.com', first_name: 'Bo', last_name: 'Ng', position: 'Director', confidence: 91 },
  ] } });
  assert.deepEqual(out.map((c) => c.email), ['boss@example.com', 'low@example.com']);
  assert.equal(out[1].name, 'Ann Lee');
  assert.deepEqual(parseHunterDomain({}), []);
});

t('the contact lookup key is a per-account secret', () => {
  assert.deepEqual(ENRICH_NAMES, ['HUNTER_API_KEY']);
  assert.ok(SECRET_NAMES.includes('HUNTER_API_KEY'));
});

t('an inbound caller hears the AI disclosure before anything else, and the assistant is told it is an AI', () => {
  const g = inboundGreetingFor({ business: 'Kandy Dental' });
  assert.match(g, /automated assistant for Kandy Dental/);
  assert.match(g, /written down/);
  assert.match(systemPromptFor({ business: 'Kandy Dental', purpose: 'answer questions' }), /You are an AI/);
  assert.match(buildTwiml({ say: g, gatherAction: 'https://a.example/api/voice/turn?t=x' }), /<Gather input="speech"/);
});

console.log(`enrich-inbound: ${n} passed`);

import { inboundLeadWrite } from '../lib/server/inbound-messages.js';
t('a number the owner attaches becomes a new inbound lead, with its channel and number kept', () => {
  const w = inboundLeadWrite({ uid: 'u1', email: 'Ann@Example.com', phone: '+94771234567', channel: 'whatsapp', businessName: 'Ann Co', now: new Date(Date.UTC(2026, 9, 31)) });
  assert.equal(w.stage, 'new');
  assert.equal(w.source, 'inbound');
  assert.equal(w.sourceDetail, 'WhatsApp reply');
  assert.equal(w.email, 'ann@example.com');
  assert.equal(w.phone, '+94771234567');
  assert.equal(w.businessName, 'Ann Co');
});
console.log(`enrich-inbound (lead): ${n + 1} passed`);
