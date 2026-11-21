// Customers gone quiet become notifications (lib/notification-automation.ts). Hand-worked cases, then an end-to-end run
// from raw sales through the rhythm calculation to the notification list, then the wiring that must exist.
// Run: /home/claude/.npm-global/bin/tsx scripts/verify-customer-quiet-notifications.ts
import fs from "node:fs";
import {
  generateAllNotifications,
  generateCustomerQuietNotifications,
  MAX_QUIET_CUSTOMER_NOTIFICATIONS,
} from "../lib/notification-automation";
import { computeOrderRhythms, type CustomerRhythm, type RhythmStatus } from "../lib/orderFrequency";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const rhythm = (o: Partial<CustomerRhythm> & { name: string; status: RhythmStatus }): CustomerRhythm => ({
  key: o.name.toLowerCase(),
  orders: 5,
  orderDays: 5,
  firstOrder: "2026-01-01",
  lastOrder: "2026-02-01",
  daysSinceLast: 30,
  typicalGapDays: 10,
  lowConfidence: false,
  expectedNext: "2026-02-11",
  avgOrderValue: 100,
  ...o,
});

// ---- the rule: only "gone quiet" customers are raised -------------------------------------------------------------------
const mixed: CustomerRhythm[] = [
  rhythm({ name: "Kamal", status: "slipping", daysSinceLast: 30 }),
  rhythm({ name: "Nimali", status: "due", daysSinceLast: 12 }),
  rhythm({ name: "Ravi", status: "regular", daysSinceLast: 3 }),
  rhythm({ name: "Sara", status: "new", daysSinceLast: 2, typicalGapDays: null }),
  rhythm({ name: "Tom", status: "one_off", daysSinceLast: 200, typicalGapDays: null }),
];
const out = generateCustomerQuietNotifications(mixed);
ok(out.length === 1 && out[0].title === "Win back Kamal", "only a slipping customer is raised; due-to-reorder, regular, new and one-off are not");
ok(generateCustomerQuietNotifications([]).length === 0, "no customers, no notifications");

// ---- the notification itself ---------------------------------------------------------------------------------------------
const n = out[0];
ok(n.type === "customer_quiet", "type is customer_quiet");
ok(n.entityType === "customer" && n.entityId === "kamal", "points at the customer by its name key");
ok(n.dueDate === "2026-02-01", "dated by the last order, so a lapse is raised once and again only after a new order and lapse");
ok(n.isRead === false, "a new notification starts unread");
ok(n.message === "Last order 30 days ago (2026-02-01). They usually order about every 10 days.", "message says when they last ordered and their usual gap");

// ---- priority: twice the gap is medium, three times or more is high ---------------------------------------------------
const pri = (daysSinceLast: number, typicalGapDays: number | null) =>
  generateCustomerQuietNotifications([rhythm({ name: "P", status: "slipping", daysSinceLast, typicalGapDays })])[0].priority;
ok(pri(20, 10) === "medium", "twice the usual gap is medium");
ok(pri(29, 10) === "medium", "just under three times the gap is still medium");
ok(pri(30, 10) === "high", "three times the usual gap is high");
ok(pri(40, 0) === "medium", "a zero gap never makes it high (no division surprises)");

// ---- wording: singular and plural --------------------------------------------------------------------------------------
const oneDay = generateCustomerQuietNotifications([rhythm({ name: "Z", status: "slipping", daysSinceLast: 1, typicalGapDays: 1 })])[0];
ok(oneDay.message === "Last order 1 day ago (2026-02-01). They usually order about every 1 day.", "a single day reads as a single day");

// ---- order: most overdue first, then by name -----------------------------------------------------------------------------
const ordered = generateCustomerQuietNotifications([
  rhythm({ name: "Beta", status: "slipping", daysSinceLast: 20 }),
  rhythm({ name: "Alpha", status: "slipping", daysSinceLast: 50 }),
  rhythm({ name: "Gamma", status: "slipping", daysSinceLast: 20 }),
]).map((x) => x.title);
ok(ordered.join("|") === "Win back Alpha|Win back Beta|Win back Gamma", "the longest quiet comes first; ties by name");

// ---- the cap: the most overdue are kept ------------------------------------------------------------------------------------
const many: CustomerRhythm[] = Array.from({ length: 25 }, (_, i) => rhythm({ name: `C${String(i).padStart(2, "0")}`, status: "slipping", daysSinceLast: 10 + i }));
const capped = generateCustomerQuietNotifications(many);
ok(MAX_QUIET_CUSTOMER_NOTIFICATIONS === 20 && capped.length === 20, "at most 20 are raised, so the bell is not flooded");
ok(capped[0].title === "Win back C24" && capped[19].title === "Win back C05", "the cap keeps the most overdue 20");

// ---- end to end: raw sales -> rhythms -> all notifications ------------------------------------------------------------------
const sales = [
  // Ana buys every 10 days, then stops. Last order 25 Jan; on 1 Mar that is 35 days, 3.5 times her gap.
  { id: "a1", date: "2026-01-05", customer: "Ana", unitPrice: 50, qty: 1 },
  { id: "a2", date: "2026-01-15", customer: "Ana", unitPrice: 50, qty: 1 },
  { id: "a3", date: "2026-01-25", customer: "Ana", unitPrice: 50, qty: 1 },
  // Bo buys every 5 days and was in last 4 days ago: regular, not raised.
  { id: "b1", date: "2026-02-20", customer: "Bo", unitPrice: 20, qty: 1 },
  { id: "b2", date: "2026-02-25", customer: "Bo", unitPrice: 20, qty: 1 },
  { id: "b3", date: "2026-02-25", customer: "Bo", unitPrice: 20, qty: 1 },
];
const rhythms = computeOrderRhythms(sales, "2026-03-01");
const ana = rhythms.find((r) => r.name === "Ana")!;
const bo = rhythms.find((r) => r.name === "Bo")!;
ok(ana.status === "slipping" && ana.daysSinceLast === 35 && ana.typicalGapDays === 10, "rhythm: Ana is slipping, 35 days since her last order, usual gap 10");
ok(bo.status === "regular", "rhythm: Bo is regular, not raised");

const all = generateAllNotifications({
  receivables: [], payables: [], bills: [], products: [], ledgers: new Map(), eoqByProduct: new Map(),
  expenses: [], loans: [], projectBudgetAlerts: [], milestoneReminders: [], leads: [],
  customerRhythms: rhythms,
} as unknown as Parameters<typeof generateAllNotifications>[0]);
const quiet = all.filter((x) => x.type === "customer_quiet");
ok(quiet.length === 1 && quiet[0].title === "Win back Ana" && quiet[0].priority === "high", "end to end: Ana is raised once, as high priority, and Bo is not");
const noRhythms = generateAllNotifications({
  receivables: [], payables: [], bills: [], products: [], ledgers: new Map(), eoqByProduct: new Map(),
  expenses: [], loans: [], projectBudgetAlerts: [], milestoneReminders: [], leads: [],
} as unknown as Parameters<typeof generateAllNotifications>[0]);
ok(noRhythms.every((x) => x.type !== "customer_quiet"), "without rhythms nothing is raised, so existing callers are unchanged");

// ---- wiring --------------------------------------------------------------------------------------------------------------
const types = fs.readFileSync("lib/types.ts", "utf8");
ok(/\| "customer_quiet"/.test(types), "the notification type exists in lib/types.ts");
const page = fs.readFileSync("app/notifications/page.tsx", "utf8");
ok(page.includes('customer_quiet: "Customer gone quiet"'), "the Notifications page has a label for it (the label map must be complete)");
const ctx = fs.readFileSync("contexts/NotificationsContext.tsx", "utf8");
ok(ctx.includes("customerRhythms: computeOrderRhythms(sales, todayIso())"), "the context passes this business's order rhythms in");
ok(/\n    sales,\n    bookings,\n    notifications,\n  \]\);/.test(ctx), "the context re-runs when sales change");
ok(/n\.type === "customer_quiet"/.test(ctx), "the dedupe key includes the last-order date for this type");

console.log(fails === 0 ? `OK: ${checks} checks passed` : `${fails} of ${checks} checks FAILED`);
process.exit(fails === 0 ? 0 : 1);
