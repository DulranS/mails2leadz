// Tips (lib/tips.ts): cleaning what is typed, the period total with hand-worked figures, and the wiring: a tip never enters
// revenue, profit or tax, the sale form saves and clears it, the Sales page shows the card.
// Run: npx tsx scripts/verify-tips.ts
import fs from "node:fs";
import { cleanTip, tipsSummary } from "../lib/tips";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

ok(cleanTip("") === undefined && cleanTip(undefined) === undefined && cleanTip(null) === undefined, "a blank tip means no tip (undefined, so the field clears)");
ok(cleanTip("0") === undefined && cleanTip("-5") === undefined, "zero or negative tips are not saved");
ok(cleanTip("abc") === undefined && cleanTip("NaN") === undefined, "a non-number is not saved as a tip");
ok(cleanTip("12.346") === 12.35, "a tip is rounded to the nearest cent");
ok(cleanTip("250") === 250 && cleanTip(" 7.5 ") === 7.5, "a plain or spaced number is read as typed");
ok(cleanTip(5e12) === 1_000_000_000, "a tip is capped at 1,000,000,000");

const sales = [
  { date: "2026-10-03", tipAmount: 50 },
  { date: "2026-10-10", tipAmount: 25 },
  { date: "2026-10-12" },
  { date: "2026-09-30", tipAmount: 999 },
  { date: "2026-10-20", tipAmount: 25 },
];
const s = tipsSummary(sales, "2026-10-01", "2026-10-31");
ok(s.total === 100 && s.count === 3, "October tips are 50 + 25 + 25 from three sales (September and the untipped sale are left out)");
ok(s.average === 33.33, "the average tip is 100 over 3 sales, rounded to cents");
const none = tipsSummary([{ date: "2026-10-03" }], "2026-10-01", "2026-10-31");
ok(none.total === 0 && none.count === 0 && none.average === null, "no tips in the window gives zero and no average");

const salesPage = fs.readFileSync("app/sales/page.tsx", "utf8");
ok(/<TipsCard sales=\{sales\} currency=\{currency\} \/>/.test(salesPage), "the Sales page shows the tips card");
const quick = fs.readFileSync("components/QuickForms.tsx", "utf8");
ok(/tipAmount: cleanTip\(tipText\)/.test(quick), "the single-sale form saves the tip");
ok(/useState\(existingSale\?\.tipAmount\?\.toString\(\) \?\? ""\)/.test(quick), "editing a sale shows its tip");
const ctx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(/"saleChannel", "tipAmount"/.test(ctx), "clearing the tip on a sale removes it");
const types = fs.readFileSync("lib/types.ts", "utf8");
ok(/tipAmount\?: number;/.test(types), "the sale type has the tip field");
// The tip must not feed any money figure: nothing that computes revenue, profit, tax or cash may read it.
const moneyFiles = ["lib/calculations.ts", "lib/channelEconomics.ts", "lib/taxByRate.ts", "lib/tax.ts"];
for (const f of moneyFiles) {
  if (!fs.existsSync(f)) continue;
  ok(!/tipAmount/.test(fs.readFileSync(f, "utf8")), `${f} does not read the tip (tips are not revenue, profit or tax)`);
}

console.log(`verify-tips: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
