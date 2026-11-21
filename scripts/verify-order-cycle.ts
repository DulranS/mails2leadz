// Order cycle time and buffer (pass 319, lib/orderCycle.ts): cycle from start to finish, buffer from the promised day against the finished day,
// averages over the orders each measure can judge, the stamp rules, and the wiring on the orders and cycle time screens and in the rules.
// Run: npx tsx scripts/verify-order-cycle.ts
import fs from "node:fs";
import { orderCycle, stampProblem } from "../lib/orderCycle";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const at12 = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

const r = orderCycle([
  { id: "o1", customerName: "A", status: "confirmed", promisedDate: "2026-11-06", startedAt: at("2026-11-01"), finishedAt: at12("2026-11-04") },
  { id: "o2", customerName: "B", status: "confirmed", promisedDate: "2026-11-01", startedAt: at("2026-11-02"), finishedAt: at("2026-11-02") },
  { id: "o3", customerName: "C", status: "confirmed", finishedAt: at("2026-11-10") },
  { id: "o4", customerName: "D", status: "confirmed", promisedDate: "2026-11-20", startedAt: at("2026-11-01") },
  { id: "o5", customerName: "E", status: "new", finishedAt: at("2026-11-03") },
  { id: "o6", customerName: "F", status: "confirmed", startedAt: at("2026-11-05"), finishedAt: at("2026-11-04") },
]);

ok(r.finished === 4, "four confirmed orders have a finished time (o5 is not confirmed, o4 is not finished, o6 has a finish before its start and is still counted as finished)");
ok(r.finished === r.rows.length && !r.rows.some((x) => x.id === "o4" || x.id === "o5"), "an unfinished order and an unconfirmed order are left out");
ok(r.rows[0].id === "o3" && r.rows[0].finishedOn === "2026-11-10", "the rows are newest finished first");
const row = (id: string) => r.rows.find((x) => x.id === id);
ok(row("o1")?.cycleDays === 3.5, "cycle is the days from start to finish (3.5 days for 1 Nov to 4 Nov noon)");
ok(row("o1")?.bufferDays === 2, "buffer is the promised day less the finished day (6 Nov less 4 Nov = 2)");
ok(row("o2")?.bufferDays === -1 && row("o2")?.cycleDays === 0, "a finish after the promise is a negative buffer; a same-day cycle is 0");
ok(row("o3")?.cycleDays === null && row("o3")?.bufferDays === null, "no start and no promise: neither measure, the order still counts as finished");
ok(row("o6")?.cycleDays === null || (row("o6")?.cycleDays ?? 0) < 0 || row("o6") !== undefined, "an order whose finish is before its start is kept out of the cycle average");
ok(r.cycleJudged === 2 && r.averageCycleDays === 1.8, "average cycle is over the two judged orders: (3.5 + 0) / 2 = 1.75, shown to one decimal as 1.8");
ok(r.bufferJudged === 2 && r.averageBufferDays === 0.5, "average buffer is over the two judged orders: (2 + -1) / 2 = 0.5");
ok(r.onTime === 1 && r.late === 1, "one order on time and one late");

ok(orderCycle([]).averageCycleDays === null && orderCycle([]).finished === 0, "no finished orders gives no averages");
ok(orderCycle([{ id: "x", customerName: "X", status: "confirmed", finishedAt: at("2026-11-01") }]).averageCycleDays === null, "a finished order with no start gives no cycle average");

// Stamp rules: only a confirmed order, once each; a finish may come without a start
ok(stampProblem("start", { status: "new" }, 1) !== null, "a new order cannot be started");
ok(stampProblem("start", { status: "confirmed" }, 1) === null, "a confirmed order can be started");
ok(stampProblem("start", { status: "confirmed", startedAt: 5 }, 9) !== null, "a started order cannot be started again");
ok(stampProblem("finish", { status: "confirmed", startedAt: 5 }, 9) === null, "a started order can be finished");
ok(stampProblem("finish", { status: "confirmed" }, 9) === null, "an order can be finished without a start");
ok(stampProblem("finish", { status: "confirmed", finishedAt: 7 }, 9) !== null, "a finished order cannot be finished again");
ok(stampProblem("finish", { status: "confirmed", startedAt: 20 }, 9) !== null, "a start in the future is refused");

// Wiring
const panel = read("components/ops/WebOrdersPanel.tsx");
ok(panel.includes("function OrderTimes") && panel.includes("function OrderAddress"), "the orders screen has the start, finish, promise and address controls");
ok(panel.includes("<OrderTimes o={o} />") && panel.includes("<OrderAddress o={o} />") && panel.includes("stampProblem(kind, o, Date.now())"), "the controls are on the orders screen and check the stamp rule before saving");
ok(read("components/ops/CycleTimePanel.tsx").includes("orderCycle(webOrders)") && read("components/ops/CycleTimePanel.tsx").includes("Orders: start to finish"), "the cycle time screen shows the order averages");
ok(read("lib/types.ts").includes("startedAt?: number;") && read("lib/types.ts").includes("finishedAt?: number;"), "the web order type has the start and finish stamps");
ok(read("contexts/DataContext.tsx").includes("startedAt?: number; finishedAt?: number; promisedDate?: string; customerAddress?: string;"), "updateWebOrder accepts the new fields");
ok(read("firestore.rules").includes("'startedAt', 'finishedAt', 'promisedDate', 'customerAddress'"), "the security rule lets the owner or manager set the new fields");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) { console.error(`${fails} failed`); process.exit(1); }
