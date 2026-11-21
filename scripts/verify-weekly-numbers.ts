// Weekly numbers (lib/weeklyNumbers.ts and the Settings switches): a week's sales and expenses within the dates only, the left-over figure, the wording that says
// it is not the accounting profit, the previous week's dates, and the settings and the cron route wired. Worked numbers. Run: npx tsx scripts/verify-weekly-numbers.ts
import fs from "node:fs";
import { weeklyNumbers, previousWeek } from "../lib/weeklyNumbers";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const w = weeklyNumbers({ businessName: "Shop", from: "2026-11-09", to: "2026-11-15",
  sales: [{ date: "2026-11-09", qty: 2, unitPrice: 500 }, { date: "2026-11-15", qty: 1, unitPrice: 300 }, { date: "2026-11-16", qty: 9, unitPrice: 999 }, { date: "2026-11-08", qty: 9, unitPrice: 999 }],
  expenses: [{ date: "2026-11-10", amount: 400 }, { date: "2026-11-20", amount: 5000 }] });
ok(w.salesTotal === 1300 && w.salesCount === 2, "sales of the week are 1,300 (2 sales); the day before and the day after are left out");
ok(w.expensesTotal === 400 && w.expenseCount === 1, "expenses of the week are 400; a later expense is left out");
ok(w.left === 900, "the week leaves 900 after expenses");
ok(w.text.includes("not the accounting profit"), "the email says it is not the accounting profit");
ok(w.subject === "Shop: your week to 2026-11-15", "the subject names the business and the week's end");
const pw = previousWeek("2026-11-16");
ok(pw.from === "2026-11-09" && pw.to === "2026-11-15", "on Monday 16 November the previous week is 9 to 15 November");
ok(previousWeek("2026-11-15").to === "2026-11-08", "on a Sunday the week that just ended is the one before");

const page = read("app/settings/page.tsx");
ok(page.includes("weeklyNumbers") && page.includes("reportEmail"), "Settings has the weekly numbers switch and the address to send it to");
const route = read("app/api/cron/weekly-numbers/route.ts");
ok(route.includes("requireCronSecret(req)") && route.includes("weeklyNumbers") && route.includes("getUTCDay()"), "the weekly job is gated like the other daily jobs and sends only on a Monday");
ok(JSON.parse(read("vercel.json")).crons.some((c: { path: string }) => c.path === "/api/cron/weekly-numbers"), "the weekly job is scheduled once a day, and checks for Monday itself");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
