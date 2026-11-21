// lib/server/sender-auth.js - looks up a sending domain's SPF, DKIM and DMARC records in public DNS.
import { resolveTxt, resolve4 } from 'node:dns/promises';
import { DKIM_SELECTORS, normalizeDomain, buildSenderReport, FREE_MAIL, DBL_ZONE } from '../sender-auth.js';

const LOOKUP_TIMEOUT_MS = 4000;

/** TXT records for one name. A missing name is an empty list; a timeout also counts as empty (the report says what was not found). */
export async function txtRecords(name, { resolve = resolveTxt } = {}) {
  let timer;
  try {
    const rows = await Promise.race([
      resolve(name),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), LOOKUP_TIMEOUT_MS); }),
    ]);
    return rows.map((r) => r.join(''));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Spamhaus Domain Block List answer for the domain: { known, addresses }. "Not listed" is a known empty answer (NXDOMAIN or no
 * record); a timeout, a server error or a refused query is unknown (known=false), so the report never says "clear" by mistake.
 */
export async function blocklistLookup(domain, { resolve = resolve4 } = {}) {
  let timer;
  try {
    const rows = await Promise.race([
      resolve(`${domain}.${DBL_ZONE}`),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), LOOKUP_TIMEOUT_MS); }),
    ]);
    return { known: true, addresses: rows.map(String) };
  } catch (err) {
    return { known: err?.code === 'ENOTFOUND' || err?.code === 'ENODATA', addresses: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** Checks one domain: returns buildSenderReport()'s answer. Lookups run in parallel where possible. */
export async function checkSenderDomain(domain, { lookup = txtRecords, blocklist = blocklistLookup } = {}) {
  const d = normalizeDomain(domain);
  if (!d) return buildSenderReport(domain);
  if (FREE_MAIL.has(d)) return buildSenderReport(d);
  const [spf, dmarc, dbl] = await Promise.all([lookup(d), lookup(`_dmarc.${d}`), blocklist(d)]);
  let dkim = null;
  for (const selector of DKIM_SELECTORS) {
    const txts = await lookup(`${selector}._domainkey.${d}`);
    if (txts.some((t) => /v=DKIM1/i.test(t))) { dkim = { selector, txts }; break; }
  }
  return buildSenderReport(d, { spf, dmarc, dkim, blocklist: dbl });
}

// ---- send gate (v326) -------------------------------------------------------------------------------------------
import { sendGateFromLookups } from '../sender-auth.js';
const GATE_TTL_MS = 60 * 60 * 1000;
const gateCache = new Map(); // domain -> { at, value }

/** TXT records for the gate: { known, txts }. NXDOMAIN and no-data are a known "missing"; a timeout or server error is unknown. */
export async function gateLookup(name, { resolve = resolveTxt } = {}) {
  let timer;
  try {
    const rows = await Promise.race([
      resolve(name),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), LOOKUP_TIMEOUT_MS); }),
    ]);
    return { known: true, txts: rows.map((r) => r.join('')) };
  } catch (err) {
    return { known: err?.code === 'ENOTFOUND' || err?.code === 'ENODATA', txts: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** The send gate for a sender address. Free-mail domains and unreadable DNS never block. Cached one hour per domain. */
export async function senderGateFor(email, { lookup = gateLookup, now = Date.now() } = {}) {
  const d = normalizeDomain(String(email || '').split('@').pop());
  if (!d || FREE_MAIL.has(d)) return { ok: true, unavailable: false, message: null };
  const hit = gateCache.get(d);
  if (hit && now - hit.at < GATE_TTL_MS) return hit.value;
  const [spf, dmarc] = await Promise.all([lookup(d), lookup(`_dmarc.${d}`)]);
  const value = sendGateFromLookups({ spf, dmarc });
  gateCache.set(d, { at: now, value });
  return value;
}
