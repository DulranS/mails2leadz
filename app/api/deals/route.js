// app/api/deals/route.js - buy-side sourcing and sell-side readiness for the signed-in owner. Nothing here sends anything or trades.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { doc, getDoc, setDoc } from '../../../lib/server-firestore.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { searchCompanies, trackCompany, addListing, setStage, listTargets } from '../../../lib/server/deals.js';
import { dealCheck, valueRange, readiness } from '../../../lib/deals/valuation.js';
import { parseComps, compsSummary, resaleMargin, ASSET_CLASSES } from '../../../lib/deals/resale.js';
import { addAssetListing, setComps } from '../../../lib/server/deals.js';
import { soldPricesFor } from '../../../lib/server/landregistry.js';
import { searchUndervalued } from '../../../lib/server/ebay-discovery.js';
import { classifyLink } from '../../../lib/deals/link.js';

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
  if (a === 'asset') {
    const cls = String(body.assetClass || '');
    if (!ASSET_CLASSES[cls]) return json({ error: 'Choose an asset class: vehicle, property, goods or business.' }, 400);
    const r = await addAssetListing(db, who.uid, { ...body, assetClass: cls });
    return json(r, r.ok ? 200 : 400);
  }
  if (a === 'comps') {
    const { comps, skipped } = parseComps(body.text);
    const r = await setComps(db, who.uid, body.id, comps);
    const summary = compsSummary(comps, num(body.askingPrice, 0, 1e12));
    return json({ ...r, skipped, summary }, r.ok ? 200 : 400);
  }
  if (a === 'landregistry') {
    // UK sold prices for a postcode, kept on the listing when an id is given; the owner can always paste prices instead
    const r = await soldPricesFor(body.postcode);
    if (!r.ok) return json(r, 502);
    const summary = compsSummary(r.comps, num(body.askingPrice, 0, 1e12));
    if (body.id) await setComps(db, who.uid, body.id, r.comps.slice(0, 50));
    return json({ ok: true, count: r.comps.length, cached: r.cached, summary, comps: r.comps.slice(0, 10) });
  }
  if (a === 'link') {
    const read = classifyLink(body.url);
    if (read.kind === 'unsupported') return json({ ok: false, error: read.reason }, 400);
    if (read.kind === 'companies_house') {
      const r = await trackCompany(db, who.uid, read.companyNumber, {});
      return json(r.ok ? { ok: true, message: `Tracking ${read.companyNumber}. Signal score ${r.score}.` } : r, r.ok ? 200 : 400);
    }
    // an eBay search: the words are added to the saved searches (up to five), then searched now
    const snap = await getDoc(doc(db, 'users', who.uid, 'settings', 'business')).catch(() => null);
    const current = Array.isArray(snap?.data?.()?.dealSearches) ? snap.data().dealSearches : [];
    const terms = [...new Set([...current, read.keyword])].slice(0, 5);
    await setDoc(doc(db, 'users', who.uid, 'settings', 'business'), { dealSearches: terms }, { merge: true });
    const found = await searchUndervalued(db, who.uid);
    return json({ ok: true, message: `Searching eBay for "${read.keyword}". ${found.added || 0} new candidate${found.added === 1 ? '' : 's'}.` });
  }
  if (a === 'searches') {
    const terms = (Array.isArray(body.terms) ? body.terms : String(body.terms || '').split(/[,\n]/)).map((t) => String(t).trim().slice(0, 80)).filter((t) => t.length >= 2).slice(0, 5);
    await setDoc(doc(db, 'users', who.uid, 'settings', 'business'), { dealSearches: terms }, { merge: true });
    return json({ ok: true, saved: terms.length });
  }
  if (a === 'discover') {
    const r = await searchUndervalued(db, who.uid);
    return json({ ok: true, ...r });
  }
  if (a === 'margin') {
    const m = resaleMargin({ buyPrice: num(body.buyPrice, 0, 1e12), expectedSale: num(body.expectedSale, 0, 1e12), fees: num(body.fees, 0, 1e12) ?? 0, transport: num(body.transport, 0, 1e12) ?? 0, repairs: num(body.repairs, 0, 1e12) ?? 0, holdingPerMonth: num(body.holdingPerMonth, 0, 1e12) ?? 0, months: num(body.months, 0, 120) ?? 0, taxRatePct: num(body.taxRatePct, 0, 100) ?? 0, minMarginPct: num(body.minMarginPct, -100, 1000) ?? 15 });
    return json(m ? { ok: true, ...m } : { error: 'Enter a buy price and an expected sale price above zero.' }, m ? 200 : 400);
  }
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
