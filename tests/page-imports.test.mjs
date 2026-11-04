// Every library function a page or component calls must be imported there (Pass 156). Catches the "X is not defined" class of
// error before it reaches a browser. Checks calls of the form name(...) only, to avoid false alarms on words in text.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const exported = new Set();
for (const f of walk('lib')) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) exported.add(m[1]);
  for (const m of src.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\(|async|function|\w+\s*=>)/g)) exported.add(m[1]);
}

// Only camel-case names (the helpers this code base exports); single generic words such as limit or load appear in text too often.
const helpers = [...exported].filter((n) => /[a-z][A-Z]/.test(n));

const problems = [];
for (const f of [...walk('app')]) {
  const src = fs.readFileSync(f, 'utf8');
  const imported = new Set();
  for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    for (const name of m[1].match(/[A-Za-z_$][\w$]*/g) || []) imported.add(name);
  }
  const declared = new Set([...src.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) for (const name of m[1].match(/[A-Za-z_$][\w$]*/g) || []) declared.add(name);
  for (const name of helpers) {
    if (imported.has(name) || declared.has(name)) continue;
    if (new RegExp(`(?<![\\w$.])${name}\\s*\\(`).test(src)) problems.push(`${f}: ${name}()`);
  }
}

assert.deepEqual(problems, [], `functions used without an import:\n${problems.join('\n')}`);
console.log('  ok - every library function called in app/ is imported there');
console.log('\n1 passed');
