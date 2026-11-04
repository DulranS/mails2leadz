// lib/multi-touch.js - multi-touch attribution: splits each customer's revenue across the channels that touched them. Pure.
// Models: linear (equal shares), u_shaped (40% first, 40% last, 20% shared by the middle touches), first_touch, last_touch.
export const ATTRIBUTION_MODELS = ['linear', 'u_shaped', 'first_touch', 'last_touch'];

function sharesFor(n, model) {
  if (n <= 0) return [];
  if (n === 1) return [1];
  if (model === 'first_touch') return Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0));
  if (model === 'last_touch') return Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 : 0));
  if (model === 'u_shaped') {
    if (n === 2) return [0.5, 0.5];
    const mid = 0.2 / (n - 2);
    return Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 0.4 : mid));
  }
  return Array.from({ length: n }, () => 1 / n);
}

/** customers: [{ revenue, touches: [{ channel, at }] }]. Returns revenue per channel, largest first. */
export function attributeRevenue(customers = [], model = 'linear') {
  const m = ATTRIBUTION_MODELS.includes(model) ? model : 'linear';
  const byChannel = {};
  for (const c of Array.isArray(customers) ? customers : []) {
    const revenue = Number(c?.revenue) || 0;
    const touches = (Array.isArray(c?.touches) ? c.touches : [])
      .filter((t) => t && t.channel && Number.isFinite(t.at))
      .sort((a, b) => a.at - b.at);
    if (!(revenue > 0) || touches.length === 0) continue;
    const shares = sharesFor(touches.length, m);
    touches.forEach((t, i) => { byChannel[t.channel] = (byChannel[t.channel] || 0) + revenue * shares[i]; });
  }
  return Object.entries(byChannel)
    .map(([channel, amount]) => ({ channel, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}
