// Business valuation (pass 305, lib/valuation.ts). The EBITDA example is the one on the valuation cheat sheet.
import { enterpriseFromMultiple, equityFromEnterprise, netAssetValue, dcfEnterprise } from "../lib/business-valuation";

let failed = 0;
const ok = (c: boolean, w: string) => { if (!c) failed++; console.log(`${c ? "ok  " : "FAIL"} - ${w}`); };

const ev = enterpriseFromMultiple(2_000_000, 6);
ok(ev === 12_000_000, `EBITDA 2,000,000 at 6x is 12,000,000 enterprise value (got ${ev})`);
ok(equityFromEnterprise(ev!, 1_500_000, 500_000) === 11_000_000, "equity is 12m less 1.5m debt plus 0.5m cash = 11m (cheat sheet example)");
ok(enterpriseFromMultiple(1_000_000, 2) === 2_000_000, "revenue of 1,000,000 at 2x is 2,000,000");
ok(enterpriseFromMultiple(100, -1) === null, "a negative multiple gives no value");
ok(netAssetValue(60_000, 25_000) === 35_000, "net asset value is assets less liabilities");

// Flat cash flow of 100 forever, at a 10% required return with no growth: value is 100 / 0.10 = 1000.
const flat = dcfEnterprise({ baseCashFlow: 100, growthPct: 0, years: 5, discountPct: 10, terminalGrowthPct: 0 });
ok(flat === 1000, `flat 100 a year at 10% is worth 1000 (got ${flat})`);
ok(dcfEnterprise({ baseCashFlow: 100, growthPct: 0, years: 5, discountPct: 2, terminalGrowthPct: 2 }) === null, "required return must beat terminal growth");
const grown = dcfEnterprise({ baseCashFlow: 100, growthPct: 5, years: 5, discountPct: 12, terminalGrowthPct: 2 })!;
ok(grown > 1000 && grown < 2000, `5% growth gives a value between 1000 and 2000 (got ${grown})`);

console.log(failed ? `${failed} failed` : "Business valuation: all checks passed");
process.exit(failed ? 1 : 0);
