// Consignment (lib/consignment.ts) and its wiring: the stock still with a partner, what is owed on their reported sales, the
// settlement limit, the per-partner summary, and the data, rules, backup and page links. Hand-worked values throughout.
// Run: npx tsx scripts/verify-consignment.ts
import fs from "node:fs";
import { balanceOwed, onConsignmentQty, summarizeConsignments, validateConsignment, type ConsignmentEntry } from "../lib/consignment";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const e = (x: Partial<ConsignmentEntry> & Pick<ConsignmentEntry, "kind" | "partner" | "date">): ConsignmentEntry => ({ id: Math.random().toString(36).slice(2), createdAt: 1, ...x });
const book: ConsignmentEntry[] = [
  e({ kind: "placed", partner: "Kumar Stall", date: "2026-10-01", productName: "Mango jam", qty: 20 }),
  e({ kind: "placed", partner: "Kumar Stall", date: "2026-10-01", productName: "Chilli jam", qty: 10 }),
  e({ kind: "sold", partner: "Kumar Stall", date: "2026-10-20", productName: "Mango jam", qty: 8, unitPrice: 500, partnerSharePct: 30 }),
  e({ kind: "returned", partner: "Kumar Stall", date: "2026-10-25", productName: "Chilli jam", qty: 4 }),
  e({ kind: "settled", partner: "Kumar Stall", date: "2026-10-26", amount: 500 }),
  e({ kind: "placed", partner: "Nimal Shop", date: "2026-10-05", productName: "Mango jam", qty: 5 }),
];

// stock with partners
ok(onConsignmentQty(book, "Kumar Stall", "Mango jam") === 12, "20 placed less 8 sold leaves 12 with Kumar");
ok(onConsignmentQty(book, "kumar stall", "MANGO JAM") === 12, "partner and product match ignoring case and spaces");
ok(onConsignmentQty(book, "Kumar Stall", "Chilli jam") === 6, "10 placed less 4 returned leaves 6 chilli jam");
ok(onConsignmentQty(book, "Nimal Shop", "Mango jam") === 5, "stock with another partner is kept apart");

// money owed
ok(balanceOwed(book, "Kumar Stall") === 700, "8 x 500 at 30% is 1200 owed, less 500 paid, leaves 700");
ok(balanceOwed(book, "Nimal Shop") === 0, "a partner with no sales owes nothing");

// validation
ok(validateConsignment({ kind: "placed", partner: "  ", date: "2026-11-01", productName: "Jam", qty: 3 }, book) !== null, "a partner name is required");
ok(validateConsignment({ kind: "placed", partner: "New Stall", date: "2026-11-01", productName: "Jam", qty: 2.5 }, book) !== null, "units must be whole");
ok(validateConsignment({ kind: "placed", partner: "New Stall", date: "2026-11-01", productName: "Jam", qty: 2 }, book) === null, "a handover is accepted");
ok(validateConsignment({ kind: "returned", partner: "Kumar Stall", date: "2026-11-01", productName: "Mango jam", qty: 13 }, book) !== null, "cannot return more than is with the partner");
ok(validateConsignment({ kind: "sold", partner: "Kumar Stall", date: "2026-11-01", productName: "Mango jam", qty: 12, unitPrice: 500, partnerSharePct: 30 }, book) === null, "can report every unit that is with them");
ok(validateConsignment({ kind: "sold", partner: "Kumar Stall", date: "2026-11-01", productName: "Mango jam", qty: 1, unitPrice: 500, partnerSharePct: 120 }, book) !== null, "a partner share over 100 percent is refused");
ok(validateConsignment({ kind: "settled", partner: "Kumar Stall", date: "2026-11-01", amount: 701 }, book) !== null, "cannot pay more than is owed");
ok(validateConsignment({ kind: "settled", partner: "Kumar Stall", date: "2026-11-01", amount: 700 }, book) === null, "paying exactly the balance is accepted");
ok(validateConsignment({ kind: "placed", partner: "X", date: "11/01/2026", productName: "Jam", qty: 1 }, book) !== null, "dates must be ISO days");

// summary per partner, owed most first
const rows = summarizeConsignments(book);
const kumar = rows.find((r) => r.partner === "Kumar Stall")!;
ok(rows[0].partner === "Kumar Stall", "the partner owed the most comes first");
ok(kumar.placedQty === 30 && kumar.soldQty === 8 && kumar.returnedQty === 4 && kumar.withPartnerQty === 18, "Kumar: 30 placed, 8 sold, 4 back, 18 with them");
ok(kumar.reportedSales === 4000 && kumar.owedToPartner === 1200 && kumar.settled === 500 && kumar.balance === 700, "Kumar: 4000 sales, 1200 owed, 500 paid, 700 balance");
ok(kumar.yourShareOfSales === 2800, "Kumar: your share of sales is 2800");
ok(rows.find((r) => r.partner === "Nimal Shop")!.withPartnerQty === 5, "Nimal: 5 with them");

// wiring
const dc = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(dc.includes('collection(db, "users", businessId, "consignments")'), "the consignments are listened to");
ok(/"shipments", "rentals", "consignments",/.test(dc), "consignments are in the owner and manager read lists");
ok(dc.includes("addConsignmentEntry: async") && dc.includes("validateConsignment(e, consignments)"), "adding an entry checks it first");
ok(dc.includes('requirePermission("delete:records")') && dc.includes("deleteConsignmentEntry: async"), "only deleting needs delete rights");
ok(dc.includes("consignments: ConsignmentEntry[]"), "the data context exposes consignments");
const rules = fs.readFileSync("firestore.rules", "utf8");
ok(rules.includes("match /consignments/{docId}") && rules.includes("allow delete: if isOwner(businessId)"), "rules: owner and manager write, owner deletes");
ok(fs.readFileSync("lib/backupPayload.ts", "utf8").includes("consignments: data.consignments"), "the full backup includes consignments");
ok(fs.readFileSync("lib/periodGuards.ts", "utf8").includes("addConsignmentEntry"), "a closed period blocks new settlements");
ok(fs.readFileSync("components/AppShell.tsx", "utf8").includes('href: "/consignment"'), "the menu links to Consignment");
const page = fs.readFileSync("app/consignment/page.tsx", "utf8");
ok(page.includes("validateConsignment(input") && page.includes('can(role, "manage:products")'), "the page checks entries and limits writing to owner and manager");

console.log(`verify-consignment: ${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
