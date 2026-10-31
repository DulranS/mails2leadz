// app/api/deals/assign/route.js - the owner gives a deal to a team member (or the owner). Only a manager or the owner can be chosen.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { loadRoster } from '../../../../lib/server/team-store.js';
import { eligibleOwners, OWNER_KEY } from '../../../../lib/assignment.js';
import { doc, getDoc, updateDoc } from '../../../../lib/server-firestore.js';
import { dealDocId } from '../../../../lib/deal-utils.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const email = String(body?.email || '').trim().toLowerCase();
  if (!email) return json({ error: 'Choose the deal.' }, 400);
  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;

  const ref = doc(db, 'deals', dealDocId(uid, email));
  if (!(await getDoc(ref)).exists()) return json({ error: 'This deal could not be found.' }, 404);
  const choice = String(body?.assignee || '');
  if (choice === '') {
    await updateDoc(ref, { assignedTo: null, assignedAt: new Date().toISOString() });
    return json({ ok: true, assignedTo: null });
  }
  const roster = await loadRoster(db, uid);
  const owners = eligibleOwners(roster.members);
  if (!owners.some((o) => o.key === choice)) return json({ error: 'Only the owner or a team manager can own a deal.' }, 400);
  await updateDoc(ref, { assignedTo: choice, assignedAt: new Date().toISOString() });
  return json({ ok: true, assignedTo: choice, isOwner: choice === OWNER_KEY });
}
