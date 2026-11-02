// app/api/signal-feeds/route.js - the owner's buying-signal feeds and their alerts. GET reads both; POST saves the feed list (up to 5).
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { loadSignalFeeds, saveSignalFeeds } from '../../../lib/server/signal-feeds-job.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  const s = await loadSignalFeeds(db, who.uid);
  return json({ feeds: s.feeds, alerts: s.alerts.slice(0, 100), lastRunAt: s.lastRunAt, note: s.note });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  const r = await saveSignalFeeds(db, who.uid, body?.urls);
  if (r.error) return json({ error: r.error }, 400);
  return json({ ok: true, feeds: r.feeds, rejected: r.bad });
}
