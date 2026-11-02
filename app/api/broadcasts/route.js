// app/api/broadcasts/route.js - the owner's newsletters to the confirmed list. Signed-in owner only.
//   GET                           the broadcasts and their counts
//   POST {action:'create',subject,body}  make a draft (nothing is sent)
//   POST {action:'start',id}      take the recipient list (confirmed, not unsubscribed) and begin
//   POST {action:'run',id}        send the next batch (10 at most, paced; the daily cap applies)
//   POST {action:'cancel',id}     stop a draft or a sending broadcast
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { doc, getDoc } from '../../../lib/server-firestore.js';
import { createBroadcast, startBroadcast, runBroadcastBatch, cancelBroadcast, loadBroadcasts, scheduleBroadcast, unscheduleBroadcast } from '../../../lib/server/broadcast.js';

export const maxDuration = 60; // one batch of up to 10 paced sends

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const limiter = makeLimiter({ limit: 60, windowMs: 60000 });
const publicBase = () => String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  try {
    return json({ items: await loadBroadcasts(getDb(), who.uid) });
  } catch (e) {
    console.error('[broadcasts] load failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not load your broadcasts. Try again.' }, 500);
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const gate0 = limiter.hit(uid);
  if (!gate0.ok) return json({ error: `Too many requests. Try again in ${gate0.retryAfterSec} seconds.` }, 429);
  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;
  const action = String(body?.action || '');
  const id = String(body?.id || '').slice(0, 80);
  try {
    if (action === 'create') {
      const r = await createBroadcast(db, uid, body);
      return r.error ? json({ error: r.error }, 400) : json({ ok: true, id: r.id });
    }
    if (!id) return json({ error: 'Choose a broadcast.' }, 400);
    if (action === 'start') {
      const r = await startBroadcast(db, uid, id);
      return r.error ? json({ error: r.error }, 400) : json({ ok: true, total: r.total, capped: r.capped });
    }
    if (action === 'run') {
      const bizSnap = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
      const businessName = bizSnap.exists() ? String((bizSnap.data().profile || {}).businessName || '') : '';
      const r = await runBroadcastBatch(db, uid, id, { businessName, baseOk: /^https:\/\//i.test(publicBase()) });
      return r.error ? json({ error: r.error, done: !!r.done }, 400) : json(r);
    }
    if (action === 'schedule') {
      const r = await scheduleBroadcast(db, uid, id, String(body?.at || ''));
      return r.error ? json({ error: r.error }, 400) : json({ ok: true, scheduledFor: r.scheduledFor });
    }
    if (action === 'unschedule') {
      const r = await unscheduleBroadcast(db, uid, id);
      return r.error ? json({ error: r.error }, 400) : json({ ok: true });
    }
    if (action === 'cancel') {
      const r = await cancelBroadcast(db, uid, id);
      return r.error ? json({ error: r.error }, 400) : json({ ok: true });
    }
    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    console.error('[broadcasts] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Something went wrong. Try again.' }, 500);
  }
}
