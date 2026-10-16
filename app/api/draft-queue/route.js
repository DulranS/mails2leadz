// app/api/draft-queue/route.js - drafts that were prepared ahead of time, waiting for the owner's review.
//   GET                          -> the drafts still worth sending (anything that went stale since it was written is dropped first)
//   POST { action: 'prepare' }   -> prepare drafts now (the same job the nightly run does), for this owner only
//   POST { action: 'resolve', sent: [ids], dismissed: [ids] } -> close drafts after the review window
// Nothing is sent here: sending is the review window's Send button -> /api/send-email | /api/send-followup.
import { NextResponse } from 'next/server';
import { collection, doc, getDoc, getDocs, query, where, setDoc, isAdminMode } from '../../../lib/server-firestore.js';
import { getDb, uidFromRequest, pickOriginal, isBlockedContact, NO_STORE } from '../../../lib/server/route-helpers.js';
import { loadAutopilot, readyDrafts, prepareDraftsForUser } from '../../../lib/server/prepare-drafts.js';
import { QUEUE_KINDS, QUEUE_STATUS, isDraftStale, toReviewItem, summarizeQueue } from '../../../lib/draft-queue.js';
import { MAX_FOLLOW_UPS } from '../../../lib/server/draft-core.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { inboxDocId } from '../../../lib/server/ingest-key.js';
import { inboxKey, INBOX_STATUS } from '../../../lib/lead-inbox.js';

export const maxDuration = 60;
const NEEDS_ADMIN = 'Prepared drafts need the server connection to the database. Set FIREBASE_SERVICE_ACCOUNT_JSON on the server first.';

/** Has anything changed since the draft was written that makes sending it wrong? (replied, opted out / Lost, already emailed, step already sent) */
async function stillGood(db, uid, q) {
  if (isDraftStale(q.createdAt)) return false;
  if (await isBlockedContact(db, uid, q.email)) return false;
  const sent = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('to', '==', q.email)));
  if (q.kind === QUEUE_KINDS.FIRST) return sent.empty; // somebody (or you, by hand) already emailed them
  if (sent.empty || sent.docs.some((d) => d.data().replied === true)) return false;
  return pickOriginal(sent.docs).count + 1 === q.number && q.number <= MAX_FOLLOW_UPS;
}

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: NO_STORE });
  if (!isAdminMode()) return NextResponse.json({ items: [], summary: summarizeQueue([]), available: false }, { headers: NO_STORE });
  const db = getDb();
  const ready = await readyDrafts(db, uid);
  const keep = [];
  for (const q of ready) {
    let ok = false;
    try { ok = await stillGood(db, uid, q); } catch { ok = true; } // an outage of the check must not hide good drafts; the send routes re-check everything
    if (ok) keep.push(q);
    else await setDoc(q.ref, { status: QUEUE_STATUS.STALE, staleAt: new Date().toISOString() }, { merge: true }).catch(() => {});
  }
  // best first: follow-ups (a lead is waiting on you) ahead of first emails, then HOT before WARM
  keep.sort((a, b) => (a.kind === b.kind ? (b.score || 0) - (a.score || 0) : a.kind === QUEUE_KINDS.FOLLOWUP ? -1 : 1));
  return NextResponse.json({ items: keep.map((q) => ({ kind: q.kind, ...toReviewItem(q, q.id) })), summary: summarizeQueue(keep), available: true }, { headers: NO_STORE });
}

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: NO_STORE });
  if (!isAdminMode()) return NextResponse.json({ error: NEEDS_ADMIN }, { status: 503, headers: NO_STORE });
  const db = getDb();
  const body = await request.json().catch(() => ({}));

  if (body.action === 'prepare') {
    const gate = await guardTenant(db, uid, { feature: 'autopilot' }); // plan / trial / suspension (SAAS_MODE only)
    if (gate.response) return gate.response;
    const settings = await loadAutopilot(db, uid);
    if (typeof body.senderName === 'string' && body.senderName.trim()) settings.senderName = body.senderName.trim().slice(0, 80);
    // Manual "prepare now" works even when the nightly switch is off: the owner asked for it.
    const result = await prepareDraftsForUser(db, uid, { settings: { ...settings, firstPerRun: settings.firstPerRun || 10, followUpsPerRun: settings.followUpsPerRun || 10 }, deadline: Date.now() + 50000 });
    return NextResponse.json({ success: true, ...result }, { headers: NO_STORE });
  }

  if (body.action === 'resolve') {
    const mark = async (ids, status) => {
      for (const id of (Array.isArray(ids) ? ids : []).slice(0, 60)) {
        if (typeof id !== 'string' || !id.startsWith(`${uid}_`)) continue; // only this owner's drafts
        const ref = doc(db, 'draft_queue', id);
        await setDoc(ref, { status, resolvedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        if (status === QUEUE_STATUS.SENT) {
          // A first email that went out: the lead is no longer "new" in the Lead Inbox.
          try {
            const q = (await getDoc(ref)).data();
            if (q?.kind === QUEUE_KINDS.FIRST && q.email) await setDoc(doc(db, 'lead_inbox', inboxDocId(uid, inboxKey({ email: q.email }))), { status: INBOX_STATUS.LOADED }, { merge: true });
          } catch { /* cosmetic: the inbox also hides anyone already emailed */ }
        }
      }
    };
    await mark(body.sent, QUEUE_STATUS.SENT);
    await mark(body.dismissed, QUEUE_STATUS.DISMISSED);
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400, headers: NO_STORE });
}
