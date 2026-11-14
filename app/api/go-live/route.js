// /api/go-live - the go-live checklist: what is connected and set, from presence only. The email-records tick is saved here. Signed-in owner only.
import { NextResponse } from 'next/server';
import { doc, getDoc, setDoc } from '../../../lib/server-firestore.js';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { secretsFor } from '../../../lib/server/integration-secrets.js';
import { operatorEnv } from '../../../lib/server/operator-settings.js';
import { goLiveChecklist } from '../../../lib/go-live.js';

async function facts(db, uid) {
  const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).then((s) => s.data() || {}).catch(() => ({})));
  const s = await secretsFor(db, uid, ['GSC_REFRESH_TOKEN', 'GA4_PROPERTY_ID', 'BALANCR_BASE_URL', 'BALANCR_BUSINESS_ID', 'BALANCR_API_KEY', 'BALANCR_WEBHOOK_TOKEN', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'GOOGLE_PLACES_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY']).catch(() => ({}));
  const env = operatorEnv();
  const has = (k) => Boolean(s[k]);
  return {
    googleConnected: has('GSC_REFRESH_TOKEN'),
    ga4PropertyId: has('GA4_PROPERTY_ID'),
    aiKey: has('ANTHROPIC_API_KEY') || has('OPENAI_API_KEY') || has('DEEPSEEK_API_KEY') || Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.DEEPSEEK_API_KEY),
    balancr: has('BALANCR_BASE_URL') && has('BALANCR_BUSINESS_ID') && has('BALANCR_API_KEY') && has('BALANCR_WEBHOOK_TOKEN'),
    twilio: has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN'),
    places: has('GOOGLE_PLACES_API_KEY'),
    catalogueItems: Array.isArray(biz.catalog) ? biz.catalog.length : 0,
    libraryItems: Array.isArray(biz.supportLibrary) ? biz.supportLibrary.length : 0,
    helpPublished: biz.helpPublished === true,
    routineChosen: Boolean(biz.routineMessagesFrom),
    dnsChecked: biz.dnsChecked === true,
  };
}

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  return NextResponse.json(goLiveChecklist(await facts(db, who.uid)), { headers: NO_STORE });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  if (typeof body?.dnsChecked !== 'boolean') return NextResponse.json({ error: 'Say dnsChecked: true or false.' }, { status: 400, headers: NO_STORE });
  await setDoc(doc(db, 'users', who.uid, 'settings', 'business'), { dnsChecked: body.dnsChecked }, { merge: true });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
