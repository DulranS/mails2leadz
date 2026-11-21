// Sales drop exception (lib/exceptions.ts salesDropException): the last seven days against the average week of the four weeks before.
// Run: npx tsx scripts/verify-sales-drop.ts
import fs from "node:fs";
import { salesDropException, financialExceptions, SALES_DROP_ALERT_PCT, SALES_BASELINE_WEEKS, SALES_BASELINE_MIN_DAYS_WITH_SALES } from "../lib/exceptions";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// Baseline: every day of the four weeks before the last seven days sells V. Recent week: the seven days ending today sell in total R.
function scenario(V: number, recentTotal: number) {
  const sales: { date: string; qty: number; unitPrice: number }[] = [];
  for (let i = 7; i <= 6 + 7 * SALES_BASELINE_WEEKS; i++) sales.push({ date: addDays(TODAY, -i), qty: 1, unitPrice: V });
  for (let i = 0; i <= 6; i++) sales.push({ date: addDays(TODAY, -i), qty: 1, unitPrice: recentTotal / 7 });
  return sales;
}
const V = 1000;

ok(SALES_DROP_ALERT_PCT === 40 && SALES_BASELINE_WEEKS === 4, "the thresholds are the ones the manual states: a 40% drop against four weeks");
ok(salesDropException(scenario(V, 7 * V), TODAY) === null, "a steady week raises nothing");
ok(salesDropException(scenario(V, 5.6 * V), TODAY) === null, "a 20% dip raises nothing");
const medium = salesDropException(scenario(V, 3.5 * V), TODAY);
ok(medium !== null && medium.area === "Sales" && medium.severity === "medium" && medium.title.startsWith("Sales down 50%"), "a 50% drop is an exception, medium, and says how much it fell");
const high = salesDropException(scenario(V, 2.1 * V), TODAY);
ok(high !== null && high.severity === "high", "a 70% drop is high");
ok(salesDropException(scenario(V, 9 * V), TODAY) === null, "growth raises nothing");

const thin: { date: string; qty: number; unitPrice: number }[] = [];
for (let i = 7; i <= 6 + 7 * SALES_BASELINE_WEEKS; i += 10) thin.push({ date: addDays(TODAY, -i), qty: 1, unitPrice: V });
ok(new Set(thin.map((s) => s.date)).size < SALES_BASELINE_MIN_DAYS_WITH_SALES && salesDropException(thin, TODAY) === null, "with too few selling days in the baseline there is nothing reliable to compare, so no alert");
ok(salesDropException([], TODAY) === null, "a business with no sales raises nothing");
ok(salesDropException([{ date: TODAY, qty: 0, unitPrice: 999 }, ...scenario(V, 7 * V)], TODAY) === null, "a zero-quantity sale is ignored");
const old = scenario(V, 7 * V).map((s) => s);
old.push({ date: addDays(TODAY, -60), qty: 1, unitPrice: 50000 });
ok(salesDropException(old, TODAY) === null, "sales outside the two windows are ignored");

const via = financialExceptions({ priceChanges: [], payables: [], sales: scenario(V, 3.5 * V) }, TODAY, Date.parse(`${TODAY}T09:00:00Z`));
ok(via.some((e) => e.area === "Sales"), "the sales drop joins the financial exceptions list");
ok(read("components/ops/useEscalations.ts").includes("sales }") && read("components/ops/useEscalations.ts").includes("sales, settings.currency"), "the escalation list is fed the sales records");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
