// app/api/inbound/attach/route.js - the owner turns a number with no customer into a lead, by adding the person's email address.
// The lead is a normal inbound lead (first stage, source "Inbound enquiry"). Earlier replies from the number are linked to it, and
// later replies match it too. Consent is NOT implied: a lead is not an agreement to messages; that is recorded separately.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from '../../../../lib/server-firestore.js';
import { normalizePhone } from '../../../../lib/phone.js';
import { dealDocId } from '../../../../lib/deal-utils.js';
import { inboundLeadWrite } from '../../../../lib/server/inbound-messages.js';
import { loadRoster } from '../../../../lib/server/team-store.js';
import { eligibleOwners, pickOwner } from '../../../../lib/assignment.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const phone = normalizePhone(String(body?.phone || ''));
  if (!phone) return json({ error: 'Choose a number from the list.' }, 400);
  const email = String(body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter the person's email address to make a lead." }, 400);

  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;

  const unmatchedRef = doc(db, 'users', uid, 'unmatched_contacts', phone);
  const um = await getDoc(unmatchedRef);
  if (!um.exists()) return json({ error: 'This number is not in the list of replies from unknown numbers.' }, 404);
  if (um.data().attachedEmail) return json({ error: `This number is already linked to ${um.data().attachedEmail}.` }, 409);

  const dealRef = doc(db, 'deals', dealDocId(uid, email));
  if ((await getDoc(dealRef)).exists()) return json({ error: 'A deal already exists for that email. Open it in the CRM instead.' }, 409);

  try {
    await setDoc(dealRef, inboundLeadWrite({ uid, email, phone, channel: um.data().channel, businessName: body?.businessName, now: new Date() }), { merge: true });
    await updateDoc(unmatchedRef, { attachedEmail: email, attachedAt: new Date().toISOString() });
    // A new lead goes to the least-loaded owner, so the work is spread from the first moment.
    const owners = eligibleOwners((await loadRoster(db, uid)).members);
    const all = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(2000)))).docs.map((d) => d.data());
    const assignee = pickOwner(owners, all);
    if (assignee) await updateDoc(dealRef, { assignedTo: assignee, assignedAt: new Date().toISOString(), assignedBy: 'auto' });
    // Link the replies already received from this number.
    const earlier = await getDocs(query(collection(db, 'users', uid, 'inbound_messages'), where('from', '==', phone), limit(200)));
    for (const d of earlier.docs) await updateDoc(d.ref, { matchedEmail: email }).catch(() => {});
    return json({ ok: true, email });
  } catch (e) {
    console.error('[inbound attach] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not make the lead. Try again.' }, 500);
  }
}
