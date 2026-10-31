// app/api/quotes/milestone/route.js - the owner invoices the next payment milestone of an accepted quote (in order, once each).
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc, getDoc } from '../../../../lib/server-firestore.js';
import { nextMilestoneIndex } from '../../../../lib/quote-core.js';
import { releaseMilestone } from '../../../../lib/server/milestones.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const id = String(body?.id || '').slice(0, 80);
  if (!id) return json({ error: 'Choose the quote.' }, 400);
  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;

  const snap = await getDoc(doc(db, 'users', uid, 'quotes', id));
  if (!snap.exists()) return json({ error: 'This quote could not be found.' }, 404);
  const quote = { id, ...snap.data() };
  if (quote.status !== 'accepted') return json({ error: 'Milestones are invoiced once the quote is accepted.' }, 409);
  const index = nextMilestoneIndex(quote.milestones);
  if (index < 0) return json({ error: 'Every milestone is already invoiced.' }, 409);
  const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
  try {
    const r = await releaseMilestone(db, uid, quote, index, biz.exists() ? biz.data() : {});
    if (r.error) return json({ error: r.error }, 409);
    return json({ ok: true, invoiced: quote.milestones[index].label, invoiceId: r.invoiceId });
  } catch (e) {
    console.error('[milestone] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not create the invoice. Try again.' }, 500);
  }
}
