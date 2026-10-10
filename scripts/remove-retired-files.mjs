// Runs automatically before `npm run build` (see "prebuild" in package.json).
// Unzipping a newer version over an older project does NOT delete files the newer version removed, and a leftover
// file can break the build or bring a retired feature back. This deletes exactly the files retired so far.
// It only touches the paths listed below.
import { rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RETIRED = [
  'lib/services',                      // CSV "enrich" client (sent lead lists to a third-party endpoint)
  'app/api/enrich',                    // CSV "enrich" route
  'app/api/send-sms-qualification',    // bulk "SMS Qualify" (send step was a stub)
  'app/api/handle-sms-reply',          // its reply webhook
  'lib/sms-qualifier.js',              // helper for the two routes above
];

let removed = 0;
for (const rel of RETIRED) {
  const p = resolve(root, rel);
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    console.log(`[cleanup] removed retired file: ${rel}`);
    removed++;
  }
}
if (!removed) console.log('[cleanup] no retired files found');
