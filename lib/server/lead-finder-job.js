// lib/server/lead-finder-job.js - the in-app lead finder as a RESUMABLE job, so it fits a free hosting plan.
//
// A search never runs in one long request. `startSearch` asks OpenStreetMap (one quick request) and queues the businesses it found;
// `runStep` then works through the queue a few sites at a time inside a time box and delivers what it finds to the Lead Inbox as it
// goes. The page just keeps calling `runStep` while it is open; if the tab is closed the nightly run picks the same job up again.
// State lives in `finder_jobs/{uid}` (server-written; no browser can edit what the server will later fetch).
//
// Nothing here sends anything. Leads only land in the Lead Inbox, status "new".
import { doc, getDoc, setDoc, collection, query, where, getDocs } from '../server-firestore.js';
import { storeLeads } from './inbox-store.js';
import { searchOsm, crawlSite, makeRobots, siteToPlain, FinderError } from './lead-finder-io.js';
import {
  buildRow, selectForInbox, sanitizeSearch, sanitizeFinderSettings, FINDER_DEFAULTS, dayKey, WARM_SCORE, pickNightlySearch, recordSearchRun, needsAutoRefresh, mergeAutoSearches,
} from '../lead-finder.js';
import { mapImportRows, importLabel, IMPORT_MAX_ROWS } from '../lead-import.js';
import { suggestTargets } from './auto-targets.js';

export const JOBS = 'finder_jobs';

/** Where the job and the settings are kept, and how leads reach the inbox. Tests pass an in-memory version instead. */
export function firestoreDeps(db) {
  return {
    async load(uid) { try { const s = await getDoc(doc(db, JOBS, uid)); return s.exists() ? s.data() : null; } catch { return null; } },
    async save(uid, job) { await setDoc(doc(db, JOBS, uid), job); },
    async loadSettings(uid) { try { const s = await getDoc(doc(db, 'users', uid, 'settings', 'lead_finder')); return s.exists() ? s.data() : null; } catch { return null; } },
    async saveSettings(uid, data, merge) { await setDoc(doc(db, 'users', uid, 'settings', 'lead_finder'), data, { merge }); },
    async markFinderUser(uid, on) { await setDoc(doc(db, 'autopilot_users', uid), { userId: uid, finder: on, updatedAt: nowIso() }, { merge: true }); },
    deliver: (uid, leads, meta) => storeLeads(db, uid, leads, meta),
  };
}
const nowIso = () => new Date().toISOString();
const SEEN_CAP = 4000;
const GROUP = 6; // sites read in parallel per round
const CONCURRENCY = 3;

const envInt = (name, fallback) => { const v = process.env[name]; const n = v === undefined || v === '' ? NaN : Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback; };
export const limits = () => ({
  searchesPerDay: envInt('FINDER_DAILY_SEARCHES', 12), // quick map requests: the free map servers ask for politeness
  sitesPerDay: envInt('FINDER_DAILY_SITES', 500), // websites read per account per day
});

const emptyStats = () => ({ found: 0, queued: 0, alreadySeen: 0, noContact: 0, read: 0, blocked: 0, unreachable: 0, delivered: 0, skipped: 0, left: {} });

export async function loadJob(db, uid, deps = firestoreDeps(db)) { return deps.load(uid); }

/** What the browser may see: progress and results, never the queue itself. */
export function publicJob(job, extra = {}) {
  if (!job) return { status: 'idle', ...extra };
  const total = (job.candidates || []).length;
  return {
    status: job.status, term: job.term, location: job.location, source: job.source, total, done: Math.min(job.cursor || 0, total),
    stats: job.stats || emptyStats(), error: job.error || '', note: job.note || '', full: !!job.full, startedAt: job.createdAt, updatedAt: job.updatedAt, ...extra,
  };
}

function usageToday(job) {
  const u = job?.usage;
  return u && u.day === dayKey() ? { day: u.day, searches: u.searches || 0, sites: u.sites || 0 } : { day: dayKey(), searches: 0, sites: 0 };
}

/** Ask the map for businesses and queue them. Replaces any earlier job (its "already seen" list is kept so repeats only find new ones). */
export async function startSearch(db, uid, rawSearch, { source = 'manual', ctx, deadline = Date.now() + 40000, deps = firestoreDeps(db) } = {}) {
  const parsed = sanitizeSearch(rawSearch);
  if (!parsed.ok) throw new FinderError(parsed.error, 'BAD_SEARCH');
  const search = parsed.search;
  const previous = await deps.load(uid);
  const usage = usageToday(previous);
  if (usage.searches >= limits().searchesPerDay) throw new FinderError(`You have reached today's limit of ${limits().searchesPerDay} searches (the free map servers ask for politeness). It resets tomorrow.`, 'DAILY_LIMIT');

  const seen = new Set(previous?.seen || []);
  // A search the map could not answer does not use up today's allowance (the count is only raised once the map has answered).
  // Carry on where an earlier, partly answered search of the same thing stopped.
  const sameSearch = previous?.mapProgress && previous.mapProgress.key === `${search.term}|${search.location}`;
  const { candidates, stats: osm } = await searchOsm(search, ctx, { deadline, seen, startTile: sameSearch ? previous.mapProgress.resumeAt || 0 : 0 });
  usage.searches++;
  const usable = candidates.filter((c) => c.website || c.email || c.whatsapp_number);
  // Businesses that need no website visit first: they are instant, so the first results appear at once.
  usable.sort((a, b) => (a.website ? 1 : 0) - (b.website ? 1 : 0));
  const stats = { ...emptyStats(), found: candidates.length + osm.alreadySeen, queued: usable.length, alreadySeen: osm.alreadySeen, noContact: candidates.length - usable.length };
  const job = {
    userId: uid, status: usable.length ? 'running' : 'done', term: search.term, location: search.location, minScore: search.minScore, source,
    candidates: usable, cursor: 0, stats, seen: [...seen].slice(-SEEN_CAP), usage, full: osm.full, error: '',
    mapProgress: osm.partial ? { key: `${search.term}|${search.location}`, resumeAt: osm.resumeAt } : null,
    note: usable.length ? (osm.partial ? 'The free map servers were slow, so only part of the area was searched. Search again to cover the rest.' : '') : osm.partial ? 'The free map servers were slow and nothing usable came back from the part that was searched. Search again in a few minutes.' : (osm.alreadySeen ? 'Everything the map has for this search was already found earlier. Try another business type or a different district.' : 'The map has no businesses with contact details for this search. Try a plainer business type or a bigger area.'),
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  await deps.save(uid, job);
  return job;
}

/**
 * Queue the rows of the owner's OWN list (a Google Maps extension export, a purchased list, a CRM export) so the finder reads each
 * website, scores the lead and fills the Lead Inbox, exactly like a map search but with no map request. Uses only the daily website
 * allowance. Refuses while another search is still running (it would silently replace that queue).
 */
export async function startImport(db, uid, { label, rows }, { deps = firestoreDeps(db) } = {}) {
  const previous = await deps.load(uid);
  if (previous?.status === 'running' && (previous.cursor || 0) < (previous.candidates || []).length) {
    throw new FinderError('A search is still running. Let it finish (or press Stop) before importing a list.', 'JOB_RUNNING');
  }
  const { candidates, stats: m } = mapImportRows(rows, { max: IMPORT_MAX_ROWS, label: importLabel(label) });
  if (!candidates.length) {
    throw new FinderError('Nothing usable in that list. It needs a business name column plus a website, an email or a phone number.', 'BAD_LIST');
  }
  const seen = new Set(previous?.seen || []);
  const fresh = candidates.filter((c) => !seen.has(c.place_id));
  const usage = usageToday(previous);
  fresh.sort((a, b) => (a.website ? 1 : 0) - (b.website ? 1 : 0)); // no website visit needed: instant, so results appear at once
  const stats = { ...emptyStats(), found: m.rows, queued: fresh.length, alreadySeen: candidates.length - fresh.length, noContact: m.noContact + m.noName, skipped: m.duplicate };
  const term = `list: ${importLabel(label)}`.slice(0, 60);
  const job = {
    userId: uid, status: fresh.length ? 'running' : 'done', term, location: '', minScore: 0, source: 'import-list',
    candidates: fresh, cursor: 0, stats, seen: [...seen].slice(-SEEN_CAP), usage, full: false, error: '', mapProgress: null,
    note: fresh.length
      ? (m.tooMany ? `Only the first ${IMPORT_MAX_ROWS} usable rows were queued. Import the rest as a second file afterwards.` : '')
      : 'Every business in this list was already imported earlier.',
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  await deps.save(uid, job);
  return job;
}

/**
 * Work through the queue until the time box ends. Each round reads a few websites (a few at a time, politely), scores them, keeps the
 * ones worth contacting and puts them in the Lead Inbox. Safe to call again and again; stops by itself when the queue is empty.
 * @returns {Promise<{ job: object, added: number, finished: boolean, waiting: string }>}
 */
export async function runStep(db, uid, { ctx, deadline = Date.now() + 40000, onlyIfSource = '', deps = firestoreDeps(db) } = {}) {
  let job = await deps.load(uid);
  if (!job || job.status !== 'running') return { job, added: 0, finished: !job || job.status !== 'running', waiting: '' };
  if (onlyIfSource && job.source !== onlyIfSource) return { job, added: 0, finished: false, waiting: '' };
  const robots = makeRobots(ctx);
  const cap = limits().sitesPerDay;
  let added = 0;
  let waiting = '';
  const queue = job.candidates || [];
  while ((job.cursor || 0) < queue.length && Date.now() < deadline - 9000) {
    const usage = usageToday(job);
    // Take the next few businesses, but never more website visits than today's allowance has room for.
    let room = cap - usage.sites;
    const batch = [];
    for (let i = job.cursor || 0; i < queue.length && batch.length < GROUP; i++) {
      if (queue[i].website) { if (room <= 0) break; room--; }
      batch.push(queue[i]);
    }
    if (!batch.length) { waiting = 'daily_limit'; break; } // today's allowance is used up: tomorrow's run (or click) continues from here
    const needSite = batch.filter((c) => c.website).length;
    const rows = [];
    const stats = { ...emptyStats(), ...job.stats, left: { ...(job.stats?.left || {}) } };
    let next = 0;
    const worker = async () => {
      while (next < batch.length) {
        const c = batch[next++];
        let site = null;
        if (c.website) {
          try { site = siteToPlain(await crawlSite(c.website, ctx, robots, { deadline: Math.min(deadline - 5000, Date.now() + 14000) })); } catch { site = null; }
          stats.read++;
          if (!site || (!site.ok && !site.blocked)) stats.unreachable++;
          if (site?.blocked) stats.blocked++;
        }
        const row = buildRow(c, site);
        row.campaign = (job.location ? `${job.term} · ${job.location}` : job.term).slice(0, 80);
        rows.push(row);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

    const { ready, reasons } = selectForInbox(rows, { minScore: job.minScore ?? WARM_SCORE, phoneOnlyMinScore: 0 });
    for (const [k, v] of Object.entries(reasons)) stats.left[k] = (stats.left[k] || 0) + v;
    let stored = { added: 0, skipped: { invalid: 0, duplicate: 0, blocked: 0, contacted: 0 } };
    if (ready.length) stored = await deps.deliver(uid, ready, { source: 'finder', batchId: `finder-${(job.createdAt || '').slice(0, 10)}` });
    added += stored.added;
    stats.delivered += stored.added;
    stats.skipped += Object.values(stored.skipped).reduce((a, b) => a + b, 0);

    const seen = [...(job.seen || []), ...batch.map((c) => c.place_id)].slice(-SEEN_CAP);
    const cursor = (job.cursor || 0) + batch.length;
    job = {
      ...job, cursor, stats, seen, status: cursor >= queue.length ? 'done' : 'running', updatedAt: nowIso(),
      usage: { ...usage, sites: usage.sites + needSite },
    };
    await deps.save(uid, job);
    if (job.status === 'done') break;
  }
  return { job, added, finished: job.status !== 'running', waiting };
}

export async function cancelJob(db, uid, deps = firestoreDeps(db)) {
  const job = await deps.load(uid);
  if (!job || job.status !== 'running') return job;
  const next = { ...job, status: 'cancelled', updatedAt: nowIso() };
  await deps.save(uid, next);
  return next;
}

// ---------------------------------------------------------------- saved searches (the nightly routine)
export async function loadFinderSettings(db, uid, deps = firestoreDeps(db)) {
  try { return sanitizeFinderSettings((await deps.loadSettings(uid)) || FINDER_DEFAULTS); } catch { return { ...FINDER_DEFAULTS }; }
}

export async function saveFinderSettings(db, uid, patch, deps = firestoreDeps(db)) {
  const current = await loadFinderSettings(db, uid, deps);
  const next = sanitizeFinderSettings({ ...current, ...patch });
  await deps.saveSettings(uid, { ...next, updatedAt: nowIso() }, false);
  // The nightly job reads this small index instead of scanning every account.
  await deps.markFinderUser(uid, next.enabled && (next.searches.length > 0 || (next.autoFind && !!next.area)));
  return next;
}

/**
 * The nightly routine for one owner: continue an unfinished search, otherwise start the next saved search (they take turns), then work
 * through the queue until the time box ends. Never replaces a search the owner started by hand and is still running.
 */
/**
 * Ask the AI which kinds of business to search next (from the offer and our own results) and merge them into the saved searches.
 * Never throws: a failed suggestion is noted on the settings and tried again on a later night.
 */
export async function refreshAutoSearches(db, uid, { settings, deps = firestoreDeps(db), suggest = (u, area) => suggestTargets(db, u, area), now = Date.now() }) {
  const put = async (patch) => { try { await deps.saveSettings(uid, patch, true); } catch { /* bookkeeping must never stop the night */ } };
  let suggestions;
  let note;
  try {
    suggestions = await suggest(uid, settings.area);
  } catch (e) {
    note = e?.code === 'NO_PROFILE'
      ? 'Describe what you sell in Account first, then auto-find can suggest where to look.'
      : 'The AI could not suggest searches just now. It will try again on a later night.';
    const patch = { autoFindedAt: new Date(now).toISOString(), autoNote: note };
    await put(patch);
    return sanitizeFinderSettings({ ...settings, ...patch });
  }
  const merged = mergeAutoSearches(settings, suggestions);
  note = merged.added.length
    ? `Added ${merged.added.length} new search${merged.added.length === 1 ? '' : 'es'}: ${merged.added.map((a) => a.term).join(', ')}.`
    : merged.searches.length
      ? 'Nothing new to add: the current searches still find businesses.'
      : 'Every suggested business type has been tried in this area. Describe your offer more widely, or change the area.';
  const next = sanitizeFinderSettings({ ...settings, searches: merged.searches, retired: merged.retired, next: 0 });
  const patch = { searches: next.searches, retired: next.retired, next: 0, autoFindedAt: new Date(now).toISOString(), autoNote: note };
  await put(patch);
  return { ...next, autoFindedAt: patch.autoFindedAt, autoNote: note, health: settings.health };
}

export async function runNightly(db, uid, { ctx, deadline, deps = firestoreDeps(db), suggest }) {
  let settings = await loadFinderSettings(db, uid, deps);
  if (needsAutoRefresh(settings)) settings = await refreshAutoSearches(db, uid, { settings, deps, suggest });
  if (!settings.enabled || !settings.searches.length) return { skipped: 'off', added: 0 };
  const job = await deps.load(uid);
  if (!job || job.status !== 'running') {
    // The next search in turn, skipping the ones that have run dry, so the night is not spent on a finished area.
    const pick = pickNightlySearch(settings);
    const turn = async () => { await deps.saveSettings(uid, { next: (pick.index + 1) % settings.searches.length }, true).catch(() => {}); };
    try {
      await startSearch(db, uid, { query: pick.search.term, location: pick.search.location, minScore: pick.search.minScore }, { source: 'nightly', ctx, deadline: Math.min(deadline, Date.now() + 40000), deps });
    } catch (e) {
      if (e instanceof FinderError) { await turn(); return { skipped: e.code, added: 0, error: e.message }; }
      throw e;
    }
    await turn();
  }
  const r = await runStep(db, uid, { ctx, deadline, deps });
  // A nightly search that has finished: remember whether it found anything new, so a dry one is noticed.
  if (r.finished && r.job && r.job.source === 'nightly' && r.job.term && r.job.stats) {
    try {
      const health = recordSearchRun(settings.health, { term: r.job.term, location: r.job.location }, r.job.stats.delivered || 0);
      await deps.saveSettings(uid, { health }, true);
    } catch { /* never let bookkeeping stop the night */ }
  }
  return { skipped: '', added: r.added, finished: r.finished, waiting: r.waiting };
}

export async function listFinderUsers(db) {
  const snap = await getDocs(query(collection(db, 'autopilot_users'), where('finder', '==', true)));
  return snap.docs.map((d) => d.data().userId || d.id);
}
