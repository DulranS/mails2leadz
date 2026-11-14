// app/api/cron/balancr-sync/route.js - keeps AutoLeads and Balancr in step (v264): pulls the leads that arrived in Balancr, reconciles deal stages with
// their Balancr leads, and checks the status of open invoices that were sent to Balancr. Scheduled once a day; safe to run more often, since each step only
// writes what changed. Owners whose Balancr connection is not set up are skipped.
import { NextResponse } from 'next/server';
import { isAdminMode, collection, getDocs, query, where } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { listAutopilotUsers } from '../../../../lib/server/prepare-drafts.js';
import { pullLeads, reconcileDealStages, syncInvoice, balancrConfig } from '../../../../lib/server/balancr.js';
import { cronGate } from '../../../../lib/server/cron-auth.js';

export const maxDuration = 300;

export async function GET(request) {
  const denied = cronGate(request);
  if (denied) return denied;
  if (!isAdminMode()) return NextResponse.json({ error: 'Needs the server database connection (service account or server login).' }, { status: 503, headers: NO_STORE });
  const db = getDb();
  const summary = { owners: 0, skipped: 0, leadsAdded: 0, dealsChecked: 0, dealsUpdated: 0, dealsPushed: 0, invoicesChecked: 0 };
  const deadline = Date.now() + 270000;
  for (const uid of await listAutopilotUsers(db)) {
    if (Date.now() > deadline - 30000) break;
    if (!(await balancrConfig(db, uid))) { summary.skipped++; continue; }
    summary.owners++;
    try {
      const pulled = await pullLeads(db, uid);
      summary.leadsAdded += pulled.added || 0;
      const rec = await reconcileDealStages(db, uid);
      summary.dealsChecked += rec.checked || 0;
      summary.dealsUpdated += rec.updated || 0;
      summary.dealsPushed += rec.pushed || 0;
      const invs = (await getDocs(collection(db, 'users', uid, 'invoices'))).docs.map((d) => ({ id: d.id, ...d.data() }));
      for (const inv of invs.filter((i) => i.balancrInvoiceKey && i.status !== 'paid').slice(0, 50)) {
        summary.invoicesChecked++;
        await syncInvoice(db, uid, inv.id, inv.balancrInvoiceKey);
      }
    } catch { /* one owner's failure does not stop the rest */ }
  }
  return NextResponse.json({ ok: true, ...summary }, { headers: NO_STORE });
}
