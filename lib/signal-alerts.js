// lib/signal-alerts.js - buying-signal alerts from feeds the owner chooses (job boards, council planning, tender notices, news).
// Pure: no network. Each new item from a feed becomes an alert with a plain tag, so the owner can see what kind of signal it is.
// The tags come from keyword rules only (no AI): a rule is a guess about the kind of item, shown as a tag, never as a judgement.
// An alert does not identify a company or contact anyone; the owner decides what to pursue.
export const ALERT_CAP = 100;
export const SEEN_CAP = 2000;

const TAGS = [
  ['tender', /\b(tender|tenders|invitation to tender|procurement|rfp|rfq|framework agreement|contract notice)\b/i],
  ['planning', /\b(planning|application|development|demolition|change of use|listed building)\b/i],
  ['hiring', /\b(vacancy|vacancies|hiring|recruit\w*|job opening|we are looking for)\b/i],
  ['funding', /\b(grant|funding|investment|raises|series [a-d]|seed round)\b/i],
  ['new_business', /\b(launch\w*|opens|new branch|relocat\w*|new location|expands? to)\b/i],
];

/** The tags that fit an item's text, most specific first. A plain item gets 'other'. */
export function tagsFor({ title = '', description = '' } = {}) {
  const text = `${title} ${description}`;
  const found = TAGS.filter(([, re]) => re.test(text)).map(([t]) => t);
  return found.length ? found : ['other'];
}

/** Items not seen before, as alerts, oldest first. `seen` is the set of links already handled. */
export function newAlerts({ items = [], seen = new Set(), feedLabel = '', now = Date.now() } = {}) {
  const out = [];
  const handled = new Set(seen); // links already seen, plus those accepted earlier in this batch
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !it.link || handled.has(it.link)) continue;
    handled.add(it.link);
    out.push({
      link: String(it.link).slice(0, 500),
      title: String(it.title || '').slice(0, 200),
      description: String(it.description || '').slice(0, 300),
      feed: String(feedLabel || '').slice(0, 80),
      tags: tagsFor(it),
      foundAt: new Date(now).toISOString(),
    });
  }
  return out;
}

/** The alert list with the newest first, capped. Old alerts drop off the end. */
export function mergeAlerts(current = [], fresh = [], cap = ALERT_CAP) {
  return [...fresh.slice().reverse(), ...(Array.isArray(current) ? current : [])].slice(0, cap);
}
