// app/api/ops-status/route.js - "is everything I switched on actually running?" Read-only; reports only what the jobs already record.
import { NextResponse } from 'next/server';
import { uidFromRequest, NO_STORE, getDb } from '../../../lib/server/route-helpers.js';
import { loadAutopilot } from '../../../lib/server/prepare-drafts.js';
import { loadConnection } from '../../../lib/server/gmail-offline.js';
import { loadFinderSettings } from '../../../lib/server/lead-finder-job.js';
import { opsStatus } from '../../../lib/ops-status.js';

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401, headers: NO_STORE });
  try {
    const db = getDb();
    const [autopilot, connection, finder] = await Promise.all([
      loadAutopilot(db, uid),
      loadConnection(db, uid).catch(() => null),
      loadFinderSettings(db, uid).catch(() => null),
    ]);
    return NextResponse.json({ success: true, ...opsStatus({ autopilot, connection, finder }) }, { headers: NO_STORE });
  } catch (e) {
    console.error('ops-status error:', e);
    return NextResponse.json({ success: false, error: 'Could not check right now.' }, { status: 500, headers: NO_STORE });
  }
}
