// lib/job-rules.js - when a scheduled job may run. Pure (no database).

/** A run that says "running" for longer than this is treated as crashed and may be taken over. Daily jobs take at most 5 minutes. */
export const STALE_RUN_MS = 20 * 60 * 1000;

/**
 * @param {{status?: string, startedAt?: string}|null} prev  today's record for this job, or null
 * @param {{once: boolean, now: number}} opts
 * @returns {'run'|'skip-done'|'skip-running'|'take-over'}
 *   run: nothing recorded yet, or the job is repeatable
 *   skip-done: a once-a-day job already finished today
 *   skip-running: another run is going right now
 *   take-over: the earlier run failed, or crashed (still "running" long after it started)
 */
export function lockDecision(prev, { once = false, now = Date.now() } = {}) {
  if (!once || !prev) return 'run';
  if (prev.status === 'done') return 'skip-done';
  if (prev.status === 'running' && now - (Date.parse(prev.startedAt) || 0) < STALE_RUN_MS) return 'skip-running';
  return 'take-over';
}

/** A once-a-day job is skipped only when today's record says it finished. A failed or unfinished run is retried. */
export function shouldSkipJob(prevStatus, once) {
  return Boolean(once) && prevStatus === 'done';
}
