// lib/seo-totals.js - click-through rate from Search Console rows, and traffic figures from GA4 rows. Pure.
/** Clicks and impressions summed over the rows Search Console returns. */
export function parseSeoRows(json) {
  const rows = Array.isArray(json?.rows) ? json.rows : [];
  return rows.reduce((a, r) => ({ clicks: a.clicks + (Number(r.clicks) || 0), impressions: a.impressions + (Number(r.impressions) || 0) }), { clicks: 0, impressions: 0 });
}
/** Click-through rate as a percentage with one decimal; null when there were no impressions. */
export function ctrPercent(clicks, impressions) {
  return impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : null;
}
/** GA4 runReport totals: metric values come back in the order requested (sessions, totalUsers, bounceRate). */
export function parseGa4Totals(json) {
  const v = json?.rows?.[0]?.metricValues;
  if (!Array.isArray(v) || v.length < 3) return null;
  const bounce = Number(v[2].value);
  return { sessions: Number(v[0].value) || 0, users: Number(v[1].value) || 0, bouncePct: Number.isFinite(bounce) ? Math.round(bounce * 1000) / 10 : null };
}
