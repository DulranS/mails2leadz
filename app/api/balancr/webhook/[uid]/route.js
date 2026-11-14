// POST /api/balancr/webhook/{uid}?token=...  Balancr posts a lead's stage change here. The token must match the one the owner set in both places.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getDb, NO_STORE } from '../../../../../lib/server/route-helpers.js';
import { balancrConfig, applyStageWebhook } from '../../../../../lib/server/balancr.js';

const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

export async function POST(request) {
  const url = new URL(request.url);
  const uid = decodeURIComponent(url.pathname.split('/').pop() || '');
  if (!uid || uid === 'item') return json({ error: 'Not found.' }, 404);
  const db = getDb();
  const c = await balancrConfig(db, uid);
  const given = url.searchParams.get('token') || '';
  if (!c || !c.webhookToken || !given) return json({ error: 'Not allowed.' }, 403);
  const a = Buffer.from(given), b = Buffer.from(c.webhookToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return json({ error: 'Not allowed.' }, 403);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  const r = await applyStageWebhook(db, uid, payload);
  return json(r);
}
