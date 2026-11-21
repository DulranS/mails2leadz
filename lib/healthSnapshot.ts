// A tiny daily health summary of one business, for the operator's account list ("who needs a call?").
//
// Why the customer's own app writes it, rather than the server recomputing: the figures (what is overdue, cash
// runway, last month's profit) already exist on the owner's screens, and a second server-side copy of that maths would
// drift from them (see lib/aiBusinessHealth.ts for the same reasoning). So the owner's app writes six plain numbers and
// a date, once a day, when the owner has it open; the admin list reads that one small document. A business whose
// summary is old is itself the finding: nobody has opened the app. Numbers only: no names, no free text.

export interface HealthSnapshot {
  asOf: string; // ISO date the summary was taken
  overdueTotal: number; // owed to the business and past its due date
  overdueCount: number; // invoices past due
  totalOutstanding: number; // everything customers owe, due or not
  runwayMonths: number | null; // months of cash left at the current burn; null = not burning cash
  lastMonth: string | null; // the last complete month, "2026-09"
  lastMonthNetProfit: number | null; // that month's net profit before tax
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const r2 = (n: number) => Math.round(n * 100) / 100;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

export function buildHealthSnapshot(input: {
  today: string;
  overdueTotal: number;
  overdueCount: number;
  totalOutstanding: number;
  runwayMonths: number | null;
  lastMonth: string | null;
  lastMonthNetProfit: number | null;
}): HealthSnapshot {
  return {
    asOf: input.today,
    overdueTotal: r2(Math.max(0, isNum(input.overdueTotal) ? input.overdueTotal : 0)),
    overdueCount: Math.max(0, Math.round(isNum(input.overdueCount) ? input.overdueCount : 0)),
    totalOutstanding: r2(Math.max(0, isNum(input.totalOutstanding) ? input.totalOutstanding : 0)),
    runwayMonths: isNum(input.runwayMonths) && input.runwayMonths >= 0 ? r2(input.runwayMonths) : null,
    lastMonth: typeof input.lastMonth === "string" && MONTH.test(input.lastMonth) ? input.lastMonth : null,
    lastMonthNetProfit: isNum(input.lastMonthNetProfit) ? r2(input.lastMonthNetProfit) : null,
  };
}

// Reads a stored document back, trusting nothing: anything malformed gives null (shown as "no summary yet").
export function readHealthSnapshot(raw: unknown): HealthSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.asOf !== "string" || !DATE.test(o.asOf)) return null;
  return buildHealthSnapshot({
    today: o.asOf,
    overdueTotal: o.overdueTotal as number,
    overdueCount: o.overdueCount as number,
    totalOutstanding: o.totalOutstanding as number,
    runwayMonths: (isNum(o.runwayMonths) ? o.runwayMonths : null) as number | null,
    lastMonth: (typeof o.lastMonth === "string" ? o.lastMonth : null) as string | null,
    lastMonthNetProfit: (isNum(o.lastMonthNetProfit) ? o.lastMonthNetProfit : null) as number | null,
  });
}

export const STALE_AFTER_DAYS = 14;
export const OVERDUE_SHARE_ALERT = 0.5; // half or more of what customers owe is past due
export const RUNWAY_ALERT_MONTHS = 3;

export interface HealthException {
  code: "stale" | "overdue" | "runway" | "loss";
  text: string;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

// What deserves a call, in plain words. Empty = nothing stands out. A missing summary is reported by the caller (the
// account has not produced one yet), not here, since for a brand-new account that is normal.
export function healthExceptions(s: HealthSnapshot, today: string, currency = ""): HealthException[] {
  const out: HealthException[] = [];
  const age = daysBetween(s.asOf, today);
  if (age > STALE_AFTER_DAYS) out.push({ code: "stale", text: `App not opened for ${age} days` });
  if (s.overdueTotal > 0 && s.totalOutstanding > 0 && s.overdueTotal / s.totalOutstanding >= OVERDUE_SHARE_ALERT) {
    out.push({ code: "overdue", text: `${Math.round((s.overdueTotal / s.totalOutstanding) * 100)}% of what customers owe is overdue (${s.overdueCount} invoice${s.overdueCount === 1 ? "" : "s"}${currency ? `, ${currency} ${Math.round(s.overdueTotal).toLocaleString("en-US")}` : ""})` });
  }
  if (s.runwayMonths !== null && s.runwayMonths < RUNWAY_ALERT_MONTHS) out.push({ code: "runway", text: `Cash lasts about ${s.runwayMonths.toFixed(1)} months at the current burn` });
  if (s.lastMonthNetProfit !== null && s.lastMonthNetProfit < 0 && s.lastMonth) out.push({ code: "loss", text: `Loss in ${s.lastMonth}` });
  return out;
}
