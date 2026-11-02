// lib/server/signal-feeds-job.js - reads the owner's buying-signal feeds, keeps the new items as alerts, and remembers what it has seen.
// Only public feeds the owner adds are read (the same safe reader as the deal watch). Nothing is sent or contacted.
import { doc, getDoc, setDoc, collection, query, where, getDocs, limit } from '../server-firestore.js';
import { safeGet } from './lead-finder-io.js';
import { parseFeed, sanitizeFeeds } from '../deal-watch.js';
import { newAlerts, mergeAlerts, SEEN_CAP, ALERT_CAP } from '../signal-alerts.js';

const stateRef = (db, uid) => doc(db, 'users', uid, 'signal_feeds', 'state');
const nowIso = () => new Date().toISOString();

export async function loadSignalFeeds(db, uid) {
  const s = await getDoc(stateRef(db, uid));
  const d = s.exists() ? s.data() : {};
  return { feeds: Array.isArray(d.feeds) ? d.feeds : [], alerts: Array.isArray(d.alerts) ? d.alerts : [], seen: Array.isArray(d.seen) ? d.seen : [], lastRunAt: d.lastRunAt || null, note: d.note || '' };
}

/** Saves the owner's feed list. Refuses bad or too many feeds, and says which. */
export async function saveSignalFeeds(db, uid, urls) {
  const { feeds, bad, tooMany } = sanitizeFeeds(urls);
  if (tooMany) return { error: 'Up to 5 feeds.' };
  const cur = await loadSignalFeeds(db, uid);
  await setDoc(stateRef(db, uid), { ...cur, feeds, updatedAt: nowIso() });
  await setDoc(doc(db, 'autopilot_users', uid), { userId: uid, signalFeeds: feeds.length > 0, updatedAt: nowIso() }, { merge: true });
  return { feeds, bad };
}

export async function listSignalFeedUsers(db) {
  const snap = await getDocs(query(collection(db, 'autopilot_users'), where('signalFeeds', '==', true), limit(500)));
  return snap.docs.map((d) => d.data().userId || d.id);
}

/** One owner's run. A feed that cannot be read is named in the note; the others still count. */
export async function runSignalFeeds(db, uid, { ctx, fetchFeed, now = Date.now() } = {}) {
  const cur = await loadSignalFeeds(db, uid);
  if (!cur.feeds.length) return { checked: 0, fresh: 0 };
  const fetcher = fetchFeed || ((url) => safeGet(url, ctx, {
    timeoutMs: 8000, maxBytes: 1500000,
    accept: 'application/rss+xml,application/atom+xml,application/xml;q=0.9,text/xml;q=0.8',
  }));
  const seen = new Set(cur.seen);
  const fresh = [];
  const failed = [];
  let checked = 0;
  for (const f of cur.feeds) {
    try {
      const r = await fetcher(f.url);
      if (!r || !r.ok) { failed.push(f.label); continue; }
      checked++;
      const alerts = newAlerts({ items: parseFeed(r.text), seen, feedLabel: f.label, now });
      for (const a of alerts) { seen.add(a.link); fresh.push(a); }
    } catch { failed.push(f.label); }
  }
  const note = `Checked ${checked} of ${cur.feeds.length} feed${cur.feeds.length === 1 ? '' : 's'}${failed.length ? `; could not read ${failed.join(', ')}` : ''}; ${fresh.length} new alert${fresh.length === 1 ? '' : 's'}.`;
  const seenList = [...seen].slice(-SEEN_CAP);
  await setDoc(stateRef(db, uid), {
    ...cur, seen: seenList, alerts: mergeAlerts(cur.alerts, fresh, ALERT_CAP), lastRunAt: new Date(now).toISOString(), note,
  });
  return { checked, fresh: fresh.length, failed: failed.length };
}
