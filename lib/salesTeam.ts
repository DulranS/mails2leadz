// Sales team scorecard (v202b): each salesperson's revenue, orders, order value and lead conversion over the last 30 days, against the
// monthly revenue target the owner sets for them. Worked out from the sales (attributed to whoever recorded them) and the leads (attributed
// to their owner). Pure: the caller passes the records, the targets and today.
export interface SalesTeamRow {
  key: string; // the person's id, or "unassigned"
  name: string;
  revenue30: number;
  orders30: number;
  averageOrder: number | null;
  leads30: number; // leads that came in over the last 30 days and are theirs
  won30: number;
  conversionPct: number | null;
  target: number | null; // monthly revenue target
  attainmentPct: number | null; // revenue over the last 30 days as a share of the monthly target
  behind: boolean; // a target is set and attainment is under the threshold
}

export const BEHIND_TARGET_BELOW_PCT = 70;
const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function salesTeamFor(
  sales: { id: string; date: string; qty: number; unitPrice: number; invoiceId?: string; createdByUid?: string; createdByName?: string }[],
  leads: { createdAt: number; stage: string; ownerUid?: string; ownerName?: string }[],
  targets: Record<string, number> | undefined,
  today: string,
  nowMs: number,
): SalesTeamRow[] {
  const from = addDays(today, -29);
  type Acc = { name: string; revenue: number; orders: Set<string>; leads: number; won: number };
  const people = new Map<string, Acc>();
  const get = (key: string, name: string) => {
    if (!people.has(key)) people.set(key, { name, revenue: 0, orders: new Set(), leads: 0, won: 0 });
    return people.get(key)!;
  };
  for (const s of sales) {
    const value = s.qty * s.unitPrice;
    if (!(value > 0) || s.date < from || s.date > today) continue;
    const key = s.createdByUid ?? "unassigned";
    const a = get(key, s.createdByName ?? "Not recorded against a person");
    a.revenue += value;
    a.orders.add(s.invoiceId ?? s.id);
  }
  const fromMs = nowMs - 30 * DAY;
  for (const l of leads) {
    if (l.createdAt < fromMs || l.createdAt > nowMs) continue;
    const key = l.ownerUid ?? "unassigned";
    const a = get(key, l.ownerName ?? "Not recorded against a person");
    a.leads += 1;
    if (l.stage === "won") a.won += 1;
  }
  const rows: SalesTeamRow[] = [...people.entries()].map(([key, a]) => {
    const target = key !== "unassigned" && targets && typeof targets[key] === "number" && targets[key] > 0 ? targets[key] : null;
    const attainment = target === null ? null : r1((a.revenue / target) * 100);
    return {
      key,
      name: a.name,
      revenue30: Math.round(a.revenue * 100) / 100,
      orders30: a.orders.size,
      averageOrder: a.orders.size ? Math.round((a.revenue / a.orders.size) * 100) / 100 : null,
      leads30: a.leads,
      won30: a.won,
      conversionPct: a.leads ? r1((a.won / a.leads) * 100) : null,
      target,
      attainmentPct: attainment,
      behind: attainment !== null && attainment < BEHIND_TARGET_BELOW_PCT,
    };
  });
  return rows.sort((x, y) => Number(y.behind) - Number(x.behind) || (x.attainmentPct ?? 999) - (y.attainmentPct ?? 999) || y.revenue30 - x.revenue30);
}
