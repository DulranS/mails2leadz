// Trial balance (lib/trialBalance.ts and the Operations tab): a balanced set of balances, debits equal credits, zero balances left out, an unbalanced set
// reported as unbalanced, a reconciliation to the balance sheet, and the wiring. Worked numbers. Run: npx tsx scripts/verify-trial-balance.ts
import fs from "node:fs";
import { trialBalance, type TbInput } from "../lib/trialBalance";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Assets 10,000 = liabilities 2,000 + equity 8,000
const b: TbInput = {
  cash: 2000, accountsReceivable: 1000, inventoryValue: 1000, fixedAssetsNetBookValue: 5000, investmentsValue: 1000,
  loansLentValue: 0, supplierCredit: 0, totalAssets: 10000,
  accountsPayable: 500, loansPayable: 1000, accruedLiabilities: 500, customerDeposits: 0, salesTaxPayable: 0, totalLiabilities: 2000,
  ownersCapital: 5000, retainedEarnings: 3000, unrealizedInvestmentGain: 0, totalEquity: 8000,
};
const t = trialBalance(b);
ok(t.balanced && t.debits === 10000 && t.credits === 10000, "assets of 10,000 against liabilities of 2,000 and equity of 8,000: debits and credits both 10,000");
ok(t.reconcilesToSheet, "the listed lines reconcile to the balance sheet's totals");
ok(!t.lines.some((l) => l.amount === 0), "accounts with a zero balance are left off the list");
ok(t.lines.filter((l) => l.side === "debit").every((l) => ["Cash", "Accounts receivable", "Inventory", "Fixed assets (net book value)", "Investments", "Loans lent out", "Credit held with suppliers"].includes(l.account)), "every asset is in the debit column");
const off = trialBalance({ ...b, cash: 2500 });
ok(!off.balanced && !off.reconcilesToSheet, "a balance off by 500 is reported as unbalanced, and as not reconciling to the sheet");
ok(trialBalance({ ...b, unrealizedInvestmentGain: 300 }).reconcilesToSheet === false, "an equity line that the balance sheet total does not carry is caught");
ok(trialBalance({ ...b, unrealizedInvestmentGain: 300, totalEquity: 8300 }).reconcilesToSheet === true, "the same gain, with the total carried, reconciles");

ok(tabsForRole("owner").includes("trialbalance") && tabsForRole("manager").includes("trialbalance") && !tabsForRole("staff").includes("trialbalance"), "the trial balance is for the owner and manager");
const screen = read("components/ops/TrialBalancePanel.tsx");
ok(screen.includes("trialBalance(") && !/addDoc|updateDoc|setDoc|deleteDoc/.test(screen), "the screen reads the balance sheet and changes nothing");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
