// Once-a-day gate for the daily job when no CRON_SECRET is set (see lib/cronAuth.ts). The slot is CLAIMED
// before the job starts (in a transaction), so two simultaneous calls cannot both run it. Fails closed: if the
// claim cannot be recorded the job does not run, because this is the only thing standing between an open URL and
// repeated runs. Server-only document: no Firestore rule opens `platform`.
import { getAdminDb } from "@/lib/firebaseAdmin";

export const OPEN_CRON_MIN_GAP_MS = 20 * 60 * 60 * 1000;
export const CRON_GATE_DOC = "platform/cronGate";

// Pure: may a run start now, given when the last one was claimed?
export function gateAllows(lastClaimedAt: number | null | undefined, now: number, minGapMs = OPEN_CRON_MIN_GAP_MS): boolean {
  if (typeof lastClaimedAt !== "number" || !Number.isFinite(lastClaimedAt)) return true;
  if (lastClaimedAt > now) return false; // a clock in the future must not unlock the gate
  return now - lastClaimedAt >= minGapMs;
}

export async function claimOpenCronRun(now = Date.now()): Promise<boolean> {
  try {
    const db = getAdminDb();
    const ref = db.doc(CRON_GATE_DOC);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const last = (snap.data() as { claimedAt?: number } | undefined)?.claimedAt;
      if (!gateAllows(last, now)) return false;
      tx.set(ref, { claimedAt: now });
      return true;
    });
  } catch (err) {
    console.error("[cronGate] could not claim the daily run — not running", err);
    return false;
  }
}
