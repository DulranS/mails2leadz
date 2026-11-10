// lib/pdf-text.js - a plain text PDF (A4, Helvetica) with a correct cross-reference table. Pure: no libraries. Non-ASCII characters become "?".
const LINES_PER_PAGE = 50;
const WRAP = 88;

const ascii = (s) => String(s).replace(/[^\x20-\x7e\n]/g, '?');
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export function wrapLines(text) {
  const out = [];
  for (const para of ascii(text).replace(/\r\n/g, '\n').split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      if ((line + ' ' + word).trim().length > WRAP) { out.push(line.trim()); line = word; }
      else line = (line + ' ' + word).trim();
    }
    if (line) out.push(line);
  }
  return out;
}

export function textToPdf(text) {
  const lines = wrapLines(text);
  const pages = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) pages.push(lines.slice(i, i + LINES_PER_PAGE));
  if (!pages.length) pages.push(['']);
  const objs = {};
  const kids = [];
  let next = 4;
  for (const page of pages) {
    const pageId = next++, contentId = next++;
    kids.push(`${pageId} 0 R`);
    const stream = `BT /F1 11 Tf 14 TL 50 792 Td ${page.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objs[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < next; i++) {
    offsets[i] = Buffer.byteLength(out, 'latin1');
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let i = 1; i < next; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
