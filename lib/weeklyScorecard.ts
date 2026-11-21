// Weekly scorecard: the handful of numbers worth looking at every Monday, this week so far against last week.
//
// "Can the business run without me" starts with being able to see, in ten seconds, whether the week went the right way.
// Everything here is already recorded elsewhere; this only counts it by week (Monday to Sunday):
//   Sales            = money brought in by sales dated in the week, net of returns and discounts (as the profit pages count it)
//   Sales made       = number of sales dated in the week
//   New leads        = leads added in the week
//   New customers    = customers added in the week
//   Cases opened / resolved = support cases by the date they were opened / resolved
//   Feedback answers / average score = customer feedback answers dated in the week (score is empty with no answers)
// Plus two things that are "right now", not weekly: follow-ups past their date, and support cases waiting over 7 days.
// "This week so far" has fewer days than "last week", and the page says so: never read it as a drop until the week ends.
import { addDays, isIsoDate, isoFromEpoch } from "./playbook";

export interface WeekRange {
  thisFrom: string; // Monday of this week
  thisTo: string; // today
  lastFrom: string; // Monday of last week
  lastTo: string; // Sunday of last week
  daysSoFar: number; // 1 (Monday) to 7 (Sunday)
}

export function weekRange(today: string): WeekRange {
  const dow = new Date(today + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  const sinceMonday = (dow + 6) % 7;
  const thisFrom = addDays(today, -sinceMonday);
  return { thisFrom, thisTo: today, lastFrom: addDays(thisFrom, -7), lastTo: addDays(thisFrom, -1), daysSoFar: sinceMonday + 1 };
}

export interface ScorecardInput {
  today: string;
  sales: { date: string; revenue: number }[];
  leads: { createdAt: number; stage: string; nextFollowUpDate?: string }[];
  customers: { createdAt: number }[];
  supportCases: { openedOn: string; resolvedOn?: string; status: string }[];
  feedback: { receivedOn: string; score: number }[];
  toIso?: (ms: number) => string; // epoch ms -> the calendar day where the owner is (default: isoFromEpoch)
}

export type ScorecardKind = "money" | "count" | "score";
export interface ScorecardRow {
  id: "revenue" | "sales" | "leads" | "customers" | "casesOpened" | "casesResolved" | "feedback" | "score";
  label: string;
  kind: ScorecardKind;
  thisWeek: number | null;
  lastWeek: number | null;
}
export interface Scorecard {
  range: WeekRange;
  rows: ScorecardRow[];
  followUpsOverdue: number; // active leads whose follow-up date has passed
  casesWaiting: number; // open support cases older than 7 days
}

const inRange = (d: string, from: string, to: string) => isIsoDate(d) && d >= from && d <= to;
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function buildScorecard(i: ScorecardInput): Scorecard {
  const r = weekRange(i.today);
  const toIso = i.toIso ?? isoFromEpoch;
  const both = <T,>(items: T[], dateOf: (x: T) => string) => ({
    now: items.filter((x) => inRange(dateOf(x), r.thisFrom, r.thisTo)),
    last: items.filter((x) => inRange(dateOf(x), r.lastFrom, r.lastTo)),
  });
  const sales = both(i.sales.filter((s) => Number.isFinite(s.revenue)), (s) => s.date);
  const leads = both(i.leads, (l) => toIso(l.createdAt));
  const customers = both(i.customers, (c) => toIso(c.createdAt));
  const opened = both(i.supportCases, (c) => c.openedOn);
  const resolved = both(i.supportCases.filter((c) => c.status === "resolved" && !!c.resolvedOn), (c) => c.resolvedOn as string);
  const fb = both(i.feedback.filter((f) => Number.isInteger(f.score) && f.score >= 0 && f.score <= 10), (f) => f.receivedOn);
  const sum = (xs: { revenue: number }[]) => money(xs.reduce((a, s) => a + s.revenue, 0));
  const rows: ScorecardRow[] = [
    { id: "revenue", label: "Sales", kind: "money", thisWeek: sum(sales.now), lastWeek: sum(sales.last) },
    { id: "sales", label: "Sales made", kind: "count", thisWeek: sales.now.length, lastWeek: sales.last.length },
    { id: "leads", label: "New leads", kind: "count", thisWeek: leads.now.length, lastWeek: leads.last.length },
    { id: "customers", label: "New customers", kind: "count", thisWeek: customers.now.length, lastWeek: customers.last.length },
    { id: "casesOpened", label: "Support cases opened", kind: "count", thisWeek: opened.now.length, lastWeek: opened.last.length },
    { id: "casesResolved", label: "Support cases resolved", kind: "count", thisWeek: resolved.now.length, lastWeek: resolved.last.length },
    { id: "feedback", label: "Feedback answers", kind: "count", thisWeek: fb.now.length, lastWeek: fb.last.length },
    { id: "score", label: "Average feedback score", kind: "score", thisWeek: avg(fb.now.map((f) => f.score)), lastWeek: avg(fb.last.map((f) => f.score)) },
  ];
  const followUpsOverdue = i.leads.filter((l) => l.stage !== "won" && l.stage !== "lost" && isIsoDate(l.nextFollowUpDate) && (l.nextFollowUpDate as string) < i.today).length;
  const waitCutoff = addDays(i.today, -7);
  const casesWaiting = i.supportCases.filter((c) => c.status === "open" && isIsoDate(c.openedOn) && c.openedOn < waitCutoff).length;
  return { range: r, rows, followUpsOverdue, casesWaiting };
}

// "up 3", "down 120.50", "same", or "" when there is nothing to compare. Percent is only added for money/counts with a base.
export function changeLabel(row: ScorecardRow): string {
  if (row.thisWeek === null || row.lastWeek === null) return "";
  const d = Math.round((row.thisWeek - row.lastWeek) * 100) / 100;
  if (d === 0) return "same as last week";
  return `${d > 0 ? "up" : "down"} ${Math.abs(d)}`;
}
