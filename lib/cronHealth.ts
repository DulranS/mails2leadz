// Is the daily job alive? The admin panel already shows this, but only if you open it. The new-lead
// email is the one message that still reaches you when the scheduler has silently stopped (the
// morning digest cannot warn you that it is not running), so it carries this line too.
//
// Never throws and never blocks a lead: any problem reading the heartbeat means "no warning".
import { getAdminDb } from "@/lib/firebaseAdmin";
import { cronAuthMode } from "@/lib/cronAuth";

const STALE_AFTER_MS = 36 * 60 * 60 * 1000; // same threshold as the admin panel's Automation card

export function cronWarningFor(opts: { secretSet: boolean; lastRunAt: number | null; now: number }): string | null {
  if (!opts.secretSet) return null; // scheduler deliberately off; the readiness script already says so
  if (opts.lastRunAt == null) return null; // first run has not happened yet (new deploy)
  const hours = Math.floor((opts.now - opts.lastRunAt) / 3_600_000);
  if (opts.now - opts.lastRunAt <= STALE_AFTER_MS) return null;
  return `the daily job last ran about ${hours} hours ago. Reminders and the morning digest may have stopped; check the scheduler.`;
}

export async function cronWarningText(): Promise<string | null> {
  try {
    // Only a too-short CRON_SECRET (job refuses to run) means "deliberately off"; no secret = open mode, still scheduled.
    const secretSet = cronAuthMode() !== "misconfigured";
    if (!secretSet) return null;
    const snap = await getAdminDb().doc("platform/automation").get();
    const lastRunAt = (snap.data() as { lastRunAt?: number } | undefined)?.lastRunAt ?? null;
    return cronWarningFor({ secretSet, lastRunAt, now: Date.now() });
  } catch {
    return null;
  }
}
