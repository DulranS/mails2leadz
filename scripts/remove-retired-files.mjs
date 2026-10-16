// Runs automatically before `npm run build` (see "prebuild" in package.json), locally and on the host.
//
// WHY: unzipping a newer release over an older project does NOT delete files the newer release no longer has. A leftover file that
// imports something the new release renamed or removed breaks the whole build ("export X was not found in ...").
//
// WHAT IT DOES (nothing is ever deleted except the short RETIRED list below):
//   1. RETIRED: exact files that older releases had and no release has now. These are removed.
//   2. SWEEP: any source file under app/, lib/, components/ or hooks/ that is NOT in scripts/shipped-files.txt (this release's own
//      list) is MOVED to _stale/<same path>, so the build ignores it and you can still get it back. Every move is printed.
//      Turn the sweep off with KEEP_UNLISTED_FILES=1 if you deliberately add your own source files. (Better: add them to the list
//      with `npm run manifest`.)
import { rmSync, existsSync, readFileSync, mkdirSync, renameSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSource } from './make-manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RETIRED = [
  'lib/services',                      // CSV "enrich" client (sent lead lists to a third-party endpoint)
  'app/api/enrich',                    // CSV "enrich" route
  'app/api/send-sms-qualification',    // bulk "SMS Qualify" (send step was a stub)
  'app/api/handle-sms-reply',          // its reply webhook
  'lib/sms-qualifier.js',              // helper for the two routes above
  'lib/reply-text.js',                 // older reply-text reader (replaced by lib/gmail-text.js)
  'lib/gmail-watch.js',                // older reply-watch scheduler (replaced by lib/server/gmail-offline.js + the nightly job)
];

export function removeRetired({ base = root, log = console.log } = {}) {
  let removed = 0;
  for (const rel of RETIRED) {
    const p = resolve(base, rel);
    if (existsSync(p)) { rmSync(p, { recursive: true, force: true }); log(`[cleanup] removed retired file: ${rel}`); removed++; }
  }
  return removed;
}

/** Move source files this release does not own into _stale/. Returns the list moved. */
export function sweepStale({ base = root, log = console.log, env = process.env } = {}) {
  if (env.KEEP_UNLISTED_FILES === '1') return [];
  const manifestPath = join(base, 'scripts', 'shipped-files.txt');
  if (!existsSync(manifestPath)) return [];
  const owned = new Set(readFileSync(manifestPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean));
  if (owned.size < 50) return []; // a damaged list must never cause a mass move
  const moved = [];
  for (const rel of listSource(base)) {
    if (owned.has(rel)) continue;
    const to = join(base, '_stale', rel);
    mkdirSync(dirname(to), { recursive: true });
    renameSync(join(base, rel), to);
    log(`[cleanup] moved leftover file from an older release to _stale/: ${rel}`);
    moved.push(rel);
  }
  return moved;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const removed = removeRetired();
  const moved = sweepStale();
  if (!removed && !moved.length) console.log('[cleanup] no retired or leftover files found');
}
