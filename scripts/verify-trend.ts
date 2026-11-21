// Monthly trend (lib/trend.ts): least-squares line, flat and rising series, too few points, zero base for percentage change,
// with hand-worked values; plus the wiring (chart reads the P&L fields that exist, the profit page mounts it).
// Run: npx tsx scripts/verify-trend.ts
import fs from "node:fs";
import { linearTrend, percentChange } from "../lib/trend";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const rising = linearTrend([1, 2, 3, 4])!;
ok(rising.every((v, i) => close(v, [1, 2, 3, 4][i])), "a perfectly rising series is its own trend");
const noisy = linearTrend([10, 20, 10, 20])!;
ok(close(noisy[0], 12) && close(noisy[3], 18), "a zig-zag series trends from 12 at the start to 18 at the end");
const flat = linearTrend([5, 5, 5])!;
ok(flat.every((v) => close(v, 5)), "a flat series has a flat trend");
ok(linearTrend([3]) === null && linearTrend([]) === null, "one month or none has no trend");
ok(linearTrend([1, NaN, 3]) === null, "a missing figure gives no trend rather than a wrong one");

ok(close(percentChange([100, 150])!, 50), "100 to 150 is up 50 percent");
ok(close(percentChange([200, 100])!, -50), "200 to 100 is down 50 percent");
ok(percentChange([0, 5]) === null, "a zero starting month has no percentage");
ok(percentChange([7]) === null, "one month has no change");
ok(close(percentChange([-100, -50])!, 50), "a loss shrinking to half is up 50 percent by the same rule");

const chart = fs.readFileSync("components/MonthlyTrendChart.tsx", "utf8");
const calc = fs.readFileSync("lib/calculations.ts", "utf8");
ok(/r\.totalRevenue/.test(chart) && /r\.netProfitAfterTax/.test(chart), "the chart reads total revenue and profit after tax");
const iface = calc.slice(calc.indexOf("export interface MonthlyPnL"), calc.indexOf("export interface MonthlyPnL") + 6000);
ok(/totalRevenue: number/.test(iface) && /netProfitAfterTax: number/.test(iface), "those fields exist on the monthly P&L");
ok(/rows\.length < 2\) return null/.test(chart), "the chart is hidden until there are two months");
ok(/from "recharts"/.test(chart) && /ResponsiveContainer/.test(chart), "the chart uses the same chart library as the dashboard");
const page = fs.readFileSync("app/profitability/page.tsx", "utf8");
ok(/import MonthlyTrendChart from "@\/components\/MonthlyTrendChart"/.test(page), "the profit page imports the chart");
ok(/<MonthlyTrendChart rows=\{monthlyPnL\} currency=\{currency\} \/>/.test(page), "the profit page shows the chart with its P&L rows");

console.log(`verify-trend: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
