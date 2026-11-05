// lib/quote-followup.js - a quote the customer opened but has not answered is the warmest unanswered sale. Pure: which ones.
const DAY = 86400000;
const CLOSED = ['accepted', 'declined', 'withdrawn'];

export function viewedNoAnswer(quotes = [], now = Date.now(), days = 3) {
  return (Array.isArray(quotes) ? quotes : []).filter((q) => {
    if (!q || !q.id || CLOSED.includes(q.status) || !(Number(q.viewCount) > 0)) return false;
    if (q.validUntil && Date.parse(`${q.validUntil}T23:59:59Z`) < now) return false;
    const last = Date.parse(q.lastViewedAt || q.viewedAt || '');
    return Number.isFinite(last) && now - last >= days * DAY;
  }).map((q) => ({
    id: String(q.id),
    email: String(q.customerEmail || '').trim().toLowerCase(),
    title: String(q.title || 'quote').slice(0, 120),
    viewCount: Number(q.viewCount) || 0,
    daysSince: Math.floor((now - Date.parse(q.lastViewedAt || q.viewedAt)) / DAY),
  }));
}
