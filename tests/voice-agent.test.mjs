import assert from 'node:assert/strict';
import { signVoiceToken, verifyVoiceToken, buildTwiml, escapeXml, wantsStop, withinCallingHours, greetingFor, systemPromptFor, MAX_TURNS } from '../lib/server/voice-agent.js';
import { twilioFor } from '../lib/server/twilio-account.js';
import { CALL_NAMES, SECRET_NAMES } from '../lib/server/integration-secrets.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const KEY = 'voice-test-key';

t('a voice token names one account and one call, verifies, and refuses tampering and other keys', () => {
  const tok = signVoiceToken('u1', 'c9', KEY);
  assert.deepEqual(verifyVoiceToken(tok, KEY), { uid: 'u1', callId: 'c9' });
  assert.equal(verifyVoiceToken(tok, 'other'), null);
  assert.equal(verifyVoiceToken(`${tok}x`, KEY), null);
  assert.equal(verifyVoiceToken('nonsense', KEY), null);
  assert.equal(signVoiceToken('', 'c', KEY), null);
});

t('spoken text is escaped, so a name or purpose cannot break the call script', () => {
  assert.equal(escapeXml('A & B <script>"x"</script>'), 'A &amp; B &lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  const xml = buildTwiml({ say: 'Hi </Say><Dial>', gatherAction: 'https://a.example/api/voice/turn?t=x&y=1' });
  assert.doesNotMatch(xml, /<Dial>/);
  assert.match(xml, /action="https:\/\/a\.example\/api\/voice\/turn\?t=x&amp;y=1"/);
});

t('a turn listens for speech and posts back; a final turn hangs up', () => {
  const listen = buildTwiml({ say: 'Okay.', gatherAction: 'https://a.example/t' });
  assert.match(listen, /<Gather input="speech"/);
  assert.match(listen, /Goodbye/);
  const end = buildTwiml({ say: 'Bye.', hangup: true });
  assert.match(end, /<Hangup\/>/);
  assert.doesNotMatch(end, /<Gather/);
});

t('"stop" in any common wording is recognised; ordinary talk is not', () => {
  for (const s of ['please stop calling me', "don't call me again", 'Remove me from your list', 'do not call', 'unsubscribe me']) assert.equal(wantsStop(s), true, s);
  for (const s of ['yes I am interested', 'what is the price', 'tomorrow is fine', '']) assert.equal(wantsStop(s), false, s);
});

t('calls are only made between 9:00 and 18:00 in the owner\'s time zone', () => {
  const utc = (h, m = 0) => Date.UTC(2026, 9, 31, h, m);
  assert.equal(withinCallingHours(utc(3, 30), 330), true);   // 09:00 Colombo
  assert.equal(withinCallingHours(utc(2, 59), 330), false);  // 08:29 Colombo
  assert.equal(withinCallingHours(utc(12, 29), 330), true);  // 17:59 Colombo
  assert.equal(withinCallingHours(utc(12, 30), 330), false); // 18:00 Colombo
  assert.equal(withinCallingHours(utc(12, 30), 0), true);    // 12:30 UTC is inside 9-18 in UTC
});

t('the call says at once that it is an automated assistant and that it may be written down', () => {
  const g = greetingFor({ business: 'Kandy Dental', purpose: 'confirming the quote' });
  assert.match(g, /automated assistant/);
  assert.match(g, /Kandy Dental/);
  assert.match(g, /written down/);
  assert.match(g, /stop calling/);
});

t('the AI is told it is an AI, must not invent figures, and must hand anything else to a person', () => {
  const p = systemPromptFor({ business: 'Kandy Dental', purpose: 'confirming the quote' });
  assert.match(p, /You are an AI, not a person/);
  assert.match(p, /Never invent prices/);
  assert.match(p, /a person from Kandy Dental will follow up/);
  assert.ok(MAX_TURNS >= 3 && MAX_TURNS <= 10);
});

t('the Twilio keys used by calls and SMS are part of the per-account key store', () => {
  for (const k of CALL_NAMES) assert.ok(SECRET_NAMES.includes(k), k);
  assert.equal(typeof twilioFor, 'function');
});

console.log(`voice-agent: ${n} passed`);
