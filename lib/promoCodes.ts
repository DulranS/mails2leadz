// Promo codes: a code the owner sets up (SAVE10 = 10% off) that fills in a lower sale price on the sale form. The price on the
// sale is the lower one, so revenue and profit already reflect it: no separate discount is booked. The Promo card only adds up
// what the codes took off. Shop currency only. Pure.

export const MAX_PROMO_CODES = 30;
const CODE_RE = /^[A-Z0-9_-]{1,20}$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type PromoCodes = Record<string, number>; // code -> percent off

// "SAVE10:10, WELCOME:5" -> { SAVE10: 10, WELCOME: 5 }. Codes are upper-cased. An error comes back instead of a partial list.
export function parsePromoCodes(text: string): { codes: PromoCodes; error?: string } {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > MAX_PROMO_CODES) return { codes: {}, error: `At most ${MAX_PROMO_CODES} promo codes.` };
  const codes: PromoCodes = {};
  for (const part of parts) {
    const m = part.match(/^([^:]+):\s*(\d+(?:\.\d+)?)\s*%?$/);
    if (!m) return { codes: {}, error: `"${part}" should look like CODE:PERCENT, for example SAVE10:10.` };
    const code = m[1].trim().toUpperCase();
    if (!CODE_RE.test(code)) return { codes: {}, error: `"${code}": codes use letters, numbers, - or _, up to 20 characters.` };
    const pct = Number(m[2]);
    if (!(pct > 0 && pct <= 100)) return { codes: {}, error: `"${code}": the percent must be above 0 and at most 100.` };
    if (Object.prototype.hasOwnProperty.call(codes, code)) return { codes: {}, error: `"${code}" is listed more than once.` };
    codes[code] = pct;
  }
  return { codes };
}

export function formatPromoCodes(codes: PromoCodes | undefined): string {
  return Object.entries(codes ?? {}).map(([c, p]) => `${c}:${p}`).join(", ");
}

// The percent a typed code gives, or null when it is not one of the owner's codes.
export function findPromoPercent(codes: PromoCodes | undefined, input: string): number | null {
  const key = input.trim().toUpperCase();
  if (!key || !codes || !Object.prototype.hasOwnProperty.call(codes, key)) return null;
  return codes[key];
}

// The lower price per unit a code gives (rounded to cents).
export function promotedPrice(price: number, pct: number): number {
  return round2(Math.max(0, price * (1 - pct / 100)));
}

// What the code took off on this sale: the price drop per unit times the quantity. Never negative.
export function promoOff(priceBefore: number, priceAfter: number, qty: number): number {
  return round2(Math.max(0, priceBefore - priceAfter) * Math.max(0, qty));
}

export interface PromoUsageRow {
  code: string;
  uses: number;
  off: number;
}

// Sales outside from..to (ISO dates, inclusive) are left out. A sale without a code is not counted.
export function promoUsage(
  sales: { date: string; promoCode?: string; promoOffAmount?: number }[],
  from?: string,
  to?: string
): { rows: PromoUsageRow[]; uses: number; off: number } {
  const byCode = new Map<string, PromoUsageRow>();
  for (const s of sales) {
    if (from && s.date < from) continue;
    if (to && s.date > to) continue;
    if (!s.promoCode) continue;
    const row = byCode.get(s.promoCode) ?? { code: s.promoCode, uses: 0, off: 0 };
    row.uses++;
    row.off += s.promoOffAmount ?? 0;
    byCode.set(s.promoCode, row);
  }
  const rows = [...byCode.values()].map((r) => ({ ...r, off: round2(r.off) })).sort((a, b) => b.off - a.off || a.code.localeCompare(b.code));
  return {
    rows,
    uses: rows.reduce((t, r) => t + r.uses, 0),
    off: round2(rows.reduce((t, r) => t + r.off, 0)),
  };
}

// Campaign spend per code, typed by the owner under Settings: "SAVE10:5000, WELCOME:1200". Amounts in shop currency, zero or more.
// A comparison figure only: it is never posted to your expenses and never added to profit.
export function parseCampaignSpend(text: string): { spend: Record<string, number>; error?: string } {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length > MAX_PROMO_CODES) return { spend: {}, error: `At most ${MAX_PROMO_CODES} campaigns.` };
  const spend: Record<string, number> = {};
  for (const part of parts) {
    const m = part.match(/^([^:]+):\s*(\d+(?:\.\d+)?)$/);
    if (!m) return { spend: {}, error: `"${part}" should look like CODE:AMOUNT, for example SAVE10:5000.` };
    const code = m[1].trim().toUpperCase();
    if (!CODE_RE.test(code)) return { spend: {}, error: `"${code}": codes use letters, numbers, - or _, up to 20 characters.` };
    if (Object.prototype.hasOwnProperty.call(spend, code)) return { spend: {}, error: `"${code}" is listed more than once.` };
    spend[code] = Math.round(Number(m[2]) * 100) / 100;
  }
  return { spend };
}

export function formatCampaignSpend(spend: Record<string, number> | undefined): string {
  return Object.entries(spend ?? {}).map(([c, a]) => `${c}:${a}`).join(", ");
}

export interface CampaignRow {
  code: string;
  uses: number;
  revenue: number; // what the sales that used the code brought in, after returns and discounts
  grossProfit: number; // revenue less the cost of the goods
  off: number; // what the code took off the price
  spend: number; // what you typed for this campaign (0 if none)
  profitAfterSpend: number; // gross profit less that spend
  costPerSale: number | null; // spend per sale that used the code, null when none or no sales
}

// Results per promo code for the window. Revenue and gross profit come from the same per-sale economics the profit page uses.
export function campaignResults(
  sales: { id: string; date: string; promoCode?: string; promoOffAmount?: number }[],
  economics: { saleId: string; revenue: number; grossProfit: number }[],
  spend: Record<string, number> | undefined,
  from?: string,
  to?: string
): { rows: CampaignRow[]; revenue: number; grossProfit: number; spend: number; profitAfterSpend: number } {
  const econ = new Map(economics.map((e) => [e.saleId, e]));
  const byCode = new Map<string, { uses: number; revenue: number; grossProfit: number; off: number }>();
  for (const s of sales) {
    if (from && s.date < from) continue;
    if (to && s.date > to) continue;
    if (!s.promoCode) continue;
    const e = econ.get(s.id);
    if (!e) continue;
    const row = byCode.get(s.promoCode) ?? { uses: 0, revenue: 0, grossProfit: 0, off: 0 };
    row.uses++;
    row.revenue += e.revenue;
    row.grossProfit += e.grossProfit;
    row.off += s.promoOffAmount ?? 0;
    byCode.set(s.promoCode, row);
  }
  // A campaign with spend but no sales in the window still shows, so you see the money that bought nothing.
  for (const code of Object.keys(spend ?? {})) {
    if (!byCode.has(code) && (spend ?? {})[code] > 0) byCode.set(code, { uses: 0, revenue: 0, grossProfit: 0, off: 0 });
  }
  const rows: CampaignRow[] = [...byCode.entries()]
    .map(([code, r]) => {
      const s = spend?.[code] ?? 0;
      return {
        code,
        uses: r.uses,
        revenue: round2(r.revenue),
        grossProfit: round2(r.grossProfit),
        off: round2(r.off),
        spend: round2(s),
        profitAfterSpend: round2(r.grossProfit - s),
        costPerSale: r.uses > 0 && s > 0 ? round2(s / r.uses) : null,
      };
    })
    .sort((a, b) => b.profitAfterSpend - a.profitAfterSpend || a.code.localeCompare(b.code));
  const sum = (k: keyof CampaignRow) => round2(rows.reduce((t, r) => t + (r[k] as number), 0));
  return { rows, revenue: sum("revenue"), grossProfit: sum("grossProfit"), spend: sum("spend"), profitAfterSpend: sum("profitAfterSpend") };
}
