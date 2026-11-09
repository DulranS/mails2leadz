// lib/seo-insights.js - reads Search Console query data into the few searches worth acting on this week. Pure.
export function parseSearchRows(json) {
  return (json?.rows || []).map((r) => ({
    query: String(r.keys?.[0] || '').slice(0, 120),
    clicks: Number(r.clicks) || 0,
    impressions: Number(r.impressions) || 0,
    ctr: Number(r.ctr) || 0,
    position: Number(r.position) || 0,
  })).filter((r) => r.query);
}

/** Searches worth a page or a better title: close to page one with real demand, or seen often and clicked rarely. */
export function opportunities(rows = [], limit = 3) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r.impressions >= 50 && r.position >= 4 && r.position <= 15) out.push({ ...r, why: `Seen ${r.impressions} times and ranks about ${Math.round(r.position)}: a page or a section aimed at it could move it onto page one.` });
    else if (r.impressions >= 100 && r.ctr < 0.01) out.push({ ...r, why: `Seen ${r.impressions} times but clicked rarely: sharpen the title and the first line for it.` });
  }
  return out.sort((a, b) => b.impressions - a.impressions).slice(0, limit);
}
