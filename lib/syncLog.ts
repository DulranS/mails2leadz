// The sync log (v274): every call the AutoLeads sync makes to Balancr is recorded, with what it did, the record it touched and whether it succeeded, so a
// failed sync can be seen and checked. It is written by the lead and invoice routes through this helper, and it never blocks the call itself: if the log
// cannot be written, the call still answers and the failure is kept out of the response.
import type { Firestore } from "firebase-admin/firestore";

export interface SyncEntry { action: string; recordId: string; ok: boolean; detail?: string }

export async function logSync(base: Firestore | { collection: (name: string) => { add: (data: object) => Promise<unknown> } }, entry: SyncEntry): Promise<void> {
  try {
    await (base as { collection: (n: string) => { add: (d: object) => Promise<unknown> } }).collection("syncLog").add({
      ...entry,
      source: "autoleads",
      at: Date.now(),
      detail: entry.detail ? entry.detail.slice(0, 200) : null,
    });
  } catch {
    // The log is a record, not a gate: a failure to write it is not a failure of the sync.
  }
}
