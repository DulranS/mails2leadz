// Customer outreach: who to contact this week, and what to say. Pure: segments, birthdays, message text and the consent rule.
// Nothing here sends anything. The page opens the owner's own WhatsApp or email with the text filled in, and the owner presses send.
// Marketing messages go only to customers who agreed to offers (marketingOptIn). A customer who has not agreed can still be
// contacted about an order, but never with an offer, and the page says so.

export type OutreachSegment = "lapsed" | "birthdays" | "top" | "new" | "review" | "referrers";

export const SEGMENT_LABEL: Record<OutreachSegment, string> = {
  lapsed: "Lapsed: not bought for a while",
  birthdays: "Birthdays coming up",
  top: "Top customers by spend",
  new: "New: first purchase recently",
  review: "Bought recently: ask for a review",
  referrers: "Referrers: thank the people who sent you customers",
};

export interface OutreachCustomer {
  id: string;
  name: string;
  contact?: string;
  marketingOptIn?: boolean;
  birthday?: string; // YYYY-MM-DD or MM-DD. Only the day and month are used.
  lastContactedAt?: string; // ISO day the owner last messaged them
  referredBy?: string; // the customer name this one was referred by
  reviewRequestedAt?: string; // ISO day a review was last asked for
}

export interface OutreachSale {
  customer?: string;
  date: string;
  qty: number;
  unitPrice: number;
}

export interface OutreachOptions {
  lapsedDays?: number; // default 60
  birthdayDays?: number; // default 14: birthdays today through this many days ahead
  topN?: number; // default 10
  newDays?: number; // default 30
  recentlyContactedDays?: number; // default 7: skip anyone messaged this recently
  reviewWindowDays?: number; // default 14: bought within this many days, so the request is still fresh
  reviewCooldownDays?: number; // default 60: do not ask the same person for a review again this soon
}

export interface OutreachRow {
  customerId: string;
  name: string;
  contact: string;
  consented: boolean;
  reason: string;
  revenue: number;
  lastBought?: string;
  orders: number;
  contactedRecently: boolean;
}

export const MAX_MESSAGE_LENGTH = 600;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const key = (s: string) => s.trim().toLowerCase();
const round2 = (n: number) => Math.round(n * 100) / 100;

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(...(fromIso.split("-").map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))) as [number, number, number]));
  const b = Date.UTC(...(toIso.split("-").map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))) as [number, number, number]));
  return Math.round((b - a) / 86_400_000);
}

// Days from today until the next birthday (0 = today). Null when the birthday is not a usable month and day.
export function daysUntilBirthday(birthday: string | undefined, today: string): number | null {
  const m = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec((birthday ?? "").trim());
  if (!m || !ISO_DAY.test(today)) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = Number(today.slice(0, 4));
  let next = `${year}-${m[1]}-${m[2]}`;
  if (next < today) next = `${year + 1}-${m[1]}-${m[2]}`;
  // Feb 29 falls on Feb 28 in a year without one; keep it simple and accept the 29th as typed.
  return daysBetween(today, next);
}

// Customers in one segment, most relevant first. Names are matched the same way the rest of the app matches them.
export function segmentCustomers(
  customers: OutreachCustomer[],
  sales: OutreachSale[],
  today: string,
  segment: OutreachSegment,
  opts: OutreachOptions = {}
): OutreachRow[] {
  const lapsedDays = opts.lapsedDays ?? 60;
  const birthdayDays = opts.birthdayDays ?? 14;
  const topN = opts.topN ?? 10;
  const newDays = opts.newDays ?? 30;
  const recentDays = opts.recentlyContactedDays ?? 7;

  const byName = new Map<string, { revenue: number; orders: number; last?: string; first?: string }>();
  for (const s of sales) {
    if (!s.customer || !ISO_DAY.test(s.date)) continue;
    const k = key(s.customer);
    const t = byName.get(k) ?? { revenue: 0, orders: 0 };
    t.revenue += (s.qty ?? 0) * (s.unitPrice ?? 0);
    t.orders += 1;
    if (!t.last || s.date > t.last) t.last = s.date;
    if (!t.first || s.date < t.first) t.first = s.date;
    byName.set(k, t);
  }

  if (segment === "referrers") {
    const counts = new Map<string, number>();
    for (const c of customers) {
      const from = key(c.referredBy ?? "");
      if (from) counts.set(from, (counts.get(from) ?? 0) + 1);
    }
    return customers
      .filter((c) => (counts.get(key(c.name)) ?? 0) > 0)
      .map((c) => {
        const n = counts.get(key(c.name)) ?? 0;
        const sale = byName.get(key(c.name));
        const row: OutreachRow = {
          customerId: c.id,
          name: c.name,
          contact: c?.contact?.trim() ?? "",
          consented: c.marketingOptIn === true,
          revenue: round2(sale?.revenue ?? 0),
          lastBought: sale?.last,
          orders: sale?.orders ?? 0,
          contactedRecently: !!c.lastContactedAt && ISO_DAY.test(c.lastContactedAt) && daysBetween(c.lastContactedAt, today) < recentDays,
          reason: `Sent ${n} customer${n === 1 ? "" : "s"} your way`,
        };
        return { row, n };
      })
      .sort((a, b) => b.n - a.n || a.row.name.localeCompare(b.row.name))
      .map((x) => x.row);
  }

  const reviewWindow = opts.reviewWindowDays ?? 14;
  const reviewCooldown = opts.reviewCooldownDays ?? 60;
  const rows: OutreachRow[] = [];
  for (const c of customers) {
    const sale = byName.get(key(c.name));
    if (segment === "review") {
      if (!sale?.last) continue;
      const since = daysBetween(sale.last, today);
      if (since < 0 || since > reviewWindow) continue;
      if (c.reviewRequestedAt && ISO_DAY.test(c.reviewRequestedAt) && daysBetween(c.reviewRequestedAt, today) < reviewCooldown) continue;
      rows.push({
        customerId: c.id,
        name: c.name,
        contact: c?.contact?.trim() ?? "",
        consented: c.marketingOptIn === true,
        revenue: round2(sale.revenue),
        lastBought: sale.last,
        orders: sale.orders,
        contactedRecently: !!c.lastContactedAt && ISO_DAY.test(c.lastContactedAt) && daysBetween(c.lastContactedAt, today) < recentDays,
        reason: since === 0 ? "Bought today" : `Bought ${since} day${since === 1 ? "" : "s"} ago`,
      });
      continue;
    }
    const contacted = !!c.lastContactedAt && ISO_DAY.test(c.lastContactedAt) && daysBetween(c.lastContactedAt, today) < recentDays;
    const base = {
      customerId: c.id,
      name: c.name,
      contact: c?.contact?.trim() ?? "",
      consented: c.marketingOptIn === true,
      revenue: round2(sale?.revenue ?? 0),
      lastBought: sale?.last,
      orders: sale?.orders ?? 0,
      contactedRecently: contacted,
    };
    if (segment === "lapsed") {
      if (!sale?.last) continue;
      const days = daysBetween(sale.last, today);
      if (days < lapsedDays) continue;
      rows.push({ ...base, reason: `Last bought ${days} days ago (${sale.orders} order${sale.orders === 1 ? "" : "s"})` });
    } else if (segment === "birthdays") {
      const d = daysUntilBirthday(c.birthday, today);
      if (d === null || d > birthdayDays) continue;
      rows.push({ ...base, reason: d === 0 ? "Birthday today" : `Birthday in ${d} day${d === 1 ? "" : "s"}` });
    } else if (segment === "new") {
      if (!sale?.first) continue;
      if (daysBetween(sale.first, today) > newDays || daysBetween(sale.first, today) < 0) continue;
      rows.push({ ...base, reason: `First order ${daysBetween(sale.first, today)} days ago` });
    }
  }

  if (segment === "top") {
    return [...customers]
      .map((c) => ({ c, sale: byName.get(key(c.name)) }))
      .filter((x) => (x.sale?.revenue ?? 0) > 0)
      .sort((a, b) => b.sale!.revenue - a.sale!.revenue || a.c.name.localeCompare(b.c.name))
      .slice(0, topN)
      .map(({ c, sale }) => ({
        customerId: c.id,
        name: c.name,
        contact: c?.contact?.trim() ?? "",
        consented: c.marketingOptIn === true,
        revenue: round2(sale!.revenue),
        lastBought: sale!.last,
        orders: sale!.orders,
        contactedRecently: !!c.lastContactedAt && ISO_DAY.test(c.lastContactedAt) && daysBetween(c.lastContactedAt, today) < recentDays,
        reason: `Spent ${round2(sale!.revenue)} over ${sale!.orders} order${sale!.orders === 1 ? "" : "s"}`,
      }));
  }

  if (segment === "review") return rows.sort((a, b) => (b.lastBought ?? "").localeCompare(a.lastBought ?? "") || a.name.localeCompare(b.name));
  return rows.sort((a, b) => (a.lastBought ?? "").localeCompare(b.lastBought ?? "") || a.name.localeCompare(b.name));
}

// A short post for social media: the offer, the business, and the review link. Trimmed to a length most platforms accept.
export function socialCaption(params: { business: string; offer?: string; reviewLink?: string }): string {
  const parts = [
    params.offer?.trim() ? `${params.offer.trim()}.` : "",
    `Thank you for choosing ${params.business.trim() || "us"}.`,
    params.reviewLink?.trim() ? `Tell us how we did: ${params.reviewLink.trim()}` : "",
  ].filter(Boolean);
  return parts.join(" ").replace(/ +([.,!?])/g, "$1").slice(0, 2000);
}

export interface MessageFill {
  name: string;
  business: string;
  offer?: string;
  review?: string; // the review link (Settings > reviewLink)
}

// Fills the placeholders. Unknown placeholders are left out, so a customer never sees "{offer}" in a message.
export function renderMessage(template: string, fill: MessageFill): string {
  const first = (fill.name ?? "").trim().split(/\s+/)[0] || "there";
  const text = template
    .replace(/\{name\}/g, first)
    .replace(/\{business\}/g, fill.business.trim() || "us")
    .replace(/\{offer\}/g, (fill.offer ?? "").trim())
    .replace(/\{review\}/g, (fill.review ?? "").trim())
    .replace(/\{[a-zA-Z_]+\}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,!?])/g, "$1")
    .trim();
  return text.slice(0, MAX_MESSAGE_LENGTH);
}

export const DEFAULT_TEMPLATES: { key: string; label: string; text: string; needsConsent: boolean }[] = [
  { key: "lapsed", label: "We miss you", text: "Hi {name}, it's been a while since we saw you at {business}. {offer}", needsConsent: true },
  { key: "birthday", label: "Birthday wish", text: "Happy birthday, {name}! Thank you for being with {business}. {offer}", needsConsent: true },
  { key: "thanks", label: "Thank you", text: "Hi {name}, thank you for ordering from {business}. Let us know if there is anything we can do.", needsConsent: false },
  { key: "new", label: "Welcome", text: "Hi {name}, welcome to {business}! We are glad you chose us. {offer}", needsConsent: true },
  { key: "review", label: "Ask for a review", text: "Hi {name}, thank you for your order at {business}. If you enjoyed it, we would really appreciate a review: {review}", needsConsent: false },
  { key: "referrer", label: "Thank a referrer", text: "Hi {name}, thank you for sending friends our way. It means a lot to {business}.", needsConsent: false },
];

// Whether a template may be sent to this row: offers only to customers who agreed.
export function canSendTemplate(
  template: { needsConsent: boolean; text?: string },
  row: { consented: boolean; contact: string },
  ctx: { reviewLink?: string } = {}
): { ok: boolean; reason?: string } {
  if (template.text?.includes("{review}") && !(ctx.reviewLink ?? "").trim()) {
    return { ok: false, reason: "Add your review link above first (Settings > review link)." };
  }
  if (!row.contact) return { ok: false, reason: "No phone or email saved for this customer." };
  if (template.needsConsent && !row.consented) return { ok: false, reason: "They have not agreed to offers. Send a message about an order instead." };
  return { ok: true };
}
