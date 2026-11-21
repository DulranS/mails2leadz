// app/api/loyalty/route.js - the owner reads points balances. ?email=a@b.c gives one balance; ?emails=a@b.c,d@e.f gives many (up to 100)
// in one answer, for the customers list. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { balanceFor } from '../../../lib/server/loyalty.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const sp = new URL(request.url).searchParams;
  if (sp.has('emails')) {
    const emails = [...new Set(sp.get('emails').split(',').map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e)))].slice(0, 100);
    const pairs = await Promise.all(emails.map(async (e) => [e, await balanceFor(db, who.uid, e)]));
    return NextResponse.json({ balances: Object.fromEntries(pairs) }, { headers: NO_STORE });
  }
  const email = sp.get('email') || '';
  if (!EMAIL.test(email)) return NextResponse.json({ error: 'Give a customer email.' }, { status: 400, headers: NO_STORE });
  return NextResponse.json({ points: await balanceFor(db, who.uid, email) }, { headers: NO_STORE });
}
