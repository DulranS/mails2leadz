// app/api/sales-tools/manage/route.js - objectives, competitor prices, accounts to reach, and the screen data. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { doc, getDoc } from '../../../../lib/server-firestore.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { economicsFor } from '../../../../lib/server/economics.js';
import { salesToolsData, saveSalesTools, positionVs } from '../../../../lib/server/gap-tools.js';
import { ugcBrief } from '../../../../lib/ugc.js';
import { dueJourneyActions } from '../../../../lib/server/journeys.js';
import { doc as fsDoc, setDoc } from '../../../../lib/server-firestore.js';
import { parseQueries } from '../../../../lib/places.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const money = await economicsFor(db, who.uid).catch(() => ({}));
  const data = await salesToolsData(db, who.uid, {}, money);
  const biz = (await getDoc(doc(db, 'users', who.uid, 'settings', 'business')).then((x) => x.data() || {}).catch(() => ({})));
  const prices = data.competitors.map((c) => c.price);
  return NextResponse.json({ ...data, journeys: biz.journeys || [], dueSteps: await dueJourneyActions(db, who.uid), position: data.yourPrice ? positionVs(data.yourPrice, prices) : null, ugc: ugcBrief({ businessName: money.businessName, offer: money.offer, idealCustomer: money.idealCustomer }) }, { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  if (body?.action === 'save_places_queries') {
    const placesQueries = parseQueries(body.text).join('\n');
    await setDoc(fsDoc(db, 'users', who.uid, 'settings', 'business'), { placesQueries }, { merge: true });
    return NextResponse.json({ ok: true, saved: parseQueries(body.text).length }, { headers: NO_STORE });
  }
  const r = await saveSalesTools(db, who.uid, String(body?.action || ''), body);
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: NO_STORE });
}
