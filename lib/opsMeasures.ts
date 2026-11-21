// Automatic operations measures (v240): the KPIs a business needs to run well, worked out from the records the app already holds, so a KPI can
// follow one of them and nobody types the figure in. Each returns null when there is nothing to measure yet, so an empty measure never shows as
// zero. Pure: the caller passes the records and today.
import { deliveryPromises } from "./deliveryPromise";
import { calendarSummary, type Obligation } from "./obligations";
import { improvementSummary, type Improvement } from "./feedbackLoops";
import { pipelineSummary, type Candidate } from "./recruiting";

export type OpsMeasureKey = "customer_on_time_pct" | "supplier_on_time_pct" | "staff_turnover_pct" | "overdue_obligations" | "overdue_improvements" | "avg_time_to_hire_days";

export const OPS_MEASURES: { key: OpsMeasureKey; label: string; unit: string; blurb: string; lowerIsBetter: boolean }[] = [
  { key: "customer_on_time_pct", label: "Customer deliveries on time (%)", unit: "%", blurb: "Delivered orders that arrived by their promised day, as a share of those with a promise.", lowerIsBetter: false },
  { key: "supplier_on_time_pct", label: "Supplier deliveries on time (%)", unit: "%", blurb: "Received purchase orders that arrived by the expected day, as a share of those with one.", lowerIsBetter: false },
  { key: "staff_turnover_pct", label: "Staff turnover, last 12 months (%)", unit: "%", blurb: "People who left in the last year, as a share of everyone employed in that time.", lowerIsBetter: true },
  { key: "overdue_obligations", label: "Overdue filings and renewals (count)", unit: "", blurb: "Deadlines on the obligations calendar that have passed without being marked done.", lowerIsBetter: true },
  { key: "overdue_improvements", label: "Overdue changes from feedback (count)", unit: "", blurb: "Changes raised from customers and the team that are past their day.", lowerIsBetter: true },
  { key: "avg_time_to_hire_days", label: "Average time to hire (days)", unit: "days", blurb: "Days from application to being hired, averaged over the hires made.", lowerIsBetter: true },
];

const DAY = 86_400_000;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export function computeOpsMeasures(i: {
  webOrders: { status: string; promisedDate?: string; deliveredOn?: string; customerName: string }[];
  purchaseOrders: { status: string; expectedDate?: string; receivedDate?: string }[];
  employees: { endDate?: string; active: boolean }[];
  obligations: Obligation[];
  improvements: Improvement[];
  candidates: Candidate[];
  todayIso: string;
}): Record<OpsMeasureKey, number | null> {
  const promises = deliveryPromises(i.webOrders as never, i.todayIso);
  const received = i.purchaseOrders.filter((o) => o.status === "received" && o.expectedDate && o.receivedDate);
  const supplierOnTime = received.filter((o) => (o.receivedDate as string) <= (o.expectedDate as string)).length;
  const windowStart = Date.parse(`${i.todayIso}T00:00:00Z`) - 365 * DAY;
  const leavers = i.employees.filter((e) => e.endDate && Date.parse(`${e.endDate}T00:00:00Z`) >= windowStart && Date.parse(`${e.endDate}T00:00:00Z`) <= Date.parse(`${i.todayIso}T00:00:00Z`)).length;
  const headcount = i.employees.filter((e) => e.active).length + leavers;
  const hiring = pipelineSummary(i.candidates, i.todayIso);
  return {
    customer_on_time_pct: promises.delivered.length ? pct(promises.onTime, promises.delivered.length) : null,
    supplier_on_time_pct: received.length ? pct(supplierOnTime, received.length) : null,
    staff_turnover_pct: headcount > 0 ? pct(leavers, headcount) : null,
    overdue_obligations: calendarSummary(i.obligations, i.todayIso).overdue,
    overdue_improvements: improvementSummary(i.improvements, i.todayIso).overdue.length,
    avg_time_to_hire_days: hiring.averageTimeToHireDays,
  };
}
