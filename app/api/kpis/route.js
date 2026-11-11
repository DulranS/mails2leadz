// app/api/kpis/route.js - the sales, buy-side, speed and support measures for the signed-in owner. Read once when the screen opens.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { collection, doc, getDoc, getDocs, query, where, limit } from '../../../lib/server-firestore.js';
import { listTargets } from '../../../lib/server/deals.js';
import { ticketsFor } from '../../../lib/server/support-queue.js';
import { salesKpis } from '../../../lib/sales-kpis.js';
import { economicsFor, saveBusinessProfile } from '../../../lib/server/economics.js';
import { quarterForecast, dealHealth } from '../../../lib/health.js';
import { demandTrend } from '../../../lib/demand.js';
import { repScorecard } from '../../../lib/insights.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const [deals, leads, targets, support] = await Promise.all([
    getDocs(query(collection(db, 'deals'), where('userId', '==', who.uid), limit(1000))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
    getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', who.uid), limit(1000))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
    listTargets(db, who.uid).catch(() => []),
    ticketsFor(db, who.uid).catch(() => ({ tickets: [], kpis: null })),
  ]);
  const money = await economicsFor(db, who.uid).catch(() => null);
  const now = Date.now();
  const forecast = quarterForecast({ deals, monthlyTarget: money?.targets?.monthlyRevenue || 0, now });
  const atRisk = deals.map((d) => ({ name: d.businessName || d.email || 'Deal', value: d.value || 0, health: dealHealth(d, now) })).filter((d) => d.health && d.health.status === 'at_risk').sort((a, b) => b.value - a.value).slice(0, 5);
  const demand = demandTrend(leads, now);
  const teamDoc = (await getDoc(doc(db, 'users', who.uid, 'settings', 'team')).catch(() => null))?.data?.() || {};
  const memberList = Array.isArray(teamDoc.members) ? teamDoc.members : [];
  const reps = repScorecard(deals, now).map((r) => ({ ...r, name: r.owner === 'unassigned' ? 'Unassigned' : (memberList.find((m) => String(m.id) === String(r.owner))?.name || 'Team member') }));
  return NextResponse.json({ kpis: salesKpis({ deals, leads, targets, tickets: support.tickets }), support: support.kpis, money, forecast, atRisk, demand, reps }, { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  return NextResponse.json(await saveBusinessProfile(db, who.uid, body || {}), { headers: NO_STORE });
}
