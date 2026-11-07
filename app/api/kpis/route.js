// app/api/kpis/route.js - the sales, buy-side, speed and support measures for the signed-in owner. Read once when the screen opens.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { collection, getDocs, query, where, limit } from '../../../lib/server-firestore.js';
import { listTargets } from '../../../lib/server/deals.js';
import { ticketsFor } from '../../../lib/server/support-queue.js';
import { salesKpis } from '../../../lib/sales-kpis.js';

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
  return NextResponse.json({ kpis: salesKpis({ deals, leads, targets, tickets: support.tickets }), support: support.kpis }, { headers: NO_STORE });
}
