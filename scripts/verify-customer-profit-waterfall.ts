// Customer profitability and the cash waterfall (lib/customerProfit.ts, lib/cashWaterfall.ts): a customer's profit after cost, refunds and discounts, the flags,
// the worst-first order, the principal repaid on a loan, the waterfall steps, the partners' split, the shortfall case, and the validation. Worked numbers.
// Run: npx tsx scripts/verify-customer-profit-waterfall.ts
import { customerProfitability, principalRepaid } from "../lib/customerProfit";
import { cashWaterfall, validatePartners } from "../lib/cashWaterfall";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const cost = (id: string) => (id === "A" ? 60 : 40);
const sales = [
  { id: "s1", date: "2026-10-02", productId: "A", qty: 10, unitPrice: 100, customer: "Nimal" },   // revenue 1,000, cost 600
  { id: "s2", date: "2026-10-05", productId: "B", qty: 10, unitPrice: 50, customer: "Pradeep" },  // revenue 500, cost 400
  { id: "s3", date: "2026-10-09", productId: "B", qty: 10, unitPrice: 40, customer: "Pradeep", promoOffAmount: 100 }, // revenue 400, cost 400, discount 100
  { id: "s4", date: "2026-10-12", productId: "A", qty: 5, unitPrice: 100, customer: "Kamal" },    // revenue 500, cost 300
];
const returns = [{ saleId: "s4", date: "2026-10-20", refundAmount: 300 }];   // Kamal returns 300 of 500
const rows = customerProfitability(sales, returns, cost, { from: "2026-10", to: "2026-10" });
const pradeep = rows.find((r) => r.name === "Pradeep")!;
ok(pradeep.profit === 0 && pradeep.flag === "loses money", "Pradeep: 900 revenue, less 800 cost and 100 discount, leaves nothing; with no profit left, he is flagged as losing money");
const kamal = rows.find((r) => r.name === "Kamal")!;
ok(kamal.profit === 0 - 0 + (500 - 300 - 300) && kamal.flag === "loses money", "Kamal: 500 revenue, less 300 cost and 300 refunded, leaves a loss of 100: a sale that comes back is not profit");
const nimal = rows.find((r) => r.name === "Nimal")!;
ok(nimal.profit === 400 && nimal.marginPct === 40 && nimal.flag === "healthy", "Nimal: 1,000 revenue, 600 cost, 40% margin, healthy");
ok(rows[0].name === "Kamal" && rows[1].name === "Pradeep" && rows[rows.length - 1].name === "Nimal", "customers are listed worst first: Kamal (minus 100), then Pradeep (nothing), then Nimal (400)");
const returner = customerProfitability([{ id: "x", date: "2026-10-01", productId: "A", qty: 10, unitPrice: 100, customer: "Ravi" }], [{ saleId: "x", date: "2026-10-03", refundAmount: 200 }], cost, { from: "2026-10", to: "2026-10" })[0];
ok(returner.flag === "returns a lot" && returner.returnPct === 20, "a customer who returns 20% of what they buy is flagged as returning a lot, even while profitable");
ok(customerProfitability(sales, returns, cost, { from: "2026-09", to: "2026-09" }).length === 0, "sales outside the period are not counted");

const loan = { principal: 120000, annualRatePct: 0, termMonths: 12, startDate: "2026-01-01" };
ok(principalRepaid([loan], { from: "2026-03", to: "2026-03" }) === 10000, "a 120,000 interest-free loan over 12 months repays 10,000 of principal in each month");
ok(principalRepaid([{ ...loan, active: false }], { from: "2026-03", to: "2026-03" }) === 0, "a loan marked inactive repays nothing in the period");

const w = cashWaterfall({ ebitda: 1000000, interest: 100000, tax: 135000, principalRepaid: 200000, reinvestment: 150000, takeHome: 150000,
  partners: [{ name: "Asha", pct: 60 }, { name: "Ben", pct: 40 }] });
ok(w.afterInterestAndTax === 765000 && w.afterPrincipal === 565000 && w.afterReinvestment === 415000, "EBITDA 1m, less interest 100k and tax 135k, leaves 765k; less 200k principal, leaves 565k; less 150k reinvestment, leaves 415k");
ok(w.remainder === 265000 && !w.shortfall, "after the 150k take-home, 265k remains");
ok(w.partnerShares[0].amount === 159000 && w.partnerShares[1].amount === 106000, "the 265k is shared 60% to Asha (159k) and 40% to Ben (106k)");
const short = cashWaterfall({ ebitda: 200000, interest: 0, tax: 0, principalRepaid: 100000, reinvestment: 0, takeHome: 150000, partners: [{ name: "Asha", pct: 100 }] });
ok(short.shortfall && short.remainder === -50000 && short.partnerShares[0].amount === 0, "when take-home and commitments exceed what is earned, there is a shortfall and nothing is split");
ok(validatePartners([{ name: "A", pct: 60 }, { name: "B", pct: 50 }]) !== null && validatePartners([{ name: "", pct: 10 }]) !== null, "partners whose shares add up to more than 100%, or who have no name, are refused");
ok(cashWaterfall({ ebitda: 100, interest: 0, tax: 0, principalRepaid: 0, reinvestment: 0, takeHome: 0, partners: [{ name: "A", pct: 60 }] }).unallocatedPct === 40, "the share not yet assigned to a partner is shown");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
