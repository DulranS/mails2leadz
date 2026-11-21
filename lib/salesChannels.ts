// Sales by channel: which way a sale reached the customer (walk-in, wholesale, online, an agent, a tender...) and what each
// way brought in. Read-only arithmetic over sales the business already has, using the same per-sale economics the P&L uses,
// so the totals here agree with the rest of the app. A sale with no channel is reported as "Not recorded" so it can be
// tagged, never guessed.
//
// This is separate from marketing channels (lib/channelEconomics.ts, "where did the customer come from"). A wholesale
// order from a customer you found by a Facebook ad is a Wholesale sale and a Facebook lead at the same time.
import type { SaleEconomics } from "./calculations";

export const MAX_SALE_CHANNEL = 40;
export const NOT_RECORDED = "Not recorded";
export const SALE_CHANNEL_PRESETS = ["Walk-in", "Wholesale", "Online", "Direct to consumer (D2C)", "Phone / WhatsApp", "Agent / reseller", "Tender / project"];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Trims, collapses spaces and caps the length. Blank means "not recorded": undefined, so nothing is stored blank.
export function cleanSaleChannel(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/\s+/g, " ").slice(0, MAX_SALE_CHANNEL).trim();
  // "Not recorded" is the label for untagged sales, so it cannot also be a channel name.
  if (!s || s.toLowerCase() === NOT_RECORDED.toLowerCase()) return undefined;
  return s;
}

// Channels match ignoring case and spacing, so "online" and "Online " are one channel.
export const saleChannelKey = (v: string | undefined | null) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export interface ChannelSaleInput {
  id: string;
  date: string; // ISO
  qty: number;
  saleChannel?: string;
  customer?: string; // the name typed on the sale; used only when the sale has no channel of its own
}

export interface SalesChannelRow {
  channel: string; // as first written, or NOT_RECORDED
  sales: number; // sale lines in the window (an invoice with three lines counts three)
  units: number;
  revenue: number; // net of returns and discounts, as the P&L counts it
  grossProfit: number; // after cost of goods sold
  contribution: number; // after variable per-sale costs, before rent and wages
  sharePct: number; // this channel's share of total revenue, one decimal place
  grossMarginPct: number | null; // grossProfit / revenue as a percent; null when revenue is 0
}

export interface SalesByChannel {
  from: string;
  to: string;
  rows: SalesChannelRow[]; // highest revenue first; Not recorded always last
  totalRevenue: number;
  totalGrossProfit: number;
  totalContribution: number;
  totalSales: number;
}

// Sales dated from `from` to `to` (both ISO, both included). Sales with no economics record are left out rather than
// guessed, and that cannot happen for a saved sale in practice.
// A sale with no channel of its own takes the channel of its customer (customerChannel: saleChannelKey(customer name) -> channel),
// the same rule channel economics (lib/channelEconomics.ts) uses, so the two reports agree. Only sales with neither stay Not recorded.
export function summarizeSalesByChannel(
  sales: ChannelSaleInput[],
  economics: SaleEconomics[],
  from: string,
  to: string,
  customerChannel?: Map<string, string>
): SalesByChannel {
  const econBySale = new Map(economics.map((e) => [e.saleId, e]));
  const groups = new Map<string, SalesChannelRow>();

  for (const s of sales) {
    if (s.date < from || s.date > to) continue;
    const econ = econBySale.get(s.id);
    if (!econ) continue;
    const label =
      cleanSaleChannel(s.saleChannel) ??
      (s.customer ? customerChannel?.get(saleChannelKey(s.customer)) : undefined) ??
      NOT_RECORDED;
    const key = label === NOT_RECORDED ? "" : saleChannelKey(label);
    let row = groups.get(key);
    if (!row) {
      row = { channel: label, sales: 0, units: 0, revenue: 0, grossProfit: 0, contribution: 0, sharePct: 0, grossMarginPct: null };
      groups.set(key, row);
    }
    row.sales++;
    row.units += s.qty;
    row.revenue += econ.revenue;
    row.grossProfit += econ.grossProfit;
    row.contribution += econ.contributionMargin;
  }

  const totalRevenue = [...groups.values()].reduce((a, r) => a + r.revenue, 0);
  const rows = [...groups.values()].map((r) => ({
    ...r,
    revenue: round2(r.revenue),
    grossProfit: round2(r.grossProfit),
    contribution: round2(r.contribution),
    sharePct: totalRevenue > 0 ? Math.round((r.revenue / totalRevenue) * 1000) / 10 : 0,
    grossMarginPct: r.revenue > 0 ? Math.round((r.grossProfit / r.revenue) * 1000) / 10 : null,
  }));
  rows.sort((a, b) => {
    if (a.channel === NOT_RECORDED) return 1;
    if (b.channel === NOT_RECORDED) return -1;
    return b.revenue - a.revenue || a.channel.localeCompare(b.channel);
  });

  return {
    from,
    to,
    rows,
    totalRevenue: round2(totalRevenue),
    totalGrossProfit: round2(rows.reduce((a, r) => a + r.grossProfit, 0)),
    totalContribution: round2(rows.reduce((a, r) => a + r.contribution, 0)),
    totalSales: rows.reduce((a, r) => a + r.sales, 0),
  };
}

// The usual windows the page offers, as ISO dates ending on `today`.
export function salesChannelWindow(today: string, kind: "month" | "last30" | "last90" | "year"): { from: string; to: string } {
  if (kind === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (kind === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  const days = kind === "last30" ? 29 : 89;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return { from: d.toISOString().slice(0, 10), to: today };
}
