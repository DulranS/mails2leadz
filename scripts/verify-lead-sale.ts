// Won leads recorded as sales (lib/leadSales.ts), the transaction and guards in DataContext, the period lock, and the Leads page.
// Run: /home/claude/.npm-global/bin/tsx scripts/verify-lead-sale.ts
import fs from "node:fs";
import {
  LEAD_SALE_PAYMENTS, leadDeleteProblem, leadSaleDefaultPrice, leadSaleDraftFor, leadSaleOfferings, leadSaleProblem, leadStageProblem,
} from "../lib/leadSales";
import type { Lead } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const lead = (o: Partial<Lead> = {}): Lead => ({
  id: "l1", name: "Ruwan Silva", contact: "+94 71 000 0000", stage: "won", createdAt: 0, source: "Referral", estValue: 15000, ...o,
});
const TODAY = "2026-11-01";

// 1. Only a Won lead without a sale can be recorded.
ok(leadSaleProblem(lead()) === null, "a Won lead can be recorded");
for (const st of ["new", "contacted", "qualified", "follow_up", "proposal_sent", "lost"] as Lead["stage"][]) {
  ok(leadSaleProblem(lead({ stage: st })) !== null, `a ${st} lead cannot be recorded`);
}
ok(leadSaleProblem(lead({ saleId: "s1" }))?.includes("already recorded") === true, "a lead with a sale cannot get a second");

// 2. A Won lead with a sale stays Won; without a sale it can move.
ok(leadStageProblem({ saleId: "s1" }, "contacted") !== null, "a lead with a sale cannot move off Won");
ok(leadStageProblem({ saleId: "s1" }, "won") === null, "a lead with a sale can stay Won");
ok(leadStageProblem({}, "contacted") === null, "a lead without a sale can move");
ok(leadStageProblem({ saleId: "s1" }, undefined) === null, "an edit that does not touch the stage is not blocked");

// 3. Deletion: a lead with a sale cannot be deleted.
ok(leadDeleteProblem({ saleId: "s1" }) !== null, "a lead with a sale cannot be deleted");
ok(leadDeleteProblem({}) === null, "a lead without a sale can be deleted");

// 4. Offerings: active products and services, by name.
const products = [
  { id: "p2", name: "Stove", active: true, defaultSellPrice: 9000 },
  { id: "p1", name: "Ceiling fan", active: true, defaultSellPrice: 4500 },
  { id: "p3", name: "Old item", active: false },
];
ok(leadSaleOfferings(products).map((p) => p.id).join(",") === "p1,p2", "only active products are offered, by name");

// 5. Starting price: the deal's estimate when set, otherwise the product's price.
ok(leadSaleDefaultPrice(15000, 4500) === 15000, "the estimated value is the starting price when it is set");
ok(leadSaleDefaultPrice(undefined, 4500) === 4500, "the product's price is the starting price when there is no estimate");
ok(leadSaleDefaultPrice(0, 4500) === 4500, "a zero estimate falls back to the product's price");
ok(leadSaleDefaultPrice(undefined, undefined) === undefined, "nothing to start from gives no price");

// 6. The draft: one unit, the price, today, the lead's name and contact, its source as the channel unless changed.
const d = leadSaleDraftFor(lead(), "p1", 15000.456, "card", TODAY);
ok(d.qty === 1 && d.unitPrice === 15000.46, "one unit at the price, rounded to cents");
ok(d.date === TODAY && d.customer === "Ruwan Silva", "dated today, for the lead's name");
ok(d.customerContact === "+94 71 000 0000", "the lead's contact is carried");
ok(d.saleChannel === "Referral", "the lead's source is the channel");
ok(leadSaleDraftFor(lead(), "p1", 1, "cash", TODAY, "Online").saleChannel === "Online", "a channel typed on the form wins over the source");
ok(!("saleChannel" in leadSaleDraftFor(lead({ source: undefined }), "p1", 1, "cash", TODAY)), "no source and no channel leaves the channel off");
ok(!("customerContact" in leadSaleDraftFor(lead({ contact: undefined }), "p1", 1, "cash", TODAY)), "a blank contact is left off");

// 7. Payments are the ones a sale can be paid by in full, never credit.
ok((LEAD_SALE_PAYMENTS as { value: string }[]).every((m) => m.value !== "credit"), "credit is not offered on a lead sale");

// 8. Wiring.
const ctx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(ctx.includes("recordLeadSale: (leadId: string"), "DataContext declares recordLeadSale");
ok(/recordLeadSale: async \(leadId, sale\) => \{[\s\S]*?runTransaction\(db/.test(ctx), "recordLeadSale runs in one transaction");
ok(/recordLeadSale: async[\s\S]*?tx\.set\(saleRef[\s\S]*?tx\.update\(leadRef, \{ saleId: saleRef\.id \}\)/.test(ctx), "the transaction saves the sale and links the lead together");
ok(/recordLeadSale: async[\s\S]*?leadSaleProblem\(l\)/.test(ctx), "the transaction refuses a second sale or a lead that is not Won");
ok(/updateLead: async[\s\S]*?leadStageProblem\(cur\.data\(\) as Lead, l\.stage\)/.test(ctx), "updateLead refuses moving a lead with a sale off Won");
ok(/deleteLead: async[\s\S]*?leadDeleteProblem\(cur\.data\(\) as Lead\)/.test(ctx), "deleteLead refuses a lead with a sale");
ok(/const linkedLeads = leads\.filter\(\(l\) => l\.saleId === docId\)/.test(ctx), "deleting a sale finds the leads linked to it");
ok(/\], linkedBookings, linkedLeads\);/.test(ctx), "deleting a sale clears the lead's link in the same batch");
const guards = fs.readFileSync("lib/periodGuards.ts", "utf8");
ok(guards.includes("recordLeadSale: (args) => [args[1]?.date]"), "the period lock covers the sale date of a lead sale");
ok(fs.readFileSync("lib/types.ts", "utf8").includes("saleId?: string;\n  createdByUid?: string;\n  createdByName?: string;\n  createdAt: number;\n}\n\n// An opening balance") || fs.readFileSync("lib/types.ts", "utf8").includes("// The sale recorded from this lead once it was Won"), "Lead has a saleId field");
const page = fs.readFileSync("app/leads/page.tsx", "utf8");
ok(page.includes("Record as sale") && page.includes("✓ Sale recorded"), "the Leads page offers Record as sale and shows a recorded sale");
ok(page.includes("await recordLeadSale(") || page.includes("await recordLeadSale("), "the page records through the transaction");
ok(page.includes("onSell={canSell && lead.stage === \"won\" && !lead.saleId"), "the button only shows for a Won lead without a sale");
const manual = fs.readFileSync("USER-MANUAL.md", "utf8");
ok(manual.includes("**Record as sale.** When a lead is Won"), "the manual explains recording a lead sale");
ok(manual.includes("Balancr never counts the estimated value as revenue"), "the manual states the estimate is not revenue");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
