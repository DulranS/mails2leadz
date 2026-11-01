// app/api/credit-notes/route.js - issue a credit note for money owed back on a revised quote, then settle it.
//   { action: 'issue', quoteId }                 -> creates CN-#### against the quote (once; a second call returns the same note)
//   { action: 'hold' | 'apply' | 'refund', id }  -> hold as credit for the next invoice, apply it, or record a cash refund
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { addDoc, collection, doc, getDoc, updateDoc } from '../../../lib/server-firestore.js';
import { buildCreditNote, settleCredit } from '../../../lib/credit-notes.js';
import { nextCreditNumber } from '../../../lib/server/credit-number.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const SETTLE_ACTIONS = ['hold', 'apply', 'refund'];

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;
  const action = String(body?.action || '');

  try {
    if (action === 'issue') {
      const quoteId = String(body?.quoteId || '').trim();
      if (!quoteId) return json({ error: 'Choose a quote.' }, 400);
      const qRef = doc(db, 'users', uid, 'quotes', quoteId);
      const qs = await getDoc(qRef);
      if (!qs.exists()) return json({ error: 'That quote was not found.' }, 404);
      const q = qs.data();
      if (q.creditNoteId) return json({ ok: true, id: q.creditNoteId, number: q.creditNoteNumber, already: true });
      if (!(Math.round((Number(q.refundDue) || 0) * 100) > 0)) return json({ error: 'Nothing is owed back on this quote.' }, 400);
      const number = await nextCreditNumber(db, uid);
      const built = buildCreditNote({ uid, quoteId, quote: q, currency: q.currency, amount: q.refundDue, number });
      if (!built.ok) return json({ error: built.error }, 400);
      const ref = await addDoc(collection(db, 'credit_notes'), built.write);
      await updateDoc(qRef, { creditNoteId: ref.id, creditNoteNumber: number });
      return json({ ok: true, id: ref.id, number });
    }

    if (SETTLE_ACTIONS.includes(action)) {
      const id = String(body?.id || '').trim();
      if (!id) return json({ error: 'Choose a credit note.' }, 400);
      const ref = doc(db, 'credit_notes', id);
      const snap = await getDoc(ref);
      if (!snap.exists() || snap.data().userId !== uid) return json({ error: 'That credit note was not found.' }, 404);
      const r = settleCredit(snap.data(), action);
      if (!r.ok) return json({ error: r.error }, 409);
      await updateDoc(ref, r.patch);
      return json({ ok: true, status: r.patch.status });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    console.error('[credit-notes] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not save the credit note. Try again.' }, 500);
  }
}
