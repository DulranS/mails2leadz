// app/api/find-leads/route.js - the in-app lead finder (OpenStreetMap search -> read websites -> score -> Lead Inbox).
// Signed-in only. It never sends anything: leads land in the Lead Inbox, status "new", for the owner to review.
//
// POST { action: "start", query, location, minScore? }  queue a search            (one quick map request)
// POST { action: "import-list", label, rows: [ {..file columns..} ] }  queue the owner's OWN list (any scraped CSV): no map request, same website reading
// POST { action: "step" }                               work through the queue    (time-boxed; call again until finished)
// POST { action: "cancel" }                             stop the running search
// POST { action: "settings", enabled, searches }        the nightly routine (saved searches)
// GET                                                   progress + nightly settings + today's allowance
import { NextResponse, after } from 'next/server';
import { isAdminMode } from '../../../lib/server-firestore.js';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { featureAllowed } from '../../../lib/tenant.js';
import { defaultCtx, FinderError } from '../../../lib/server/lead-finder-io.js';
import { startSearch, startImport, runStep, cancelJob, loadJob, publicJob, loadFinderSettings, saveFinderSettings, refreshAutoSearches, limits } from '../../../lib/server/lead-finder-job.js';
import { needsAutoRefresh } from '../../../lib/lead-finder.js';
import { suggestTargets } from '../../../lib/server/auto-targets.js';
import { loadAutopilot, prepareDraftsForUser } from '../../../lib/server/prepare-drafts.js';
import { QUEUE_KINDS } from '../../../lib/draft-queue.js';
import { OSM_ATTRIBUTION } from '../../../lib/lead-finder.js';

export const maxDuration = 60;
const ok = (body) => NextResponse.json({ success: true, attribution: OSM_ATTRIBUTION, ...body }, { headers: NO_STORE });
const fail = (status, error, code) => NextResponse.json({ success: false, error, code }, { status, headers: NO_STORE });
const STATUS = { DAILY_LIMIT: 429, BAD_SEARCH: 422, AREA_NOT_FOUND: 422, AREA_TOO_BIG: 422, BAD_QUERY: 422, MAP_UNAVAILABLE: 503, MAP_BUSY: 503, JOB_RUNNING: 409, BAD_LIST: 422 };

async function overview(db, uid) {
  const [job, settings] = await Promise.all([loadJob(db, uid), loadFinderSettings(db, uid)]);
  const used = job?.usage?.day === new Date().toISOString().slice(0, 10) ? job.usage : { searches: 0, sites: 0 };
  return { job: publicJob(job), settings, today: { searches: used.searches || 0, sites: used.sites || 0, ...limits() } };
}

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  if (!isAdminMode()) return fail(503, 'The lead finder needs a server connection to the database. Set FIREBASE_SERVICE_ACCOUNT_JSON on the server first.', 'NO_ADMIN');
  try { return ok(await overview(getDb(), who.uid)); } catch (e) { console.error('find-leads status error:', e); return fail(500, 'Could not read the finder status right now.'); }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const who = identify(request, body?.userId);
    if (who.response) return who.response;
    const uid = who.uid;
    if (!isAdminMode()) return fail(503, 'The lead finder needs a server connection to the database. Set FIREBASE_SERVICE_ACCOUNT_JSON on the server first.', 'NO_ADMIN');
    const db = getDb();
    const action = String(body?.action || '');

    if (action === 'cancel') { await cancelJob(db, uid); return ok(await overview(db, uid)); }

    if (action === 'settings') {
      const gate = await guardTenant(db, uid, { feature: 'autopilot' });
      if (gate.response) return gate.response;
      const patch = { enabled: body.enabled === true, searches: Array.isArray(body.searches) ? body.searches : [] };
      if (typeof body.autoFind === 'boolean') patch.autoFind = body.autoFind;
      if (typeof body.area === 'string') patch.area = body.area;
      let settings = await saveFinderSettings(db, uid, patch);
      // Turning auto-find on (or setting its area) fills the list now, not tomorrow night.
      if (needsAutoRefresh(settings)) settings = await refreshAutoSearches(db, uid, { settings, suggest: (u, area) => suggestTargets(db, u, area) });
      return ok({ ...(await overview(db, uid)), settings });
    }

    if (action !== 'start' && action !== 'step' && action !== 'import-list') return fail(400, 'Unknown action.', 'BAD_ACTION');
    const gate = await guardTenant(db, uid); // plan / trial / suspension (a no-op unless SAAS_MODE=on)
    if (gate.response) return gate.response;
    const ctx = defaultCtx();
    const t0 = Date.now();

    if (action === 'import-list') {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
      if (!rows.length) return fail(400, 'The list is empty.', 'BAD_LIST');
      await startImport(db, uid, { label: String(body.label || '').slice(0, 80), rows });
      return ok(await overview(db, uid));
    }

    if (action === 'start') {
      await startSearch(db, uid, { query: body.query, location: body.location, minScore: body.minScore }, { source: 'manual', ctx, deadline: t0 + 40000 });
      return ok(await overview(db, uid));
    }

    const r = await runStep(db, uid, { ctx, deadline: t0 + 50000 });
    if (r.finished && r.added > 0) {
      // Same as when the worker delivers leads: if the owner switched on overnight drafts, write first-email drafts for the new HOT leads.
      after(async () => {
        try {
          const settings = await loadAutopilot(db, uid);
          if (settings.enabled && featureAllowed(gate.ent, 'autopilot')) await prepareDraftsForUser(db, uid, { settings, kinds: [QUEUE_KINDS.FIRST], deadline: Date.now() + 50000 });
        } catch (e) { console.warn('[find-leads] draft preparation skipped:', e?.message); }
      });
    }
    return ok({ ...(await overview(db, uid)), added: r.added, finished: r.finished, waiting: r.waiting });
  } catch (error) {
    if (error instanceof FinderError) return fail(STATUS[error.code] || 422, error.message, error.code);
    console.error('find-leads error:', error);
    return fail(500, 'The lead finder hit a problem. Try again in a minute.');
  }
}
