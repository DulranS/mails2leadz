// app/api/ai-smart-outreach/route.js
// Drafts a personalised outreach email for ONE prospect. It never sends anything:
// the user reviews/edits the draft in the dashboard and sends it through the normal
// send pipeline (duplicate protection, logging, tracking, follow-up tasks).
// The drafting rules live in lib/server/draft-core.js (shared with the overnight draft preparation).
import { NextResponse } from 'next/server';
import { AiError } from '../../../lib/ai-client.js';
import { getDb } from '../../../lib/server/route-helpers.js';
import { draftFirstEmail, DraftError } from '../../../lib/server/draft-core.js';

export async function POST(request) {
  try {
    let db;
    try { db = getDb(); } catch (err) { console.error('Firebase init failed:', err.message); }
    if (!db) return NextResponse.json({ error: 'Database not initialised' }, { status: 500 });
    const { companyName, companyWebsite, contactEmail, contactName, userId: bodyUserId, senderName, category, location } = await request.json();
    const userId = request.headers.get('x-user-id') || bodyUserId; // the verified user wins over the body
    if (!companyName || !userId) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const r = await draftFirstEmail({ db, uid: userId, companyName, companyWebsite, contactEmail, contactName, senderName, category, location });
    return NextResponse.json({ success: true, ...r });
  } catch (error) {
    if (error instanceof DraftError) return NextResponse.json({ success: false, ...(error.code ? { code: error.code } : {}), error: error.message }, { status: error.status });
    if (error instanceof AiError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status });
    console.error('ai-smart-outreach error:', error);
    return NextResponse.json({ success: false, error: 'Could not create a draft right now.' }, { status: 500 });
  }
}
