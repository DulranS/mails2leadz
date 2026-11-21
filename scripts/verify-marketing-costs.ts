// Marketing costs (lib/adSpend.ts campaignCostEntries, the recorder, and the expense path): imported campaign spend becomes one Marketing
// expense per campaign, nothing is recorded twice, zero and empty amounts are skipped, a Marketing cost counts as a selling cost in the
// profit split, and the expense form offers Marketing. Run: npx tsx scripts/verify-marketing-costs.ts
import fs from "node:fs";
import { campaignCostEntries } from "../lib/adSpend";
import { sgaSplit, sgaFunctionOf } from "../lib/sga";
import { EXPENSE_CATEGORIES } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const period = { from: "2026-10-01", to: "2026-10-31" };

const first = campaignCostEntries({ SAVE10: 5000, WELCOME: 1200.456, EMPTY: 0, BAD: Number.NaN }, period, new Set());
ok(first.length === 2, "one expense per campaign with spend; zero and invalid amounts are skipped");
ok(first[0].name === "Ads: SAVE10 (2026-10-01 to 2026-10-31)" && first[0].amount === 5000 && first[0].startDate === "2026-10-31", "each campaign is named with its period and dated on the last day of it");
ok(first[1].amount === 1200.46 && first.every((e) => e.category === "Marketing"), "amounts are rounded to the cent and every entry is a Marketing cost");

const repeat = campaignCostEntries({ SAVE10: 5000, WELCOME: 1200.46 }, period, new Set(first.map((e) => e.name)));
ok(repeat.length === 0, "recording the same period again adds nothing");
const partial = campaignCostEntries({ SAVE10: 5000, WELCOME: 1200.46 }, period, new Set([first[0].name]));
ok(partial.length === 1 && partial[0].name.startsWith("Ads: WELCOME"), "after a partial run, only the campaigns not yet recorded are added");
ok(campaignCostEntries({ "  ": 100 }, period, new Set()).length === 0, "a blank campaign code is skipped");

ok(sgaFunctionOf("Marketing") === "selling", "a Marketing cost is a selling cost in the profit split");
const split = sgaSplit([{ category: "Marketing", amount: 5000 }, { category: "Insurance", amount: 800 }]);
ok(split.selling === 5000 && split.admin === 800, "a recorded campaign cost reaches the selling figure, not the admin figure");
ok((EXPENSE_CATEGORIES as readonly string[]).includes("Marketing") && (EXPENSE_CATEGORIES as readonly string[]).includes("Sales payroll"), "the expense form offers Marketing and Sales payroll, so a marketing or sales cost can always be typed in");

ok(read("lib/adSpend.ts").includes("if (alreadyRecorded.has(name)) continue;"), "the rule skips a campaign already recorded for the period");
ok(read("components/MarketingCostRecorder.tsx").includes("Record as Marketing costs") && read("components/MarketingCostRecorder.tsx").includes("nothing is recorded twice"), "the recorder records only on the owner's press, and says so");
ok(read("app/settings/page.tsx").includes("<MarketingCostRecorder") && read("app/settings/page.tsx").includes("setLastAdSpend({ spend, period })"), "the settings page offers the recorder after an ad spend import");
ok(read("components/AdSpendImport.tsx").includes("onImport(spend, summary, { from, to });"), "the import passes the period it covers");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
