// lib/deal-watch.js - watches the listing feeds an owner chooses (RSS or Atom), remembers prices, and flags undervalued new listings.
// Pure: no network and no storage. The nightly job (lib/server/deal-watch-job.js) does the I/O.
import { parseMoney, normaliseGroup, groupFromTitle, MIN_GROUP, MIN_DISCOUNT, CHECK_DISCOUNT } from './deal-screen.js';

export const MAX_FEEDS = 5;
export const MEMORY_PER_GROUP = 25;
export const MEMORY_GROUPS = 200;
export const MAX_DEALS = 60;
export const MAX_SEEN = 2000;
export const DEFAULT_COSTS = { sellFeePct: 0.05, repairCost: 0, transportCost: 0 };

const decode = (s) => String(s)
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const cleanText = (s) => decode(String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' '))
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tagText = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? cleanText(m[1]) : '';
};
const linkOf = (block) => {
  const atom = block.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?>/i);
  if (atom) return atom[1].trim();
  return tagText(block, 'link') || tagText(block, 'guid');
};

/** A web address that is http or https, or ''. */
export function safeLink(u) {
  try {
    const x = new URL(String(u || '').trim());
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.toString() : '';
  } catch { return ''; }
}

/** RSS <item> and Atom <entry> -> [{title, link, description}]. Only web links, no duplicates, at most 200. */
export function parseFeed(xml) {
  const text = String(xml || '').slice(0, 1500000);
  const blocks = [...text.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi), ...text.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  const seen = new Set();
  const out = [];
  for (const b of blocks) {
    const link = safeLink(linkOf(b));
    const title = tagText(b, 'title').slice(0, 200);
    if (!link || !title || seen.has(link)) continue;
    seen.add(link);
    out.push({ title, link, description: (tagText(b, 'description') || tagText(b, 'summary') || tagText(b, 'content')).slice(0, 500) });
    if (out.length >= 200) break;
  }
  return out;
}

// Currency word or symbol, a number, an optional k / m / lakh, and an optional distance unit (which marks mileage, not price).
const PRICE_RE = /(rs\.?|lkr|usd|us\$|\$|£|€)?\s?(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|k|m)?(?!\w)(\s*(?:km|kms|kilomet\w*|miles?|mi\b))?/gi;

/** The asking price in a listing's text, or null. A currency-marked amount wins; a bare number counts only if it is 10,000 or more (not a year, not mileage). */
export function priceFrom(text) {
  let fallback = null;
  for (const m of String(text || '').matchAll(PRICE_RE)) {
    if (m[4]) continue;
    const base = Number(m[2].replace(/,/g, ''));
    if (!Number.isFinite(base) || base <= 0) continue;
    const unit = (m[3] || '').toLowerCase();
    const mult = unit.startsWith('lakh') ? 1e5 : unit === 'k' ? 1e3 : unit === 'm' ? 1e6 : 1;
    const value = Math.round(base * mult);
    if (m[1]) return value;
    if (value >= 10000 && fallback === null) fallback = value;
  }
  return fallback;
}

export const groupOf = (item) => normaliseGroup(item?.group) || groupFromTitle(item?.title || '');

/** Adds observed prices to the memory: per group, the newest MEMORY_PER_GROUP prices; at most MEMORY_GROUPS groups, most recently seen kept. */
export function rememberPrices(memory = {}, items = [], now = Date.now()) {
  const out = { ...(memory || {}) };
  for (const it of Array.isArray(items) ? items : []) {
    const price = Number(it?.price);
    const group = groupOf(it);
    if (!(price > 0) || !group) continue;
    const prior = Array.isArray(out[group]?.p) ? out[group].p : [];
    out[group] = { p: [...prior, Math.round(price)].slice(-MEMORY_PER_GROUP), t: now };
  }
  const keys = Object.keys(out);
  if (keys.length > MEMORY_GROUPS) {
    keys.sort((a, b) => (out[b].t || 0) - (out[a].t || 0)).slice(MEMORY_GROUPS).forEach((k) => { delete out[k]; });
  }
  return out;
}

/** The typical price of a group, or null until the group has MIN_GROUP prices. */
export function benchmarkFor(memory, group) {
  const e = memory?.[group];
  if (!e || !Array.isArray(e.p) || e.p.length < MIN_GROUP) return null;
  const s = [...e.p].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function sanitizeCosts(c = {}) {
  const fee = Number(c?.sellFeePct);
  return {
    sellFeePct: Number.isFinite(fee) ? Math.min(0.5, Math.max(0, fee)) : DEFAULT_COSTS.sellFeePct,
    repairCost: Math.max(0, Number(c?.repairCost) || 0),
    transportCost: Math.max(0, Number(c?.transportCost) || 0),
  };
}

/**
 * Judges new listings against the memory as it was BEFORE tonight, so a listing is never compared with itself.
 * Same rules as the pasted-list screen: at least MIN_DISCOUNT under the median, profit after fee and costs; far below is a check.
 */
export function assessNew(items = [], memory = {}, costs = {}) {
  const c = sanitizeCosts(costs);
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    const price = Number(it?.price);
    if (!(price > 0)) continue;
    const group = groupOf(it);
    const median = benchmarkFor(memory, group);
    if (median === null) continue;
    const discount = 1 - price / median;
    if (discount < MIN_DISCOUNT) continue;
    const cost = price + c.repairCost + c.transportCost;
    const profit = Math.round(median * (1 - c.sellFeePct) - cost);
    const tooCheap = discount >= CHECK_DISCOUNT;
    if (!tooCheap && profit <= 0) continue;
    out.push({
      title: it.title, link: it.link, group, price: Math.round(price), benchmark: Math.round(median),
      discountPct: Math.round(discount * 100), estProfit: profit, n: memory[group].p.length,
      status: tooCheap ? 'check' : 'deal',
    });
  }
  return out;
}

/** Feed addresses from a list: web links only, no duplicates, at most MAX_FEEDS. Anything else is reported back. */
export function sanitizeFeeds(urls) {
  const list = Array.isArray(urls) ? urls : String(urls || '').split(/\s+/);
  const feeds = [];
  const bad = [];
  const seen = new Set();
  let tooMany = false;
  for (const raw of list) {
    const s = String(raw ?? '').trim();
    if (!s) continue;
    const u = safeLink(s);
    if (!u) { bad.push(s.slice(0, 80)); continue; }
    if (seen.has(u)) continue;
    seen.add(u);
    if (feeds.length >= MAX_FEEDS) { tooMany = true; break; }
    feeds.push({ url: u, label: new URL(u).hostname.replace(/^www\./, '') });
  }
  return { feeds, bad, tooMany };
}

export function readState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    feeds: Array.isArray(s.feeds) ? s.feeds.filter((f) => safeLink(f?.url)).slice(0, MAX_FEEDS) : [],
    seen: Array.isArray(s.seen) ? s.seen.filter((x) => typeof x === 'string').slice(-MAX_SEEN) : [],
    memory: s.memory && typeof s.memory === 'object' ? s.memory : {},
    deals: Array.isArray(s.deals) ? s.deals.slice(0, MAX_DEALS) : [],
    costs: sanitizeCosts(s.costs),
    lastRunAt: typeof s.lastRunAt === 'string' ? s.lastRunAt.slice(0, 40) : '',
    lastNote: typeof s.lastNote === 'string' ? s.lastNote.slice(0, 300) : '',
  };
}
