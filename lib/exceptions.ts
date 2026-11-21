// Exception-based management (v192b): normal activity is left alone; only the deviations are raised. These are the financial ones
// that an owner would otherwise have to go looking for: a large price change, and a bill or payable overdue for longer than a week.
// Thresholds are fixed and listed here so the owner can see what counts. Pure.
import { dayDiff } from "./operations";
import type { Escalation, Severity } from "./escalations";

export const PRICE_CHANGE_ALERT_PCT = 10; // a price moved by this much or more, within the window, is an exception
export const PRICE_WINDOW_DAYS = 30;
export const PAYABLE_OVERDUE_DAYS = 7; // a payable overdue by more than this many days is an exception
// Sales: the last seven days against the average week of the four weeks before. A drop of this much or more is an exception.
export const SALES_DROP_ALERT_PCT = 40;
export const SALES_BASELINE_WEEKS = 4;
export const SALES_BASELINE_MIN_DAYS_WITH_SALES = 8; // fewer selling days than this in the baseline and there is nothing reliable to compare with

export interface FinancialExceptionSources {
  priceChanges: { productName: string; field: string; oldValue?: number; newValue?: number; changedAt: number }[];
  payables: { supplier?: string; payee?: string; dueDate: string; amountOutstanding: number }[];
  sales?: { date: string; qty: number; unitPrice: number }[];
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// The sales drop exception: the last seven days (today included) against the average week of the baseline weeks before them.
export function salesDropException(sales: { date: string; qty: number; unitPrice: number }[], today: string): Escalation | null {
  const weekStart = addDays(today, -6);
  const baseStart = addDays(today, -6 - 7 * SALES_BASELINE_WEEKS);
  const baseEnd = addDays(today, -7);
  let recent = 0, baseline = 0, baseDays = new Set<string>();
  for (const s of sales) {
    const value = s.qty * s.unitPrice;
    if (!(value > 0)) continue;
    if (s.date >= weekStart && s.date <= today) recent += value;
    else if (s.date >= baseStart && s.date <= baseEnd) { baseline += value; baseDays.add(s.date); }
  }
  if (baseDays.size < SALES_BASELINE_MIN_DAYS_WITH_SALES) return null;
  const averageWeek = baseline / SALES_BASELINE_WEEKS;
  if (averageWeek <= 0) return null;
  const dropPct = ((averageWeek - recent) / averageWeek) * 100;
  if (dropPct < SALES_DROP_ALERT_PCT) return null;
  const severity: Severity = dropPct >= 60 ? "high" : dropPct >= 50 ? "medium" : "low";
  return {
    area: "Sales",
    title: `Sales down ${Math.round(dropPct)}% this week against the average of the last ${SALES_BASELINE_WEEKS} weeks`,
    dueOn: today,
    daysLate: 0,
    severity,
  };
}

export function financialExceptions(s: FinancialExceptionSources, today: string, nowMs: number, currency = ""): Escalation[] {
  const out: Escalation[] = [];
  for (const c of s.priceChanges) {
    if (typeof c.oldValue !== "number" || typeof c.newValue !== "number" || c.oldValue === 0) continue;
    if (nowMs - c.changedAt > PRICE_WINDOW_DAYS * 86_400_000) continue;
    const pct = Math.abs(((c.newValue - c.oldValue) / c.oldValue) * 100);
    if (pct < PRICE_CHANGE_ALERT_PCT) continue;
    const severity: Severity = pct >= 50 ? "high" : pct >= 20 ? "medium" : "low";
    out.push({
      area: "Prices",
      title: `${c.productName}: ${c.field} price ${c.newValue > c.oldValue ? "up" : "down"} ${Math.round(pct)}% (${c.oldValue} to ${c.newValue}${currency ? ` ${currency}` : ""})`,
      dueOn: new Date(c.changedAt).toISOString().slice(0, 10),
      daysLate: 0,
      severity,
    });
  }
  for (const p of s.payables) {
    const late = dayDiff(p.dueDate, today);
    if (late <= PAYABLE_OVERDUE_DAYS || !(p.amountOutstanding > 0)) continue;
    const severity: Severity = late >= 30 ? "high" : late >= 14 ? "medium" : "low";
    out.push({
      area: "Payables",
      title: `${p.supplier ?? p.payee ?? "Bill"}: ${p.amountOutstanding.toLocaleString("en-US")}${currency ? ` ${currency}` : ""} overdue`,
      dueOn: p.dueDate,
      daysLate: late,
      severity,
    });
  }
  if (s.sales) {
    const drop = salesDropException(s.sales, today);
    if (drop) out.push(drop);
  }
  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.daysLate - a.daysLate);
}
