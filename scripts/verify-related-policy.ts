// Related parties and accounting policy changes (lib/relatedParty.ts, lib/policyLog.ts, red flags, pass 350). Run: tsx scripts/verify-related-policy.ts
import { readFileSync } from "node:fs";
import { relatedPartyShare } from "../lib/relatedParty";
import { policyChanges, policySummary, policyChangesInWindow, POLICY_ENTITY } from "../lib/policyLog";
import { redFlags, type FlagBalance, type FlagExtras, type FlagMonth } from "../lib/redFlags";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};

// ---- related-party share ----
const customers = [{ name: "Anil Perera", relatedParty: true }, { name: "Open Shop" }];
const suppliers = [{ name: "Sisters Trading", relatedParty: true }, { name: "City Electric" }];
const sales = [
  { customer: "Anil Perera", qty: 2, unitPrice: 100, date: "2026-11-02" },   // 200 related
  { customer: "open shop", qty: 3, unitPrice: 100, date: "2026-11-03" },    // 300 not related (name matched without case issues)
  { customer: "  ANIL   perera ", qty: 1, unitPrice: 100, date: "2026-10-09" }, // 100 related, October
  { customer: "Anil Perera", qty: 9, unitPrice: 100, date: "2025-06-01" },   // outside the range
];
const purchases = [
  { supplier: "Sisters Trading", qty: 1, unitCost: 50, date: "2026-11-04" },  // 50 related
  { supplier: "City Electric", qty: 1, unitCost: 150, date: "2026-11-05" },  // 150 not related
];
const share = relatedPartyShare({ sales, purchases, customers, suppliers, from: "2026-10", to: "2026-11" });
ok(share.salesTotal === 600, `sales in the range total 600 (the 2025 sale is left out); got ${share.salesTotal}`);
ok(share.salesRelated === 300, `related sales are 300 (name matched ignoring case and spaces); got ${share.salesRelated}`);
ok(share.salesPct === 50, `related share of sales is 50%; got ${share.salesPct}`);
ok(share.purchasesPct === 25, `related share of purchases is 25%; got ${share.purchasesPct}`);
ok(relatedPartyShare({ sales: [], purchases: [], customers, suppliers, from: "2026-10", to: "2026-11" }).salesPct === null, "no sales gives no share (not zero)");
const none = relatedPartyShare({ sales, purchases, customers: [{ name: "Anil Perera" }], suppliers: [], from: "2026-10", to: "2026-11" });
ok(none.salesRelated === 0 && none.salesPct === 0, "a customer not marked related counts nothing");
ok(relatedPartyShare({ sales: [{ customer: "", qty: 1, unitPrice: 9, date: "2026-11-01" }], purchases: [], customers: [{ name: "", relatedParty: true }], suppliers: [], from: "2026-11", to: "2026-11" }).salesRelated === 0, "a blank name never matches");

// ---- policy changes ----
const changed = policyChanges({ taxRatePct: 15, salesTaxEnabled: false }, { taxRatePct: 17, salesTaxEnabled: false });
ok(changed.length === 1 && changed[0].key === "taxRatePct", "one change: income tax rate 15 to 17");
ok(policySummary(changed[0]) === "Income tax rate changed from 15 to 17", `the summary reads plainly; got "${policySummary(changed[0])}"`);
ok(policyChanges({ salesTaxEnabled: undefined }, { salesTaxEnabled: false }).length === 0, "a switch never set and now off is not a change");
ok(policyChanges({ salesTaxEnabled: false }, { salesTaxEnabled: true })[0]?.to === "on", "a switch turned on is shown as on");
ok(policyChanges({ taxRatePct: 15 }, { costingMethod: "batch" }).length === 0, "a save that does not touch these settings logs nothing");
ok(policyChanges({ taxRatePct: 15 }, { taxRatePct: 15 }).length === 0, "the same value logs nothing");
ok(POLICY_ENTITY === "accounting policy", "the audit entity is 'accounting policy'");

const now = Date.UTC(2026, 10, 21);
const day = 86400000;
const audit = [
  { at: now - 10 * day, entity: POLICY_ENTITY },
  { at: now - 200 * day, entity: POLICY_ENTITY },
  { at: now - 400 * day, entity: POLICY_ENTITY },   // older than a year
  { at: now - 5 * day, entity: "settings" },        // not a policy change
];
ok(policyChangesInWindow(audit, now) === 2, "two policy changes in the last year, the old one and the other entity are left out");

// ---- red flags ----
const BAL: FlagBalance = { totalEquity: 1000, totalAssets: 1000, totalLiabilities: 0, loansPayable: 0, cash: 100, accountsReceivable: 0, inventoryValue: 0 };
const months: FlagMonth[] = [{ month: "2026-09", revenue: 100, operatingExpenses: 0, netProfitAfterTax: 10 }];
const flag = (id: string, extra?: FlagExtras) => redFlags(months, BAL, extra).find((f) => f.id === id);
const extra = (o: Partial<FlagExtras> = {}): FlagExtras => ({ relatedPartySalesPct: 0, relatedPartyPurchasePct: 0, policyChanges: 0, ...o });

ok(flag("related_party", extra({ relatedPartySalesPct: 25 }))?.status === "flag", "related-party sales over 10% are flagged");
ok(flag("related_party", extra({ relatedPartyPurchasePct: 40 }))?.status === "flag", "related-party purchases over 10% are flagged");
ok(flag("related_party", extra({ relatedPartySalesPct: 8, relatedPartyPurchasePct: 9 }))?.status === "ok", "under 10% on both is not flagged");
ok(flag("related_party", extra({ relatedPartySalesPct: null, relatedPartyPurchasePct: null }))?.status === "not_measured", "no sales or purchases is not measured");
ok(flag("related_party")?.status === "not_measured", "without the figures the related-party check is not measured");
ok(flag("policy_changes", extra({ policyChanges: 2 }))?.status === "flag", "two policy changes in a year is flagged");
ok(flag("policy_changes", extra({ policyChanges: 1 }))?.status === "ok", "one policy change is not flagged");
ok(flag("policy_changes", extra({ policyChanges: null }))?.status === "not_measured", "no audit log is not measured");
ok(flag("policy_changes")?.status === "not_measured", "without the figures the policy check is not measured");
ok(redFlags(months, BAL).length >= 1, "the red flags still run without the new figures");

// ---- wiring ----
const ctx = readFileSync(new URL("../contexts/DataContext.tsx", import.meta.url), "utf8");
ok(ctx.includes("policyChanges(settings as unknown") && ctx.includes("logAudit(POLICY_ENTITY, c.key"), "updateSettings writes each policy change to the audit log");
ok(ctx.includes('logAudit(POLICY_ENTITY, "costingMethod"'), "the cost-of-goods method change is audited under the same entity");
const cust = readFileSync(new URL("../app/customers/page.tsx", import.meta.url), "utf8");
ok(cust.includes("relatedParty: relatedParty || undefined") && cust.includes("Related party"), "the customer form has a related-party box and saves it");
const sup = readFileSync(new URL("../app/suppliers/page.tsx", import.meta.url), "utf8");
ok(sup.includes("relatedParty: relatedParty || undefined") && sup.includes("Related party"), "the supplier form has a related-party box and saves it");
const panel = readFileSync(new URL("../components/ops/ProfitSplitPanel.tsx", import.meta.url), "utf8");
ok(panel.includes("relatedPartyExtra\n  );") && !panel.includes(", relatedPartyExtra") && panel.includes("relatedPartyShare({") && panel.includes("policyChangesInWindow(auditLog"), "the profit panel passes related-party and policy figures to the red flags");
const types = readFileSync(new URL("../lib/types.ts", import.meta.url), "utf8");
ok(types.includes("relatedParty?: boolean") && types.split("relatedParty?: boolean").length === 3, "customers and suppliers both carry the related-party flag");

console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
// ---- depreciation method and useful life (pass 350, second part) ----
import { depreciationMethodLabel } from "../lib/policyLog";
ok(depreciationMethodLabel("reducing_balance") === "reducing balance" && depreciationMethodLabel(undefined) === "straight line", "the depreciation method reads in words");
const faSrc = readFileSync(new URL("../contexts/DataContext.tsx", import.meta.url), "utf8");
ok(faSrc.includes("Depreciation method for ${before.name} changed from") && faSrc.includes("Useful life for ${before.name} changed from"), "a change to the depreciation method or useful life is written to the audit log");
ok(faSrc.indexOf("const before = fixedAssetsRaw.find") < faSrc.indexOf('"fixedAssets", id), patch);'), "the asset's old values are read before the save");
