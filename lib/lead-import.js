// lib/lead-import.js - turns the rows of ANY scraped list (a Google Maps extension export, a purchased list, a CRM export)
// into finder candidates, so the in-app finder can read the websites, score the leads and fill the Lead Inbox.
// Pure and isomorphic. The browser parses the file; the server runs this again on what it receives (the browser is never trusted).
// Nothing here sends anything.
import { prepareWebsite, socialFromUrl, normaliseEmail, cleanPhone, hostKey } from './lead-finder.js';
import { normalizePhone } from './phone.js';

export const IMPORT_MAX_ROWS = 500; // one import never queues more than this many businesses (the job lives in one small document)

// Column names scrapers use, compared after lower-casing and dropping everything that is not a letter or digit.
const COLS = {
  name: ['businessname', 'name', 'title', 'company', 'companyname', 'business', 'placename', 'storename'],
  website: ['website', 'websiteurl', 'site', 'web', 'domain', 'companywebsite', 'url'],
  email: ['email', 'emails', 'emailaddress', 'mail', 'email1', 'primaryemail'],
  phone: ['whatsappnumber', 'phone', 'phonenumber', 'telephone', 'tel', 'mobile', 'mobilenumber', 'contactnumber', 'phone1', 'internationalphonenumber', 'whatsapp'],
  address: ['address', 'fulladdress', 'formattedaddress', 'streetaddress'],
  category: ['category', 'categories', 'maincategory', 'type', 'businesstype', 'industry'],
  facebook: ['facebook', 'facebookurl', 'facebookpage'],
  instagram: ['instagram', 'instagramurl', 'instagramhandle'],
};
const squash = (k) => String(k ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Which of the file's columns feed which field (first match in the order above wins). Used for the preview and by the mapper. */
export function detectColumns(headers) {
  const byKey = new Map();
  for (const h of headers || []) { const k = squash(h); if (k && !byKey.has(k)) byKey.set(k, h); }
  const out = {};
  for (const [field, names] of Object.entries(COLS)) {
    const hit = names.find((n) => byKey.has(n));
    if (hit) out[field] = byKey.get(hit);
  }
  return out;
}

// Small stable hash (no crypto needed, works in the browser and on the server): two 32-bit FNV-1a passes -> 16 hex characters.
function hash(str) {
  let a = 0x811c9dc5; let b = 0x01000193 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    a ^= str.charCodeAt(i); a = Math.imul(a, 0x01000193);
    b = Math.imul(b ^ str.charCodeAt(i), 0x85ebca6b) + 0x27d4eb2f | 0;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

const MAPS_HOSTS = /(^|\.)(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|g\.page|gstatic\.com)$/i;

function pickWebsite(raw) {
  const url = prepareWebsite(text(raw, 300));
  if (!url) return { website: '', facebook: '', instagram: '' };
  let host = '';
  try { host = hostKey(new URL(url).hostname); } catch { return { website: '', facebook: '', instagram: '' }; }
  if (MAPS_HOSTS.test(host)) return { website: '', facebook: '', instagram: '' }; // a Google Maps link is not the business's website
  const { kind, value } = socialFromUrl(url);
  if (kind === 'facebook') return { website: '', facebook: String(value || url).slice(0, 200), instagram: '' };
  if (kind === 'instagram') return { website: '', facebook: '', instagram: String(value || url).slice(0, 200) };
  if (kind) return { website: '', facebook: '', instagram: '' }; // linkedin / x / youtube pages are not a site we can read for contacts
  return { website: url, facebook: '', instagram: '' };
}

/**
 * @param {object[]} rows rows as objects keyed by the file's own headers
 * @returns {{ candidates: object[], stats: { rows: number, usable: number, noName: number, noContact: number, duplicate: number, tooMany: number }, columns: object }}
 *   A candidate has the same shape the map search produces, so the finder reads its website and scores it exactly the same way.
 */
export function mapImportRows(rows, { max = IMPORT_MAX_ROWS, label = '' } = {}) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
  const headers = [...new Set(list.slice(0, 50).flatMap((r) => Object.keys(r)))];
  const columns = detectColumns(headers);
  const stats = { rows: list.length, usable: 0, noName: 0, noContact: 0, duplicate: 0, tooMany: 0 };
  const candidates = [];
  const seen = new Set();
  const get = (r, field) => (columns[field] === undefined ? '' : r[columns[field]]);
  const tag = text(label, 40);

  for (const r of list) {
    const name = text(get(r, 'name'), 160);
    if (!name) { stats.noName++; continue; }
    const site = pickWebsite(get(r, 'website'));
    const fbOwn = pickWebsite(get(r, 'facebook'));
    const igOwn = pickWebsite(get(r, 'instagram'));
    let email = '';
    for (const part of String(get(r, 'email') ?? '').split(/[;,\s|]+/)) { email = normaliseEmail(part) || ''; if (email) break; }
    const rawPhone = text(get(r, 'phone'), 40);
    const phoneDigits = normalizePhone(rawPhone);
    const phone = phoneDigits || cleanPhone(rawPhone) || '';
    if (!site.website && !email && !phone) { stats.noContact++; continue; }

    const id = `csv:${hash(`${name.toLowerCase()}|${String(phone).replace(/\D/g, '')}|${site.website ? hostKey(new URL(site.website).hostname) : ''}|${email}`)}`;
    const dupKey = email ? `e:${email}` : phone ? `p:${String(phone).replace(/\D/g, '')}` : id;
    if (seen.has(id) || seen.has(dupKey)) { stats.duplicate++; continue; }
    if (candidates.length >= max) { stats.tooMany++; continue; }
    seen.add(id); seen.add(dupKey);
    candidates.push({
      place_id: id, business_name: name, category: text(get(r, 'category'), 100), address: text(get(r, 'address'), 300),
      whatsapp_number: phone, website: site.website, email,
      facebook: site.facebook || fbOwn.facebook, instagram: site.instagram || igOwn.instagram, search_query: tag || 'my list',
    });
  }
  stats.usable = candidates.length;
  return { candidates, stats, columns };
}

/** A short label for the job from a file name: "plumbers-colombo.csv" -> "plumbers colombo". */
export function importLabel(fileName) {
  const base = String(fileName || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[-_]+/g, ' ').replace(/[^\p{L}\p{N} ,&']+/gu, ' ').replace(/\s+/g, ' ').trim();
  return (base || 'my list').slice(0, 40);
}
