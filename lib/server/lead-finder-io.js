// lib/server/lead-finder-io.js - the only place the lead finder touches the network.
//
//  * OpenStreetMap: Nominatim finds the area, Overpass lists the businesses (free, no key, no card). One request at a time, an honest
//    User-Agent, several public Overpass servers tried in turn.
//  * Business websites: read with a fetch that REFUSES anything that is not a public web address (a website tag in a public map is
//    attacker-controlled text, and this runs on our server). Every hop of a redirect is checked again. robots.txt is honoured.
//
// Everything takes a `ctx` ({ fetch, lookup, userAgent }) so the tests can run without a network.
import dns from 'node:dns/promises';
import net from 'node:net';
import {
  categoryFilters, overpassQuery, rectFromNominatim, splitRect, rectIsSmall, candidateFromElement, parsePage, hostKey,
  isContactPath, normaliseUrl, MAX_CANDIDATES,
} from '../lead-finder.js';

export class FinderError extends Error {
  constructor(message, code = 'FINDER_ERROR') { super(message); this.code = code; }
}
class AreaTooHeavy extends Error {}

export function defaultCtx() {
  const contact = String(process.env.NEXT_PUBLIC_CONTACT_EMAIL || process.env.AUTOLEADS_CONTACT || '').trim();
  const site = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  return {
    fetch: (...a) => globalThis.fetch(...a),
    lookup: (host) => dns.lookup(host, { all: true }),
    userAgent: `AutoLeads/1.0 (lead search tool${site ? `; ${site}` : ''}${contact ? `; ${contact}` : ''})`,
    nominatim: String(process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/+$/, ''),
    overpass: process.env.OVERPASS_URL ? [process.env.OVERPASS_URL.trim()] : ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'],
  };
}

// ---------------------------------------------------------------- safe fetching
/** True for any address that is not on the public internet (loopback, private, link-local, metadata, multicast, reserved). */
export function isPrivateIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51) || (a === 203 && b === 0);
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || /^fe[89ab]/.test(x) || x.startsWith('ff') || x.startsWith('2001:db8') || x.startsWith('64:ff9b');
  }
  return true; // not an address at all: refuse
}

/** Throws FinderError('UNSAFE_URL') unless the URL is a plain http(s) address on a public host (ports 80/443 only, no credentials). */
export async function assertPublicUrl(raw, ctx) {
  let u;
  try { u = new URL(raw); } catch { throw new FinderError('Not a web address.', 'UNSAFE_URL'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new FinderError('Not a plain web address.', 'UNSAFE_URL');
  if (u.port && !['80', '443'].includes(u.port)) throw new FinderError('Unusual port.', 'UNSAFE_URL');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (!host || host === 'localhost' || /\.(local|localhost|internal|localdomain|lan|home|corp)$/.test(host) || !host.includes('.') && !net.isIP(host)) throw new FinderError('Not a public host.', 'UNSAFE_URL');
  if (net.isIP(host)) { if (isPrivateIp(host)) throw new FinderError('Not a public host.', 'UNSAFE_URL'); return u; }
  let addrs;
  try { addrs = await ctx.lookup(host); } catch { throw new FinderError('The site did not resolve.', 'UNREACHABLE'); }
  if (!addrs?.length || addrs.some((a) => isPrivateIp(a.address))) throw new FinderError('Not a public host.', 'UNSAFE_URL');
  return u;
}

async function readLimited(res, maxBytes) {
  if (!res.body?.getReader) { const t = await res.text(); return t.slice(0, maxBytes); }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    chunks.push(value);
    if (total >= maxBytes) { try { await reader.cancel(); } catch { /* done */ } break; }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, maxBytes));
}

/** GET a public web page as text. Follows up to 3 redirects, re-checking each; HTML/text only; body capped. Never throws on a bad site: returns { ok: false }. */
export async function safeGet(url, ctx, { timeoutMs = 7000, maxBytes = 600000, accept = 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5' } = {}) {
  let current = url;
  try {
    for (let hop = 0; hop <= 3; hop++) {
      await assertPublicUrl(current, ctx);
      const res = await ctx.fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': ctx.userAgent, Accept: accept, 'Accept-Language': 'en' } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        try { await res.body?.cancel(); } catch { /* ignore */ }
        if (!loc) return { ok: false, status: res.status, url: current };
        current = new URL(loc, current).toString();
        continue;
      }
      if (res.status < 200 || res.status >= 300) { try { await res.body?.cancel(); } catch { /* ignore */ } return { ok: false, status: res.status, url: current }; }
      const type = String(res.headers.get('content-type') || '').toLowerCase();
      if (type && !/(text\/|html|xml)/.test(type)) { try { await res.body?.cancel(); } catch { /* ignore */ } return { ok: false, status: 415, url: current }; }
      return { ok: true, status: res.status, url: current, text: await readLimited(res, maxBytes) };
    }
    return { ok: false, status: 310, url: current }; // too many redirects
  } catch (e) {
    return { ok: false, status: 0, url: current, error: e?.code === 'UNSAFE_URL' ? 'unsafe' : 'unreachable' };
  }
}

// ---------------------------------------------------------------- robots.txt
function parseRobots(text, agent = 'autoleads') {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.replace(/#.*/, '').match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(m[2].toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && cur) {
      cur.rules.push({ allow: key === 'allow', path: m[2] });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const mine = groups.filter((g) => g.agents.some((a) => a && a !== '*' && agent.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules).filter((r) => r.path);
  return (path) => {
    let best = null;
    for (const r of rules) {
      const re = new RegExp(`^${r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
      if (!re.test(path)) continue;
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
    return best ? best.allow : true;
  };
}

/** A per-run robots.txt cache: allowed(url) -> boolean. 404 and other 4xx = everything allowed; 5xx / unreachable = skip the site (be polite). */
export function makeRobots(ctx) {
  const cache = new Map();
  return async function allowed(url) {
    let u;
    try { u = new URL(url); } catch { return false; }
    let check = cache.get(u.origin);
    if (!check) {
      const r = await safeGet(`${u.origin}/robots.txt`, ctx, { timeoutMs: 4000, maxBytes: 150000, accept: 'text/plain,*/*;q=0.5' });
      if (r.ok) check = parseRobots(r.text);
      else if (r.status >= 400 && r.status < 500 && r.status !== 429) check = () => true;
      else check = () => false;
      cache.set(u.origin, check);
    }
    return check(u.pathname + u.search);
  };
}

// ---------------------------------------------------------------- read one business website
const mergeSocials = (into, from) => { for (const [k, v] of Object.entries(from)) if (v && !into[k]) into[k] = v; };

/** Read a business's website (home page, then its contact page and up to two more) and return what it publishes. Never throws. */
export async function crawlSite(website, ctx, robots, { maxPages = 4, deadline = Date.now() + 15000 } = {}) {
  const seed = normaliseUrl(website);
  const site = { ok: false, emails: new Set(), phones: new Set(), whatsapp: new Set(), socials: {}, contactUrl: '', tech: new Set(), pages: 0 };
  if (!seed) return site;
  const hosts = new Set([hostKey(new URL(seed).hostname)]);
  const variants = (() => {
    const u = new URL(seed);
    const alt = new URL(seed); alt.hostname = u.hostname.startsWith('www.') ? u.hostname.slice(4) : `www.${u.hostname}`;
    const other = new URL(seed); other.protocol = u.protocol === 'https:' ? 'http:' : 'https:';
    return [seed, alt.toString(), other.toString()];
  })();
  let home = null;
  for (const v of variants) {
    if (Date.now() > deadline) return site;
    if (!(await robots(v))) { site.blocked = true; return site; }
    const r = await safeGet(v, ctx);
    if (r.ok) { home = { url: r.url, text: r.text }; break; }
    if (r.error === 'unsafe') return site;
  }
  if (!home) return site;
  site.ok = true;
  const queue = [];
  const done = new Set();
  const take = (page) => {
    site.pages++;
    page.emails.forEach((e) => site.emails.add(e));
    page.phones.forEach((p) => site.phones.add(p));
    page.whatsapp.forEach((p) => site.whatsapp.add(p));
    page.tech.forEach((t) => site.tech.add(t));
    mergeSocials(site.socials, page.socials);
    if (page.isContact && !site.contactUrl) site.contactUrl = page.url;
    for (const [u, pr] of page.links) if (!done.has(u) && !queue.some((q) => q[0] === u)) queue.push([u, pr]);
    queue.sort((a, b) => a[1] - b[1]);
  };
  done.add(home.url);
  hosts.add(hostKey(new URL(home.url).hostname)); // a redirect to the real domain is the same business
  take(parsePage(home.text, home.url, hosts, 0));
  while (site.pages < maxPages && queue.length && Date.now() < deadline) {
    if (site.emails.size && site.phones.size && site.contactUrl) break; // everything we came for
    const [next] = queue.shift();
    if (done.has(next)) continue;
    done.add(next);
    if (!(await robots(next))) continue;
    const r = await safeGet(next, ctx, { timeoutMs: 6000, maxBytes: 400000 });
    if (!r.ok) continue;
    const page = parsePage(r.text, r.url, hosts, 1);
    if (isContactPath(new URL(r.url).pathname)) page.isContact = true;
    take(page);
  }
  return site;
}

export const siteToPlain = (s) => ({ ok: s.ok, emails: [...s.emails], phones: [...s.phones], whatsapp: [...s.whatsapp], socials: s.socials, contactUrl: s.contactUrl, tech: [...s.tech], pages: s.pages, blocked: !!s.blocked });

// ---------------------------------------------------------------- OpenStreetMap
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function geocode(location, ctx) {
  const url = `${ctx.nominatim}/search?${new URLSearchParams({ q: location, format: 'json', limit: '1' })}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ctx.fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': ctx.userAgent, Accept: 'application/json', 'Accept-Language': 'en' } });
      lastStatus = res.status;
      if (res.ok) {
        const data = await res.json();
        const rect = rectFromNominatim(data?.[0]?.boundingbox);
        if (!rect) throw new FinderError(`Could not find "${location}" on the map. Try a fuller name, like "Kandy, Sri Lanka".`, 'AREA_NOT_FOUND');
        return rect;
      }
      if (res.status === 403 || res.status === 400) break; // asking again will not help
    } catch (e) {
      if (e instanceof FinderError) throw e;
    }
    await sleep(1200);
  }
  throw new FinderError(`The map service did not answer for "${location}" (${lastStatus || 'no reply'}). Try again in a few minutes.`, 'MAP_UNAVAILABLE');
}

async function overpass(ql, ctx, deadline) {
  let last = 'no reply';
  const servers = ctx.overpass;
  for (let attempt = 0; attempt < servers.length * 2; attempt++) {
    const left = deadline - Date.now();
    if (left < 4000) break;
    const server = servers[attempt % servers.length];
    try {
      const res = await ctx.fetch(server, {
        method: 'POST', signal: AbortSignal.timeout(Math.min(left - 1000, 32000)),
        headers: { 'User-Agent': ctx.userAgent, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ data: ql }).toString(),
      });
      const text = await res.text();
      if (res.ok) {
        let data;
        try { data = JSON.parse(text); } catch { last = 'unreadable answer'; continue; }
        if (data?.remark && /timed out|out of memory|runtime error/i.test(data.remark) && !(data.elements || []).length) throw new AreaTooHeavy(data.remark);
        return data;
      }
      last = `HTTP ${res.status}`;
      if (res.status === 504 || (res.status === 400 && /timeout|memory/i.test(text))) throw new AreaTooHeavy(last);
      if (res.status === 400) throw new FinderError('The map service rejected that search. Try a plainer business type.', 'BAD_QUERY');
    } catch (e) {
      if (e instanceof AreaTooHeavy || e instanceof FinderError) throw e;
      last = e?.name === 'TimeoutError' ? 'timed out' : 'unreachable';
    }
    await sleep(attempt % servers.length === servers.length - 1 ? 1500 : 300);
  }
  throw new FinderError(`The free map servers are busy right now (${last}). Try again in a few minutes.`, 'MAP_BUSY');
}

/**
 * Find businesses on OpenStreetMap: { candidates: [...], stats }. A crowded area is split into four and asked again (up to two levels)
 * while time lasts. `seen` is a Set of place ids already delivered earlier; those are counted, not returned.
 */
export async function searchOsm({ term, location }, ctx, { deadline = Date.now() + 45000, seen = new Set(), limit = 300 } = {}) {
  const { tags, stems } = categoryFilters(term);
  const rect = await geocode(location, ctx);
  const found = new Map();
  const stats = { returned: 0, noName: 0, alreadySeen: 0, full: false };
  const add = (el) => {
    stats.returned++;
    const r = candidateFromElement(el, `${term} in ${location}`);
    if (r.skip) { if (r.skip === 'no_name') stats.noName++; return; }
    const c = r.candidate;
    if (found.has(c.place_id)) return;
    if (seen.has(c.place_id)) { stats.alreadySeen++; found.set(c.place_id, null); return; }
    found.set(c.place_id, c);
  };
  async function area(rc, depth) {
    let data;
    try { data = await overpass(overpassQuery(tags, stems, rc, limit, 25), ctx, deadline); }
    catch (e) {
      if (e instanceof AreaTooHeavy && depth < 2 && !rectIsSmall(rc) && deadline - Date.now() > 8000) { for (const child of splitRect(rc)) await area(child, depth + 1); return; }
      if (e instanceof AreaTooHeavy) throw new FinderError('That area is too big for the free map server. Try a city or district instead of a whole region.', 'AREA_TOO_BIG');
      throw e;
    }
    const els = data.elements || [];
    els.forEach(add);
    if (els.length >= limit && depth < 2 && !rectIsSmall(rc) && deadline - Date.now() > 10000) { for (const child of splitRect(rc)) { if (deadline - Date.now() < 8000) { stats.full = true; break; } await area(child, depth + 1); } }
    else if (els.length >= limit) stats.full = true;
  }
  await area(rect, 0);
  const candidates = [...found.values()].filter(Boolean);
  return { candidates: candidates.slice(0, Math.max(MAX_CANDIDATES, 0)), stats };
}
