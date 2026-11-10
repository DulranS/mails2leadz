// lib/competitor.js - where your prices sit against the competitor prices you enter. Pure. Only prices you enter are used; competitor sites are not read.
const r2 = (n) => Math.round(n * 100) / 100;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function positionVs(yourPrice, prices = []) {
  const p = (Array.isArray(prices) ? prices : []).map(Number).filter((x) => x > 0);
  if (!(Number(yourPrice) > 0) || !p.length) return null;
  const mid = median(p);
  const diff = r2(((Number(yourPrice) - mid) / mid) * 100);
  return { competitorMedian: r2(mid), low: r2(Math.min(...p)), high: r2(Math.max(...p)), yourPrice: Number(yourPrice), differencePct: diff, verdict: diff <= -10 ? 'well_below' : diff < 0 ? 'below' : diff < 10 ? 'in_line' : 'above', basis: 'Competitor prices you entered' };
}

/** A competitor price line: "Competitor, product, price". Bad lines are skipped and counted. */
export function parseCompetitorLines(text) {
  const rows = []; let skipped = 0;
  for (const line of String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^([^,]{1,80}),\s*([^,]{1,120}),\s*([\d.,]+)\s*$/);
    const price = m ? Number(m[3].replace(/,/g, '')) : NaN;
    if (!m || !(price > 0)) { skipped++; continue; }
    rows.push({ competitor: m[1].trim(), product: m[2].trim(), price });
  }
  return { rows: rows.slice(0, 200), skipped };
}
