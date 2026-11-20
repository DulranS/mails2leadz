// app/api/find-leads/route.js - the in-app lead finder (OpenStreetMap search -> read websites -> score -> Lead Inbox).
// Signed-in only. It never sends anything: leads land in the Lead Inbox, status "new", for the owner to review.
//
// POST { action: "start", query, location, minScore? }  queue a search            (one quick map request)
// POST { action: "import-list", label, rows: [ {..file columns..} ] }  queue the owner's OWN list (any scraped CSV): no map request, same website reading
// POST { action: "step" }                               work through the queue    (time-boxed; call again until finished)
// POST { action: "cancel" }                             stop the running search
// POST { action: "settings", enabled, searches }        the nightly routine (saved searches)
// POST { action: "source-candidates", brief, rows, listSource, lawfulBasis }  screen a candidate list against a role brief
// POST { action: "privacy-delete", id }                 erase one sourced person on request (record, inbox lead, all mail stopped)
// GET                                                  progress + nightly settings + today's allowance
import { NextResponse, after } from 'next/server';
import { isAdminMode } from '../../../lib/server-firestore.js';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { featureAllowed } from '../../../lib/tenant.js';
import { defaultCtx, FinderError } from '../../../lib/server/lead-finder-io.js';
import { startSearch, startImport, runStep, cancelJob, loadJob, publicJob, loadFinderSettings, saveFinderSettings, refreshAutoSearches, limits } from '../../../lib/server/lead-finder-job.js';
import { needsAutoRefresh } from '../../../lib/lead-finder.js';
import { buyListGate } from '../../../lib/consent-rules.js';
import { mapImportRows } from '../../../lib/lead-import.js';
import { normaliseBrief, prepareCandidates } from '../../../lib/recruit-sourcing.js';
import { writeSourcedNotices, overdueFor, eraseNotice, markNoticeTold } from '../../../lib/server/privacy-notices.js';
import { suggestTargets } from '../../../lib/server/auto-targets.js';
import { loadAutopilot, prepareDraftsForUser } from '../../../lib/server/prepare-drafts.js';
import { QUEUE_KINDS } from '../../../lib/draft-queue.js';
import { OSM_ATTRIBUTION } from '../../../lib/lead-finder.js';

export const maxDuration = 60;
const ok = (body) => NextResponse.json({ success: true, attribution: OSM_ATTRIBUTION, ...body }, { headers: NO_STORE });
const fail = (status, error, code) => NextResponse.json({ success: false, error, code }, { status, headers: NO_STORE });
const STATUS = { DAILY_LIMIT: 429, BAD_SEARCH: 422, AREA_NOT_FOUND: 422, AREA_TOO_BIG: 422, BAD_QUERY: 422, MAP_UNAVAILABLE: 503, MAP_BUSY: 503, JOB_RUNNING: 409, BAD_LIST: 422 };

// privacy: also list the sourced people whose privacy notice is overdue. Only the status load, a screen and an erase ask for it:
// a search calls overview on every step, and reading the notice list each time would cost a read per open notice per step.
async function overview(db, uid, { privacy = false } = {}) {
  const [job, settings] = await Promise.all([loadJob(db, uid), loadFinderSettings(db, uid)]);
  const used = job?.usage?.day === new Date().toISOString().slice(0, 10) ? job.usage : { searches: 0, sites: 0 };
  const base = { job: publicJob(job), settings, today: { searches: used.searches || 0, sites: used.sites || 0, ...limits() } };
  if (!privacy) return base;
  // null (not []) when the check itself failed, so the panel can say so.
  const privacyOverdue = await overdueFor(db, uid, new Date().toISOString().slice(0, 10)).catch(() => null);
  return { ...base, privacyOverdue };
}

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  if (!isAdminMode()) return fail(503, 'The lead finder needs a server connection to the database. Set FIREBASE_SERVICE_ACCOUNT_JSON on the server first.', 'NO_ADMIN');
  try { return ok(await overview(getDb(), who.uid, { privacy: true })); } catch (e) { console.error('find-leads status error:', e); return fail(500, 'Could not read the finder status right now.'); }
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

    if (action === 'privacy-told') {
      // The owner has told this person by hand (pass 335): the notice leaves the overdue list.
      const res = await markNoticeTold(db, uid, body.id);
      if (!res.ok) return fail(404, 'That privacy notice record was not found.', 'NOT_FOUND');
      return ok(await overview(db, uid, { privacy: true }));
    }

    if (action === 'privacy-delete') {
      // Erasure on request (pass 334): removes the person's privacy-notice record and inbox lead, and stops all mail to that address.
      const res = await eraseNotice(db, uid, body.id);
      if (!res.ok) return fail(404, 'That privacy notice record was not found.', 'NOT_FOUND');
      return ok(await overview(db, uid, { privacy: true }));
    }

    if (action !== 'start' && action !== 'step' && action !== 'import-list' && action !== 'source-candidates') return fail(400, 'Unknown action.', 'BAD_ACTION');
    const gate = await guardTenant(db, uid); // plan / trial / suspension (a no-op unless SAAS_MODE=on)
    if (gate.response) return gate.response;
    const ctx = defaultCtx();
    const t0 = Date.now();

    if (action === 'source-candidates') {
      // Recruitment sourcing (pass 331): screen the owner's own candidate list against a role brief, then queue it
      // through the same lawful-basis gate and import as any list.
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
      if (!rows.length) return fail(400, 'The candidate list is empty.', 'BAD_LIST');
      const brief = normaliseBrief(body.brief);
      if (!brief.role && !brief.mustHave.length && !brief.niceToHave.length) {
        return fail(400, 'Describe the role first: a title and the skills you need.', 'NO_BRIEF');
      }
      const source = String(body.listSource || '').trim().slice(0, 120);
      const lawfulBasis = String(body.lawfulBasis || '');
      const sourced = prepareCandidates(rows, brief, { source, lawfulBasis });
      if (sourced.error) return fail(400, sourced.error, 'SOURCE_BLOCKED');
      if (sourced.rows.length === 0) return fail(400, 'No candidate in this list passed the brief.', 'NONE_PASSED');
      const gate = buyListGate({ source, lawfulBasis }, mapImportRows(sourced.rows).candidates);
      if (!gate.ok) return fail(400, gate.reasons.join(' '), 'LIST_BLOCKED');
      await startImport(db, uid, { label: String(body.label || brief.role || 'candidates').slice(0, 80), rows: sourced.rows });
      // The notice is recorded only once the import is queued, so a refused import leaves no record behind (pass 334).
      await writeSourcedNotices(db, uid, sourced.rows, { noticeBy: sourced.noticeBy, source, lawfulBasis });
      return ok({ ...(await overview(db, uid, { privacy: true })), sourcing: sourced.stats, rejected: sourced.rejected.slice(0, 200) });
    }

    if (action === 'import-list') {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
      if (!rows.length) return fail(400, 'The list is empty.', 'BAD_LIST');
      // A bought or borrowed list needs its source and lawful basis; personal addresses need consent (lib/consent-rules.js).
      const listCheck = buyListGate({ source: String(body.listSource || '').trim().slice(0, 120), lawfulBasis: String(body.lawfulBasis || '') }, mapImportRows(rows).candidates);
      if (!listCheck.ok) return fail(400, listCheck.reasons.join(' '), 'LIST_BLOCKED');
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
