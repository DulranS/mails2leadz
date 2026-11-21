// Checks for the equity ratios (pass 312). Run: tsx scripts/verify-equity-ratios.ts
import { bookValuePerShare, dividendPayoutPct, dividendsInWindow } from "../lib/equity-ratios";

let fails = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) { fails++; console.log("FAIL:", name); }
};

check("book value per share: 1000 over 100 shares is 10", bookValuePerShare(1000, 100) === 10);
check("book value per share: no shares gives null", bookValuePerShare(1000, 0) === null);
check("book value per share: negative net assets stays negative", bookValuePerShare(-500, 100) === -5);
check("book value per share: non-finite input gives null", bookValuePerShare(NaN, 100) === null);

check("payout: 50 of 200 profit is 25%", dividendPayoutPct(50, 200) === 25);
check("payout: a loss gives null", dividendPayoutPct(50, -10) === null);
check("payout: zero profit gives null", dividendPayoutPct(50, 0) === null);
check("payout: no dividends is 0%", dividendPayoutPct(0, 200) === 0);

const divs = [
  { date: "2026-01-05", amount: 10 },
  { date: "2025-12-31", amount: 99 },
  { date: "2026-03-01", amount: 5 },
];
check("window: only dividends on or after the start count", dividendsInWindow(divs, "2026-01-01") === 15);
check("window: empty list is 0", dividendsInWindow([], "2026-01-01") === 0);
check("window: a bad start gives null", dividendsInWindow(divs, "") === null);
check("window: a non-ISO start gives null", dividendsInWindow(divs, "2026-1-1") === null);

import { sharesOnDate, epsGrowthPct } from "../lib/equity-ratios";
const rounds = [{ date: "2026-03-01", shares: 100 }, { date: "2025-06-01", shares: 50 }];
check("shares on a date: rounds after the date are taken off today's count", sharesOnDate(1000, rounds, "2026-01-01") === 900);
check("shares on a date: a date after every round gives today's count", sharesOnDate(1000, rounds, "2026-12-31") === 1000);
check("EPS growth: 120 on 100 shares against 100 on 100 shares is 20%", Math.abs((epsGrowthPct(120, 100, 100, 100) ?? 0) - 20) < 1e-9);
check("EPS growth: dilution lowers EPS growth", (epsGrowthPct(120, 150, 100, 100) ?? 0) < 20);
check("EPS growth: a loss last year gives null", epsGrowthPct(100, 100, -10, 100) === null);
check("EPS growth: no shares gives null", epsGrowthPct(100, 0, 100, 100) === null);

// Dividends with no share count (pass 315): a dividend whose stored split holds no shares was recorded before the cap table.
import { dividendsWithoutShares } from "../lib/equity-ratios";
import fs from "node:fs";
const withShares = { date: "2026-01-05", amount: 10, allocations: [{ shares: 100 }] };
check("no share count: a dividend with a split that holds shares is not counted", dividendsWithoutShares([withShares], "2026-01-01") === 0);
check("no share count: an empty split is counted", dividendsWithoutShares([{ date: "2026-02-01", amount: 5, allocations: [] }], "2026-01-01") === 1);
check("no share count: a split with zero shares is counted", dividendsWithoutShares([{ date: "2026-02-01", amount: 5, allocations: [{ shares: 0 }] }], "2026-01-01") === 1);
check("no share count: a dividend with no split at all is counted", dividendsWithoutShares([{ date: "2026-02-01", amount: 5 }], "2026-01-01") === 1);
check("no share count: only dividends in the window are counted", dividendsWithoutShares([{ date: "2025-12-31", amount: 5, allocations: [] }], "2026-01-01") === 0);
check("no share count: a bad window start gives null", dividendsWithoutShares([], "2026-1-1") === null);
const healthSrc = fs.readFileSync(new URL("../app/health/page.tsx", import.meta.url), "utf8");
check("no share count: the health page shows the note in place of the payout", healthSrc.includes('"No share count"') && healthSrc.includes("payoutNoShares > 0 ? null : dividendPayoutPct"));

console.log(fails === 0 ? "equity ratios: all checks passed" : `equity ratios: ${fails} check(s) failed`);
if (fails > 0) process.exit(1);
