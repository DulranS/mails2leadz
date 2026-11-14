// lib/stock-draw.js - takes stock for a paid sale, and reads "Mug x2, Home visit x1" lines. Items without tracked stock are left alone. Pure.
/** "Mug x2, Home visit" -> [{name, qty}]. A missing quantity means one. */
export function parseSaleLines(text) {
  return String(text || '').split(/[,\n]/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^(.*?)\s*[x×]\s*(\d+)$/i);
    return m ? { name: m[1].trim(), qty: Math.max(1, Number(m[2])) } : { name: p, qty: 1 };
  }).filter((l) => l.name).slice(0, 50);
}

/** Takes stock for each line. Returns the updated items, what was taken, and any shortfall (not tracked, or not enough left). */
export function drawStock(items = [], lines = []) {
  const next = (Array.isArray(items) ? items : []).map((i) => ({ ...i }));
  const drawn = [], shortfalls = [];
  for (const { name, qty } of lines) {
    const want = Math.max(1, Math.floor(Number(qty) || 1));
    const item = next.find((i) => i.stock !== null && i.stock !== undefined && String(i.name).toLowerCase() === String(name).toLowerCase());
    if (!item) { shortfalls.push({ name, qty: want, reason: 'not tracked' }); continue; }
    const take = Math.min(item.stock, want);
    item.stock -= take;
    if (take > 0) drawn.push({ name: item.name, qty: take });
    if (take < want) shortfalls.push({ name, qty: want - take, reason: 'not enough in stock' });
  }
  return { items: next, drawn, shortfalls };
}
