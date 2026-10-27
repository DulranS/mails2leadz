// app/api/deal-watch/route.js - the owner's listing feeds: read them, save them, check them now. Never buys or sends anything.
import { NextResponse } from 'next/server';
import { uidFromRequest, NO_STORE, getDb } from '../../../lib/server/route-helpers.js';
import { defaultCtx } from '../../../lib/server/lead-finder-io.js';
import { loadDealWatch, saveFeeds, runDealWatch } from '../../../lib/server/deal-watch-job.js';
import { MIN_GROUP } from '../../../lib/deal-screen.js';

export const maxDuration = 60;
const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return json({ success: false, error: 'Please sign in again.' }, 401);
  try {
    const s = await loadDealWatch(getDb(), uid);
    return json({
      success: true, feeds: s.feeds, costs: s.costs, deals: s.deals,
      lastRunAt: s.lastRunAt, lastNote: s.lastNote, learnedGroups: Object.keys(s.memory).length, minGroup: MIN_GROUP,
    });
  } catch (e) {
    console.error('deal-watch load failed:', e?.message);
    return json({ success: false, error: 'Could not load the deal watch right now.' }, 500);
  }
}

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return json({ success: false, error: 'Please sign in again.' }, 401);
  let body;
  try { body = await request.json(); }
  catch { return json({ success: false, error: 'Send the request as JSON.' }, 400); }
  try {
    const db = getDb();
    if (body.action === 'feeds') {
      const r = await saveFeeds(db, uid, { urls: body.urls, costs: body.costs });
      if (r.tooMany) return json({ success: false, error: 'Watch up to 5 feeds. Remove one and try again.' }, 400);
      return json({ success: true, feeds: r.feeds, skipped: r.bad });
    }
    if (body.action === 'run') {
      const r = await runDealWatch(db, uid, { ctx: defaultCtx() });
      return json({ success: true, ...r });
    }
    return json({ success: false, error: 'Unknown request.' }, 400);
  } catch (e) {
    console.error('deal-watch failed:', e?.message);
    return json({ success: false, error: 'Could not do that right now.' }, 500);
  }
}
