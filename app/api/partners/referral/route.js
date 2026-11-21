// app/api/partners/referral/route.js - a signed-in company enters the referral code of the partner who brought it (pass 348).
// Kept only if the account has no partner yet. The code is checked against an active partner; the account cannot pick its own partner.
import { NextResponse } from 'next/server';
import { uidFromRequest, NO_STORE, getDb } from '../../../../lib/server/route-helpers.js';
import { captureReferral } from '../../../../lib/server/software-partners.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return json({ ok: false, error: 'Please sign in again.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
  try {
    const r = await captureReferral(getDb(), uid, { code: body?.code, email: request.headers.get('x-user-email') || '' });
    return json(r, r.ok ? 200 : 400);
  } catch {
    return json({ ok: false, error: 'Could not save the referral. Try again.' }, 500);
  }
}
