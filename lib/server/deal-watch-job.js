// lib/server/deal-watch-job.js - the I/O around lib/deal-watch.js: reads the owner's feeds, saves prices and deals.
// Only reads public listing feeds the owner chose. It never buys, contacts anyone, or sends anything.
import { doc, getDoc, setDoc, collection, query, where, getDocs } from '../server-firestore.js';
import { safeGet } from './lead-finder-io.js';
import { parseFeed, priceFrom, rememberPrices, assessNew, readState, sanitizeFeeds, sanitizeCosts, MAX_SEEN, MAX_DEALS } from '../deal-watch.js';

const nowIso = () => new Date().toISOString();
const stateRef = (db, uid) => doc(db, 'users', uid, 'deal_watch', 'state');

export function firestoreWatchStore(db) {
  return {
    async load(uid) {
      try { const s = await getDoc(stateRef(db, uid)); return readState(s.exists() ? s.data() : null); }
      catch { return readState(null); }
    },
    async save(uid, state) { await setDoc(stateRef(db, uid), state); },
    async markUser(uid, on) { await setDoc(doc(db, 'autopilot_users', uid), { userId: uid, dealWatch: on, updatedAt: nowIso() }, { merge: true }); },
  };
}

export async function loadDealWatch(db, uid, store = firestoreWatchStore(db)) {
  return store.load(uid);
}

/** Saves the owner's feeds (and optionally their costs). Saves nothing if there are too many. */
export async function saveFeeds(db, uid, { urls, costs } = {}, store = firestoreWatchStore(db)) {
  const cur = await store.load(uid);
  const { feeds, bad, tooMany } = sanitizeFeeds(urls);
  if (tooMany) return { saved: false, tooMany: true, feeds: [], bad };
  const next = {
    ...cur,
    feeds: feeds.map((f) => ({ ...f, addedAt: cur.feeds.find((x) => x.url === f.url)?.addedAt || nowIso() })),
    costs: costs ? sanitizeCosts({ ...cur.costs, ...costs }) : cur.costs,
  };
  await store.save(uid, next);
  await store.markUser(uid, feeds.length > 0);
  return { saved: true, tooMany: false, feeds, bad };
}

/** Owners who have at least one feed saved; read by the nightly job. */
export async function listDealWatchUsers(db) {
  const snap = await getDocs(query(collection(db, 'autopilot_users'), where('dealWatch', '==', true)));
  return snap.docs.map((d) => d.data().userId || d.id);
}

function buildNote({ checked, configured, fresh, priced, found, failed }) {
  if (!configured) return 'Add at least one listing feed to start watching.';
  const parts = [`Checked ${checked} of ${configured} feed${configured === 1 ? '' : 's'}`];
  if (failed.length) parts.push(`could not read ${failed.join(', ')}`);
  parts.push(`${fresh} new listing${fresh === 1 ? '' : 's'}, ${priced} with a price`);
  parts.push(found ? `${found} undervalued` : 'none undervalued');
  return `${parts.join('; ')}.`;
}

/**
 * One owner's watch: read each feed, keep only listings not seen before, judge them against the prices already remembered,
 * then remember their prices. Never throws for a bad feed; a feed that cannot be read is named in the note.
 */
export async function runDealWatch(db, uid, { ctx, now = Date.now(), fetchFeed, store = firestoreWatchStore(db) } = {}) {
  const state = await store.load(uid);
  const fetcher = fetchFeed || ((url) => safeGet(url, ctx, {
    timeoutMs: 8000, maxBytes: 1500000,
    accept: 'application/rss+xml,application/atom+xml,application/xml;q=0.9,text/xml;q=0.8',
  }));
  const seen = new Set(state.seen);
  const fresh = [];
  const failed = [];
  let checked = 0;
  for (const f of state.feeds) {
    try {
      const r = await fetcher(f.url);
      if (!r || !r.ok) { failed.push(f.label); continue; }
      checked++;
      for (const it of parseFeed(r.text)) {
        if (seen.has(it.link)) continue;
        seen.add(it.link);
        fresh.push({ ...it, price: priceFrom(`${it.title} ${it.description}`) });
      }
    } catch { failed.push(f.label); }
  }
  const priced = fresh.filter((it) => it.price);
  const found = assessNew(priced, state.memory, state.costs).map((d) => ({ ...d, foundAt: nowIso() }));
  const memory = rememberPrices(state.memory, priced, now);
  const note = buildNote({ checked, configured: state.feeds.length, fresh: fresh.length, priced: priced.length, found: found.length, failed });
  await store.save(uid, {
    ...state,
    memory,
    seen: [...seen].slice(-MAX_SEEN),
    deals: [...found, ...state.deals].slice(0, MAX_DEALS),
    lastRunAt: nowIso(),
    lastNote: note,
  });
  return { checked, fresh: fresh.length, found: found.length, failed, note };
}
