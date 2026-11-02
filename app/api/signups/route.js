// app/api/signups/route.js - the owner's mailing list: counts, exports, and the sign-up link. Signed-in owner only.
//   GET  ?format=summary                 counts by status
//   GET  ?format=contacts&status=...     contacts file (confirmed by default), no unsubscribed or suppressed addresses
//   GET  ?format=audience&status=...     hashed addresses for ad platforms (custom audiences)
//   POST {action:'newKey'}               makes a new sign-up link; the previous link stops working
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { doc, setDoc } from '../../../lib/server-firestore.js';
import { sanitizeMagnet } from '../../../lib/signup.js';
import { loadList, suppressedEmails } from '../../../lib/server/signup.js';
import { countsByStatus, exportRows, contactsCsv, audienceCsv, newSignupKey, SIGNUP_LIMITS } from '../../../lib/signup.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const limiter = makeLimiter({ limit: 20, windowMs: 60000 });
const STATUSES = ['confirmed', 'pending', 'all'];
const publicBase = () => String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: `Too many requests. Try again in ${gate.retryAfterSec} seconds.` }, 429);
  const sp = new URL(request.url).searchParams;
  const format = sp.get('format') || 'summary';
  const status = sp.get('status') || 'confirmed';
  if (!['summary', 'contacts', 'audience'].includes(format)) return json({ error: 'Choose summary, contacts or audience.' }, 400);
  if (!STATUSES.includes(status)) return json({ error: 'Choose confirmed, pending or all.' }, 400);
  const db = getDb();
  const gate2 = await guardTenant(db, who.uid);
  if (gate2.response) return gate2.response;
  try {
    const list = await loadList(db, who.uid);
    if (format === 'summary') return json({ counts: countsByStatus(list), cap: SIGNUP_LIMITS.listMax });
    const suppressed = await suppressedEmails(db, who.uid);
    const rows = exportRows(list, { status, suppressed });
    const csv = format === 'contacts' ? contactsCsv(rows) : audienceCsv(rows);
    const name = `autoleads-${format}-${status}.csv`;
    return new Response('\uFEFF' + csv, { headers: { ...NO_STORE, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` } });
  } catch (e) {
    console.error('[signups] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not load the list. Try again in a minute.' }, 500);
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: `Too many requests. Try again in ${gate.retryAfterSec} seconds.` }, 429);
  if (body?.action === 'magnet') {
    const m = sanitizeMagnet(body);
    if (!m.ok) return json({ error: m.error }, 400);
    const db = getDb();
    const gate3 = await guardTenant(db, who.uid);
    if (gate3.response) return gate3.response;
    await setDoc(doc(db, 'users', who.uid, 'settings', 'list'), m.value, { merge: true });
    return json({ ok: true });
  }
  if (body?.action !== 'newKey') return json({ error: 'Unknown action.' }, 400);
  const base = publicBase();
  if (!/^https:\/\//i.test(base)) return json({ error: 'Set the public web address (https) in the server settings before making a sign-up link.' }, 503);
  const db = getDb();
  const gate2 = await guardTenant(db, who.uid);
  if (gate2.response) return gate2.response;
  try {
    const key = newSignupKey(who.uid);
    await setDoc(doc(db, 'users', who.uid, 'settings', 'list_key'), { hash: key.hash, createdAt: key.createdAt, revokedAt: null });
    // The full link is shown once. Only a hash of its secret is stored.
    return json({ ok: true, url: `${base}/api/signup?k=${key.raw}` });
  } catch (e) {
    console.error('[signups] key failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not make the link. Try again.' }, 500);
  }
}
