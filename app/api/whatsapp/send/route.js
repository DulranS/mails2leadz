// app/api/whatsapp/send/route.js - sends a Meta-approved WhatsApp template to a customer who agreed, with the owner's press.
// Refused unless WhatsApp is connected, a template is set, the customer has consent on record, and they are not opted out or lost.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE, isBlockedContact } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { collection, addDoc, doc, getDoc } from '../../../../lib/server-firestore.js';
import { dealDocId } from '../../../../lib/deal-utils.js';
import { whatsappReady, templateSidFor, canSendWhatsApp, sendWhatsAppTemplate } from '../../../../lib/server/whatsapp.js';
import { secretsFor, WA_NAMES } from '../../../../lib/server/integration-secrets.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const KINDS = ['quote', 'followup', 'invoice'];

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;

  const kind = KINDS.includes(body?.kind) ? body.kind : null;
  if (!kind) return json({ error: 'Choose a quote, follow-up or invoice message.' }, 400);
  const email = String(body?.email || '').trim().toLowerCase();
  if (!email) return json({ error: "Choose the customer." }, 400);

  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;

  const secrets = await secretsFor(db, uid, WA_NAMES); // this account's own Twilio keys, never the operator's
  const consentSnap = await getDoc(doc(db, 'users', uid, 'whatsapp_consent', dealDocId(uid, email)));
  const consent = consentSnap.exists() ? consentSnap.data() : null;
  const plan = canSendWhatsApp({
    ready: whatsappReady(secrets),
    templateSid: templateSidFor(kind, secrets),
    blocked: await isBlockedContact(db, uid, email),
    consent,
  });
  if (plan.error) return json({ error: plan.error }, 409);

  // Template variables: {"1": "...", "2": "..."}, at most 10, each short and plain text.
  const variables = {};
  for (const [k, v] of Object.entries(body?.variables || {}).slice(0, 10)) {
    if (/^\d{1,2}$/.test(k)) variables[k] = String(v ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 200);
  }
  try {
    const sent = await sendWhatsAppTemplate({ to: consent.phone, templateSid: templateSidFor(kind, secrets), variables, secrets });
    await addDoc(collection(db, 'users', uid, 'whatsapp_sent'), { userId: uid, email, kind, sid: sent?.sid || null, sentAt: new Date().toISOString() });
    return json({ ok: true, sid: sent?.sid || null });
  } catch (e) {
    console.error('[whatsapp send] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'WhatsApp did not accept the message. Check the template is approved and the number is on WhatsApp.' }, 502);
  }
}
