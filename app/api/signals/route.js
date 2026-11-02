// app/api/signals/route.js - the owner's buying-signal settings: GET reads them, POST saves them. Signed-in owner only.
// Saving never runs a search; the nightly job does the work.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { loadSignalSettings, saveSignalSettings } from '../../../lib/server/signal-job.js';
import { secretsFor, SIGNAL_NAMES } from '../../../lib/server/integration-secrets.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  try {
    const settings = await loadSignalSettings(db, who.uid);
    const secrets = await secretsFor(db, who.uid, SIGNAL_NAMES);
    return json({ settings, keySet: !!secrets.COMPANIES_HOUSE_KEY });
  } catch (e) {
    console.error('[signals] read failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not read the settings. Try again.' }, 500);
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  try {
    const r = await saveSignalSettings(db, who.uid, body || {});
    if (r.error) return json({ error: r.error }, 400);
    return json({ ok: true, settings: r.settings });
  } catch (e) {
    console.error('[signals] save failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not save the settings. Try again.' }, 500);
  }
}
