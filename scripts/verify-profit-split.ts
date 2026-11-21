// Profit split (lib/profitSplit.ts): the worked example from the notes (revenue 25m, gross 7.5m, net 2.5m, reinvest 8%, take-home 2%), the actuals from
// capital entries (pool returns left out), the period cut-off, the statuses, and the target checks. Run: npx tsx scripts/verify-profit-split.ts
import fs from "node:fs";
import { profitSplit, validateTargets } from "../lib/profitSplit";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const months = [{ month: "2026-10", revenue: 25_000_000, grossProfit: 7_500_000, netProfit: 2_500_000 }];
const capital = [
  { kind: "reinvestment" as const, amount: 2_000_000, date: "2026-10-30", poolOwned: false },
  { kind: "withdrawal" as const, amount: 500_000, date: "2026-10-31", poolOwned: false },
  { kind: "withdrawal" as const, amount: 900_000, date: "2026-10-15", poolOwned: true },   // an investor's money returned: not take-home
  { kind: "withdrawal" as const, amount: 40_000, date: "2026-09-20", poolOwned: false },   // outside the period
];
const s = profitSplit(months, capital, { reinvestPct: 8, takeHomePct: 2 }, { from: "2026-10", to: "2026-10" });
ok(s.revenue === 25_000_000 && s.grossMarginPct === 30 && s.netMarginPct === 10, "the notes' figures: revenue 25m, gross margin 30%, net margin 10%");
ok(s.reinvest.target === 2_000_000 && s.takeHome.target === 500_000, "8% reinvested and 2% taken home, on 25m, are 2m and 0.5m");
ok(s.leftAfterTargets === 0 && s.status === "covered", "net profit of 2.5m covers 2m reinvested and 0.5m taken home, with nothing left over: covered");
ok(s.reinvest.actual === 2_000_000 && s.takeHome.actual === 500_000, "actuals come from the capital entries: 2m reinvested, 0.5m drawn by the owner");
ok(!(s.takeHome.actual === 1_400_000), "an investor's pool money returned, and a withdrawal outside the period, are not counted as take-home");

const short = profitSplit(months, [], { reinvestPct: 12, takeHomePct: 2 }, { from: "2026-10", to: "2026-10" });
ok(short.status === "short" && short.leftAfterTargets === -1_000_000, "targets above the net profit show as short: 12% reinvested (3m) plus 2% taken home (0.5m) is 1m more than the 2.5m net profit");
ok(profitSplit(months, [], {}, { from: "2026-10", to: "2026-10" }).status === "not_set", "with no targets set, nothing is judged");
ok(profitSplit([{ month: "2026-10", revenue: 100, grossProfit: 0, netProfit: -10 }], [], { reinvestPct: 5 }, { from: "2026-10", to: "2026-10" }).status === "loss", "a loss is shown as a loss, not as short");
ok(profitSplit([], [], { reinvestPct: 5 }, { from: "2026-10", to: "2026-10" }).grossMarginPct === null, "with no revenue, margins are not shown, not divided by zero");
ok(profitSplit([...months, { month: "2026-11", revenue: 1, grossProfit: 1, netProfit: 1 }], [], {}, { from: "2026-10", to: "2026-10" }).revenue === 25_000_000, "only the chosen period counts");

ok(validateTargets({ reinvestPct: 8, takeHomePct: 2 }) === null, "sensible targets are accepted");
ok(validateTargets({ reinvestPct: 80, takeHomePct: 30 }) !== null, "targets that together exceed all revenue are refused");
ok(validateTargets({ reinvestPct: -1 }) !== null, "a negative target is refused");

const screen = read("components/ops/ProfitSplitPanel.tsx");
ok(screen.includes("profitSplit(") && screen.includes("updateSettings({ profitSplit: {") && !/addDoc|updateDoc|setDoc|deleteDoc/.test(screen), "the screen reads the figures, and saves only the two targets to the settings");
ok(read("lib/operations.ts").includes("\"profitsplit\"") && read("lib/operations.ts").includes("OWNER_ONLY_TABS: string[] = [\"exitrecords\", \"group\""), "the profit split is for the owner alone");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
