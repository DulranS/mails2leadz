// Marketing by channel: what each way of finding customers cost, and what it brought back.
//
// Read-only arithmetic over records the business already has. A marketing expense can carry a channel (the same names
// the Leads and Customers pages use for "where did they come from"); this joins that spend to the leads, new customers
// and sales that carry the same channel name. Nothing is written and no figure elsewhere changes.
//
// For each channel, over the last N calendar months including the current one (default 3):
//   spend         = marketing expenses tagged to the channel, counted by month exactly as the P&L counts them
//                   (a one-off lands in its month; a recurring cost lands in every month it is active)
//   leads         = leads created in the window with this source;  won = of those, the ones now Won
//   new customers = customers created in the window with this lead source
//   revenue       = sales in the window that belong to this channel (net of returns and discounts). A sale belongs to the channel
//                   it was made by (its own channel: a booking, a won lead or a sale form that recorded one); a sale with no
//                   channel of its own belongs to the channel of the customer who bought it.
//   contribution  = the profit those sales left after cost of goods and per-sale costs (before rent, wages and the rest)
//   cost per lead = spend / leads                        (only when both are above 0)
//   CAC           = spend / new customers                (only when both are above 0)
//   return        = contribution / spend                 (1.0 means the channel's customers paid for the spend)
//   lifetime value = profit from EVERY sale, any date, to every customer the channel has ever brought, divided by how
//                    many customers it has brought ever (a customer with no sales yet counts as 0, so this is conservative)
//   LTV:CAC       = lifetime value / CAC (this window's CAC; about 3 is the usual healthy mark)
// Channel names match ignoring case and spacing. Spend in the "Marketing" category that has no channel is reported
// separately so it can be tagged, never guessed into a channel.
import type { Customer, Expense, Lead } from "./types";
import { expenseTotalsForMonth, type SaleEconomics } from "./calculations";
import { cleanSaleChannel } from "./salesChannels";

export const DEFAULT_CHANNEL_WINDOW_MONTHS = 3;

export interface ChannelRow {
  channel: string; // as first written
  spend: number;
  leads: number;
  wonLeads: number;
  newCustomers: number;
  revenue: number;
  contribution: number;
  costPerLead: number | null;
  cac: number | null;
  returnOnSpend: number | null; // contribution / spend
  customersEver: number; // every customer this channel has brought, any date
  ltv: number | null; // lifetime profit per customer this channel has brought (after cost of goods and per-sale costs)
  ltvToCac: number | null; // ltv / cac, using this window's CAC
}

export interface ChannelEconomics {
  windowMonths: number;
  months: string[]; // YYYY-MM, oldest first
  rows: ChannelRow[];
  totalSpend: number; // all marketing spend tagged to a channel
  unattributedSpend: number; // "Marketing" category spend with no channel
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const channelKey = (s: string | undefined | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function windowMonthKeys(asOfISO: string, windowMonths: number): string[] {
  const [y, m] = asOfISO.slice(0, 7).split("-").map(Number);
  const keys: string[] = [];
  for (let k = windowMonths - 1; k >= 0; k--) {
    const idx = y * 12 + (m - 1) - k;
    keys.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
  }
  return keys;
}

// Epoch ms of the first moment of the first month in the window, in the person's local time.
function windowStartMs(firstMonth: string): number {
  const [y, m] = firstMonth.split("-").map(Number);
  return new Date(y, m - 1, 1).getTime();
}
function windowEndMs(lastMonth: string): number {
  const [y, m] = lastMonth.split("-").map(Number);
  return new Date(y, m, 1).getTime(); // first moment of the month after
}

export function computeChannelEconomics(args: {
  expenses: Expense[];
  leads: Lead[];
  customers: Customer[];
  sales: { id: string; customer?: string; date: string; saleChannel?: string }[];
  saleEconomics: SaleEconomics[];
  asOfISO: string;
  windowMonths?: number;
}): ChannelEconomics {
  const windowMonths = Math.max(1, Math.min(24, Math.round(args.windowMonths ?? DEFAULT_CHANNEL_WINDOW_MONTHS)));
  const months = windowMonthKeys(args.asOfISO, windowMonths);
  const from = windowStartMs(months[0]);
  const to = windowEndMs(months[months.length - 1]);
  const inWindow = (ms: number) => Number.isFinite(ms) && ms >= from && ms < to;

  const rows = new Map<string, ChannelRow>();
  const row = (label: string): ChannelRow => {
    const k = channelKey(label);
    let r = rows.get(k);
    if (!r) {
      r = { channel: label.trim().replace(/\s+/g, " "), spend: 0, leads: 0, wonLeads: 0, newCustomers: 0, revenue: 0, contribution: 0, costPerLead: null, cac: null, returnOnSpend: null, customersEver: 0, ltv: null, ltvToCac: null };
      rows.set(k, r);
    }
    return r;
  };

  // Spend: group the tagged marketing expenses by channel, then count each group by month the way the P&L does.
  const marketing = args.expenses.filter((e) => e.kind === "expense" && e.category === "Marketing");
  const byChannel = new Map<string, { label: string; list: Expense[] }>();
  const untagged: Expense[] = [];
  for (const e of marketing) {
    const k = channelKey(e.channel);
    if (!k) { untagged.push(e); continue; }
    const g = byChannel.get(k) ?? { label: e.channel as string, list: [] };
    g.list.push(e);
    byChannel.set(k, g);
  }
  let totalSpend = 0;
  for (const g of byChannel.values()) {
    let spend = 0;
    for (const m of months) spend += expenseTotalsForMonth(g.list, m).expenseTotal;
    row(g.label).spend = round2(spend);
    totalSpend += spend;
  }
  let unattributedSpend = 0;
  for (const m of months) unattributedSpend += expenseTotalsForMonth(untagged, m).expenseTotal;

  for (const l of args.leads) {
    if (!channelKey(l.source) || !inWindow(l.createdAt)) continue;
    const r = row(l.source as string);
    r.leads++;
    if (l.stage === "won") r.wonLeads++;
  }

  // All-time figures per channel, for lifetime value. Not limited to the window.
  const lifetime = new Map<string, { customers: number; contribution: number }>();
  const life = (label: string) => {
    const k = channelKey(label);
    let g = lifetime.get(k);
    if (!g) { g = { customers: 0, contribution: 0 }; lifetime.set(k, g); }
    return g;
  };

  const channelOfCustomer = new Map<string, string>(); // customer name key -> channel label
  for (const c of args.customers) {
    if (!channelKey(c.leadSource)) continue;
    channelOfCustomer.set(channelKey(c.name), c.leadSource as string);
    life(c.leadSource as string).customers++;
    if (inWindow(c.createdAt)) row(c.leadSource as string).newCustomers++;
  }

  const econBySale = new Map(args.saleEconomics.map((e) => [e.saleId, e]));
  const monthSet = new Set(months);
  for (const s of args.sales) {
    const econ = econBySale.get(s.id);
    if (!econ) continue;
    // The sale's own channel first; otherwise the channel of the customer who bought it.
    const own = cleanSaleChannel(s.saleChannel);
    const label = own ?? (s.customer ? channelOfCustomer.get(channelKey(s.customer)) : undefined);
    if (!label) continue;
    life(label).contribution += econ.contributionMargin; // every sale, whenever it was made
    if (!monthSet.has(s.date.slice(0, 7))) continue;
    const r = row(label);
    r.revenue += econ.revenue;
    r.contribution += econ.contributionMargin;
  }

  const out: ChannelRow[] = [];
  for (const r of rows.values()) {
    r.spend = round2(r.spend);
    r.revenue = round2(r.revenue);
    r.contribution = round2(r.contribution);
    if (r.spend <= 0 && r.leads === 0 && r.newCustomers === 0 && r.revenue <= 0) continue;
    r.costPerLead = r.spend > 0 && r.leads > 0 ? round2(r.spend / r.leads) : null;
    r.cac = r.spend > 0 && r.newCustomers > 0 ? round2(r.spend / r.newCustomers) : null;
    r.returnOnSpend = r.spend > 0 ? Math.round((r.contribution / r.spend) * 100) / 100 : null;
    const g = lifetime.get(channelKey(r.channel));
    r.customersEver = g?.customers ?? 0;
    r.ltv = g && g.customers > 0 ? round2(g.contribution / g.customers) : null;
    r.ltvToCac = r.ltv !== null && r.cac !== null && r.cac > 0 ? Math.round((r.ltv / r.cac) * 100) / 100 : null;
    out.push(r);
  }
  out.sort((a, b) => b.spend - a.spend || b.revenue - a.revenue || b.leads - a.leads || a.channel.localeCompare(b.channel, undefined, { sensitivity: "base" }));
  return { windowMonths, months, rows: out, totalSpend: round2(totalSpend), unattributedSpend: round2(unattributedSpend) };
}

// One plain sentence per channel with spend, for the card. A channel with no spend is not judged.
export function channelVerdict(r: ChannelRow): "paying" | "not_yet" | "no_customers" | "free" {
  if (r.spend <= 0) return "free";
  if (r.newCustomers === 0 && r.revenue <= 0) return "no_customers";
  return (r.returnOnSpend ?? 0) >= 1 ? "paying" : "not_yet";
}
