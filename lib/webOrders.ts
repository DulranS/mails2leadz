// Web orders (v183): an order placed on the business's own website or shop platform (through Zapier, Make or n8n, with the lead API
// key) arrives in a queue. Nothing is recorded as a sale until the owner confirms it; confirming records one sale per line through the
// same path as any other sale, so stock and money follow the usual rules. Pure: no I/O.
export const MAX_ORDER_LINES = 50;
export const WEB_ORDER_STATUSES = ["new", "confirmed", "declined"] as const;

export interface WebOrderLineInput {
  name: string; // what the customer ordered, as the shop names it
  sku?: string;
  qty: number;
  unitPrice?: number;
}

export interface WebOrderInput {
  externalId: string;
  customerName: string;
  customerAddress?: string; // where the goods go (optional): used for delivery runs
  contact?: string;
  note?: string;
  placedOn: string;
  promisedDate?: string; // the day the customer was promised their goods (optional; the shop sends it when it has one)
  lines: WebOrderLineInput[];
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
// A real calendar day, round-tripped so 30 February is refused (the date parser would roll it over).
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(Date.parse(`${s}T00:00:00Z`)).toISOString().slice(0, 10) === s;

export function cleanWebOrder(body: Record<string, unknown>, today: string): { ok: true; value: WebOrderInput } | { ok: false; error: string } {
  const externalId = clip(body.externalId, 120);
  if (externalId.length < 2) return { ok: false, error: "Send the order's number as externalId, so a retried order is not recorded twice." };
  const customerName = clip(body.customerName, 120) || "Web customer";
  const placedOn = clip(body.placedOn, 10) || today;
  if (!isDay(placedOn)) return { ok: false, error: "The date the order was placed is not a valid date." };
  const addressRaw = clip(body.customerAddress, 300);
  const promisedRaw = clip(body.promisedDate, 10);
  if (promisedRaw && !isDay(promisedRaw)) return { ok: false, error: "The promised delivery date is not a valid date." };
  if (!Array.isArray(body.lines) || body.lines.length === 0) return { ok: false, error: "The order needs at least one line." };
  if (body.lines.length > MAX_ORDER_LINES) return { ok: false, error: `An order can have at most ${MAX_ORDER_LINES} lines.` };
  const lines: WebOrderLineInput[] = [];
  for (const raw of body.lines as Record<string, unknown>[]) {
    const name = clip(raw?.name, 150);
    const qty = Number(raw?.qty);
    if (!name) return { ok: false, error: "Every line needs the name of what was ordered." };
    if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return { ok: false, error: `The quantity for "${name}" must be a whole number of at least 1.` };
    const unitPrice = raw?.unitPrice === undefined || raw?.unitPrice === null || raw?.unitPrice === "" ? undefined : Number(raw.unitPrice);
    if (unitPrice !== undefined && (!Number.isFinite(unitPrice) || unitPrice < 0)) return { ok: false, error: `The price for "${name}" is not a valid amount.` };
    lines.push({ name, sku: clip(raw?.sku, 80) || undefined, qty, unitPrice });
  }
  return {
    ok: true,
    value: {
      externalId,
      customerName,
      contact: clip(body.contact, 200) || undefined,
      note: clip(body.note, 1000) || undefined,
      placedOn,
      promisedDate: promisedRaw || undefined,
      customerAddress: addressRaw || undefined,
      lines,
    },
  };
}

// Match each ordered line to a product: by sku or barcode first, then by name (ignoring case and spaces). Unmatched lines stay
// unmatched; the order cannot be confirmed until every line has a product.
export function matchLines(
  lines: WebOrderLineInput[],
  products: { id: string; name: string; sku?: string; barcode?: string; price?: number }[],
): { productId?: string; name: string; qty: number; unitPrice?: number }[] {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  return lines.map((l) => {
    const bySku = l.sku
      ? products.find((p) => (p.sku && norm(p.sku) === norm(l.sku as string)) || (p.barcode && norm(p.barcode) === norm(l.sku as string)))
      : undefined;
    const byName = products.find((p) => norm(p.name) === norm(l.name));
    const hit = bySku ?? byName;
    return { productId: hit?.id, name: l.name, qty: l.qty, unitPrice: l.unitPrice ?? hit?.price };
  });
}

export function orderTotal(lines: { qty: number; unitPrice?: number }[]): number {
  return Math.round(lines.reduce((t, l) => t + l.qty * (l.unitPrice ?? 0), 0) * 100) / 100;
}

export function confirmProblem(order: { status: string; lines: { productId?: string }[] }): string | null {
  if (order.status !== "new") return "This order has already been dealt with.";
  if (order.lines.some((l) => !l.productId)) return "Some lines don't match a product yet. Match them, or decline the order.";
  return null;
}
