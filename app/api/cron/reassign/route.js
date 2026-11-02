// app/api/cron/reassign/route.js - once a day (05:40 UTC): hands an untouched new deal to another free owner, once. A deal untouched for an hour moves at the first daily run after that. Called by the host's scheduler
// with "Authorization: Bearer <CRON_SECRET>".
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { cronGate } from '../../../../lib/server/cron-auth.js';
import { runUntouchedReroutes } from '../../../../lib/server/reroute.js';

export const maxDuration = 300;

export async function GET(request) {
  const denied = cronGate(request);
  if (denied) return denied;
  try {
    const r = await runUntouchedReroutes(getDb());
    return NextResponse.json({ ok: true, ...r }, { headers: NO_STORE });
  } catch (e) {
    console.error('[cron/reassign] failed:', String(e?.message || '').slice(0, 120));
    return NextResponse.json({ error: 'Untouched deals could not be reassigned.' }, { status: 500, headers: NO_STORE });
  }
}
