/**
 * lib/concurrency.js
 * ------------------
 * Runs `worker` over `items` with at most `limit` in flight at once, instead
 * of the `for (const item of items) await worker(item)` pattern used
 * throughout the drafting/scoring/sourcing routes.
 *
 * Why this matters here specifically: every serverless invocation in this
 * app (campaigns/draft, followups/draft, leads/source) is billed by wall-
 * clock duration and capped by `maxDuration`. A sequential loop over a
 * 10-item batch takes ~10x one AI call's latency to finish, which is pure
 * idle waiting, not work — and on a slow day it risks tripping the
 * function's time limit before the batch finishes. Running everything with
 * `Promise.all` and no cap would remove the wait but also fire every call
 * at the AI/API provider simultaneously, which is a good way to hit a
 * provider's own rate limit on a larger batch. A small fixed concurrency
 * (4 by default) gets most of the speedup with a predictable, provider-
 * friendly number of simultaneous requests regardless of batch size.
 */
async function mapWithConcurrency(items, limit, worker) {
  const list = items || [];
  const results = new Array(list.length);
  let cursor = 0;

  async function runOne() {
    while (cursor < list.length) {
      const i = cursor++;
      results[i] = await worker(list[i], i);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, list.length)) }, runOne);
  await Promise.all(workers);
  return results;
}

module.exports = { mapWithConcurrency };
