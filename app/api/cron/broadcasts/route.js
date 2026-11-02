// app/api/cron/broadcasts/route.js - the scheduled newsletter run (once a day, 09:15 UTC: Vercel's Hobby plan allows daily cron jobs only). Starts due newsletters and sends a bounded number of
// batches, fairly across accounts. Called by the host's scheduler with "Authorization: Bearer <CRON_SECRET>".
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { cronGate } from '../../../../lib/server/cron-auth.js';
import { runDueBroadcasts } from '../../../../lib/server/broadcast.js';

export const maxDuration = 300;

export async function GET(request) {
  const denied = cronGate(request);
  if (denied) return denied;
  try {
    const baseOk = /^https:\/\//i.test(String(process.env.NEXT_PUBLIC_BASE_URL || '').trim());
    const r = await runDueBroadcasts(getDb(), { baseOk });
    return NextResponse.json({ ok: true, ...r }, { headers: NO_STORE });
  } catch (e) {
    console.error('[cron/broadcasts] failed:', String(e?.message || '').slice(0, 120));
    return NextResponse.json({ error: 'Scheduled newsletters could not run.' }, { status: 500, headers: NO_STORE });
  }
}
