// app/api/deals/stage-alert/route.js - raises an alert the moment the owner moves a deal into a stage that needs the next step (pass 367).
// Only the deal's current stage counts, so a stale or repeated call adds nothing. Sends one push to the owner.
import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, limit, addDoc } from '../../../../lib/server-firestore.js';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { sendOwnerPush } from '../../../../lib/server/push.js';
import { normalizeStage } from '../../../../lib/deal-utils.js';
import { STAGE_ALERT_STAGES, stageAlertFor, stageAlertPushPayload } from '../../../../lib/stage-alert.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;

  const email = String(body?.email || '').trim().toLowerCase();
  const stage = normalizeStage(body?.stage);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Give the deal email.' }, 400);
  if (!STAGE_ALERT_STAGES.includes(stage)) return json({ ok: true, alerted: false });

  // The deal must really be in this stage now.
  const deals = await getDocs(query(collection(db, 'deals'), where('userId', '==', who.uid), where('email', '==', email), limit(1)));
  const deal = deals.docs[0] ? deals.docs[0].data() : null;
  if (!deal || normalizeStage(deal.stage) !== stage) return json({ ok: true, alerted: false });

  const alert = stageAlertFor({ email, stage });
  const existing = await getDocs(query(collection(db, 'users', who.uid, 'pipeline_alerts'), where('stageKey', '==', alert.stageKey), limit(1)));
  if (!existing.empty) return json({ ok: true, alerted: false, reason: 'already alerted today' });

  await addDoc(collection(db, 'users', who.uid, 'pipeline_alerts'), alert);
  const push = await sendOwnerPush(db, who.uid, stageAlertPushPayload({ email, stage })).catch(() => ({ sent: 0 }));
  return json({ ok: true, alerted: true, pushed: push && push.sent ? push.sent : 0 });
}
