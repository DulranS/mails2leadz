// app/api/broadcasts/route.js - segments, draft broadcasts (approved by the owner before any send), consent records, and the campaign report. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { collection, getDocs, query, limit } from '../../../lib/server-firestore.js';
import { previewSegment, createDraft, sendDraft, recordAgreement, reportFor } from '../../../lib/server/broadcasts.js';

const limiter = makeLimiter({ limit: 60, windowMs: 3600000 });
const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const broadcasts = (await getDocs(query(collection(db, 'users', who.uid, 'broadcasts'), limit(50)))).docs.map((d) => ({ id: d.id, ...d.data(), recipients: undefined, recipientCount: (d.data().recipients || []).length }));
  return json({ broadcasts, report: await reportFor(db, who.uid) });
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
  const filter = body?.filter || {};
  if (body?.action === 'preview') return json({ ok: true, ...(await previewSegment(db, who.uid, filter)) });
  if (body?.action === 'draft') { const r = await createDraft(db, who.uid, { name: body.name, subject: body.subject, text: body.text, filter, channel: body.channel === 'sms' ? 'sms' : 'email' }); return json(r, r.ok ? 200 : 400); }
  if (body?.action === 'send') {
    if (body.confirm !== 'SEND') return json({ error: 'Type SEND to approve this batch.' }, 400);
    const r = await sendDraft(db, who.uid, String(body.id || ''), { fromName: '' });
    return json(r, r.ok ? 200 : 400);
  }
  if (body?.action === 'consent') { const r = await recordAgreement(db, who.uid, String(body.email || ''), body.consented === true, body.channel === 'sms' ? 'sms' : 'email'); return json(r, r.ok ? 200 : 400); }
  return json({ error: 'Unknown action.' }, 400);
}
