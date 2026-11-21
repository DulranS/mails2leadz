// Purchasing power of cash (lib/purchasingPower.ts, v329). Run: tsx scripts/verify-purchasing-power.ts
import { readFileSync } from "node:fs";
import { valueInTodaysMoney, costInFuture, inflationLoss } from "../lib/purchasingPower";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};

ok(valueInTodaysMoney(1000, 10, 12) === 909.09, "LKR 1,000 at 10% inflation is worth 909.09 after a year");
ok(inflationLoss(1000, 10, 12) === 90.91, "the loss over a year at 10% is 90.91");
ok(valueInTodaysMoney(1000, 10, 24) === 826.45, "two years at 10% leaves 826.45");
ok(valueInTodaysMoney(1000, 0, 36) === 1000, "no inflation keeps the value");
ok(inflationLoss(1000, 0, 36) === 0, "no inflation means no loss");
ok(costInFuture(1000, 10, 12) === 1100, "goods costing 1,000 today cost 1,100 in a year at 10%");
ok(costInFuture(1000, 10, 0) === 1000, "no time passes, no change in price");
ok(valueInTodaysMoney(1000, -2, 12) === 1020.41, "deflation raises the value of cash");
ok(valueInTodaysMoney(0, 10, 12) === 0, "zero cash stays zero");
ok(valueInTodaysMoney(-5, 10, 12) === null, "negative cash is refused");
ok(valueInTodaysMoney(1000, -100, 12) === null, "a rate of -100% is refused");
ok(valueInTodaysMoney(1000, 150, 12) === null, "a rate above 100% is refused");
ok(valueInTodaysMoney(1000, NaN, 12) === null, "a missing rate is refused");
ok(valueInTodaysMoney(1000, 10, -1) === null, "a negative period is refused");
ok(valueInTodaysMoney(1000, 10, Infinity) === null, "an infinite period is refused");
ok(inflationLoss(-1, 10, 12) === null, "loss is refused for negative cash");

const page = readFileSync(new URL("../app/statements/page.tsx", import.meta.url), "utf8");
ok(page.includes("function PurchasingPowerMemo("), "the balance sheet has the purchasing-power memo");
ok(page.includes("<PurchasingPowerMemo"), "the purchasing-power memo is rendered");
ok(page.includes("from \"@/lib/purchasingPower\""), "the statements page imports the purchasing-power rules");
ok(page.includes("is not saved"), "the memo says the rate is a what-if and is not saved");
ok(page.includes("term=\"net worth\""), "total equity is labelled as net worth with a definition");
const gl = readFileSync(new URL("../lib/glossary.ts", import.meta.url), "utf8");
ok(gl.includes("\"net worth\":") && gl.includes("\"purchasing power\":"), "the glossary defines net worth and purchasing power");

console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
