// app/api/unsubscribe/route.js - PUBLIC (listed in proxy.js). A recipient opts out through the signed link in an email.
//
// POST does the work: that is what RFC 8058 "one-click" (Gmail/Yahoo's Unsubscribe button) sends, and what the
// /unsubscribe page sends when the person presses the button. GET never changes anything (mail scanners and link
// previewers open links automatically, and must not unsubscribe people by accident): it only redirects to the page.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, isAdminMode } from '../../../lib/server-firestore.js';
import { verifyUnsubToken } from '../../../lib/server/unsubscribe.js';
import { dealDocId, buildDealWrite, OPEN_STAGES, normalizeStage } from '../../../lib/deal-utils.js';

const tokenOf = (request) => new URL(request.url).searchParams.get('t') || '';

export async function GET(request) {
  const t = tokenOf(request);
  return NextResponse.redirect(new URL(`/unsubscribe${t ? `?t=${encodeURIComponent(t)}` : ''}`, request.url), 303);
}

export async function POST(request) {
  const who = verifyUnsubToken(tokenOf(request));
  if (!who) return NextResponse.json({ ok: false, error: 'This opt-out link is not valid.' }, { status: 400, headers: NO_STORE });
  if (!isAdminMode()) {
    return NextResponse.json({ ok: false, error: 'Opt-out is temporarily unavailable. Please reply to the email and ask to be removed.' }, { status: 503, headers: NO_STORE });
  }

  const { uid, email } = who;
  const nowIso = new Date().toISOString();
  try {
    const db = getDb();
    const id = dealDocId(uid, email);

    // 1) The suppression list: every send and AI-draft route checks this before contacting anyone.
    await setDoc(doc(db, 'suppressions', id), { userId: uid, email, source: 'unsubscribe_link', createdAt: nowIso }, { merge: true });

    // 2) Mark an open deal Lost (reason: opted out) so the pipeline, follow-up queue and win rate stay truthful.
    //    A customer who already bought (Won/Delivery/...) keeps their stage: they only stop receiving outreach.
    try {
      const dealRef = doc(db, 'deals', id);
      const snap = await getDoc(dealRef);
      if (snap.exists() && OPEN_STAGES.includes(normalizeStage(snap.data().stage))) {
        const write = buildDealWrite({ uid, email, stage: 'closed_lost', existing: snap.data() });
        await updateDoc(dealRef, { ...write, lostReason: 'unsubscribed', unsubscribedAt: nowIso });
      }
    } catch (e) {
      console.error('[unsubscribe] deal update failed (suppression is saved):', e.message);
    }

    // 3) Cancel pending follow-up reminders for this person.
    try {
      const sent = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('to', '==', email)));
      for (const d of sent.docs) await updateDoc(d.ref, { followUpAt: null });
    } catch (e) {
      console.error('[unsubscribe] could not clear follow-ups:', e.message);
    }

    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    console.error('[unsubscribe] failed:', e.message);
    return NextResponse.json({ ok: false, error: 'Something went wrong. Please try again in a minute.' }, { status: 500, headers: NO_STORE });
  }
}
