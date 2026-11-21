import { capitalisedDevView } from "../lib/capitalised-dev";

let fails = 0;
const check = (name: string, ok: boolean) => { if (!ok) { fails++; console.log("FAIL:", name); } };
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

// 1. One month of 1200 over 3 years: 33.33 charged, 1166.67 left on the books.
const one = capitalisedDevView({ rd: [1200], netProfit: [500], years: 3 })!;
check("one month capitalised", near(one.capitalisedTotal, 1200));
check("one month amortised", near(one.amortisationTotal, 33.33));
check("one month balance", near(one.intangibleBalance, 1166.67));
check("one month adjusted profit", near(one.adjustedNetProfit, 500 + 1200 - 33.33));
check("actual profit untouched", near(one.actualNetProfit, 500));

// 2. No development spend: nothing changes.
const none = capitalisedDevView({ rd: [0, 0], netProfit: [10, 20], years: 1 })!;
check("no spend, no amortisation", near(none.amortisationTotal, 0) && near(none.intangibleBalance, 0));
check("no spend, profit unchanged", near(none.adjustedNetProfit, 30));

// 3. Two months of 1200 over 1 year: 100 a month, then 200 in month two.
const two = capitalisedDevView({ rd: [1200, 1200], netProfit: [0, 0], years: 1 })!;
check("two months amortised 300", near(two.amortisationTotal, 300));
check("two months balance 2100", near(two.intangibleBalance, 2100));

// 4. Charge stops after the useful life: 1200 over 1 year, 14 months in view, all charged by month 12.
const life = capitalisedDevView({ rd: [1200, ...new Array(13).fill(0)], netProfit: new Array(14).fill(0), years: 1 })!;
check("charge stops at end of life", near(life.amortisationTotal, 1200) && near(life.intangibleBalance, 0));

// 5. Bad inputs are refused.
check("zero years refused", capitalisedDevView({ rd: [1], netProfit: [1], years: 0 }) === null);
check("eleven years refused", capitalisedDevView({ rd: [1], netProfit: [1], years: 11 }) === null);
check("fractional years refused", capitalisedDevView({ rd: [1], netProfit: [1], years: 1.5 }) === null);
check("mismatched lengths refused", capitalisedDevView({ rd: [1, 2], netProfit: [1], years: 1 }) === null);
check("empty refused", capitalisedDevView({ rd: [], netProfit: [], years: 1 }) === null);

console.log(fails === 0 ? "Capitalised development (what-if): all checks passed" : `Capitalised development: ${fails} failed`);
process.exit(fails ? 1 : 0);
