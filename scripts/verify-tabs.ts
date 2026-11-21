// Tabs (lib/tabs.ts): naming, adding and taking off items, totals, and how a closed tab becomes sales (tax per line, service
// charge, credit needs a customer), with hand-worked cases; plus the wiring that must know about tabs (rules, data layer, period
// guard, read-only guard, menu, the page itself).
// Run: npx tsx scripts/verify-tabs.ts
import fs from "node:fs";
import { addToTab, changeTabQty, cleanTabName, closingSales, tabTotal, validateTabName } from "../lib/tabs";
import type { TabLine } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const SHOP = { salesTaxEnabled: true, salesTaxRatePct: 10 };
const OFF = { salesTaxEnabled: false, salesTaxRatePct: 10 };

// Names
ok(cleanTabName("  Table   4 ") === "Table 4", "a tab name has its spaces tidied");
ok(cleanTabName("x".repeat(60)).length === 40, "a tab name is capped at 40 characters");
ok(cleanTabName(42) === "", "a non-text name is treated as blank");
ok(validateTabName("", []) !== null, "a blank name is refused");
ok(validateTabName("Table 4", ["table 4"]) === "That table already has an open tab.", "a name already open is refused, ignoring case");
ok(validateTabName("Bar 2", ["Table 4"]) === null, "a new name is accepted");

// Lines and totals
let lines: TabLine[] = [];
lines = addToTab(lines, { productId: "C", name: "Coffee", unitPrice: 300, taxRatePct: 10 });
lines = addToTab(lines, { productId: "C", name: "Coffee", unitPrice: 300, taxRatePct: 10 });
ok(lines.length === 1 && lines[0].qty === 2, "the same item at the same price is one line with quantity 2");
lines = addToTab(lines, { productId: "C", name: "Coffee", unitPrice: 350 });
ok(lines.length === 2, "the same item at a different price is its own line");
ok(lines[1].taxRatePct === null, "an item with no rate of its own carries null, so the shop rate applies");
ok(tabTotal(lines) === 600 + 350, "the total is the sum of quantity times price");
ok(tabTotal([{ productId: "X", name: "x", qty: 1, unitPrice: 0.1 }, { productId: "Y", name: "y", qty: 2, unitPrice: 0.1 }]) === 0.3, "the total is rounded to cents");

const back = changeTabQty(lines, "C", 300, -2);
ok(back.length === 1 && back[0].unitPrice === 350, "taking a line to zero removes it from the tab");
ok(changeTabQty(lines, "C", 350, 1).find((l) => l.unitPrice === 350)!.qty === 2, "a quantity can go up");
ok(changeTabQty(lines, "C", 300, -5).every((l) => l.unitPrice !== 300), "a line never goes below zero");

// Closing
const tab = {
  table: "Table 4",
  lines: [
    { productId: "C", name: "Coffee", qty: 2, unitPrice: 300, taxRatePct: 10 },
    { productId: "B", name: "Book", qty: 1, unitPrice: 250, taxRatePct: 0 },
  ] as TabLine[],
};
const base = { date: "2026-10-30", paymentMethod: "cash" as const };

const nothing = closingSales({ table: "T", lines: [] }, base, SHOP);
ok(nothing.sales === null && nothing.error !== null, "an empty tab cannot be closed");
ok(closingSales(tab, { ...base, paymentMethod: "credit" }, SHOP).error !== null, "a tab on credit needs the customer's name");
ok(closingSales(tab, { ...base, serviceChargePct: 10 }, SHOP).error !== null, "a service charge needs the service item it is recorded under");
ok(closingSales(tab, { ...base, serviceChargePct: 150, serviceProductId: "SVC" }, SHOP).error !== null, "a service charge above 100 percent is refused");

const plain = closingSales(tab, base, SHOP);
ok(plain.error === null && plain.sales!.length === 2, "each item becomes one sale");
ok(plain.sales![0].qty === 2 && plain.sales![0].unitPrice === 300, "a sale keeps its quantity and price");
ok(plain.sales![0].taxAmount === 60, "coffee: 600 at 10 percent is 60 of tax, added on top");
ok(plain.sales![1].taxAmount === undefined, "a book at 0 percent carries no tax");
ok(plain.sales!.every((s) => s.date === "2026-10-30" && s.paymentMethod === "cash" && s.notes === "Table 4"), "every sale carries the date, payment and table");
ok(plain.sales!.every((s) => s.customer === undefined), "a cash tab without a name carries no customer");

const credit = closingSales(tab, { ...base, paymentMethod: "credit", customer: "  Ann  " }, SHOP);
ok(credit.error === null && credit.sales!.every((s) => s.customer === "Ann" && s.paymentMethod === "credit"), "a credit tab carries the trimmed customer name on every sale");

const meal: TabLine[] = [
  { productId: "C", name: "Coffee", qty: 2, unitPrice: 300, taxRatePct: 10 },
  { productId: "M", name: "Meal", qty: 1, unitPrice: 1000 },
];
const svc = closingSales({ table: "Table 9", lines: meal }, { ...base, serviceChargePct: 10, serviceProductId: "SVC" }, SHOP);
ok(svc.error === null && svc.sales!.length === 3, "a service charge is one extra sale");
ok(svc.sales![1].taxAmount === 100, "a meal with no rate of its own is taxed at the shop rate");
ok(svc.sales![2].productId === "SVC" && svc.sales![2].unitPrice === 160, "the service charge is 10 percent of the 1600 bill");
ok(svc.sales![2].taxAmount === 16, "the service charge is taxed at the shop rate");
ok(/service charge 10%/.test(svc.sales![2].notes ?? ""), "the service sale says what it was");

const none = closingSales(tab, { ...base, serviceChargePct: 0 }, SHOP);
ok(none.sales!.length === 2, "a service charge of 0 adds no line and needs no item");

const untaxed = closingSales({ table: "Table 9", lines: meal }, base, OFF);
ok(untaxed.sales!.every((s) => s.taxAmount === undefined), "with sales tax switched off no sale carries tax");

// Wiring
const read = (p: string) => fs.readFileSync(p, "utf8");
const rules = read("firestore.rules");
ok(/match \/tabs\/\{docId\}/.test(rules), "the rules have a tabs collection");
const tabsRule = rules.slice(rules.indexOf("match /tabs/{docId}"), rules.indexOf("match /tabs/{docId}") + 600);
ok(/allow read: if isOwnerOrActiveMember\(/.test(tabsRule), "a tab can be read by any active member");
ok(/allow create, update: if isOwnerOrOperatingMember\(/.test(tabsRule), "owner, manager and staff can open and change tabs");
ok(/allow delete: if isOwnerOrManager\(businessId\) && !isPublicDemo\(businessId\)/.test(tabsRule), "only an owner or manager can delete a tab, and never in the public demo");

const dc = read("contexts/DataContext.tsx");
ok(/collection\(db, "users", bizId, "tabs"\)/.test(dc) || /"tabs"/.test(dc), "the data layer reads the tabs collection");
ok(/const tabs = readyList\(loading, tabsRaw\)/.test(dc), "tabs are exposed as a ready list");
ok(/\btabs,/.test(dc), "tabs are in the data context value");
ok(/addTab: async/.test(dc) && /updateTabLines: async/.test(dc) && /closeTab: async/.test(dc) && /deleteTab: async/.test(dc), "the four tab operations exist");
const closeStart = dc.indexOf("closeTab: async");
const closeBody = closeStart >= 0 ? dc.slice(closeStart, closeStart + 2600) : "";
ok(/closingSales\(/.test(closeBody), "closing a tab goes through closingSales");
ok(/writeBatch\(/.test(closeBody), "closing a tab writes its sales and the tab in one batch");
ok(/status: "closed"/.test(closeBody), "closing a tab marks it closed");
ok(/logAudit\(\s*"tab"/.test(closeBody), "closing a tab is written to the audit log");

const guard = read("lib/periodGuards.ts");
ok(/closeTab: \(args\) => \[args\[1\]\?\.date\]/.test(guard), "closing a tab is checked against the locked period by its date");
ok(/\|close[|)]/.test(read("lib/readOnlyGuard.ts")), "the accountant read-only guard covers closing a tab");

const shell = read("components/AppShell.tsx");
ok(/href: "\/tabs"[^\n]*roles: \["owner", "manager", "staff"\]/.test(shell), "the Tabs menu entry shows for owner, manager and staff");
ok(/href: "\/tabs"/.test(read("lib/navPrefs.ts")), "Tabs is in the menu preferences list");

const page = read("app/tabs/page.tsx");
ok(/useRequireRole\(\["owner", "manager", "staff"\]\)/.test(page), "the Tabs page is limited to owner, manager and staff");
ok(/closeTab\(current\.id/.test(page) && /deleteTab\(current\.id\)/.test(page), "the page closes and deletes tabs through the data layer");
ok(/validateTabName|addTab\(name\)/.test(page), "the page opens tabs by name");
ok(/serviceChargePct/.test(page) && /serviceProductId/.test(page), "the page takes a service charge");

console.log(`verify-tabs: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
