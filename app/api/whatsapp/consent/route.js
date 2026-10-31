// app/api/whatsapp/consent/route.js - the owner records that a customer agreed (or withdrew) to WhatsApp messages.
// WhatsApp is never sent without this record (see lib/server/whatsapp.js).
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc, setDoc } from '../../../../lib/server-firestore.js';
import { normalizePhone } from '../../../../lib/phone.js';
import { dealDocId } from '../../../../lib/deal-utils.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter the customer's email address." }, 400);
  const consent = body?.consent === true;
  const phone = normalizePhone(String(body?.phone || ''));
  if (!phone) return json({ error: 'Enter the phone number with its country code, for example +94 77 000 0000.' }, 400);
  try {
    await setDoc(doc(db, 'users', uid, 'whatsapp_consent', dealDocId(uid, email)), {
      email, phone, consent, recordedAt: new Date().toISOString(), source: 'recorded by owner', userId: uid,
    });
    return json({ ok: true, consent });
  } catch (e) {
    console.error('[whatsapp consent] failed:', e.message);
    return json({ error: 'Could not save the consent record. Try again.' }, 500);
  }
}
