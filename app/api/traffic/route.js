// app/api/traffic/route.js - website traffic for the Dashboard: the last 28 days from Google Analytics 4 (pass 341).
// A reading is kept in settings/business (webTotals.ga4) and reused for 12 hours. Without a property or a Google connection it says so.
import { NextResponse } from 'next/server';
import { doc, getDoc, setDoc } from '../../../lib/server-firestore.js';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { secretsFor } from '../../../lib/server/integration-secrets.js';
import { googleAccessToken, ga4Report, isFresh, trafficView } from '../../../lib/traffic.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  const now = Date.now();
  const s = await secretsFor(db, who.uid, ['GSC_REFRESH_TOKEN', 'GA4_PROPERTY_ID']).catch(() => ({}));
  const hasProperty = !!s.GA4_PROPERTY_ID;
  const hasRefresh = !!s.GSC_REFRESH_TOKEN;
  if (!hasProperty || !hasRefresh) return NextResponse.json(trafficView(null, { hasProperty, hasRefresh }), { headers: NO_STORE });

  const ref = doc(db, 'users', who.uid, 'settings', 'business');
  const saved = await getDoc(ref).then((x) => x.data()?.webTotals?.ga4 || null).catch(() => null);
  let ga4 = saved;
  if (!saved?.at || !isFresh(saved.at, now)) {
    const token = await googleAccessToken(s.GSC_REFRESH_TOKEN, process.env, fetch).catch(() => '');
    const fresh = await ga4Report({ token, propertyId: s.GA4_PROPERTY_ID, fetchImpl: fetch, now });
    ga4 = { ...fresh, at: fresh.at || new Date(now).toISOString() }; // a failed try is also remembered for 12 hours, so Google is not called on every load
    await setDoc(ref, { webTotals: { ga4 } }, { merge: true }).catch(() => {});
  }
  return NextResponse.json(trafficView(ga4, { hasProperty, hasRefresh }), { headers: NO_STORE });
}
