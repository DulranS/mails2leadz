// lib/sender-auth.js - reads the DNS records that decide whether mail from a domain reaches inboxes (pure: no network).
//
// Gmail and Yahoo (bulk senders: 5,000+ messages a day to their users) require SPF and DKIM to pass, a DMARC record whose
// From domain aligns with them, and spam complaints under 0.3%. Smaller senders are not required to pass, but mail
// without these records is the first thing mailbox providers spam-file. This module only interprets records it is given;
// lib/server/sender-auth.js does the DNS lookups.

export const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com']);
// Selector names we look for. A DKIM key lives at <selector>._domainkey.<domain>; the selector is chosen by the sender, so
// a domain signed under a name not on this list shows as "not found" (the owner can tell us the name).
export const DKIM_SELECTORS = ['google', 'default', 'selector1', 'selector2', 'k1', 'mail', 'dkim', 's1', 's2'];
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const SPF_LOOKUP_LIMIT = 10;

/** "owner@Example.com", "https://example.com/x" and "example.com." all become "example.com"; anything else becomes ''. */
export function normalizeDomain(input) {
  let d = String(input || '').trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^.*@/, '').replace(/\.$/, '');
  return DOMAIN_RE.test(d) ? d : '';
}

/** SPF: one record starting v=spf1, at most 10 lookups, and a hard or soft fail for everything else (-all or ~all). */
export function evaluateSpf(txts = []) {
  const rec = txts.map((t) => String(t).trim()).find((t) => /^v=spf1(\s|$)/i.test(t));
  if (!rec) return { ok: false, found: false, warnings: [], message: 'No SPF record. Publish one TXT record that starts with "v=spf1".' };
  const terms = rec.split(/\s+/).slice(1);
  const lookups = terms.filter((t) => /^[+\-~?]?(include:|a(:|\/|$)|mx(:|\/|$)|ptr(:|$)|exists:|redirect=)/i.test(t)).length;
  const allMatch = terms.join(' ').match(/(^|\s)([+\-~?]?)all$/i);
  const qualifier = allMatch ? (allMatch[2] || '+') : '';
  const warnings = [];
  if (!allMatch) warnings.push('The record has no "all" ending, so servers it does not list are not rejected. End it with ~all or -all.');
  else if (qualifier === '+') warnings.push('The record ends with +all, which lets any server send as your domain. Change it to ~all or -all.');
  else if (qualifier === '?') warnings.push('The record ends with ?all (neutral). Change it to ~all or -all.');
  if (lookups > SPF_LOOKUP_LIMIT) warnings.push(`The record makes ${lookups} DNS lookups; SPF allows ${SPF_LOOKUP_LIMIT}, so it fails with a permanent error.`);
  const ok = warnings.length === 0 && lookups <= SPF_LOOKUP_LIMIT;
  return { ok, found: true, lookups, warnings, message: ok ? 'SPF is set and ends with a fail rule.' : 'SPF is set but needs changes (see below).' };
}

/** DKIM: a v=DKIM1 record with a non-empty public key (p=). An empty p= means the key was revoked. */
export function evaluateDkim(found = null) {
  if (!found) return { ok: false, found: false, message: `No DKIM key under the common names (${DKIM_SELECTORS.join(', ')}). In Google Workspace it is "google"; in other mail systems the name differs.` };
  const key = String(found.txts.find((t) => /v=DKIM1/i.test(t)) || '');
  const p = (key.match(/(?:^|;)\s*p=([^;]*)/i) || [])[1];
  if (p === undefined || !p.trim()) return { ok: false, found: true, selector: found.selector, message: `A DKIM record exists at ${found.selector}._domainkey but holds no public key (it was revoked or is incomplete).` };
  return { ok: true, found: true, selector: found.selector, message: `DKIM key found (selector ${found.selector}).` };
}

/** DMARC: a v=DMARC1 record. p=none only monitors, so it does not stop spoofing; it is still required for bulk senders. */
export function evaluateDmarc(txts = []) {
  const rec = txts.map((t) => String(t).trim()).find((t) => /^v=DMARC1(\s|;|$)/i.test(t));
  if (!rec) return { ok: false, found: false, warnings: [], message: 'No DMARC record. Publish a TXT record at _dmarc.<your domain> starting "v=DMARC1; p=none".' };
  const policy = ((rec.match(/(?:^|;)\s*p=([a-z]+)/i) || [])[1] || '').toLowerCase();
  const warnings = [];
  if (policy === 'none') warnings.push('The policy is p=none (monitor only). Once the reports look clean, move to p=quarantine, then p=reject.');
  if (!/(?:^|;)\s*rua=/i.test(rec)) warnings.push('No rua= address, so you will not receive the aggregate reports that show who is sending as your domain.');
  if (!['none', 'quarantine', 'reject'].includes(policy)) warnings.push('The policy (p=) is missing or not recognised.');
  return { ok: ['none', 'quarantine', 'reject'].includes(policy), found: true, policy, warnings, message: policy ? `DMARC policy is p=${policy}.` : 'DMARC is set but has no policy.' };
}

/** Everything together. `dkim` is the output of evaluateDkim. */
export function overallStatus({ spf, dkim, dmarc }) {
  const passing = [spf.ok, dkim.ok, dmarc.ok].filter(Boolean).length;
  if (spf.ok && dkim.ok && dmarc.found && dmarc.ok) return { status: 'ready', label: 'Ready for bulk sending', passing };
  if (passing === 0) return { status: 'missing', label: 'Not set up: most mail to Gmail and Yahoo will be filed as spam', passing };
  return { status: 'partial', label: 'Partly set up: fix the items below before sending in volume', passing };
}

/**
 * The full answer for a domain. `lookups` = { spf: [txt], dmarc: [txt], dkim: { selector, txts } | null } as read from DNS.
 */
export function buildSenderReport(domain, lookups = {}) {
  const d = normalizeDomain(domain);
  if (!d) return { error: 'Enter a domain such as example.com (not an address with a full path).' };
  if (FREE_MAIL.has(d)) {
    return { domain: d, freeMail: true, status: 'provider', label: 'Sent through a provider that signs mail for you', message: `${d} is a free mail service. The provider signs and checks mail for its own domain, so there are no records for you to publish. Your own domain is what needs these records.`, checks: [] };
  }
  const spf = evaluateSpf(lookups.spf || []);
  const dkim = evaluateDkim(lookups.dkim || null);
  const dmarc = evaluateDmarc(lookups.dmarc || []);
  const { status, label, passing } = overallStatus({ spf, dkim, dmarc });
  return {
    domain: d, freeMail: false, status, label, passing,
    checks: [
      { id: 'spf', name: 'SPF', ok: spf.ok, message: spf.message, warnings: spf.warnings, example: 'v=spf1 include:_spf.google.com ~all' },
      { id: 'dkim', name: 'DKIM', ok: dkim.ok, selector: dkim.selector || '', message: dkim.message, warnings: [], example: 'In Google Workspace: Admin, Apps, Google Workspace, Gmail, Authenticate email. Generate the key and publish it as a TXT record.' },
      { id: 'dmarc', name: 'DMARC', ok: dmarc.ok, message: dmarc.message, warnings: dmarc.warnings, example: `v=DMARC1; p=none; rua=mailto:dmarc@${d}` },
    ],
    notes: ['Gmail and Yahoo require all three for bulk senders (5,000 or more messages a day). Keep spam complaints under 0.3%; check them in Google Postmaster Tools.'],
  };
}
