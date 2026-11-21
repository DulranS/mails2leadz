// The 13-week cash map: the day-by-day cash projection (computeCashRunway) rolled up into weeks, with the weeks
// where cash runs out or gets dangerously thin marked, so the owner sees a squeeze coming and can act before it
// arrives. Pure functions, no I/O: it only re-groups figures the projection already produced.
//
// The projection counts what is KNOWN (invoices coming due, bills, loan instalments, payroll, recurring costs,
// rent) plus the recent daily cash-sales average. It is a planning aid, not a promise.
import type { CashRunwayDay } from "./calculations";

export type CashWeekStatus = "ok" | "tight" | "danger";

export interface CashMapWeek {
  index: number; // 1-based
  start: string; // first day of the week
  end: string; // last day of the week
  opening: number;
  closing: number;
  lowest: number; // the lowest cash balance reached during the week
  lowestDate: string;
  inflow: number;
  outflow: number;
  net: number;
  status: CashWeekStatus; // danger: cash goes below zero. tight: it drops under a week of the bills coming up.
  events: string[]; // what moves cash this week, in date order (sales are not listed, they just drift)
}

export interface CashMap {
  weeks: CashMapWeek[];
  tightBelow: number; // "tight" means under this: about one average week of outgoings
  firstDanger: CashMapWeek | null;
  firstTight: CashMapWeek | null;
  lowestWeek: CashMapWeek | null;
  shortfallAtLow: number; // how much more cash is needed to stay at zero at the lowest point, 0 when never short
}

export function buildCashMap(days: CashRunwayDay[], startingCash: number, maxWeeks = 13): CashMap {
  const weeks: CashMapWeek[] = [];
  const nWeeks = Math.min(Math.max(1, Math.round(maxWeeks)), Math.ceil(days.length / 7));
  const usedDays = days.slice(0, nWeeks * 7);
  const tightBelow = usedDays.length ? usedDays.reduce((t, d) => t + d.outflow, 0) / (usedDays.length / 7) : 0;

  let opening = startingCash;
  for (let w = 0; w < nWeeks; w++) {
    const chunk = days.slice(w * 7, w * 7 + 7);
    if (!chunk.length) break;
    let lowest = Infinity;
    let lowestDate = chunk[0].date;
    for (const d of chunk) if (d.balance < lowest) { lowest = d.balance; lowestDate = d.date; }
    const inflow = chunk.reduce((t, d) => t + d.inflow, 0);
    const outflow = chunk.reduce((t, d) => t + d.outflow, 0);
    const closing = chunk[chunk.length - 1].balance;
    const status: CashWeekStatus = lowest < 0 ? "danger" : tightBelow > 0 && lowest < tightBelow ? "tight" : "ok";
    weeks.push({
      index: w + 1, start: chunk[0].date, end: chunk[chunk.length - 1].date, opening, closing, lowest, lowestDate,
      inflow, outflow, net: closing - opening, status, events: chunk.flatMap((d) => d.events),
    });
    opening = closing;
  }

  const lowestWeek = weeks.reduce<CashMapWeek | null>((m, w) => (m === null || w.lowest < m.lowest ? w : m), null);
  return {
    weeks, tightBelow,
    firstDanger: weeks.find((w) => w.status === "danger") ?? null,
    firstTight: weeks.find((w) => w.status !== "ok") ?? null,
    lowestWeek,
    shortfallAtLow: lowestWeek && lowestWeek.lowest < 0 ? -lowestWeek.lowest : 0,
  };
}
