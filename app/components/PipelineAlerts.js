import React, { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, query, updateDoc, where } from "../../lib/client-firestore.js";

const KIND_LABEL = { stall_alert: "Stalled", lost_revival: "Lost, worth a look", renewal_due: "Renewing soon", speed_to_lead: "New lead waiting for a reply", quote_viewed: "Quote opened, no answer" };

// Open pipeline alerts. Nothing shown here is sent to anyone: the owner acts in the CRM, then marks the alert done.
export default function PipelineAlerts({ db, uid }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!db || !uid) return;
    // Live: an alert the daily run writes appears here without a reload, and a closed one disappears.
    const unsub = onSnapshot(
      query(collection(db, "users", uid, "pipeline_alerts"), where("status", "==", "pending"), limit(200)),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))),
      () => {}
    );
    return () => unsub();
  }, [db, uid]);

  const markDone = async (id) => {
    setBusy(id);
    try {
      await updateDoc(doc(db, "users", uid, "pipeline_alerts", id), { status: "done", doneAt: new Date().toISOString() });
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch { /* the alert stays open; try again */ }
    finally { setBusy(""); }
  };

  if (!items.length) return null;
  return (
    <section aria-label="Pipeline alerts" className="mx-4 my-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Pipeline alerts ({items.length})</h2>
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Nothing here has been sent to anyone. Act from the CRM, then mark the alert done.</p>
      <ul className="mt-3 space-y-2">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
            <div className="min-w-0">
              <span className="text-xs font-medium text-amber-800 dark:text-amber-300">{KIND_LABEL[a.kind] || a.kind}</span>{" "}
              <strong className="text-gray-900 dark:text-white break-all">{a.leadEmail}</strong>
              <p className="text-gray-700 dark:text-gray-200">{a.reason}</p>
            </div>
            <button type="button" disabled={busy === a.id} onClick={() => markDone(a.id)} className="shrink-0 px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-100">Mark done</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
