// app/api/voice/inbound/route.js - PUBLIC (listed in proxy.js). Twilio calls this when someone rings the business's number.
// The AI answers with the same rules as an outbound call (disclosure, stop, six turns, transcript). Inbound calls are not
// capped by the daily limit (the caller chose to ring); Twilio and AI costs apply to every call.
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { setDoc, doc } from '../../../../lib/server-firestore.js';
import { normalizePhone } from '../../../../lib/phone.js';
import { getBusinessProfile } from '../../../../lib/ai-client.js';
import { secretsFor, accountForNumber } from '../../../../lib/server/integration-secrets.js';
import { verifyTwilioSignature, twilioNumber } from '../../../../lib/server/inbound-messages.js';
import { signVoiceToken, buildTwiml, inboundGreetingFor } from '../../../../lib/server/voice-agent.js';

const xml = (body, status = 200) => new NextResponse(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
const say = (text) => xml(buildTwiml({ say: text, hangup: true }));
const AI_KEYS = ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];

export async function POST(request) {
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(base)) return say('Sorry, this line is not available right now. Please try again later.');
  const form = await request.formData().catch(() => null);
  if (!form) return say('Sorry, we could not understand that call.');
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

  const db = getDb();
  const uid = await accountForNumber(db, twilioNumber(params.To));
  if (!uid) return say('Sorry, this number is not in use.');
  const secrets = await secretsFor(db, uid, ['TWILIO_AUTH_TOKEN']);
  if (!verifyTwilioSignature(`${base}${new URL(request.url).pathname}`, params, secrets.TWILIO_AUTH_TOKEN, request.headers.get('x-twilio-signature'))) {
    return xml('<Response/>', 403);
  }
  if (!AI_KEYS.some((k) => String(process.env[k] || '').trim())) return say('Sorry, our assistant is not available right now. Please try again later.');

  const business = String((await getBusinessProfile(uid))?.businessName || '').replace(/[\r\n]/g, ' ').trim().slice(0, 80) || 'the business';
  const callId = randomUUID();
  const token = signVoiceToken(uid, callId);
  if (!token) return say('Sorry, we cannot take this call right now.');
  const recorded = process.env.VOICE_RECORD_CALLS !== 'off';
  const greeting = inboundGreetingFor({ business, recorded });
  await setDoc(doc(db, 'voice_calls', callId), {
    id: callId, userId: uid, direction: 'inbound', email: null, phone: normalizePhone(twilioNumber(params.From)) || twilioNumber(params.From),
    purpose: 'answer questions from a customer who called the business', business, status: 'in_progress',
    turns: [{ role: 'assistant', text: greeting }], ended: false, startedAt: new Date().toISOString(), twilioCallSid: params.CallSid || null, recorded,
  });
  return xml(buildTwiml({
    say: greeting, gatherAction: `${base}/api/voice/turn?t=${encodeURIComponent(token)}`,
    recordCallback: recorded ? `${base}/api/voice/recording?t=${encodeURIComponent(token)}` : '',
  }));
}
