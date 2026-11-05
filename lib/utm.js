// lib/utm.js - tags the outbound links in a message with UTM parameters, so a click can be traced to the email that sent it. Pure.
// Only external links are tagged. Links to the business's own domain, unsubscribe, manage, pay and similar paths are left alone,
// and so are links that already carry a utm_source. With no own domain configured, nothing is changed.
const SKIP_PATH = /\/(unsubscribe|track|manage|pay|api|signup|statement|quote|book|shop|site)(\/|$|\?)/i;

export function tagLinks(text, { host = '', medium = 'email', source = 'autoleads', campaign = '' } = {}) {
  const own = String(host || '').replace(/^www\./, '').toLowerCase();
  if (!own || !text) return text;
  return String(text).replace(/https?:\/\/[^\s<>"')]+/g, (url) => {
    try {
      const u = new URL(url);
      const h = u.hostname.replace(/^www\./, '').toLowerCase();
      if (h === own || h.endsWith(`.${own}`) || SKIP_PATH.test(u.pathname) || u.searchParams.has('utm_source')) return url;
      u.searchParams.set('utm_source', source);
      u.searchParams.set('utm_medium', medium);
      if (campaign) u.searchParams.set('utm_campaign', String(campaign).slice(0, 60));
      return u.toString();
    } catch {
      return url;
    }
  });
}

/** The business's own domain, from the public base URL, or '' when it is not configured. */
export function ownHost(env = process.env) {
  try { return new URL(String(env.NEXT_PUBLIC_BASE_URL || '')).hostname; } catch { return ''; }
}
