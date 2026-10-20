// lib/lead-name.js - a business name that is really a phone number is never a name.
//
// Scraped lists and map data sometimes put the phone number in the name column (or the name is missing and a number sits there
// instead). That number then showed up as the business in the CRM, in "Hi 0771234567," greetings and on invoices. This module spots
// those values and, where it honestly can, derives a readable name from the lead's own website or business e-mail domain
// ("acme-plumbing.lk" -> "Acme Plumbing"). When there is nothing to derive from it returns '' and the caller decides (skip, or show
// "Unnamed business"): it never invents a name. Pure, no I/O.

const PHONE_PREFIX = /^(?:whatsapp|wa|tel|telephone|phone|mobile|mob|cell|call|contact)\s*(?:no\.?|number|#)?\s*[:\-]?\s*/i;

/** True for "0771234567", "+94 77 123 4567", "(011) 234-5678", "whatsapp:+94771234567". False for "7 Eleven", "24/7 Plumbing", "Acme 2000". */
export function looksLikePhone(value) {
  let t = String(value ?? '').trim();
  if (!t) return false;
  t = t.replace(PHONE_PREFIX, '').replace(/\s*(?:ext\.?|x)\s*\d{1,6}$/i, '');
  if (!/^\+?[\d\s().\-/]+$/.test(t)) return false; // any letter makes it a name
  const digits = t.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com',
  'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com', 'rediffmail.com',
]);
// Hosts that say nothing about the business itself (social pages, link-in-bio, chat links, site builders).
const GENERIC_HOSTS = ['facebook.com', 'fb.com', 'instagram.com', 'linktr.ee', 'wa.me', 'whatsapp.com', 'tiktok.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'wixsite.com', 'wordpress.com', 'blogspot.com', 'business.site', 'google.com', 'goo.gl'];
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ltd', 'plc']);

const titleCase = (s) => s.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());

/** "https://www.acme-plumbing.co.uk/contact" -> "Acme Plumbing"; social / free-mail / builder hosts -> ''. */
export function nameFromHost(hostOrUrl) {
  let host = String(hostOrUrl || '').trim().toLowerCase();
  if (!host) return '';
  try { host = new URL(/^[a-z]+:\/\//.test(host) ? host : `http://${host}`).hostname; } catch { return ''; }
  host = host.replace(/^www\./, '');
  if (FREE_MAIL.has(host) || GENERIC_HOSTS.some((g) => host === g || host.endsWith(`.${g}`))) return '';
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return '';
  let i = labels.length - 2; // the label before the TLD
  if (labels.length >= 3 && SECOND_LEVEL.has(labels[i])) i -= 1; // acme.co.uk -> acme
  const label = labels[i] || '';
  if (label.length < 3 || /^\d+$/.test(label)) return '';
  return titleCase(label);
}

/**
 * The name to use for a lead. Keeps a real name as it is. A PHONE NUMBER in the name field is replaced by a name derived from the
 * website, then the business e-mail's domain. A blank name stays blank (the caller already decides what a nameless row means).
 * @param {string} name
 * @param {{ website?: string, email?: string }} [hints]
 * @returns {string} '' when there is nothing honest to show
 */
export function cleanBusinessName(name, { website = '', email = '' } = {}) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!n) return '';
  if (!looksLikePhone(n)) return n;
  return deriveName({ website, email });
}

function deriveName({ website = '', email = '' } = {}) {
  const fromSite = nameFromHost(website);
  if (fromSite) return fromSite;
  const at = String(email || '').lastIndexOf('@');
  return at > 0 ? nameFromHost(String(email).slice(at + 1)) : '';
}

/**
 * First real name among several candidates (phone numbers are skipped).
 * If a candidate was a phone number, or deriveBlank is true (screens), the website / e-mail domain is used when no real name exists.
 * Ingest code passes deriveBlank:false so a genuinely nameless record is still treated as nameless.
 */
export function pickBusinessName(candidates, hints = {}, { deriveBlank = true } = {}) {
  let sawPhone = false;
  for (const c of candidates || []) {
    const n = String(c ?? '').replace(/\s+/g, ' ').trim();
    if (!n) continue;
    if (looksLikePhone(n)) { sawPhone = true; continue; }
    return n;
  }
  return sawPhone || deriveBlank ? deriveName(hints) : '';
}

/** What the screens print: the name, or a plain "Unnamed business" (never the raw number). */
export const NO_NAME_LABEL = 'Unnamed business';
export const businessLabel = (name, hints) => cleanBusinessName(name, hints) || NO_NAME_LABEL;
