// app/api/ad-spend/sync/route.js - brings in the last three months of Meta and Google Ads spend for THIS account (read-only).
// Months entered by hand are never overwritten (see lib/server/ad-import.js).
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { syncAdSpend } from '../../../../lib/server/ad-sync.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  try {
    const result = await syncAdSpend(db, who.uid);
    if (!result.meta && !result.google) return json({ error: 'Connect Meta Ads or Google Ads first (see Integrations).' }, 409);
    return json({ ok: true, result });
  } catch (e) {
    console.error('[ad-spend sync] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not sync the ad spend. Try again.' }, 500);
  }
}
