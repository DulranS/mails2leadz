// app/api/insights/route.js - patterns in won and lost customers, and a check of a message against the owner's standard. Nothing is sent. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { patternsFor, critiqueFor, spendAuditFor, reactivationFor } from '../../../lib/server/insights.js';

const limiter = makeLimiter({ limit: 30, windowMs: 3600000 });
const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  if (!limiter.hit(who.uid).ok) return json({ error: 'Too many checks for now. Try again later.' }, 429);
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  if (body?.action === 'patterns') {
    const r = await patternsFor(db, who.uid);
    return json(r, r.ok ? 200 : 400);
  }
  if (body?.action === 'critique') {
    const text = String(body.text || '').trim();
    if (text.length < 10) return json({ error: 'Paste the message first.' }, 400);
    const channel = ['general', 'email', 'sms', 'whatsapp', 'web', 'video'].includes(body.channel) ? body.channel : 'general';
    const r = await critiqueFor(db, who.uid, text.slice(0, 3000), channel);
    return json(r, r.ok ? 200 : 400);
  }
  if (body?.action === 'spend_audit') return json(await spendAuditFor(db, who.uid), 200);
  if (body?.action === 'reactivation') return json(await reactivationFor(db, who.uid), 200);
  return json({ error: 'Unknown action.' }, 400);
}
