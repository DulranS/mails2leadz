// app/api/deal-screen/route.js - screens a pasted or uploaded list of priced listings. Pure computation: nothing is sent, saved or fetched.
import { NextResponse } from 'next/server';
import { uidFromRequest, NO_STORE, getDb } from '../../../lib/server/route-helpers.js';
import { firestoreWatchStore } from '../../../lib/server/deal-watch-job.js';
import { rememberPrices } from '../../../lib/deal-watch.js';
import { parseCsv, detectDealColumns, screenDeals, parseMoney, MAX_ROWS } from '../../../lib/deal-screen.js';

const MAX_CHARS = 1500000;
const COLUMN_KEYS = ['price', 'title', 'group', 'location', 'url'];

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401, headers: NO_STORE });
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, error: 'Send the listings as CSV text.' }, { status: 400, headers: NO_STORE }); }
  const csv = String(body?.csv || '');
  if (!csv.trim()) return NextResponse.json({ success: false, error: 'Paste or upload a CSV first.' }, { status: 400, headers: NO_STORE });
  if (csv.length > MAX_CHARS) return NextResponse.json({ success: false, error: `That list is too large. Keep it under ${MAX_ROWS.toLocaleString()} listings.` }, { status: 413, headers: NO_STORE });

  const parsed = parseCsv(csv);
  if (!parsed.rows.length) return NextResponse.json({ success: false, error: 'No listings found. The first line must hold the column names.' }, { status: 400, headers: NO_STORE });
  const detected = detectDealColumns(parsed.headers);
  if (!detected.price) return NextResponse.json({ success: false, error: 'No price column found. Name one column "price" and try again.' }, { status: 400, headers: NO_STORE });

  // The owner may pick other columns; only real header names are accepted.
  const chosen = {};
  if (body.columns && typeof body.columns === 'object') {
    for (const k of COLUMN_KEYS) if (parsed.headers.includes(body.columns[k])) chosen[k] = body.columns[k];
  }
  const columns = { ...detected, ...chosen };
  const costs = body.costs && typeof body.costs === 'object' ? body.costs : {};
  const result = screenDeals({ rows: parsed.rows, columns, costs });
  // By default the prices are remembered, so the nightly watch can judge new listings against them. A failure here never blocks the screen.
  if (body.remember !== false) {
    try {
      const store = firestoreWatchStore(getDb());
      const st = await store.load(uid);
      const items = parsed.rows
        .map((r) => ({ title: r[columns.title] || '', group: columns.group ? r[columns.group] || '' : '', price: parseMoney(r[columns.price]) }))
        .filter((i) => i.price);
      await store.save(uid, { ...st, memory: rememberPrices(st.memory, items, Date.now()) });
    } catch (e) { console.error('deal-screen remember failed:', e?.message); }
  }
  return NextResponse.json({ success: true, headers: parsed.headers, columns, ...result }, { headers: NO_STORE });
}
