// scripts/make-manifest.mjs - writes scripts/shipped-files.txt: every source file this release owns (app/, lib/, components/, hooks/).
// remove-retired-files.mjs uses it to move aside leftovers from an OLDER release that was unzipped over this one.
// Run `npm run manifest` after adding or removing a source file; `npm test` fails if the list is out of date.
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SWEEP_ROOTS = ['app', 'lib', 'components', 'hooks'];
export const CODE_EXT = /\.(m?js|jsx|ts|tsx)$/;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function listSource(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p); }
      else if (CODE_EXT.test(name)) out.push(relative(root, p).split(sep).join('/'));
    }
  };
  for (const r of SWEEP_ROOTS) walk(join(root, r));
  return out.sort();
}

export const manifestText = (root = ROOT) => `${listSource(root).join('\n')}\n`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(join(ROOT, 'scripts', 'shipped-files.txt'), manifestText());
  console.log(`scripts/shipped-files.txt written (${listSource().length} files)`);
}
