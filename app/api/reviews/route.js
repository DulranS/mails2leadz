// app/api/reviews/route.js - the owner's logged reviews. Reads for any signed-in member; viewers cannot add or answer (pass 341).
import { NextResponse } from 'next/server';
import { identify, getDb, actorFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { listReviews, addReview, markReviewAnswered } from '../../../lib/server/reviews.js';
import { sanitizeReview, reviewAlerts, isBadReview } from '../../../lib/reviews.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const rows = await listReviews(getDb(), who.uid);
  return NextResponse.json({
    reviews: rows,
    alerts: reviewAlerts(rows),
    badCount: rows.filter(isBadReview).length,
  }, { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const actor = actorFromRequest(request);
  if (actor.role === 'viewer') {
    return NextResponse.json({ error: 'Viewers can read reviews but cannot change them.', code: 'VIEWER_READ_ONLY' }, { status: 403, headers: NO_STORE });
  }
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send the review as JSON.' }, { status: 400, headers: NO_STORE }); }
  const db = getDb();
  const action = String(body?.action || '');

  if (action === 'add') {
    const s = sanitizeReview(body);
    if (!s.ok) return NextResponse.json({ error: s.error }, { status: 400, headers: NO_STORE });
    const id = await addReview(db, who.uid, s.review, { createdBy: actor.uid });
    return NextResponse.json({ ok: true, id }, { headers: NO_STORE });
  }
  if (action === 'answer') {
    try {
      const r = await markReviewAnswered(db, who.uid, body?.id);
      return NextResponse.json(r.ok ? { ok: true } : { error: r.error }, { status: r.ok ? 200 : 400, headers: NO_STORE });
    } catch {
      return NextResponse.json({ error: 'That review was not found.' }, { status: 404, headers: NO_STORE });
    }
  }
  return NextResponse.json({ error: 'Unknown review action.' }, { status: 400, headers: NO_STORE });
}
