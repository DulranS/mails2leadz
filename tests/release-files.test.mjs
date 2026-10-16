// Guards the "unzip a new release over an old project" failure: a leftover file that imports something this release removed breaks `next build`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkImports } from '../scripts/check-imports.mjs';
import { manifestText } from '../scripts/make-manifest.mjs';
import { sweepStale, removeRetired, RETIRED } from '../scripts/remove-retired-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const quiet = () => {};
const imp = (names, from) => `${'imp'}ort { ${names} } from '${from}';\n`; // built in pieces so the import checker does not read it as a real import

t('every import resolves and every named import is really exported (the build-breaking error class)', () => {
  const { problems } = checkImports();
  assert.deepEqual(problems, []);
});

t('scripts/shipped-files.txt lists exactly this release\'s source files (run `npm run manifest` after adding or removing one)', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'scripts', 'shipped-files.txt'), 'utf8'), manifestText());
});

t('nothing in the RETIRED list still exists in the release', () => {
  for (const rel of RETIRED) assert.equal(fs.existsSync(path.join(ROOT, rel)), false, rel);
});

t('cleanup: leftovers from an older release are moved aside (not deleted) and the build graph is clean again', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoleads-sweep-'));
  try {
    for (const d of ['app', 'lib', 'components', 'hooks', 'scripts', 'tests']) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(tmp, 'package.json'));
    fs.copyFileSync(path.join(ROOT, 'proxy.js'), path.join(tmp, 'proxy.js'));
    fs.writeFileSync(path.join(tmp, 'lib', 'reply-text.js'), `${imp('QUOTE_CUT_RE', './reply-intents.js')}export const X = 1;\n`);
    fs.writeFileSync(path.join(tmp, 'lib', 'older-feature.js'), `${imp('gone', './token-vault-old.js')}export const Y = gone;\n`);
    fs.mkdirSync(path.join(tmp, 'app', 'api', 'old-watch'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'app', 'api', 'old-watch', 'route.js'), `${imp('encryptToken', '../../../lib/server/token-vault.js')}export const GET = () => encryptToken;\n`);
    assert.ok(checkImports({ root: tmp }).problems.length >= 3); // the leftovers break the build
    assert.equal(removeRetired({ base: tmp, log: quiet }), 1); // lib/reply-text.js is on the retired list
    const moved = sweepStale({ base: tmp, log: quiet, env: {} });
    assert.deepEqual(moved.sort(), ['app/api/old-watch/route.js', 'lib/older-feature.js']);
    assert.ok(fs.existsSync(path.join(tmp, '_stale', 'lib', 'older-feature.js'))); // kept, not destroyed
    assert.equal(fs.existsSync(path.join(tmp, 'app', 'api', 'old-watch', 'route.js')), false);
    assert.deepEqual(checkImports({ root: tmp }).problems, []);
    // our own files were never touched, and a second run finds nothing
    assert.deepEqual(sweepStale({ base: tmp, log: quiet, env: {} }), []);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

t('cleanup: KEEP_UNLISTED_FILES=1 turns the sweep off, and a damaged list never causes a mass move', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoleads-sweep-'));
  try {
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'lib', 'mine.js'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(tmp, 'scripts', 'shipped-files.txt'), 'lib/other.js\n'); // far too short to be a real list
    assert.deepEqual(sweepStale({ base: tmp, log: quiet, env: {} }), []);
    fs.copyFileSync(path.join(ROOT, 'scripts', 'shipped-files.txt'), path.join(tmp, 'scripts', 'shipped-files.txt'));
    assert.deepEqual(sweepStale({ base: tmp, log: quiet, env: { KEEP_UNLISTED_FILES: '1' } }), []);
    assert.ok(fs.existsSync(path.join(tmp, 'lib', 'mine.js')));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

console.log(`release-files: ${n} passed`);
