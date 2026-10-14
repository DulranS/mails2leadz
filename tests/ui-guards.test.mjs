// Guards for rendering bugs that unit tests cannot see (found by looking at the real pages in a browser).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const walk = (dir) => fs.readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));

t('Tailwind v4: no removed v3 opacity utilities (they silently do nothing: bg-opacity-75 made the modal overlay opaque)', () => {
  const bad = walk('app').filter((f) => /\b(bg|text|border|divide|ring|placeholder)-opacity-\d+/.test(read(f)));
  assert.deepEqual(bad, []);
});
t('Modal: the dialog sits ABOVE its position:fixed overlay (otherwise every AI draft window is a solid grey screen)', () => {
  const src = read('app/components/ui/Modal.js');
  assert.match(src, /relative z-10 inline-block/);
  assert.match(src, /bg-gray-500\/75/);
  assert.match(src, /role="dialog"/);
});
t('dark: styles follow the .dark class the theme toggle sets (Tailwind v4 ignores tailwind.config.js darkMode)', () => {
  assert.match(read('app/globals.css'), /@custom-variant dark \(&:where\(\.dark, \.dark \*\)\)/);
  assert.match(read('app/components/ui/ThemeProvider.js'), /classList\.add\(theme\)/);
});
t('the follow-up queue does not open itself when nothing is due (a new customer\'s first screen)', () => {
  const src = read('app/dashboard/page.js');
  assert.match(src, /useState\(false\); \/\/ opens by itself only when a follow-up is due/);
  assert.match(src, /if \(dueNow\) setShowFollowUpQueue\(true\)/);
});
t('AI-sent emails schedule their follow-ups (single draft and batch)', () => {
  const src = read('app/dashboard/page.js');
  assert.equal((src.match(/await scheduleEmailFollowUps\(/g) || []).length, 2);
});
console.log(`\n${n} ui-guard tests ok`);
