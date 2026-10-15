// lib/gmail-text.js - the plain text of a Gmail message, from the API's "full" payload. Pure; no network.
// Used to READ a reply properly (intent, opt-out wording) instead of guessing from Gmail's ~200 character preview.
// Only what the person wrote themselves should count: callers cut the quoted original with ownWords() (lib/reply-intents.js).

const MAX_CHARS = 20000;

const decode = (data) => {
  try { return Buffer.from(String(data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch { return ''; }
};

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? ' ')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collect(part, plain, html, depth = 0) {
  if (!part || depth > 8) return;
  const mime = String(part.mimeType || '').toLowerCase();
  if (part.body?.data && !part.filename) {
    if (mime === 'text/plain') plain.push(decode(part.body.data));
    else if (mime === 'text/html') html.push(decode(part.body.data));
  }
  for (const p of part.parts || []) collect(p, plain, html, depth + 1);
}

/** Prefer the text/plain part(s); fall back to the text/html turned into text. '' when there is none. Capped. */
export function extractPlainText(payload) {
  const plain = []; const html = [];
  collect(payload, plain, html);
  const text = plain.join('\n').trim() || htmlToText(html.join('\n'));
  return text.slice(0, MAX_CHARS);
}
