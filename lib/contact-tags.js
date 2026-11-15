// lib/contact-tags.js - the tags an owner puts on a lead or contact, so they can be used in segments (spec 2.4). Pure.
// Tags are lowercase words, letters and numbers from any language, spaces, dashes and underscores. Max 20 per contact, 30 characters each.
export const TAG_MAX = 20;
export const TAG_LEN = 30;

/** Turns a list, or a comma-separated text box, into a clean, unique, capped list of tags. */
export function sanitizeTags(input) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(',');
  const out = [];
  for (const r of raw) {
    const t = String(r ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, TAG_LEN)
      .trim();
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= TAG_MAX) break;
  }
  return out;
}
