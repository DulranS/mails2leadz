// Session load statistics (v264). Every live listener the data layer opens reports each delivery here: how many documents it carried and when. The
// System check screen reads these numbers, so the cost and speed of a real account can be measured instead of guessed. Documents delivered are a close
// proxy for database reads (the first load and every later change). Pure bookkeeping, plus one thin wrapper around onSnapshot.
import { onSnapshot, type DocumentData, type DocumentSnapshot, type QuerySnapshot } from "firebase/firestore";

export interface ListenerStat { name: string; docs: number; deliveries: number; firstMs: number | null; lastMs: number | null }

const stats = new Map<string, ListenerStat>();
let startedAt = 0;

export function markSessionStart(now = Date.now()) { if (!startedAt) startedAt = now; }

export function recordDelivery(name: string, docCount: number, now = Date.now()) {
  const s = stats.get(name) ?? { name, docs: 0, deliveries: 0, firstMs: null, lastMs: null };
  s.docs += docCount;
  s.deliveries += 1;
  const since = startedAt ? now - startedAt : 0;
  if (s.firstMs === null) s.firstMs = since;
  s.lastMs = since;
  stats.set(name, s);
}

export function resetStats() { stats.clear(); startedAt = 0; }

export function summary(list: ListenerStat[] = [...stats.values()], top = 8) {
  const sorted = [...list].sort((a, b) => b.docs - a.docs || a.name.localeCompare(b.name));
  return {
    listeners: list.length,
    totalDocs: list.reduce((t, s) => t + s.docs, 0),
    totalDeliveries: list.reduce((t, s) => t + s.deliveries, 0),
    slowestFirstMs: list.reduce((t, s) => Math.max(t, s.firstMs ?? 0), 0),
    top: sorted.slice(0, top),
  };
}

// The name a listener is reported under: the collection or document it reads.
function labelOf(ref: unknown): string {
  const p = (ref as { path?: string })?.path;
  return typeof p === "string" && p.length > 0 ? p.split("/").slice(-2).join("/") : "query";
}

// Drop-in for onSnapshot in the data layer: the same listener, with each delivery counted.
export function trackedSnapshot(
  ref: unknown,
  cb: (snap: QuerySnapshot<DocumentData> & DocumentSnapshot<DocumentData>) => void,
  errCb?: (e: unknown) => void,
) {
  markSessionStart();
  const name = labelOf(ref);
  type Snap = QuerySnapshot<DocumentData> & DocumentSnapshot<DocumentData>;
  // One signature for a collection, a query or a document: Firestore's own overloads are chosen by the reference type, which this wrapper does not know.
  const listen = onSnapshot as unknown as (r: unknown, next: (s: Snap) => void, err?: (e: unknown) => void) => () => void;
  return listen(
    ref,
    (snap) => {
      const docs = "size" in snap && typeof snap.size === "number" ? snap.size : snap.exists() ? 1 : 0;
      recordDelivery(name, docs);
      cb(snap);
    },
    errCb,
  );
}
