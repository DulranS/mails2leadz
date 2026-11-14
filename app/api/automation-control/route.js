// app/api/automation-control/route.js - what runs on its own, and the one pause that stops everything that contacts people. Signed-in owner only.
import { NextResponse } from 'next/server';
import { collection, doc, getDoc, setDoc } from '../../../lib/server-firestore.js';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { automationSummary } from '../../../lib/automation-control.js';
import { operatorEnv } from '../../../lib/server/operator-settings.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const settings = (await getDoc(doc(db, 'users', who.uid, 'settings', 'business')).then((s) => s.data() || {}).catch(() => ({})));
  return NextResponse.json(automationSummary(settings, operatorEnv()), { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  if (typeof body?.paused !== 'boolean') return NextResponse.json({ error: 'Say paused: true or false.' }, { status: 400, headers: NO_STORE });
  await setDoc(doc(db, 'users', who.uid, 'settings', 'business'), { automationPaused: body.paused }, { merge: true });
  return NextResponse.json({ ok: true, paused: body.paused }, { headers: NO_STORE });
}
