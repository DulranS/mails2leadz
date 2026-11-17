// app/api/ai-cost-per-lead/route.js - the AI spend per lead for the signed-in account (pass 329). GET only.
import { NextResponse } from 'next/server';
import { getDb, uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { aiCostPerLead } from '../../../lib/ai-client.js';

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401, headers: NO_STORE });
  const r = await aiCostPerLead(getDb(), uid);
  return NextResponse.json({ success: true, ...r }, { headers: NO_STORE });
}
