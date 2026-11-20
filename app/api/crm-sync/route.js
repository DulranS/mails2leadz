// app/api/crm-sync/route.js - the owner's last CRM sync log (pass 347): what each deal did (created, sent, pulled, skipped, failed) and why.
// Read only. Nothing is sent to a CRM from here.
import { NextResponse } from 'next/server';
import { uidFromRequest, NO_STORE, getDb } from '../../../lib/server/route-helpers.js';
import { loadCrmSyncLog } from '../../../lib/server/crm.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return json({ success: false, error: 'Please sign in again.' }, 401);
  try {
    return json({ success: true, ...(await loadCrmSyncLog(getDb(), uid)) });
  } catch (e) {
    console.error('[crm-sync] read failed:', String(e?.message || '').slice(0, 120));
    return json({ success: false, error: 'Could not load the CRM sync log.' }, 500);
  }
}
