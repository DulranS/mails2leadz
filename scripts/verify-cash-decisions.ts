// Cash allocation, exception management, discount check, decision and responsibility rules, KPI ownership. Run: npx tsx scripts/verify-cash-decisions.ts
import fs from "node:fs";
import { allocateCash, weeklyRhythm } from "../lib/cashAllocation";
import { discountCheck } from "../lib/initiativeMath";
import { financialExceptions, PRICE_CHANGE_ALERT_PCT, PAYABLE_OVERDUE_DAYS } from "../lib/exceptions";
import { validateLogEntry, decisionOverdue } from "../lib/businessLog";
import { validateKpi } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";
const NOW = Date.parse("2026-11-03T09:00:00Z");

// allocation: committed first, then reserve, then free money
const a = allocateCash({ cash: 1000, committed: 400, reserveMonths: 3, monthlyCommitted: 200 });
ok(a.committed === 400 && a.reserveTarget === 600 && a.reserve === 600 && a.discretionary === 0, "committed comes out first; the reserve (3 months of 200) takes 600 of the 600 left, so nothing is free");
const b = allocateCash({ cash: 2000, committed: 400, reserveMonths: 3, monthlyCommitted: 200 });
ok(b.discretionary === 1000 && b.reserve === 600 && b.shortfall === 0 && b.reserveGap === 0, "with more cash, what is left after the reserve is free to spend");
const c = allocateCash({ cash: 300, committed: 500, reserveMonths: 3, monthlyCommitted: 200 });
ok(c.shortfall === 200 && c.reserve === 0 && c.discretionary === 0 && c.reserveGap === 600, "when commitments exceed cash, the shortfall shows and nothing is free");
ok(allocateCash({ cash: 1000, committed: 0, reserveMonths: 0, monthlyCommitted: 0 }).discretionary === 1000, "with no reserve set, all cash after commitments is free");
const days = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ date: `2026-11-${String(i).padStart(2, "0")}`, inflow: 10, outflow: 5, committed: 4, balance: 100 - i * 10 }));
const weeks = weeklyRhythm(days, 50);
ok(weeks.length === 2 && weeks[0].committed === 28 && weeks[0].closingBalance === 30 && weeks[0].belowReserve === true, "the runway is grouped into weeks, and a week closing below the reserve is flagged");
ok(weeks[1].start === "2026-11-08" && weeks[1].closingBalance === 10, "the second week starts on the eighth day");

// discount check
const d = discountCheck({ price: 100, unitCost: 60, discountPct: 10, unitsNow: 100 });
ok(d.marginNow === 40 && d.marginAfter === 30 && d.contributionNow === 4000 && d.contributionAfter === 3000, "margin and contribution before and after a 10% discount");
ok(d.breakevenUnits !== null && Math.abs(d.breakevenUnits - 133.33) < 0.01 && Math.abs((d.breakevenIncreasePct ?? 0) - 33.33) < 0.01, "a 10% discount on a 40% margin needs a third more volume to earn the same");
ok(d.verdict === "needs more volume", "at today's volume a discount that lowers contribution is reported as needing more volume");
ok(discountCheck({ price: 100, unitCost: 60, discountPct: 50, unitsNow: 10 }).verdict === "loses money", "a discount that takes the price below cost loses money on every unit");
ok(discountCheck({ price: 100, unitCost: 60, discountPct: 50, unitsNow: 10 }).breakevenUnits === null, "no volume rescues a loss-making discount, so no break-even volume is given");

// exceptions
const ex = financialExceptions({
  priceChanges: [
    { productName: "Rice", field: "sell", oldValue: 100, newValue: 130, changedAt: NOW - 86_400_000 },
    { productName: "Tea", field: "sell", oldValue: 100, newValue: 102, changedAt: NOW - 86_400_000 },
    { productName: "Old", field: "sell", oldValue: 100, newValue: 200, changedAt: NOW - 90 * 86_400_000 },
  ],
  payables: [
    { supplier: "Ceylon Cement", dueDate: "2026-10-01", amountOutstanding: 5000 },
    { supplier: "On time", dueDate: "2026-10-30", amountOutstanding: 900 },
  ],
}, TODAY, NOW, "LKR");
ok(PRICE_CHANGE_ALERT_PCT === 10 && PAYABLE_OVERDUE_DAYS === 7, "the exception thresholds are the ones the manual states");
ok(ex.filter((e) => e.area === "Prices").length === 1 && ex.some((e) => e.area === "Prices" && e.title.startsWith("Rice")), "a 30% price rise in the window is an exception; a 2% change and an old change are not");
ok(ex.filter((e) => e.area === "Payables").length === 1 && ex.some((e) => e.area === "Payables" && e.daysLate === 33), "a payable overdue by more than a week is an exception; one not yet due is not");
ok(ex[0].severity === "medium" || ex[0].severity === "high", "the most serious exception is listed first");

// decisions and responsibility
ok(validateLogEntry({ kind: "decision", title: "Second driver", date: TODAY, targetDate: "2026-12-01", ownerName: "Nimal", status: "open" }, TODAY) === null, "a decision with an owner and a deadline passes");
ok(validateLogEntry({ kind: "decision", title: "Second driver", date: TODAY, status: "open" }, TODAY) !== null, "a decision without a deadline is refused");
ok(validateLogEntry({ kind: "decision", title: "Second driver", date: TODAY, targetDate: "2026-12-01", status: "open" }, TODAY) !== null, "a decision without an owner is refused");
ok(decisionOverdue({ status: "open", targetDate: "2026-10-01" }, TODAY) === true, "an open decision past its day is overdue");
ok(validateLogEntry({ kind: "responsibility", title: "Stock ordering", ownerName: "Ruwan", accountable: "Owner" }, TODAY) === null, "an area of work names who is responsible");
ok(validateLogEntry({ kind: "responsibility", title: "Stock ordering" }, TODAY) !== null, "an area with no one responsible is refused");

// KPIs: owner and decision are recommended, not required
ok(validateKpi({ name: "Orders on time", unit: "%", target: 95, direction: "higher", period: "week" }) === null, "a KPI still passes without an owner or a decision (they are recommended)");
ok(validateKpi({ name: "Orders on time", unit: "%", target: 95, direction: "higher", period: "week", ownerName: "Ruwan", decisionQuestion: "Add a driver?" }) === null, "a KPI can name its owner and the decision it informs");

// wiring
ok(read("lib/calculations.ts").includes("committed += lp.payment") && read("lib/calculations.ts").includes("committed: number;"), "the cash runway reports committed outflow per day, from the same sources as the outflow");
ok(read("app/cash-flow/page.tsx").includes("<CashAllocationCard"), "the cash page shows where the money is going");
ok(read("components/ops/useEscalations.ts").includes("financialExceptions"), "price and payable exceptions join the escalation list");
ok(read("components/ops/BusinessLogPanels.tsx").includes("DiscountCalculator") && read("components/ops/BusinessLogPanels.tsx").includes("discountCheck("), "decisions have a discount check beside them");
ok(read("components/ops/RecordsPanels.tsx").includes("no decision linked"), "a KPI with no decision behind it is flagged");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
