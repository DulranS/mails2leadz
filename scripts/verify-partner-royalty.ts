// Partners' share of profit and franchise royalty (lib/partnerShare.ts), and their wiring on the profitability page.
// Run: /home/claude/.npm-global/bin/tsx scripts/verify-partner-royalty.ts
import fs from "node:fs";
import { partnerSharesProblem, royaltyDue, royaltyProblem, splitProfit } from "../lib/partnerShare";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

// 1. The shares must total exactly 100 and each partner needs a name and a share above zero.
ok(partnerSharesProblem([{ name: "A", sharePct: 50 }, { name: "B", sharePct: 50 }]) === null, "two partners at 50 and 50 are valid");
ok(partnerSharesProblem([{ name: "A", sharePct: 50 }]) !== null, "one partner is refused");
ok(partnerSharesProblem([{ name: "A", sharePct: 60 }, { name: "B", sharePct: 30 }])?.includes("90%") === true, "shares that do not total 100 are refused, with the total");
ok(partnerSharesProblem([{ name: " ", sharePct: 50 }, { name: "B", sharePct: 50 }]) !== null, "a partner with no name is refused");
ok(partnerSharesProblem([{ name: "A", sharePct: 0 }, { name: "B", sharePct: 100 }]) !== null, "a share of zero is refused");
ok(partnerSharesProblem(Array.from({ length: 11 }, (_, i) => ({ name: `P${i}`, sharePct: 100 / 11 }))) !== null, "more than ten partners is refused");

// 2. The split adds back exactly to the profit, with the last partner taking the rounding.
const split = splitProfit(1000, [{ name: "A", sharePct: 33.33 }, { name: "B", sharePct: 33.33 }, { name: "C", sharePct: 33.34 }]);
const total = Math.round(split.reduce((t, s) => t + s.amount, 0) * 100) / 100;
ok(total === 1000, "the partners' amounts add back exactly to the profit");
ok(split[0].amount === 333.3 && split[1].amount === 333.3, "each partner gets their share to the cent");
ok(splitProfit(-400, [{ name: "A", sharePct: 75 }, { name: "B", sharePct: 25 }]).map((s) => s.amount).join(",") === "-300,-100", "a loss is shared the same way");
ok(splitProfit(0, [{ name: "A", sharePct: 50 }, { name: "B", sharePct: 50 }]).every((s) => s.amount === 0), "no profit means no share");

// 3. Royalty: a percentage of revenue, never negative, and the rate must be above zero and at most 100.
ok(royaltyDue(20000, 5) === 1000, "5% of 20,000 is 1,000");
ok(royaltyDue(-500, 5) === 0, "a period with no revenue owes nothing");
ok(royaltyDue(333.33, 3.5) === 11.67, "the royalty is rounded to the cent");
ok(royaltyProblem(0) !== null && royaltyProblem(101) !== null && royaltyProblem(NaN) !== null, "a royalty of zero, above 100, or not a number is refused");
ok(royaltyProblem(100) === null, "a royalty of exactly 100% is allowed");

// 4. Wiring: the card is on the profitability page, reads the whole-month totals, and says nothing is saved or posted.
const card = fs.readFileSync("components/SharesCard.tsx", "utf8");
const page = fs.readFileSync("app/profitability/page.tsx", "utf8");
ok(page.includes("<SharesCard profit={windowProfit} revenue={windowRevenue} currency={currency} />"), "the profitability page shows the card");
ok(page.includes("r.netProfitPreTax") && page.includes("r.totalRevenue"), "the card's figures come from the monthly P&L");
ok(card.includes("Nothing is saved or posted"), "the card says nothing is saved or posted");
ok(!/localStorage|sessionStorage|addDoc|updateDoc|setDoc|fetch\(/.test(card), "the card writes and sends nothing");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
