// Dividend tax withholding (v290, lib/shareholderDividends.ts): the rate is validated, each person's tax and net are exact to the cent,
// old dividends (before v290) still read as "no tax", statements and exports carry the tax, and the wiring is in place.
import fs from "node:fs";
import path from "node:path";
import {
  dividendAllocations, dividendLedgerRows, holderStatementRows, holderStatements, taxWithheldTotal, validateDividend, validateWithholding, withholdingSplit,
} from "../lib/shareholderDividends";
import type { EquityHolder, ShareholderDividend } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const cents = (n: number) => Math.round(n * 100);

// 1. The rate
for (const good of [undefined, null, 0, 15, 100, 15.5, 17.25]) ok(validateWithholding(good) === null, `a rate of ${good} is accepted`);
for (const bad of [-1, 101, 15.555, Number.NaN, Number.POSITIVE_INFINITY]) ok(validateWithholding(bad) !== null, `a rate of ${bad} is refused`);

// 2. Exact split: 600 / 300 / 100 shares of 1,000 at 15%
const holders: EquityHolder[] = [
  { id: "f", name: "Founder", shares: 600 },
  { id: "p", name: "Partner", shares: 300 },
  { id: "i", name: "Investor", shares: 100 },
];
const taxed = withholdingSplit(dividendAllocations(1000, holders), 15);
const by = (id: string) => taxed.find((x) => x.holderId === id)!;
ok(by("f").amount === 600 && by("f").withheld === 90 && by("f").net === 510, "Founder: 600 gross, 90 tax, 510 net");
ok(by("p").withheld === 45 && by("p").net === 255, "Partner: 45 tax, 255 net");
ok(by("i").withheld === 15 && by("i").net === 85, "Investor: 15 tax, 85 net");
ok(taxed.reduce((s, x) => s + cents(x.withheld), 0) === 15000, "the tax across everyone is exactly 150.00");

// 3. No rate: nothing withheld, the whole amount is net
const none = withholdingSplit(dividendAllocations(1000, holders), 0);
ok(none.every((x) => x.withheld === 0 && x.net === x.amount), "with no rate, nothing is withheld and net equals the amount");

// 4. Every person's tax plus net equals what they were allocated, to the cent, across awkward amounts and rates
let exact = true;
for (let amount = 0.01; amount < 2000; amount += 13.37) {
  for (const pct of [7.5, 17.25, 33.33, 100]) {
    for (const a of withholdingSplit(dividendAllocations(Math.round(amount * 100) / 100, [
      { id: "x", name: "X", shares: 1 }, { id: "y", name: "Y", shares: 2 }, { id: "z", name: "Z", shares: 3 },
    ]), pct)) {
      if (cents(a.withheld) + cents(a.net) !== cents(a.amount)) exact = false;
      if (a.withheld < 0 || a.net < 0) exact = false;
    }
  }
}
ok(exact, "withheld + net = allocated, to the cent, for every person across many amounts and rates");

// 5. Validation carries into a declaration
const base = { amount: 500, date: "2026-11-16", holders, distributable: 10000 };
ok(validateDividend({ ...base, withholdingPct: 15 }).length === 0, "a dividend with a valid rate can be declared");
ok(validateDividend({ ...base, withholdingPct: 120 }).some((m) => /percentage from 0 to 100/.test(m)), "a rate over 100 stops the declaration");
ok(validateDividend({ ...base }).length === 0, "no rate given: the dividend is valid as before");

// 6. Records from before v290 (no tax fields) and new ones, in a statement
const dividends: ShareholderDividend[] = [
  {
    id: "d1", date: "2026-06-30", amount: 900, withholdingPct: 15, withheld: 135, capitalEntryId: "c1",
    allocations: [
      { holderId: "a", name: "Ann", shares: 6, amount: 600, withheld: 90, net: 510 },
      { holderId: "b", name: "Ben", shares: 3, amount: 300, withheld: 45, net: 255 },
    ],
  },
  {
    id: "d0", date: "2025-12-31", amount: 100, allocations: [{ holderId: "a", name: "Ann", shares: 6, amount: 100 }],
  },
];
const cap: EquityHolder[] = [{ id: "a", name: "Ann", shares: 6 }, { id: "b", name: "Ben", shares: 3 }];
const rows = holderStatements(cap, [], dividends);
const ann = rows.find((r) => r.holderId === "a")!;
const ben = rows.find((r) => r.holderId === "b")!;
ok(ann.received === 700 && ann.withheld === 90 && ann.netReceived === 610, "Ann: 700 before tax, 90 withheld, 610 after tax (the old dividend has no tax)");
ok(ben.withheld === 45 && ben.netReceived === 255, "Ben: 45 withheld, 255 after tax");
ok(taxWithheldTotal(dividends) === 135, "the tax on record is 135.00; the old dividend adds nothing");
const sr = holderStatementRows(rows).find((r) => r.holder === "Ann")!;
ok(sr.tax_withheld === 90 && sr.net_received === 610, "the statement CSV carries tax withheld and net received");

// 7. Ledger export: a row per person per dividend, with the rate, the tax and the net
const led = dividendLedgerRows(dividends);
const annNew = led.find((r) => r.date === "2026-06-30" && r.holder === "Ann")!;
ok(annNew.withholding_pct === 15 && annNew.tax_withheld === 90 && annNew.net_paid_to_holder === 510 && annNew.paid_to_holder === 600, "ledger: 15%, tax 90, net 510, gross 600");
const annOld = led.find((r) => r.date === "2025-12-31" && r.holder === "Ann")!;
ok(annOld.withholding_pct === 0 && annOld.tax_withheld === 0 && annOld.net_paid_to_holder === 100, "ledger: an old dividend reads as no tax, net equal to gross");

// 8. The wiring: the store works out the split and stores it; the form takes the rate
const root = process.cwd();
const ctx = fs.readFileSync(path.join(root, "contexts/DataContext.tsx"), "utf8");
ok(ctx.includes("withholdingSplit(dividendAllocations(dividend.amount, equity.holders), pct)"), "the store works out tax and net per person when it records a dividend");
ok(ctx.includes("withholdingPct: pct, withheld, capitalEntryId"), "the dividend record stores the rate and the total tax");
ok(ctx.includes("withholdingPct: pct,") && ctx.includes("withholdingPct?: number"), "the record call accepts a rate and validates it on the server");
const ui = fs.readFileSync(path.join(root, "components/ShareholderDividends.tsx"), "utf8");
ok(ui.includes("Tax withheld %") && ui.includes("taxWithheldTotal(dividends)"), "the form has a tax rate field and the page shows tax on record");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) { console.error(`${fails} failed`); process.exit(1); }
