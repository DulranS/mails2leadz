// Commission tiers (lib/commissionTiers.ts and the commission calculation): the highest tier reached sets the rate, no target or no tiers keeps the
// single rate, tiers are validated, and the calculation applies the tier and reports it. Worked numbers. Run: npx tsx scripts/verify-commission-tiers.ts
import fs from "node:fs";
import { tierPctFor, validateTiers } from "../lib/commissionTiers";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const tiers = [{ fromPct: 100, pct: 8 }, { fromPct: 120, pct: 10 }];
ok(tierPctFor(5, tiers, 9000, 10000).pct === 5, "below the first tier (90% of target), the single rate applies");
ok(tierPctFor(5, tiers, 11000, 10000).pct === 8, "at 110% of target, the 100% tier applies (8%)");
ok(tierPctFor(5, tiers, 12500, 10000).pct === 10, "at 125% of target, the highest tier reached applies (10%)");
ok(tierPctFor(5, tiers, 12000, 10000).pct === 10, "exactly at a tier's start, that tier applies");
ok(tierPctFor(5, tiers, 50000, undefined).pct === 5 && tierPctFor(5, tiers, 50000, 0).pct === 5, "with no target set, the single rate applies, whatever the sales");
ok(tierPctFor(5, undefined, 50000, 10000).pct === 5 && tierPctFor(5, [], 50000, 10000).pct === 5, "with no tiers, the single rate applies");
ok(tierPctFor(5, tiers, 12500, 10000).achievedPct === 125, "the share of target achieved is reported");

ok(validateTiers([{ fromPct: 100, pct: 8 }, { fromPct: 120, pct: 10 }]) === null, "a rising set of tiers is accepted");
ok(validateTiers([{ fromPct: 100, pct: 8 }, { fromPct: 100, pct: 9 }]) !== null, "two tiers at the same share of target are refused");
ok(validateTiers([{ fromPct: 100, pct: 10 }, { fromPct: 120, pct: 8 }]) !== null, "a higher tier that pays less than the one below is refused");
ok(validateTiers([{ fromPct: 100, pct: 120 }]) !== null, "a commission above 100% is refused");

const calc = read("lib/commission.ts");
ok(calc.includes("tierPctFor(") && calc.includes("salesTargets[uid]") && calc.includes("tierAchievedPct"), "the commission calculation applies the tier from the target, and reports the tier it used");
ok(read("app/employees/page.tsx").includes("settings.salesTargets") && read("components/PayslipCard.tsx").includes("settings.salesTargets"), "the employees screen and the payslip pass the targets in");
ok(read("lib/types.ts").includes("commissionTiers?: CommissionTier[]") || read("lib/types.ts").includes("commissionTiers?:"), "an employee can carry commission tiers");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
