// lib/reply-text.js - turn a raw email body into "what the person actually wrote" (pure, no network, testable).
// Used when a reply is read in full (check-replies, the nightly reply watch, get-thread). Never throws on odd input.
import { QUOTE_CUT_RE } from './reply-intents.js';

export const REPLY_TEXT_MAX = 4000; // stored per reply: plenty to read and to answer, small enough never to matter

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', copy: '(c)' };

export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** HTML email -> readable text. Drops scripts/styles and quoted history; keeps paragraph and line breaks. */
export function htmlToText(html) {
  let t = String(html || '');
  t = t.replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '');
  t = t.replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi, '\n');         // quoted history
  t = t.replace(/<div\b[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*$/i, ''); // Gmail's quote block runs to the end of the message
  t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6]|table)>/gi, '\n').replace(/<li\b[^>]*>/gi, '- ');
  t = t.replace(/<[^>]+>/g, '');
  return decodeEntities(t);
}

/**
 * The reply's own words: line endings normalised, control characters removed, everything from the first quote marker
 * ("On ... wrote:", "-----Original Message-----", "> quoted lines") removed, capped at `max`.
 * A message that is nothing but a quote/forward keeps its text rather than becoming empty.
 */
export function cleanReplyText(raw, max = REPLY_TEXT_MAX) {
  const original = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  let t = original.slice(0, max * 4);
  const m = QUOTE_CUT_RE.exec(t);
  if (m) t = t.slice(0, m.index);
  const lines = t.split('\n');
  const q = lines.findIndex((l) => /^\s*>/.test(l));
  if (q >= 0) t = lines.slice(0, q).join('\n');
  const tidy = (x) => x.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const out = tidy(t);
  return (out || tidy(original)).slice(0, max);
}
