// scripts/check-imports.mjs - "will it build?" without building. Walks every source file and checks that
//   * every relative / "@/" import points at a file that exists,
//   * every NAMED import exists as an export of that file (the exact failure that breaks `next build`: "export X was not found"),
//   * every package imported is listed in package.json (or is a Node built-in).
// Pure file reading: no install, no network. Run: node scripts/check-imports.mjs   (also runs inside `npm test`).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CODE = /\.(m?js|jsx)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '_stale', 'public']);
const SOURCE_ROOTS = ['app', 'lib', 'components', 'hooks', 'tests', 'scripts', 'proxy.js'];

function walk(p, out = []) {
  if (!existsSync(p)) return out;
  const st = statSync(p);
  if (st.isFile()) { if (CODE.test(p)) out.push(p); return out; }
  for (const name of readdirSync(p)) {
    if (SKIP_DIRS.has(name)) continue;
    walk(join(p, name), out);
  }
  return out;
}

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const cache = new Map();

function candidates(base) {
  return [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, join(base, 'index.js'), join(base, 'index.jsx')];
}
function resolveFile(spec, fromFile) {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : resolve(dirname(fromFile), spec);
  return candidates(base).find((f) => existsSync(f) && statSync(f).isFile()) || null;
}

/** { names:Set, hasDefault:boolean, stars:string[] } for one file. */
function exportsOf(file) {
  if (cache.has(file)) return cache.get(file);
  const info = { names: new Set(), hasDefault: false, stars: [] };
  cache.set(file, info);
  const src = stripComments(readFileSync(file, 'utf8'));
  let m;
  const decl = /\bexport\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = decl.exec(src))) info.names.add(m[1]);
  const destructured = /\bexport\s+(?:const|let|var)\s*\{([^}]*)\}/g;
  while ((m = destructured.exec(src))) for (const part of m[1].split(',')) { const n = part.split(':').pop().split('=')[0].trim(); if (n) info.names.add(n); }
  const lists = /\bexport\s*\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/g;
  while ((m = lists.exec(src))) {
    for (const part of m[1].split(',')) {
      const t = part.trim(); if (!t) continue;
      const as = t.split(/\s+as\s+/);
      const out = (as[1] || as[0]).trim();
      if (out === 'default') info.hasDefault = true; else info.names.add(out);
    }
  }
  if (/\bexport\s+default\b/.test(src)) info.hasDefault = true;
  const stars = /\bexport\s*\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s*)?from\s*['"]([^'"]+)['"]/g;
  while ((m = stars.exec(src))) { if (m[1]) info.names.add(m[1]); else info.stars.push(resolveFile(m[2], file)); }
  return info;
}
function hasExport(file, name, seen = new Set()) {
  if (seen.has(file)) return false;
  seen.add(file);
  const info = exportsOf(file);
  if (name === 'default') return info.hasDefault;
  if (info.names.has(name)) return true;
  return info.stars.some((f) => f && hasExport(f, name, seen));
}

export function checkImports({ root = ROOT } = {}) {
  const problems = [];
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const deps = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
  const builtins = new Set(builtinModules.flatMap((b) => [b, `node:${b}`]));
  const files = SOURCE_ROOTS.flatMap((r) => walk(join(root, r)));
  const rel = (f) => relative(root, f).split(sep).join('/');

  for (const file of files) {
    if (rel(file) === 'scripts/check-imports.mjs') continue; // this file's own regexes look like imports
    const src = stripComments(readFileSync(file, 'utf8'));
    const specs = [];
    let m;
    // import ... from '...'   /   export ... from '...'   (multi-line safe)
    const re = /\b(import|export)\s+((?:type\s+)?[\w$*\s{},]+?)\s+from\s*['"]([^'"]+)['"]/g;
    while ((m = re.exec(src))) specs.push({ clause: m[2].trim(), spec: m[3], kind: m[1] });
    const bare = /\bimport\s*['"]([^'"]+)['"]/g;
    while ((m = bare.exec(src))) specs.push({ clause: '', spec: m[1], kind: 'import' });
    const dyn = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = dyn.exec(src))) specs.push({ clause: '', spec: m[1], kind: 'dynamic' });

    for (const { clause, spec } of specs) {
      if (spec.startsWith('.') || spec.startsWith('@/')) {
        const target = resolveFile(spec, file);
        if (!target) { problems.push(`${rel(file)}: cannot find '${spec}'`); continue; }
        if (!CODE.test(target)) continue;
        const named = [];
        const braces = clause.match(/\{([\s\S]*)\}/);
        if (braces) for (const part of braces[1].split(',')) { const n = part.trim().split(/\s+as\s+/)[0].trim(); if (n) named.push(n); }
        for (const n of named) if (!hasExport(target, n)) problems.push(`${rel(file)}: '${n}' is not exported by ${rel(target)}`);
        const head = clause.replace(/\{[\s\S]*\}/, '').replace(/\*\s*as\s+[\w$]+/, '').replace(/,/g, '').trim();
        if (head && !/^\*/.test(head) && !hasExport(target, 'default')) problems.push(`${rel(file)}: default import from ${rel(target)}, which has no default export`);
      } else if (!builtins.has(spec) && !spec.startsWith('node:')) {
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        if (!deps.has(name) && !['next'].includes(name)) problems.push(`${rel(file)}: package '${name}' is not in package.json`);
      }
    }
  }
  return { files: files.length, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, problems } = checkImports();
  if (problems.length) { console.error(`${problems.length} import problem(s) in ${files} files:\n- ${problems.join('\n- ')}`); process.exit(1); }
  console.log(`imports OK (${files} files checked)`);
}
