// Pay tax (lib/payTax.ts, v320): APIT bands against the two printed examples, the WHT threshold, the modes, and the take-home estimate.
import { computePayslip } from "../lib/payslip";
import { annualApit, monthlyApit, apitForPeriod, serviceWhtForPeriod, taxForPeriod, takeHomeEstimate, APIT_RELIEF_ANNUAL } from "../lib/payTax";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};
// The two printed examples from the br.lk APIT guide (2026/27 bands)
ok(monthlyApit(250_000) === 8_000, "Rs 250,000 a month gives Rs 8,000 APIT (printed example)");
ok(monthlyApit(300_000) === 18_500, "Rs 300,000 a month gives Rs 18,500 APIT (printed example)");
ok(monthlyApit(150_000) === 0, "the monthly relief of Rs 150,000 is tax-free");
ok(monthlyApit(0) === 0 && monthlyApit(-5) === 0, "no pay, no tax");
ok(annualApit(APIT_RELIEF_ANNUAL) === 0 && annualApit(APIT_RELIEF_ANNUAL + 1_000_000) === 60_000, "the first Rs 1,000,000 above relief is taxed at 6%");
ok(annualApit(APIT_RELIEF_ANNUAL + 1_500_000) === 60_000 + 90_000, "the next Rs 500,000 is taxed at 18%");
ok(annualApit(APIT_RELIEF_ANNUAL + 2_000_000) === 60_000 + 90_000 + 120_000, "the band at 24% starts after 2,000,000 above relief");
ok(annualApit(10_000_000) > annualApit(9_000_000), "tax rises with income");
// Band boundaries are continuous (no jump in tax between two near-equal incomes)
for (const m of [233_333, 233_334, 275_000, 275_001, 316_667, 316_668, 358_333, 358_334]) {
  const d = monthlyApit(m + 1) - monthlyApit(m);
  // one more rupee of monthly pay adds at most the top rate (36 cents of monthly tax): tax never falls and never jumps
  ok(d >= 0 && d <= 0.36 + 0.001, `no jump at Rs ${m.toLocaleString("en-US")} a month (difference ${d.toFixed(2)})`);
}
ok(apitForPeriod(125_000, 250_000) === 4_000, "a half-month of pay on a Rs 250,000 basic pays half the monthly tax");
ok(apitForPeriod(0, 250_000) === 0, "no pay in the period, no APIT");
// Service withholding: 5%, only when the monthly payment is over Rs 100,000 (strictly)
ok(serviceWhtForPeriod(100_000, 100_000) === 0, "exactly Rs 100,000 a month is not over the threshold");
ok(serviceWhtForPeriod(100_001, 100_001) === 5_000.05, "over Rs 100,000, 5% is withheld on the payment");
ok(serviceWhtForPeriod(40_000, 150_000) === 2_000, "a weekly-sized payment is judged on the monthly total (5% of the payment)");
// The modes
ok(taxForPeriod("flat", { periodGross: 100_000, monthlyBasic: 100_000, flatPct: 10 }) === 10_000, "a flat mode keeps the owner's percentage");
ok(taxForPeriod(undefined, { periodGross: 100_000, monthlyBasic: 100_000, flatPct: 10 }) === 10_000, "no mode set behaves as flat (existing records unchanged)");
ok(taxForPeriod("apit", { periodGross: 250_000, monthlyBasic: 250_000, flatPct: 0 }) === 8_000, "the apit mode uses the bands, not the flat percentage");
ok(taxForPeriod("service_wht", { periodGross: 120_000, monthlyBasic: 120_000, flatPct: 0 }) === 6_000, "the service mode withholds 5%");
// Take-home: EPF 8% comes off when it applies (as before)
ok(takeHomeEstimate(250_000, { taxMode: "apit", taxPct: 0, epfEtfApplicable: true }, 8) === 250_000 - 8_000 - 20_000, "take-home = gross less APIT less 8% EPF");
ok(takeHomeEstimate(100_000, { taxPct: 10, epfEtfApplicable: false }, 8) === 90_000, "take-home for a flat record without EPF is unchanged");

// The payslip uses the same rule. Flat records keep their percentage; APIT and service records use the bands and the 5%.
const slip = (taxMode: "flat" | "apit" | "service_wht" | undefined, payRate: number, taxPct = 0, epfEtfApplicable = false) =>
  computePayslip({ name: "T", role: "", payRate, payFrequency: "monthly", taxPct, epfEtfApplicable, taxMode }, { month: "2026-11", overtimeHours: 0, overtimeMultiplier: 1.5, hoursPerMonth: 160, commission: 0, allowances: 0, noPayDays: 0, otherDeductions: 0 });
ok(slip("apit", 250_000).tax === 8_000, "a payslip on APIT withholds the band tax (Rs 8,000 at Rs 250,000)");
ok(slip(undefined, 100_000, 10).tax === 10_000 && slip("flat", 100_000, 10).tax === 10_000, "a payslip on the flat rate is unchanged (10% of gross)");
ok(slip("service_wht", 120_000).tax === 6_000 && slip("service_wht", 90_000).tax === 0, "a service payslip withholds 5% only above Rs 100,000 a month");
ok(slip("apit", 250_000, 0, true).totalDeductions === slip("apit", 250_000, 0, true).employeeEpf + 8_000, "total deductions are EPF plus APIT");
ok(slip("apit", 250_000).taxMode === "apit", "the payslip records which rule it used");

console.log(failed === 0 ? "verify-pay-tax: all checks passed" : `verify-pay-tax: ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
