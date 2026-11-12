// app/api/social/route.js - drafts for your Facebook Page and Instagram; publishing only after you type POST. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { createSocialDraft, publishDraft, listSocialDrafts } from '../../../lib/server/social.js';

const limiter = makeLimiter({ limit: 40, windowMs: 3600000 });
const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  return json({ drafts: await listSocialDrafts(db, who.uid) });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  if (!limiter.hit(who.uid).ok) return json({ error: 'Too many requests for now.' }, 429);
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  if (body?.action === 'draft') { const r = await createSocialDraft(db, who.uid, body); return json(r, r.ok ? 200 : 400); }
  if (body?.action === 'post') { const r = await publishDraft(db, who.uid, String(body.id || ''), body.confirm); return json(r, r.ok ? 200 : 400); }
  return json({ error: 'Unknown action.' }, 400);
}
