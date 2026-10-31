// app/api/inbound/twilio/route.js - PUBLIC (listed in proxy.js). Twilio posts every SMS and WhatsApp reply here.
// The request is accepted only if its signature matches the auth token of the account that owns the number it was sent to.
// A reply is recorded for that account. A STOP by WhatsApp or SMS is honoured: consent is withdrawn and email is suppressed.
// No reply is sent back automatically.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { collection, addDoc, getDocs, limit, query, where, setDoc } from '../../../../lib/server-firestore.js';
import { normalizePhone } from '../../../../lib/phone.js';
import { suppressContact } from '../../../../lib/server/suppress.js';
import { secretsFor, accountForNumber } from '../../../../lib/server/integration-secrets.js';
import { verifyTwilioSignature, parseInbound, isStopKeyword } from '../../../../lib/server/inbound-messages.js';
import { getDoc, doc, updateDoc } from '../../../../lib/server-firestore.js';

const xml = (body = '<Response/>', status = 200) => new NextResponse(body, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8', ...NO_STORE } });

export async function POST(request) {
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(base)) return xml('<Response/>', 503);
  const form = await request.formData().catch(() => null);
  if (!form) return xml('<Response/>', 400);
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const msg = parseInbound(params);
  if (!msg.to || !msg.from) return xml();

  const db = getDb();
  const uid = await accountForNumber(db, msg.to);
  if (!uid) return xml(); // not one of our numbers: nothing to record

  const secrets = await secretsFor(db, uid, ['TWILIO_AUTH_TOKEN']);
  const url = `${base}${new URL(request.url).pathname}`;
  if (!verifyTwilioSignature(url, params, secrets.TWILIO_AUTH_TOKEN, request.headers.get('x-twilio-signature'))) {
    return xml('<Response/>', 403);
  }

  const phone = normalizePhone(msg.from) || msg.from;
  // Match the sender to a customer we have consent for, by their number.
  const [wa, voice] = await Promise.all(['whatsapp_consent', 'voice_consent'].map((c) =>
    getDocs(query(collection(db, 'users', uid, c), where('phone', '==', phone), limit(5))).then((s) => s.docs.map((d) => ({ ref: d.ref, ...d.data() })))));
  const matches = [...wa, ...voice];
  // A number the owner attached to an email address (see /api/inbound/attach) keeps matching its later replies.
  const attachedSnap = await getDoc(doc(db, 'users', uid, 'unmatched_contacts', phone)).catch(() => null);
  const attachedEmail = attachedSnap?.exists() ? (attachedSnap.data().attachedEmail || null) : null;
  const matchedEmail = matches[0]?.email || attachedEmail || null;

  await addDoc(collection(db, 'users', uid, 'inbound_messages'), {
    userId: uid, from: phone, channel: msg.channel, body: msg.body, messageSid: msg.messageSid,
    matchedEmail, receivedAt: new Date().toISOString(),
  }).catch((e) => console.error('[inbound] record failed:', e.message));

  if (!matches.length && !attachedEmail) {
    // A number we have no customer for: kept so the owner can act on it (no lead is created without an email address).
    const ref = doc(db, 'users', uid, 'unmatched_contacts', phone);
    const prev = await getDoc(ref).catch(() => null);
    await setDoc(ref, { phone, channel: msg.channel, lastBody: msg.body.slice(0, 200), lastAt: new Date().toISOString(), count: ((prev && prev.exists() ? prev.data().count : 0) || 0) + 1 }, { merge: true }).catch(() => {});
  }
  if (isStopKeyword(msg.body)) {
    for (const m of matches) {
      await updateDoc(m.ref, { consent: false, withdrawnAt: new Date().toISOString(), withdrawnBy: `${msg.channel}-stop` }).catch(() => {});
      if (m.email) await suppressContact(db, { uid, email: m.email, reason: 'unsubscribed', source: `${msg.channel}_stop` }).catch(() => {});
    }
  }
  return xml();
}
