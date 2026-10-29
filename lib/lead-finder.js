// lib/lead-finder.js - the lead finder's brain, in pure JavaScript (no network, no database): find businesses on OpenStreetMap,
// read their websites for a contact, score them, and decide which ones are worth putting in the Lead Inbox.
//
// It is the in-app port of the core of worker/autoleads_worker.py (same category table, same extraction rules, same score), so
// the app can do the whole job by itself on the free hosting plan. The Python worker stays as an optional power tool for big,
// slow runs on your own computer. Nothing here sends anything: leads only land in the Lead Inbox, status "new".
import { CATEGORIES } from './lead-finder-categories.js';
import { findDecisionMakers, estimateCompanySize, plainTextFromHtml } from './enrich-extract.js';
import { pickBusinessName } from './lead-name.js';

export const OSM_ATTRIBUTION = '(c) OpenStreetMap contributors (ODbL)';
export const HOT_SCORE = 70;
export const WARM_SCORE = 40;
export const MAX_SAVED_SEARCHES = 5;
export const MAX_CANDIDATES = 300; // one search never queues more than this many businesses

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- what to search for
const singular = (w) => {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
};
export const normaliseTerm = (text) => String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]|_/gu, ' ').split(/\s+/).filter(Boolean).map(singular).join(' ');

/** "plumbers in Colombo, Sri Lanka" -> { term: "plumbers", place: "Colombo, Sri Lanka" } */
export function splitAreaFromQuery(query) {
  const q = clean(query);
  const m = q.match(/^(.*?)\s+in\s+(.+)$/i);
  return m && m[1].trim() ? { term: m[1].trim(), place: m[2].trim() } : { term: q, place: '' };
}

/** OpenStreetMap tags and name stems for a free-text business type. An unknown type falls back to a name match. */
export function categoryFilters(term) {
  const norm = normaliseTerm(term);
  const padded = ` ${norm} `;
  const tags = [];
  const stems = [];
  for (const [words, entryTags, entryStems] of CATEGORIES) {
    if (words.some((w) => padded.includes(` ${normaliseTerm(w)} `))) {
      for (const t of entryTags) if (!tags.includes(t)) tags.push(t);
      for (const s of entryStems) if (!stems.includes(s)) stems.push(s);
    }
  }
  if (!tags.length && norm.length >= 3) stems.push(norm);
  // Only letters, digits, spaces and underscores ever reach the query text: nothing a user types can alter the query itself.
  return { tags, stems: stems.filter((s) => s.length >= 3 && /^[\p{L}\p{N}_ ]+$/u.test(s)) };
}

const tagFilter = (tag) => {
  const i = tag.indexOf('=');
  const key = tag.slice(0, i);
  const value = tag.slice(i + 1);
  return value.includes('|') ? `["${key}"~"^(${value})$"]` : `["${key}"="${value}"]`;
};

const BUSINESS_KEYS = ['shop', 'craft', 'office', 'amenity', 'healthcare', 'tourism', 'leisure', 'industrial'];
export function overpassQuery(tags, stems, rect, limit = 300, timeout = 25) {
  const bbox = `(${rect.south.toFixed(6)},${rect.west.toFixed(6)},${rect.north.toFixed(6)},${rect.east.toFixed(6)})`;
  // Name searches: the cheap "has this key" filter goes FIRST so the server narrows by its index before it runs the text match. (The old form
  // matched a regex over every key of every object in the area, which is what made the free servers time out on city-sized searches.)
  const parts = [...tags.map((t) => `nwr${tagFilter(t)}["name"]${bbox};`), ...stems.flatMap((s) => BUSINESS_KEYS.map((k) => `nwr["${k}"]["name"~"${s}",i]${bbox};`))];
  if (!parts.length) throw new Error('Nothing to search for: the search text is empty.');
  return `[out:json][timeout:${Math.floor(timeout)}];\n(\n  ${parts.join('\n  ')}\n);\nout tags center ${Math.floor(limit)};`;
}

export const rectFromNominatim = (box) => {
  const [south, north, west, east] = (box || []).map(Number);
  if (![south, north, west, east].every(Number.isFinite) || !(south < north) || !(west < east)) return null;
  return { south, west, north, east };
};
export const splitRect = (r) => {
  const mLat = (r.south + r.north) / 2;
  const mLng = (r.west + r.east) / 2;
  return [
    { south: r.south, west: r.west, north: mLat, east: mLng }, { south: r.south, west: mLng, north: mLat, east: r.east },
    { south: mLat, west: r.west, north: r.north, east: mLng }, { south: mLat, west: mLng, north: r.north, east: r.east },
  ];
};
/**
 * A big area as a grid of small tiles, the middle first (that is where most businesses are). Small tiles are quick and cheap for the free map
 * servers, so a slow or busy server costs one tile, not the whole search. About 6 km a side, at most 4 x 4.
 */
export function tileRect(r, { target = 0.06, maxPerSide = 4 } = {}) {
  const nLat = Math.min(maxPerSide, Math.max(1, Math.ceil((r.north - r.south) / target)));
  const nLng = Math.min(maxPerSide, Math.max(1, Math.ceil((r.east - r.west) / target)));
  const dLat = (r.north - r.south) / nLat;
  const dLng = (r.east - r.west) / nLng;
  const tiles = [];
  for (let i = 0; i < nLat; i++) for (let j = 0; j < nLng; j++) tiles.push({ south: r.south + i * dLat, north: r.south + (i + 1) * dLat, west: r.west + j * dLng, east: r.west + (j + 1) * dLng });
  const cLat = (r.south + r.north) / 2;
  const cLng = (r.west + r.east) / 2;
  const dist = (t) => ((t.south + t.north) / 2 - cLat) ** 2 + ((t.west + t.east) / 2 - cLng) ** 2;
  return tiles.sort((a, b) => dist(a) - dist(b));
}
export const rectIsSmall = (r) => (r.north - r.south) < 0.003 || (r.east - r.west) < 0.003; // about 300 m

// ---------------------------------------------------------------- phones and emails
export function cleanPhone(raw) {
  const value = String(raw ?? '').replace(/\u00a0/g, ' ').trim();
  const digits = value.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15 || new Set(digits).size <= 2 || /^[01]+$/.test(digits)) return null;
  if (value.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00') && digits.length > 10) return `+${digits.slice(2)}`;
  return digits;
}
export const phoneKey = (p) => String(p || '').replace(/\D/g, '');

const PHONE_RE = /(?<!\d)(\+?\(?\d[\d\s().-]{6,22}\d)(?!\d)/g;
const PHONE_CONTEXT_RE = /(?:tel|telephone|phone|call|mobile|cell|whatsapp|hotline|contact|reach us|text us|ph\b)/i;
const DATE_LIKE_RE = /^(?:\d{4}[-./ ]\d{1,2}[-./ ]\d{1,2}|\d{1,2}[-./ ]\d{1,2}[-./ ]\d{2,4})$/;
const YEAR_RUN_RE = /^(?:(?:19|20)\d{2}[\s\-/]*){2,}$/;

/** Phones in visible text. A bare digit group needs a leading + or ( or a phone word just before it, so dates and IDs are not numbers. */
export function extractPhonesFromText(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(PHONE_RE)) {
    const raw = m[1].trim();
    if (DATE_LIKE_RE.test(raw) || YEAR_RUN_RE.test(raw)) continue;
    const before = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
    if (before.slice(-14).includes('fax')) continue;
    if (!(raw.startsWith('+') || raw.startsWith('(') || PHONE_CONTEXT_RE.test(before))) continue;
    const p = cleanPhone(raw);
    if (p) out.add(p);
  }
  return out;
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/gi;
const EMAIL_FULL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}$/i;
// A plain dot must touch both labels (so "...acme [dot] lk. Next sentence" does not swallow the next word); [dot] may have spaces around it.
const OBFUSCATED_EMAIL_RE = /\b([A-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\{at\})\s*((?:[A-Z0-9-]+(?:\.|\s*(?:\[dot\]|\(dot\)|\{dot\})\s*))+[A-Z]{2,63})\b/gi;
const BAD_EMAIL_TLDS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'css', 'js', 'json', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'ico', 'pdf', 'php', 'html', 'htm', 'xml', 'mp4', 'mp3', 'map', 'zip']);
const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com', 'rediffmail.com']);
const VENDOR_DOMAINS = ['sentry.io', 'wixpress.com', 'wix.com', 'wordpress.com', 'wordpress.org', 'squarespace.com', 'shopify.com', 'godaddy.com', 'cloudflare.com', 'google.com', 'gstatic.com', 'w3.org', 'schema.org', 'domain.com', 'email.com', 'yourdomain.com', 'yoursite.com', 'mysite.com', 'website.com', 'company.com', 'example.com', 'example.org', 'example.net'];
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go']);
const EMAIL_HIGH = ['contact', 'info', 'hello', 'hi', 'sales', 'inquiries', 'enquiries', 'business'];
const EMAIL_MID = ['support', 'help', 'service', 'admin', 'office'];
const EMAIL_LOW = ['noreply', 'no-reply', 'donotreply', 'mailer-daemon', 'notifications', 'newsletter'];

export function normaliseEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase().replace(/^[<>[\](){}.,;:]+|[<>[\](){}.,;:]+$/g, '');
  if (!EMAIL_FULL_RE.test(email)) return null;
  const at = email.indexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || local.length > 64 || email.includes('..') || local.startsWith('.') || local.endsWith('.')) return null;
  if (BAD_EMAIL_TLDS.has(domain.split('.').pop())) return null;
  if (/^[0-9a-f]{24,}$/.test(local) || ['youremail', 'your-email', 'test@', 'dummy@', 'fake@'].some((t) => email.includes(t))) return null;
  return email;
}

export function extractEmails(text) {
  const found = new Set();
  for (const m of String(text || '').matchAll(EMAIL_RE)) { const e = normaliseEmail(m[0]); if (e) found.add(e); }
  for (const m of String(text || '').matchAll(OBFUSCATED_EMAIL_RE)) {
    const domain = m[2].replace(/\s*(?:\[dot\]|\(dot\)|\{dot\})\s*/gi, '.').replace(/\s+/g, '');
    const e = normaliseEmail(`${m[1]}@${domain}`);
    if (e) found.add(e);
  }
  return found;
}

/** Cloudflare "email protection": the address is XOR-encoded with its first byte. */
export function decodeCfEmail(hex) {
  try {
    const key = parseInt(hex.slice(0, 2), 16);
    if (!Number.isFinite(key)) return null;
    let out = '';
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out;
  } catch { return null; }
}

const coreLabel = (host) => {
  const parts = host.toLowerCase().split('.');
  if (parts.length >= 3 && parts[parts.length - 1].length === 2 && SECOND_LEVEL.has(parts[parts.length - 2])) return parts[parts.length - 3];
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
};
const onSiteDomain = (domain, hosts) => [...hosts].some((h) => domain === h || domain.endsWith(`.${h}`));
const relatedDomain = (domain, hosts) => { const c = coreLabel(domain); return c.length >= 4 && [...hosts].some((h) => coreLabel(h) === c); };

/** Own domain, a related domain (acme.com / acme.co.uk) or a free mailbox. Anything else is nearly always a web agency or a template leftover. */
export function emailAcceptable(email, hosts) {
  const domain = email.slice(email.lastIndexOf('@') + 1);
  if (VENDOR_DOMAINS.some((v) => domain === v || domain.endsWith(`.${v}`))) return false;
  return onSiteDomain(domain, hosts) || relatedDomain(domain, hosts) || FREEMAIL.has(domain);
}

export function emailScore(email) {
  const local = email.split('@')[0].toLowerCase();
  if (EMAIL_LOW.some((k) => local.includes(k))) return 1;
  if (EMAIL_HIGH.some((k) => k === local || local.startsWith(`${k}.`) || local.startsWith(`${k}-`))) return 10;
  if (EMAIL_MID.some((k) => local.includes(k))) return 6;
  return local.includes('.') || local.length > 3 ? 8 : 4;
}

export function choosePrimaryEmail(emails, hosts = []) {
  const rank = (e) => {
    const d = e.slice(e.lastIndexOf('@') + 1);
    const bonus = onSiteDomain(d, hosts) || relatedDomain(d, hosts) ? 3 : 0;
    return [-(emailScore(e) + bonus), e.length, e];
  };
  const sorted = [...new Set(emails)].sort((a, b) => { const x = rank(a); const y = rank(b); return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); });
  return sorted[0] || '';
}

export function choosePrimaryPhone(phones, whatsapp = []) {
  const wa = new Set([...whatsapp].map(phoneKey));
  const sorted = [...new Set(phones)].sort((a, b) => {
    const ka = [wa.has(phoneKey(a)) ? 0 : 1, a.startsWith('+') ? 0 : 1, -phoneKey(a).length];
    const kb = [wa.has(phoneKey(b)) ? 0 : 1, b.startsWith('+') ? 0 : 1, -phoneKey(b).length];
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || (a < b ? -1 : a > b ? 1 : 0);
  });
  return sorted[0] || '';
}

// ---------------------------------------------------------------- URLs
const SKIP_EXT = ['.pdf', '.zip', '.rar', '.7z', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.mp4', '.mp3', '.wav', '.mov', '.avi', '.css', '.js', '.mjs', '.map', '.woff', '.woff2', '.ttf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.xml', '.json'];
const SKIP_SEG = new Set(['wp-admin', 'wp-login.php', 'wp-json', 'cdn-cgi', 'login', 'signin', 'sign-in', 'signup', 'sign-up', 'register', 'account', 'my-account', 'cart', 'checkout', 'basket', 'logout', 'search', 'tag', 'tags', 'author', 'feed', 'rss']);
const PRIORITY = [[['contact'], 0], [['get', 'in', 'touch'], 0], [['reach', 'us'], 0], [['about'], 1], [['team'], 1], [['leadership'], 1], [['management'], 1], [['founder'], 1], [['director'], 1], [['staff'], 1], [['people'], 1], [['who', 'we', 'are'], 1], [['company'], 2], [['service'], 2], [['product'], 2], [['solution'], 2], [['career'], 3], [['location'], 3], [['office'], 3], [['blog'], 5], [['news'], 5], [['privacy'], 8]];
const CONTACT_PHRASES = [['contact'], ['get', 'in', 'touch'], ['reach', 'us']];
const TRACKING = new Set(['fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid', 'ref', 'ref_src']);

export const hostKey = (host) => { const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, ''); return h.startsWith('www.') ? h.slice(4) : h; };
const tokens = (path) => path.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const hasPhrase = (toks, phrase) => { for (let i = 0; i + phrase.length <= toks.length; i++) if (phrase.every((w, j) => toks[i + j] === w || toks[i + j] === `${w}s`)) return true; return false; };
export const isContactPath = (path) => { const t = tokens(path); return CONTACT_PHRASES.some((p) => hasPhrase(t, p)); };
const pathPriority = (path, depth) => {
  if (path.replace(/^\/+|\/+$/g, '') === '') return 0;
  const t = tokens(path);
  let best = 20 + depth * 8;
  for (const [phrase, bonus] of PRIORITY) if (hasPhrase(t, phrase)) best = Math.min(best, 2 + bonus + depth * 2);
  return best;
};
const shouldSkip = (u) => {
  const path = u.pathname.toLowerCase();
  return SKIP_EXT.some((e) => path.endsWith(e)) || path.split('/').some((s) => s && SKIP_SEG.has(s)) || ['s', 'replytocom', 'share', 'print'].some((k) => u.searchParams.has(k));
};

/** A clean absolute http(s) URL, or null. Strips tracking, fragments, credentials; rejects Google Maps links. */
export function normaliseUrl(url, base = '') {
  const raw = String(url ?? '').trim().replace(/^["'<>]+|["'<>]+$/g, '');
  if (!raw || /^(javascript:|mailto:|tel:|sms:|data:)/i.test(raw)) return null;
  let u;
  try { u = new URL(raw, base || undefined); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/\.+$/, '');
  if (!host || host.length < 3 || u.username || u.password) return null;
  if (['maps.google.com', 'goo.gl', 'g.page', 'maps.app.goo.gl'].includes(host) || (['google.com', 'www.google.com'].includes(host) && u.pathname.toLowerCase().startsWith('/maps'))) return null;
  u.hash = '';
  u.pathname = u.pathname.replace(/\/{2,}/g, '/').replace(/\/index\.(?:html?|php|aspx?)$/i, '/');
  if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  for (const k of [...u.searchParams.keys()]) if (k.toLowerCase().startsWith('utm_') || TRACKING.has(k.toLowerCase())) u.searchParams.delete(k);
  u.searchParams.sort();
  const out = u.toString();
  return out.length <= 2000 ? out : null;
}

/** Whatever is in a website tag, turned into a crawlable URL, or null. */
export function prepareWebsite(raw) {
  let value = clean(raw);
  if (!value || ['n/a', 'na', 'none', 'null', '-', 'no website', 'nil'].includes(value.toLowerCase())) return null;
  value = value.split(/[\s;|]+/)[0].replace(/^,+|,+$/g, '');
  if (value.includes('@') && !value.includes('/')) return null;
  if (value.startsWith('//')) value = `https:${value}`;
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  const url = normaliseUrl(value);
  if (!url) return null;
  return new URL(url).hostname.includes('.') ? url : null;
}

// ---------------------------------------------------------------- social links
const SOCIAL_HOSTS = { 'instagram.com': 'instagram', 'twitter.com': 'twitter', 'x.com': 'twitter', 'linkedin.com': 'linkedin', 'facebook.com': 'facebook', 'fb.com': 'facebook', 'youtube.com': 'youtube' };
const FB_SKIP = new Set(['sharer', 'sharer.php', 'share', 'share.php', 'dialog', 'plugins', 'tr', 'login', 'login.php', 'policies', 'help', 'privacy', 'legal', 'about', 'ads', 'business', 'watch', 'groups', 'events', 'marketplace', 'gaming', 'hashtag', 'l.php', 'photo', 'photos', 'permalink.php', 'story.php', 'reel', 'reels', 'stories', 'public', 'ajax', 'pages', 'profile.php', 'people', 'p']);
const IG_SKIP = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'about', 'directory', 'developer', 'legal', 'privacy', 'web', 'direct', 'share', 'tags', 'locations', 'create']);
const TW_SKIP = new Set(['share', 'intent', 'search', 'home', 'i', 'hashtag', 'explore', 'settings', 'login', 'signup', 'tos', 'privacy', 'about', 'download', 'compose', 'messages', 'notifications', 'widgets.js', 'oauth', 'lists', 'topics']);
export const emptySocials = () => ({ instagram: '', twitter: '', linkedin_company: '', facebook: '', youtube: '' });

/** { kind, value } for a link to a business profile on a social network, or { kind: '' }. Personal LinkedIn profiles are deliberately ignored. */
export function socialFromUrl(url) {
  try {
    const u = new URL(url);
    const host = hostKey(u.hostname);
    const platform = Object.entries(SOCIAL_HOSTS).find(([d]) => host === d || host.endsWith(`.${d}`))?.[1];
    const parts = u.pathname.split('/').filter(Boolean);
    if (!platform || !parts.length) return { kind: '', value: '' };
    const first = parts[0].replace(/^@/, '');
    if (platform === 'instagram') { const n = first.toLowerCase(); if (!IG_SKIP.has(n) && /^[a-z0-9._]{2,30}$/.test(n)) return { kind: 'instagram', value: `https://www.instagram.com/${n}/` }; }
    else if (platform === 'twitter') { const n = first.toLowerCase(); if (!TW_SKIP.has(n) && /^[a-z0-9_]{1,15}$/.test(n)) return { kind: 'twitter', value: `https://x.com/${n}/` }; }
    else if (platform === 'linkedin') { if (parts.length >= 2 && parts[0].toLowerCase() === 'company' && /^[\w%.-]{1,100}$/.test(parts[1])) return { kind: 'linkedin_company', value: `https://www.linkedin.com/company/${parts[1]}/` }; }
    else if (platform === 'facebook') {
      const low = parts[0].toLowerCase();
      if (low === 'pages' && parts.length >= 3) return { kind: 'facebook', value: `https://www.facebook.com/pages/${parts[1]}/${parts[2]}` };
      if (low === 'profile.php') { const id = u.searchParams.get('id') || ''; if (/^\d+$/.test(id)) return { kind: 'facebook', value: `https://www.facebook.com/profile.php?id=${id}` }; }
      else if (!FB_SKIP.has(low) && /^[\w.%-]{1,100}$/.test(parts[0])) return { kind: 'facebook', value: `https://www.facebook.com/${parts[0]}/` };
    } else if (platform === 'youtube') {
      if (parts[0].startsWith('@')) return { kind: 'youtube', value: `https://www.youtube.com/${parts[0]}/` };
      if (['channel', 'user', 'c'].includes(parts[0].toLowerCase()) && parts.length >= 2) return { kind: 'youtube', value: `https://www.youtube.com/${parts[0]}/${parts[1]}` };
    }
  } catch { /* not a URL */ }
  return { kind: '', value: '' };
}
const SOCIAL_WEIGHTS = { linkedin_company: 2, instagram: 1, facebook: 1, youtube: 1, twitter: 1 };
export const socialScore = (s) => Object.entries(s).reduce((n, [k, v]) => n + (v ? (SOCIAL_WEIGHTS[k] || 0) : 0), 0);

// ---------------------------------------------------------------- reading one web page
const TECH = { shopify: ['cdn.shopify.com', 'myshopify.com'], woocommerce: ['woocommerce', 'wc-add-to-cart'], wordpress: ['wp-content', 'wp-includes'], wix: ['static.wixstatic.com', 'wixsite.com'], squarespace: ['static1.squarespace.com', 'squarespace-cdn.com'], webflow: ['data-wf-site', 'assets.website-files.com'], hubspot: ['hs-scripts.com', 'hsforms.net'], mailchimp: ['chimpstatic.com', 'list-manage.com'], calendly: ['calendly.com'], 'tawk.to': ['embed.tawk.to'], 'google-analytics': ['google-analytics.com', 'gtag/js'], 'meta-pixel': ['connect.facebook.net', 'fbevents.js'], 'contact-form-7': ['contact-form-7', 'wpcf7'] };
export const detectTech = (htmlLower) => Object.entries(TECH).filter(([, needles]) => needles.some((n) => htmlLower.includes(n))).map(([k]) => k);

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&#64;': '@', '&commat;': '@', '&#46;': '.', '&period;': '.' };
const decodeEntities = (s) => s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|commat|period|#39|#64|#46);/g, (m) => ENTITIES[m] || m).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
const MAX_TEXT_CHARS = 200000;

function walkJsonLd(node, out, depth = 0) {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) { for (const n of node.slice(0, 50)) walkJsonLd(n, out, depth + 1); return; }
  if (typeof node !== 'object') return;
  for (const key of ['email', 'telephone']) {
    const v = node[key];
    for (const x of (Array.isArray(v) ? v : [v])) if (typeof x === 'string') (key === 'email' ? out.emails : out.phones).push(x.replace(/^mailto:/i, ''));
  }
  const same = node.sameAs;
  for (const x of (Array.isArray(same) ? same : [same])) if (typeof x === 'string') out.links.push(x);
  for (const v of Object.values(node)) if (v && typeof v === 'object') walkJsonLd(v, out, depth + 1);
}

/**
 * Everything useful on one page: emails (only ones that plausibly belong to the business), phones, WhatsApp numbers, social links,
 * links to other pages of the same site (contact and about pages first), whether this is a contact page, and the tech it runs on.
 */
export function parsePage(html, pageUrl, hosts, depth = 0) {
  const page = { url: pageUrl, emails: new Set(), phones: new Set(), whatsapp: new Set(), socials: emptySocials(), links: [], isContact: false, tech: [] };
  const src = String(html || '').slice(0, 1500000);
  const base = new URL(pageUrl);
  const siteHosts = new Set([...hosts, hostKey(base.hostname)]);
  page.tech = detectTech(src.toLowerCase());
  const addEmail = (raw) => { const e = normaliseEmail(raw); if (e && emailAcceptable(e, siteHosts)) page.emails.add(e); };
  const addSocial = (url) => { const { kind, value } = socialFromUrl(url); if (kind && !page.socials[kind]) page.socials[kind] = value; return !!kind; };

  const ld = { emails: [], phones: [], links: [] };
  for (const m of src.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walkJsonLd(JSON.parse(m[1].trim()), ld); } catch { /* bad JSON-LD: ignore */ }
  }
  ld.emails.forEach(addEmail);
  for (const p of ld.phones) { const c = cleanPhone(p); if (c) page.phones.add(c); }
  ld.links.forEach(addSocial);

  for (const m of src.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) addEmail(decodeCfEmail(m[1]) || '');

  const seen = new Set();
  for (const m of src.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const href = decodeEntities((m[1] ?? m[2] ?? m[3] ?? '').trim());
    if (!href) continue;
    const hl = href.toLowerCase();
    if (hl.startsWith('mailto:')) { let rest = href.slice(7).split('?')[0]; try { rest = decodeURIComponent(rest); } catch { /* keep raw */ } rest.split(/[,;]/).forEach(addEmail); continue; }
    if (hl.startsWith('tel:')) { let v = href.slice(4); try { v = decodeURIComponent(v); } catch { /* keep raw */ } const p = cleanPhone(v); if (p) page.phones.add(p); continue; }
    if (hl.includes('/cdn-cgi/l/email-protection#')) { addEmail(decodeCfEmail(href.split('#')[1] || '') || ''); continue; }
    if (hl.includes('wa.me/') || hl.includes('whatsapp.com/send')) {
      const w = hl.match(/(?:wa\.me\/|phone=)\+?(\d{8,15})/);
      const p = w ? cleanPhone(`+${w[1]}`) : null;
      if (p) { page.phones.add(p); page.whatsapp.add(p); }
      continue;
    }
    const absolute = normaliseUrl(href, pageUrl);
    if (!absolute) continue;
    if (addSocial(absolute)) continue;
    let u;
    try { u = new URL(absolute); } catch { continue; }
    const h = hostKey(u.hostname);
    if (![...siteHosts].some((s) => h === s || h.endsWith(`.${s}`)) || shouldSkip(u) || seen.has(absolute)) continue;
    seen.add(absolute);
    let pr = pathPriority(u.pathname, depth + 1);
    if (isContactPath(u.pathname)) pr -= 4;
    page.links.push([absolute, pr]);
  }
  page.links.sort((a, b) => a[1] - b[1] || new URL(a[0]).pathname.length - new URL(b[0]).pathname.length);
  page.links = page.links.slice(0, 80);

  const title = (src.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const h1 = (src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, ' ');
  const hasForm = /<form[\s\S]*?<textarea/i.test(src);
  page.isContact = isContactPath(base.pathname) || (/contact/i.test(`${title} ${h1}`) && hasForm);

  const text = decodeEntities(src
    .replace(/<(script|style|noscript|svg|iframe|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').slice(0, MAX_TEXT_CHARS);
  extractEmails(text).forEach(addEmail);
  for (const p of extractPhonesFromText(text)) page.phones.add(p);
  // People and company size from the page's visible text: public business information only.
  const plain = plainTextFromHtml(src);
  page.people = findDecisionMakers(plain);
  page.size = estimateCompanySize(plain.toLowerCase());
  return page;
}

// ---------------------------------------------------------------- OSM element -> candidate
const PHONE_KEYS = ['phone', 'contact:phone', 'mobile', 'contact:mobile', 'contact:whatsapp', 'whatsapp'];
const WEBSITE_KEYS = ['website', 'contact:website', 'url', 'contact:url'];
const EMAIL_KEYS = ['email', 'contact:email'];
const CATEGORY_KEYS = ['amenity', 'shop', 'craft', 'office', 'healthcare', 'tourism', 'leisure', 'industrial'];
const firstTag = (tags, keys) => { for (const k of keys) { const v = clean(tags[k]); if (v) return v; } return ''; };
const firstPhone = (tags) => { for (const k of PHONE_KEYS) for (const part of clean(tags[k]).split(/[;,/]/)) { const p = cleanPhone(part); if (p) return p; } return ''; };
const addressOf = (tags) => {
  const full = clean(tags['addr:full']);
  if (full) return full;
  const street = [clean(tags['addr:housenumber']), clean(tags['addr:street'])].filter(Boolean).join(' ');
  return [street, clean(tags['addr:suburb']) || clean(tags['addr:neighbourhood']), clean(tags['addr:city']) || clean(tags['addr:town']) || clean(tags['addr:village']), clean(tags['addr:postcode'])].filter(Boolean).join(', ');
};
const categoryOf = (tags) => {
  for (const k of CATEGORY_KEYS) {
    const v = clean(tags[k]);
    if (v && v !== 'yes' && v !== 'no') return v.split(';')[0].replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return '';
};

/** One OpenStreetMap element -> a compact candidate, or { skip: reason }. Facebook/Instagram links in the website tag become social links, not sites to crawl. */
export function candidateFromElement(el, query = '') {
  const kind = el?.type;
  const oid = el?.id;
  if (!['node', 'way', 'relation'].includes(kind) || oid == null) return { skip: 'invalid' };
  const tags = el.tags || {};
  const nameCandidates = ['name', 'name:en', 'brand', 'operator'].map((k) => clean(tags[k]));
  const socials = { facebook: firstTag(tags, ['contact:facebook', 'facebook']), instagram: firstTag(tags, ['contact:instagram', 'instagram']) };
  let website = '';
  for (const k of WEBSITE_KEYS) {
    const raw = clean(tags[k]);
    const url = raw ? prepareWebsite(raw) : null;
    if (!url) continue;
    const { kind: sk, value } = socialFromUrl(url);
    if (sk === 'facebook' || sk === 'instagram') { socials[sk] ||= value; continue; }
    if (!sk) { website = url; break; }
  }
  let email = '';
  for (const part of firstTag(tags, EMAIL_KEYS).split(/[;,\s]+/)) { email = normaliseEmail(part) || ''; if (email) break; }
  // Some map entries carry a phone number as their name: skip those tags, fall back to the website / e-mail domain, else skip the place.
  const name = pickBusinessName(nameCandidates, { website, email }, { deriveBlank: false });
  if (!name) return { skip: 'no_name' };
  return {
    candidate: {
      place_id: `osm:${kind}/${oid}`, business_name: name.slice(0, 160), category: categoryOf(tags), address: addressOf(tags).slice(0, 300),
      whatsapp_number: firstPhone(tags), website, email, facebook: socials.facebook.slice(0, 200), instagram: socials.instagram.slice(0, 200), search_query: query.slice(0, 80),
    },
  };
}

// ---------------------------------------------------------------- scoring
export function calculateLeadScore(row) {
  let score = 0;
  const email = clean(row.email_primary);
  const phone = clean(row.phone_primary);
  const li = clean(row.linkedin_company);
  const dm = clean(row.decision_maker_found) === 'Yes';
  const contact = clean(row.contact_page_found) === 'Yes';
  if (email) score += Math.min(emailScore(email) * 2.5, 25);
  if (phone) score += 18;
  if (li) score += 13;
  if (dm) score += 18;
  if (contact) score += 6;
  score += Math.min((Number(row.social_media_score) || 0) * 2, 12);
  if (clean(row.website)) score += 5;
  if ([email, phone, li, dm, contact].filter(Boolean).length >= 4) score += 3;
  return Math.min(100, Math.round(score));
}
export function calculateConfidence(row) {
  let e = 0;
  if (clean(row.email_primary)) e += 3;
  if (clean(row.phone_primary)) e += 3;
  if (clean(row.linkedin_company)) e += 2;
  if (clean(row.contact_page_found) === 'Yes') e += 1;
  if ((Number(row.social_media_score) || 0) >= 2) e += 1;
  return e >= 8 ? 'High' : e >= 5 ? 'Medium' : 'Low';
}
export function bestContact(row) {
  const m = [];
  if (clean(row.email_primary)) m.push('Email');
  if (clean(row.phone_primary)) m.push('Phone');
  if (clean(row.linkedin_company)) m.push('LinkedIn');
  if (clean(row.instagram)) m.push('Instagram DM');
  if (clean(row.facebook)) m.push('Facebook Message');
  if (clean(row.youtube)) m.push('YouTube');
  if (m.length) return m.slice(0, 2).join(' > ');
  return clean(row.contact_page_url) || clean(row.website) ? 'Website Form' : 'Unknown';
}
export const qualityLabel = (score) => (score >= HOT_SCORE ? 'HOT' : score >= WARM_SCORE ? 'WARM' : 'COLD');

/** Candidate + what the crawl found (`site`, may be null) -> a full enriched row in the Lead Inbox's field names. */
export function buildRow(candidate, site) {
  const hosts = candidate.website ? [hostKey(new URL(candidate.website).hostname)] : [];
  const emails = new Set(site?.emails || []);
  if (candidate.email) emails.add(candidate.email);
  const phones = new Set(site?.phones || []);
  if (candidate.whatsapp_number) phones.add(candidate.whatsapp_number);
  const socials = { ...emptySocials(), ...(site?.socials || {}) };
  socials.facebook ||= candidate.facebook || '';
  socials.instagram ||= candidate.instagram || '';
  const row = {
    ...candidate,
    ...socials,
    all_emails: [...emails].join('; '),
    email_primary: choosePrimaryEmail(emails, hosts),
    phone_primary: choosePrimaryPhone(phones, site?.whatsapp || []),
    contact_page_found: site?.contactUrl ? 'Yes' : 'No',
    contact_page_url: site?.contactUrl || '',
    social_media_score: socialScore(socials),
    decision_maker_found: (site?.people || []).length ? 'Yes' : 'No',
    decision_maker_name: site?.people?.[0]?.name || '',
    decision_maker_title: site?.people?.[0]?.title || '',
    decision_makers: (site?.people || []).map((p) => `${p.name} (${p.title})`).join('; '),
    company_size: site?.size?.size && site.size.size !== 'unknown' ? site.size.size : '',
    tech_stack_detected: (site?.tech || []).join(', '),
  };
  row.email = row.email_primary;
  // A named leader on the business's own site becomes the first name the outreach greets, unless one was already known.
  if (!clean(row.first_name) && site?.people?.[0]) {
    const [first, ...rest] = site.people[0].name.split(' ');
    row.first_name = first;
    row.last_name = rest.join(' ');
  }
  row.whatsapp_number = candidate.whatsapp_number || row.phone_primary;
  const score = calculateLeadScore(row);
  row.lead_quality_score = score;
  row.contact_confidence = calculateConfidence(row);
  row.best_contact_method = bestContact(row);
  return row;
}

/**
 * Which enriched rows go to the Lead Inbox. Best first; one email and one phone only once; a weak score protects email deliverability
 * (the email is dropped, the phone may still be used). Returns { ready, reasons } where reasons counts why rows were left out.
 */
const NAME_NOISE = new Set(['ltd', 'limited', 'pvt', 'private', 'inc', 'llc', 'co', 'company', 'the', 'plc', 'and']);
/** A business-name key for matching: lower case, letters and digits only, company suffixes dropped. '' if too short to trust. */
export function nameKey(name) {
  const words = String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !NAME_NOISE.has(w));
  const key = words.join('');
  return key.length >= 4 ? key : '';
}

/**
 * What the website gave us for one business, in one word: email_found, phone_only, no_contact_on_site, no_website,
 * unreachable, or blocked_by_robots. Shown to the owner so a weak list can be judged at a glance.
 */
export function enrichOutcome(website, site) {
  if (!String(website || '').trim()) return 'no_website';
  if (site?.blocked) return 'blocked_by_robots';
  if (!site || !site.ok) return 'unreachable';
  const count = (v) => (Array.isArray(v) ? v.length : (v?.size || 0));
  if (count(site.emails) > 0) return 'email_found';
  if (count(site.phones) > 0 || count(site.whatsapp) > 0) return 'phone_only';
  return 'no_contact_on_site';
}

export function selectForInbox(rows, { minScore = WARM_SCORE, phoneOnlyMinScore = 0, existing = new Set(), existingNames = new Set() } = {}) {
  const sorted = [...rows].sort((a, b) => (Number(b.lead_quality_score) || 0) - (Number(a.lead_quality_score) || 0));
  const usedEmails = new Set();
  const usedPhones = new Set();
  const ready = [];
  const reasons = {};
  const leave = (r) => { reasons[r] = (reasons[r] || 0) + 1; };
  for (const row of sorted) {
    const score = Number(row.lead_quality_score) || 0;
    let email = clean(row.email_primary).toLowerCase();
    if (email && emailScore(email) <= 1) email = ''; // noreply@ and friends are not a person
    const phone = cleanPhone(clean(row.whatsapp_number)) || cleanPhone(clean(row.phone_primary)) || '';
    if (!email && !phone) { leave('no_email_or_phone'); continue; }
    if (email && existing.has(email)) { leave('already_in_crm'); continue; } // a customer or open deal already: never re-prospect them
    const key = nameKey(row.business_name);
    if (key && existingNames.has(key)) { leave('already_in_crm'); continue; } // the same business under another email
    if (email && score < minScore) { email = ''; if (!phone) { leave('score_below_minimum'); continue; } }
    if (!email && score < phoneOnlyMinScore) { leave('score_below_minimum'); continue; }
    if (email && usedEmails.has(email)) { if (phone && !usedPhones.has(phoneKey(phone))) email = ''; else { leave('duplicate_email'); continue; } }
    if (!email && phone && usedPhones.has(phoneKey(phone))) { leave('duplicate_phone'); continue; }
    if (email) usedEmails.add(email);
    if (phone) usedPhones.add(phoneKey(phone));
    ready.push({
      ...row, email, whatsapp_number: phone, first_name: clean(row.first_name), last_name: clean(row.last_name), lead_quality: qualityLabel(score),
      lead_quality_score: String(score), rating: '', review_count: '', campaign: clean(row.campaign || row.search_query).slice(0, 80),
    });
  }
  return { ready, reasons };
}

// ---------------------------------------------------------------- what the customer types
/** A search typed by a person (or saved for the nightly run), cleaned. Returns { ok, search } or { ok: false, error }. */
export function sanitizeSearch(raw) {
  const split = splitAreaFromQuery(raw?.query);
  const term = clean(split.term).replace(/[^\p{L}\p{N} ,&'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const location = clean(raw?.location || split.place).replace(/[^\p{L}\p{N} ,.\-']/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (term.length < 3) return { ok: false, error: 'Type what to look for, for example "dentist" or "travel agency".' };
  if (location.length < 2) return { ok: false, error: 'Type where to look, for example "Colombo, Sri Lanka" (a city or district, not a whole country).' };
  const { tags, stems } = categoryFilters(term);
  if (!tags.length && !stems.length) return { ok: false, error: 'That search has nothing to look for. Try a plainer business type.' };
  const min = Number(raw?.minScore);
  return { ok: true, search: { term, location, minScore: Number.isFinite(min) ? Math.min(100, Math.max(0, Math.round(min))) : WARM_SCORE, known: tags.length > 0 } };
}

export function sanitizeFinderSettings(raw) {
  const searches = [];
  for (const s of Array.isArray(raw?.searches) ? raw.searches : []) {
    const r = sanitizeSearch({ query: s?.term || s?.query, location: s?.location, minScore: s?.minScore });
    if (!r.ok) continue;
    const key = `${normaliseTerm(r.search.term)}|${r.search.location.toLowerCase()}`;
    if (searches.some((x) => `${normaliseTerm(x.term)}|${x.location.toLowerCase()}` === key)) continue;
    searches.push({ term: r.search.term, location: r.search.location, minScore: r.search.minScore });
    if (searches.length >= MAX_SAVED_SEARCHES) break;
  }
  const next = Number(raw?.next);
  // How each saved search has been doing (only for searches that still exist). See recordSearchRun.
  const health = {};
  for (const sr of searches) {
    const k = searchKey(sr);
    const h = raw?.health && typeof raw.health === 'object' ? raw.health[k] : null;
    if (h && typeof h === 'object') {
      const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.min(100000, Math.floor(Number(v))) : 0);
      health[k] = { runs: n(h.runs), dryRuns: n(h.dryRuns), lastDelivered: n(h.lastDelivered), lastRunAt: typeof h.lastRunAt === 'string' ? h.lastRunAt.slice(0, 30) : '' };
    }
  }
  // Auto-find: the area to search, the saved searches it retired (dry ones, not asked again for a while), and its last note.
  const retired = [...new Set((Array.isArray(raw?.retired) ? raw.retired : []).map((k) => clean(k).slice(0, 200)).filter(Boolean))].slice(-60);
  return {
    enabled: raw?.enabled === true, searches, health,
    next: Number.isFinite(next) && next >= 0 ? Math.floor(next) % Math.max(1, searches.length) : 0,
    autoFind: raw?.autoFind === true, area: clean(raw?.area).slice(0, 80), retired,
    autoFindedAt: typeof raw?.autoFindedAt === 'string' ? raw.autoFindedAt.slice(0, 30) : '',
    autoNote: typeof raw?.autoNote === 'string' ? raw.autoNote.slice(0, 200) : '',
  };
}
export const FINDER_DEFAULTS = { enabled: false, searches: [], next: 0, health: {}, autoFind: false, area: '', retired: [], autoFindedAt: '', autoNote: '' };

// ---------------------------------------------------------------- a saved search that runs dry
// The same area and business type only has so many businesses. Once the finder has seen them all it finds nothing new, and without
// this the nightly job would keep spending its night on it and the pipeline would quietly go empty.
export const DRY_AFTER = 2; // finished runs in a row that added no new lead
export const searchKey = (s) => `${normaliseTerm(s?.term)}|${clean(s?.location).toLowerCase()}`;

/** Note how a finished nightly run went: new leads delivered, or a dry run. Pure; returns the new health map. */
export function recordSearchRun(health, search, delivered, now = new Date()) {
  const k = searchKey(search);
  const prev = (health && health[k]) || { runs: 0, dryRuns: 0, lastDelivered: 0, lastRunAt: '' };
  const d = Math.max(0, Math.floor(Number(delivered) || 0));
  return { ...(health || {}), [k]: { runs: prev.runs + 1, dryRuns: d > 0 ? 0 : prev.dryRuns + 1, lastDelivered: d, lastRunAt: now.toISOString() } };
}

export const isDry = (health, search) => ((health && health[searchKey(search)]) || { dryRuns: 0 }).dryRuns >= DRY_AFTER;

/** The searches that have stopped finding anything new. */
export function drySearches(settings) {
  return (settings?.searches || []).filter((s) => isDry(settings.health, s));
}

/**
 * Which saved search the night should run: the next in turn, skipping the dry ones, so a night is never spent on a finished area.
 * When every search is dry it still tries the next in turn (an area can gain new businesses), and says so.
 */
export function pickNightlySearch(settings) {
  const list = settings?.searches || [];
  if (!list.length) return null;
  const start = Math.max(0, Number(settings.next) || 0) % list.length;
  for (let i = 0; i < list.length; i++) {
    const idx = (start + i) % list.length;
    if (!isDry(settings.health, list[idx])) return { index: idx, search: list[idx], allDry: false };
  }
  return { index: start, search: list[start], allDry: true };
}

// ---------------------------------------------------------------- finding businesses by itself, from the business context
export const AUTO_MIN_GAP_DAYS = 1; // never ask for fresh searches more than once a day (cost)
export const AUTO_REFRESH_DAYS = 7; // and at least once a week, so the list does not go stale
const AUTO_DAY = 86400000;

/** Should the nightly routine ask for fresh searches now? Only when the finder and auto-find are on and an area is set. Pure. */
export function needsAutoRefresh(settings, now = Date.now()) {
  if (!settings || !settings.enabled || !settings.autoFind || !settings.area) return false;
  const last = Date.parse(settings.autoFindedAt || '');
  if (Number.isFinite(last) && now - last < AUTO_MIN_GAP_DAYS * AUTO_DAY) return false;
  if (!settings.searches.length) return true;
  if (settings.searches.every((s) => isDry(settings.health, s))) return true;
  return !Number.isFinite(last) || now - last >= AUTO_REFRESH_DAYS * AUTO_DAY;
}

/**
 * Merge AI-suggested business types into the saved searches for the area. Dry searches are retired (not asked again for a while),
 * searches that still find businesses are kept, nothing is duplicated, and the list never exceeds the saved-search limit.
 * @param {object} settings  sanitized finder settings
 * @param {{term:string}[]} suggestions  already checked against the searchable business types
 */
export function mergeAutoSearches(settings, suggestions = []) {
  const retired = new Set(settings.retired || []);
  const dropped = settings.searches.filter((s) => isDry(settings.health, s));
  const kept = settings.searches.filter((s) => !isDry(settings.health, s));
  const seen = new Set(kept.map(searchKey));
  const added = [];
  for (const sug of Array.isArray(suggestions) ? suggestions : []) {
    if (kept.length + added.length >= MAX_SAVED_SEARCHES) break;
    const term = clean(sug?.term);
    if (!term) continue;
    const cand = { term, location: settings.area };
    const key = searchKey(cand);
    if (seen.has(key) || retired.has(key)) continue;
    seen.add(key);
    added.push(cand);
  }
  const retiredNext = [...new Set([...retired, ...dropped.map(searchKey)])].slice(-60);
  return { searches: [...kept, ...added], added, dropped: dropped.length, retired: retiredNext };
}

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
