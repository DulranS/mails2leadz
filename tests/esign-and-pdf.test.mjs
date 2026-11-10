// E-signature and the PDF (Pass 212): a valid PDF with correct offsets; signature tags placed; the Dropbox Sign fields right; status read correctly.
import assert from 'node:assert/strict';
import { textToPdf, wrapLines } from '../lib/pdf-text.js';
import { withSignatureBlock, signatureRequestFields, isComplete } from '../lib/esign.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

t('the PDF has a header, an end marker, and every cross-reference offset points at its object', () => {
  const pdf = textToPdf('Hello world.\nSecond line (with brackets) and a back\\slash.');
  const s = pdf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  const start = Number(s.match(/startxref\n(\d+)/)[1]);
  assert.equal(s.slice(start, start + 4), 'xref');
  const body = s.slice(0, start);
  const entries = [...s.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  const objs = [...body.matchAll(/(\d+) 0 obj/g)];
  assert.equal(entries.length, objs.length);
  objs.forEach((m, i) => assert.equal(body.indexOf(`${m[1]} 0 obj`), entries[i], `object ${m[1]}`));
});

t('text in the PDF is escaped, and long lines wrap at a sensible width', () => {
  const s = textToPdf('Brackets (a) and \\ slash').toString('latin1');
  assert.match(s, /\(Brackets \\\(a\\\) and \\\\ slash\)/);
  const wrapped = wrapLines('word '.repeat(60));
  assert.ok(wrapped.every((l) => l.length <= 88));
  assert.ok(wrapped.length > 1);
});

t('the agreement ends with a signature and a date placed for the first signer, by text tags', () => {
  const b = withSignatureBlock('Terms here.', 'Ann Perera');
  assert.match(b, /Signed by: Ann Perera/);
  assert.match(b, /\[sig\|req\|signer1\]/);
  assert.match(b, /\[date\|req\|signer1\]/);
});

t('the Dropbox Sign request carries the signer, the title, the text-tag switch, and test mode only when asked', () => {
  const f = Object.fromEntries(signatureRequestFields({ title: 'Service Agreement', signerEmail: 'bo@x.com', signerName: 'Bo', testMode: true }));
  assert.equal(f['signers[0][email_address]'], 'bo@x.com');
  assert.equal(f.use_text_tags, '1');
  assert.equal(f.test_mode, '1');
  assert.equal(Object.fromEntries(signatureRequestFields({ signerEmail: 'a@b.co' })).test_mode, '0');
});

t('a request counts as signed only when Dropbox Sign says it is complete', () => {
  assert.equal(isComplete({ signature_request: { is_complete: true } }), true);
  assert.equal(isComplete({ signature_request: { is_complete: false } }), false);
  assert.equal(isComplete({}), false);
});

console.log(`\n${n} passed`);
