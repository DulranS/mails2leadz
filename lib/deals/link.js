// lib/deals/link.js - reads a pasted link and says what the app can do with it. Pure. Only official sources are used; any other link is refused, never fetched.
const EBAY_HOST = /(^|\.)ebay\.(com|co\.uk|com\.au|ca|de|fr|it|es|com\.my|ph|ie)$/i;
const CH_HOST = /(^|\.)companieshouse\.gov\.uk$/i;

export function classifyLink(raw) {
  let u;
  try { u = new URL(String(raw || '').trim().startsWith('http') ? String(raw).trim() : `https://${String(raw).trim()}`); } catch { return { kind: 'unsupported', reason: 'That does not look like a web link.' }; }
  if (EBAY_HOST.test(u.hostname)) {
    const kw = (u.searchParams.get('_nkw') || '').trim();
    if (u.pathname.startsWith('/sch/') && kw.length >= 2) return { kind: 'ebay_search', keyword: kw.slice(0, 80) };
    const cat = u.pathname.match(/^\/b\/([^/]+)\//);
    if (cat) {
      const words = decodeURIComponent(cat[1]).replace(/[-_]+/g, ' ').trim();
      if (words.length >= 2) return { kind: 'ebay_search', keyword: words.slice(0, 80) };
    }
    return { kind: 'unsupported', reason: 'This eBay page is not a search. Paste the link of an eBay search (it has "_nkw=" in it) instead.' };
  }
  if (CH_HOST.test(u.hostname)) {
    const m = u.pathname.match(/^\/company\/([A-Za-z0-9]{6,8})(?:\/|$)/);
    if (m) return { kind: 'companies_house', companyNumber: m[1].toUpperCase() };
    return { kind: 'unsupported', reason: 'Paste a Companies House company link (for example companieshouse.gov.uk/company/01234567).' };
  }
  return { kind: 'unsupported', reason: 'The app can read eBay search links and Companies House company links. Other sites are not read, so add those listings by hand.' };
}

/** Sales targets against the recent average month. Honest: the average is the last twelve months' won value divided by twelve. */
export function targetProgress(targets = {}, sales = {}, money = {}) {
  const monthly = Number(sales.wonValueLast12Months) / 12 || 0;
  const out = [];
  if (Number(targets.monthlyRevenue) > 0) out.push({ name: 'Revenue a month', target: Number(targets.monthlyRevenue), actual: Math.round(monthly * 100) / 100, pct: Math.round((monthly / Number(targets.monthlyRevenue)) * 100) });
  const newPerMonth = (Number(money.newCustomersLast12Months) || 0) / 12;
  if (Number(targets.newCustomersPerMonth) > 0) out.push({ name: 'New customers a month', target: Number(targets.newCustomersPerMonth), actual: Math.round(newPerMonth * 10) / 10, pct: Math.round((newPerMonth / Number(targets.newCustomersPerMonth)) * 100) });
  if (Number(targets.winRatePct) > 0 && sales.winRatePct !== null && sales.winRatePct !== undefined) out.push({ name: 'Win rate', target: Number(targets.winRatePct), actual: sales.winRatePct, pct: Math.round((sales.winRatePct / Number(targets.winRatePct)) * 100) });
  return out;
}
