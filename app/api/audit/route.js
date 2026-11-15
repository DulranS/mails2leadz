// app/api/audit/route.js - the business audit log: who sent a document or changed access, and when. Owner only. Read-only.
import { NextResponse } from 'next/server';
import { identify, getDb, actorFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { collection, getDocs, query, orderBy, limit } from '../../../lib/server-firestore.js';
import { auditView, canReadAudit, AUDIT_MAX_ENTRIES } from '../../../lib/audit-rules.js';
import { runsView, RUN_LOG_MAX } from '../../../lib/run-log-rules.js';

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  if (!canReadAudit(actorFromRequest(request))) {
    return NextResponse.json({ error: 'Only the owner of this workspace can see the audit log.', code: 'OWNER_ONLY' }, { status: 403, headers: NO_STORE });
  }
  try {
    const db = getDb();
    const snap = await getDocs(query(collection(db, 'users', who.uid, 'audit'), orderBy('at', 'desc'), limit(AUDIT_MAX_ENTRIES)));
    const runSnap = await getDocs(query(collection(db, 'users', who.uid, 'runs'), orderBy('at', 'desc'), limit(RUN_LOG_MAX)));
    return NextResponse.json({ entries: auditView(snap.docs.map((d) => d.data())), runs: runsView(runSnap.docs.map((d) => d.data())) }, { headers: NO_STORE });
  } catch (e) {
    console.error('[audit] read failed:', String(e?.message || '').slice(0, 120));
    return NextResponse.json({ error: 'Could not read the audit log. Try again.' }, { status: 500, headers: NO_STORE });
  }
}
