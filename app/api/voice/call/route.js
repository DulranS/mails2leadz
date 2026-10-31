// app/api/voice/call/route.js - the owner starts an AI phone call for a purpose they write. The call is refused unless: this account
// has Twilio and an AI key, the person has recorded consent to AI calls, they are not opted out or lost, it is within calling hours
// in the owner's time zone, and today's cap is not reached. Each turn is handled by /api/voice/turn.
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { identify, getDb, NO_STORE, isBlockedContact } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { collection, doc, getDoc, setDoc, updateDoc } from '../../../../lib/server-firestore.js';
import { dealDocId } from '../../../../lib/deal-utils.js';
import { countToday } from '../../../../lib/server/daily-count.js';
import { getBusinessProfile } from '../../../../lib/ai-client.js';
import { twilioFor } from '../../../../lib/server/twilio-account.js';
import { signVoiceToken, withinCallingHours, DEFAULT_DAILY_CAP, greetingFor } from '../../../../lib/server/voice-agent.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const AI_KEYS = ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;

  const email = String(body?.email || '').trim().toLowerCase();
  const purpose = String(body?.purpose || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  if (!email) return json({ error: 'Choose the person to call.' }, 400);
  if (purpose.length < 8) return json({ error: 'Say what the call is about, in a sentence.' }, 400);
  if (!AI_KEYS.some((k) => String(process.env[k] || '').trim())) return json({ error: 'The AI is not set up on the server, so no call can be made.' }, 409);
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(base)) return json({ error: 'Calls need a public https address on the server (NEXT_PUBLIC_BASE_URL).' }, 409);

  const tw = await twilioFor(db, uid);
  if (!tw) return json({ error: 'Phone calls are not set up for this account yet. Add the Twilio keys on the Integrations page.' }, 409);

  const consentSnap = await getDoc(doc(db, 'users', uid, 'voice_consent', dealDocId(uid, email)));
  const consent = consentSnap.exists() ? consentSnap.data() : null;
  if (!consent || consent.consent !== true || !consent.phone) return json({ error: 'Record this person\'s agreement to AI calls first. No call is made without it.' }, 409);
  if (await isBlockedContact(db, uid, email)) return json({ error: 'This person has opted out, or their deal is lost. No call was made.' }, 409);

  const ap = await getDoc(doc(db, 'users', uid, 'settings', 'autopilot'));
  const tz = Number.isFinite(Number(ap.exists() ? ap.data().tzOffsetMin : NaN)) ? Number(ap.data().tzOffsetMin) : 330;
  if (!withinCallingHours(Date.now(), tz)) return json({ error: 'AI calls are only made between 9:00 and 18:00 in your time zone. Try again then.' }, 409);

  const cap = Number(process.env.VOICE_AGENT_DAILY_CAP) || DEFAULT_DAILY_CAP;
  const today = await countToday(db, 'voice_calls', 'startedAt', uid);
  if ((today ?? 0) >= cap) return json({ error: `The daily limit of ${cap} AI calls is reached. Try again tomorrow.` }, 429);

  const business = String((await getBusinessProfile(uid))?.businessName || '').replace(/[\r\n]/g, ' ').trim().slice(0, 80) || 'the business';
  const callId = randomUUID();
  const token = signVoiceToken(uid, callId);
  if (!token) return json({ error: 'The server has no signing key set (PAY_SECRET, UNSUBSCRIBE_SECRET or WEBHOOK_SECRET).' }, 409);
  const startedAt = new Date().toISOString();
  await setDoc(doc(db, 'voice_calls', callId), {
    id: callId, userId: uid, email, phone: consent.phone, purpose, business, status: 'ringing', turns: [], ended: false, startedAt,
  });
  try {
    const placed = await tw.client.calls.create({ to: consent.phone, from: tw.from, url: `${base}/api/voice/turn?t=${encodeURIComponent(token)}`, method: 'POST' });
    await updateDoc(doc(db, 'voice_calls', callId), { twilioCallSid: placed.sid || null });
    return json({ ok: true, callId, greeting: greetingFor({ business, purpose }) });
  } catch (e) {
    console.error('[voice call] placing failed:', String(e?.message || '').slice(0, 120));
    await updateDoc(doc(db, 'voice_calls', callId), { status: 'failed', ended: true, endReason: 'not_placed' }).catch(() => {});
    return json({ error: 'The call could not be placed. Check the Twilio keys and the number, then try again.' }, 502);
  }
}
