// lib/today-actions.js - the short "Do now" list: what needs a person today, most urgent first, each with one place to go. Pure.
export const MAX_ITEMS = 5;

const ITEMS = [
  { key: 'supportPastTarget', href: '/crm', one: 'customer question is past its two-hour target', many: 'customer questions are past their two-hour target', priority: 1 },
  { key: 'leadsWaiting', href: '/crm', one: 'new lead is waiting for a first reply', many: 'new leads are waiting for a first reply', priority: 2 },
  { key: 'supportOpen', href: '/crm', one: 'customer question is open', many: 'customer questions are open', priority: 3 },
  { key: 'dealsAtRisk', href: '/crm', one: 'deal is at risk', many: 'deals are at risk', priority: 4 },
  { key: 'journeyStepsDue', href: '/crm', one: 'journey step is due to send', many: 'journey steps are due to send', priority: 5 },
  { key: 'broadcastDrafts', href: '/crm', one: 'broadcast is waiting for your approval', many: 'broadcasts are waiting for your approval', priority: 6 },
  { key: 'socialDrafts', href: '/crm', one: 'social post is ready to publish', many: 'social posts are ready to publish', priority: 7 },
  { key: 'listingsToDecide', href: '/crm', one: 'listing has gone two weeks without a decision', many: 'listings have gone two weeks without a decision', priority: 8 },
  { key: 'eventsSoon', href: '/crm', one: 'event starts within three days', many: 'events start within three days', priority: 9 },
  { key: 'restockWaiting', href: '/crm', one: 'item is back in stock and someone is waiting for it', many: 'items are back in stock and people are waiting for them', priority: 4.2 },
  { key: 'wonNotInvoiced', href: '/crm', one: 'won deal has no invoice yet', many: 'won deals have no invoice yet', priority: 3.5 },
  { key: 'stockLow', href: '/crm', one: 'item is low or out of stock', many: 'items are low or out of stock', priority: 4.5 },
  { key: 'offersEndingSoon', href: '/crm', one: 'offer ends within three days', many: 'offers end within three days', priority: 10 },
];

/** Counts in, a short ordered list out. Zero counts are left out; the list never has more than five items. */
export function buildTodayActions(counts = {}) {
  return ITEMS
    .map((it) => ({ ...it, count: Math.max(0, Math.floor(Number(counts[it.key]) || 0)) }))
    .filter((it) => it.count > 0)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_ITEMS)
    .map((it) => ({ key: it.key, href: it.href, count: it.count, text: `${it.count} ${it.count === 1 ? it.one : it.many}` }));
}
