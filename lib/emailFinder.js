/**
 * lib/emailFinder.js
 * ------------------
 * Given a business's own website, looks for a publicly published contact
 * email on that site (homepage + a couple of likely contact pages). This
 * never touches a third-party platform or personal data — only the email
 * a business itself chose to publish on its own domain, the same thing a
 * human would do by opening the site and looking for "Contact Us."
 *
 * Kept intentionally simple (no headless browser, no JS rendering) so it
 * runs inline inside a Vercel serverless function without a separate
 * always-on Python service — see backend/scraper.py for the original,
 * more thorough standalone version (still usable for large offline
 * batches if you ever need it).
 */

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PRIORITY_PATHS = ['', '/contact', '/contact-us', '/about'];
const FETCH_TIMEOUT_MS = 6000;

function baseDomain(hostname) {
  const parts = hostname.toLowerCase().replace(/^www\./, '').split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
}

function normalizeUrl(raw) {
  if (!raw) return null;
  let url = raw.trim();
  if (!url || /^(n\/a|null|none|-)$/i.test(url)) return null;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || parsed.hostname.includes('google.com')) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OutboundEngineBot/1.0)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns the best-guess contact email for `websiteUrl`, or null if none
 * was found on the homepage / common contact pages within the time budget.
 */
async function findEmailForWebsite(websiteUrl) {
  const parsed = normalizeUrl(websiteUrl);
  if (!parsed) return null;
  const domain = baseDomain(parsed.hostname);

  for (const path of PRIORITY_PATHS) {
    const pageUrl = new URL(path, parsed.origin).toString();
    const html = await fetchWithTimeout(pageUrl);
    if (!html) continue;

    const found = html.match(EMAIL_PATTERN) || [];
    const relevant = found
      .map((e) => e.toLowerCase())
      .filter((e) => {
        const emailDomain = e.split('@')[1];
        return emailDomain && (emailDomain === domain || emailDomain.endsWith('.' + domain));
      });

    if (relevant.length) return relevant[0];
  }
  return null;
}

/**
 * Runs findEmailForWebsite across many businesses with bounded concurrency,
 * so a batch of 20 sites doesn't run fully sequentially (too slow for a
 * serverless request budget) or fully in parallel (too many outbound
 * connections at once).
 */
async function findEmailsForWebsites(websites, concurrency = 5) {
  const results = new Array(websites.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < websites.length) {
      const i = cursor++;
      results[i] = await findEmailForWebsite(websites[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, websites.length) }, worker));
  return results;
}

module.exports = { findEmailForWebsite, findEmailsForWebsites };
