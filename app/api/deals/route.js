// app/api/deals/route.js - buy-side sourcing and sell-side readiness for the signed-in owner. Nothing here sends anything or trades.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { searchCompanies, trackCompany, addListing, setStage, listTargets } from '../../../lib/server/deals.js';
import { dealCheck, valueRange, readiness } from '../../../lib/deals/valuation.js';

const limiter = makeLimiter({ limit: 120, windowMs: 3600000 });
const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const p = new URL(request.url).searchParams;
  if (p.get('a') === 'search') {
    const r = await searchCompanies(db, who.uid, p.get('q'));
    return json(r, r.ok ? 200 : 400);
  }
  return json({ targets: await listTargets(db, who.uid) });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: 'Too many requests for now.' }, 429);
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  const a = String(body?.action || '');
  if (a === 'track') { const r = await trackCompany(db, who.uid, body.companyNumber, { sicFit: Array.isArray(body.sicFit) ? body.sicFit.map(String).slice(0, 20) : [] }); return json(r, r.ok ? 200 : 400); }
  if (a === 'listing') { const r = await addListing(db, who.uid, body); return json(r, r.ok ? 200 : 400); }
  if (a === 'stage') { const r = await setStage(db, who.uid, body.id, String(body.to || '')); return json(r, r.ok ? 200 : 400); }
  if (a === 'check') {
    // buy side: is this asking price reasonable against the owner's own benchmark?
    const r = dealCheck({ price: num(body.price, 0, 1e12), profit: num(body.profit, 0, 1e12), revenue: num(body.revenue, 0, 1e12), benchmarkLow: num(body.benchmarkLow, 0, 100) ?? 2.5, benchmarkHigh: num(body.benchmarkHigh, 0, 100) ?? 4, costOfCapital: num(body.costOfCapital, 0, 1) ?? 0.1 });
    return json(r ? { ok: true, ...r } : { error: 'Enter a price and a profit above zero.' }, r ? 200 : 400);
  }
  if (a === 'value') {
    const r = valueRange({ profit: num(body.profit, 0, 1e12), low: num(body.low, 0, 100) ?? 2.5, high: num(body.high, 0, 100) ?? 4 });
    return json(r ? { ok: true, ...r } : { error: 'Enter a profit above zero.' }, r ? 200 : 400);
  }
  if (a === 'readiness') {
    const r = readiness({ accountsUpToDate: body.accountsUpToDate === true, topCustomerShare: num(body.topCustomerShare, 0, 1), recurringShare: num(body.recurringShare, 0, 1), ownerDependence: num(body.ownerDependence, 0, 1), growthLastYear: num(body.growthLastYear, -1e9, 1e9), unsatisfiedCharges: num(body.unsatisfiedCharges, 0, 1000) ?? 0 });
    return json({ ok: true, ...r });
  }
  return json({ error: 'Unknown action.' }, 400);
}
