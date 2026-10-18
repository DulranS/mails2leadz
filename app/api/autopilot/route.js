// app/api/autopilot/route.js - the owner's "prepare drafts overnight" switches. Settings only; nothing is sent.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../lib/server-firestore.js';
import { getDb, uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { loadAutopilot, loadLastRuns, saveAutopilot } from '../../../lib/server/prepare-drafts.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';

const NEEDS_ADMIN = 'Overnight drafts need the server connection to the database. Set FIREBASE_SERVICE_ACCOUNT_JSON on the server first.';

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: NO_STORE });
  const settings = await loadAutopilot(getDb(), uid);
  const lastRun = await loadLastRuns(getDb(), uid);
  return NextResponse.json({ settings, lastRun, available: isAdminMode(), cronConfigured: !!process.env.CRON_SECRET }, { headers: NO_STORE });
}

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: NO_STORE });
  if (!isAdminMode()) return NextResponse.json({ error: NEEDS_ADMIN }, { status: 503, headers: NO_STORE });
  const body = await request.json().catch(() => ({}));
  if (body.enabled === true || body.autoSend === true || body.autoBilling === true || body.autoContent === true || body.weeklyReport === true || body.dailyBrief === true || body.autoLearn === true) { // switching any automation ON needs a plan that includes it (SAAS_MODE only)
    const gate = await guardTenant(getDb(), uid, { feature: 'autopilot' });
    if (gate.response) return gate.response;
  }
  const settings = await saveAutopilot(getDb(), uid, body);
  return NextResponse.json({ success: true, settings }, { headers: NO_STORE });
}
