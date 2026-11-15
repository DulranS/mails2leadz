// lib/server/job-log.js - the run ledger for the scheduled jobs (top-level `job_runs`, server-written only).
// Each run records: job, status (running | done | failed), start and finish, a summary and the error text.
//  - once: true  (daily jobs): the run is CLAIMED atomically (one Firestore transaction, service-account mode). A job that
//    finished today is skipped; a second run that starts while one is still running is skipped; a failed run, or a run
//    still "running" after 20 minutes (a crash), is taken over and retried. Two runs starting at the same instant cannot
//    both claim it. In server-login mode (no transaction available) the claim is a read-then-write and is NOT atomic.
//  - once: false (jobs that are safe to repeat): every run is recorded, none is skipped.
// Logging never blocks a job: if the ledger itself fails, the job still runs (the error is logged).
import { doc, getDoc, setDoc, claimJobRun } from '../server-firestore.js';
import { lockDecision } from '../job-rules.js';

const dayKey = (now) => new Date(now).toISOString().slice(0, 10);
const iso = (now) => new Date(now).toISOString();

/** @returns {Promise<{skip: boolean, reason?: string, ref: object|null}>} */
export async function beginJob(db, job, { once = false, now = Date.now() } = {}) {
  const id = once ? `${job}_${dayKey(now)}` : `${job}_${now}`;
  const data = { job, status: 'running', startedAt: iso(now) };
  try {
    const ref = doc(db, 'job_runs', id);
    if (!once) {
      await setDoc(ref, data, { merge: true });
      return { skip: false, ref };
    }
    // Atomic claim where the server has full database access (the cron routes require it).
    const claimed = await claimJobRun(ref, data, (prev) => lockDecision(prev, { once: true, now }) !== 'skip-done' && lockDecision(prev, { once: true, now }) !== 'skip-running');
    if (claimed === false) {
      const prev = (await getDoc(ref).catch(() => null))?.data?.() || {};
      const why = lockDecision(prev, { once: true, now }) === 'skip-running' ? 'another run is in progress' : 'already finished today';
      return { skip: true, reason: why, ref: null };
    }
    if (claimed === null) {
      // Server-login mode: no transaction. Best effort only.
      const prev = (await getDoc(ref).catch(() => null))?.data?.() || null;
      if (lockDecision(prev, { once: true, now }) !== 'run' && lockDecision(prev, { once: true, now }) !== 'take-over') {
        return { skip: true, reason: 'already finished today', ref: null };
      }
      await setDoc(ref, data, { merge: true });
    }
    return { skip: false, ref };
  } catch (e) {
    console.error('[job-log] could not start the record:', job, String(e?.message || '').slice(0, 120));
    return { skip: false, ref: null };
  }
}

/** Records how the run ended. `summary` is stored as plain JSON (no undefined values, so the database accepts it). */
export async function endJob(handle, { ok, summary = null, error = '' } = {}, now = Date.now()) {
  if (!handle?.ref) return;
  try {
    const plain = JSON.parse(JSON.stringify(summary ?? null));
    await setDoc(handle.ref, {
      status: ok ? 'done' : 'failed', finishedAt: iso(now), summary: plain, error: String(error || '').slice(0, 300),
    }, { merge: true });
  } catch (e) {
    console.error('[job-log] could not finish the record:', String(e?.message || '').slice(0, 120));
  }
}
