// app/api/deals/auto-assign/route.js - gives every unowned open deal to the least-loaded owner. Nothing is sent to anyone.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { loadRoster } from '../../../../lib/server/team-store.js';
import { eligibleOwners, planAutoAssign } from '../../../../lib/assignment.js';
import { collection, doc, getDocs, limit, query, updateDoc, where } from '../../../../lib/server-firestore.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;
  try {
    const roster = await loadRoster(db, uid);
    const owners = eligibleOwners(roster.members);
    const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(2000)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const changes = planAutoAssign(owners, deals);
    for (const c of changes) {
      await updateDoc(doc(db, 'deals', c.id), { assignedTo: c.assignedTo, assignedAt: new Date().toISOString(), assignedBy: 'auto' });
    }
    return json({ ok: true, assigned: changes.length });
  } catch (e) {
    console.error('[auto-assign] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not assign the deals. Try again.' }, 500);
  }
}
