// Account and supplier portals (lib/accountPortal.ts and their routes and pages), and the SG&A split (lib/sga.ts and the income
// statement). Run: npx tsx scripts/verify-portals-sga.ts
import fs from "node:fs";
import { accountView, confirmOrderPlan, openOrdersFor, MAX_PORTAL_INVOICES, MAX_CONFIRM_NOTE } from "../lib/accountPortal";
import { sgaFunctionOf, sgaPercentOfRevenue, sgaSplit } from "../lib/sga";
import { expenseTotalsForMonth } from "../lib/calculations";
import { EXPENSE_CATEGORIES } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const sum = (total: number, paid: number, status: "paid" | "overdue" | "outstanding", dueDate: string | null) => ({
  total, paid, balance: Math.max(0, total - paid), status, dueDate, gross: total, adjustments: 0, net: total, tax: 0, isCredit: true, firstDate: "2026-10-01",
});

// customer account view
{
  const v = accountView([
    { key: "A", reference: "INV-1", issuedOn: "2026-09-01", summary: sum(100, 100, "paid", null) },
    { key: "B", reference: "INV-2", issuedOn: "2026-10-01", summary: sum(300, 50, "overdue", "2026-10-15") },
    { key: "C", reference: "INV-3", issuedOn: "2026-10-20", summary: sum(50, 0, "outstanding", "2026-11-20") },
  ]);
  ok(v.invoices[0].key === "B" && v.invoices[1].key === "C" && v.invoices[2].key === "A", "still owed comes first, earliest due date first, settled invoices last");
  ok(v.owed === 300 && v.overdue === 250, "the amount owed and the overdue part are summed");
  ok(Object.keys(v.invoices[0]).every((k) => ["key", "reference", "issuedOn", "total", "paid", "balance", "status", "dueDate", "link"].includes(k)), "each row carries only the customer-safe fields (no cost, margin, stock)");
  const linked = accountView([{ key: "Z", reference: "INV-9", issuedOn: "2026-10-01", summary: sum(10, 0, "outstanding", null), link: "https://x/invoice/t" }]);
  ok(linked.invoices[0].link === "https://x/invoice/t", "a signed invoice link is passed through");
  ok(accountView([{ key: "R", reference: "R", issuedOn: "2026-01-01", summary: sum(10.005, 0, "outstanding", null) }]).invoices[0].total === 10.01, "money is rounded to cents");
  const many = Array.from({ length: MAX_PORTAL_INVOICES + 20 }, (_, i) => ({ key: "k" + i, reference: "r", issuedOn: "2026-01-01", summary: sum(1, 1, "paid", null) }));
  ok(accountView(many).invoices.length === MAX_PORTAL_INVOICES, `the account shows at most ${MAX_PORTAL_INVOICES} invoices`);
  ok(accountView([]).owed === 0, "an account with nothing on it owes nothing");
}

// supplier orders
{
  const orders = [
    { id: "p1", supplier: "Ceylon Cement", status: "ordered", orderDate: "2026-10-01" },
    { id: "p2", supplier: "ceylon cement ", status: "in_transit", orderDate: "2026-10-05" },
    { id: "p3", supplier: "Ceylon Cement", status: "received", orderDate: "2026-09-01" },
    { id: "p4", supplier: "Someone Else", status: "ordered", orderDate: "2026-10-01" },
    { id: "p5", supplier: "Ceylon Cement", status: "cancelled", orderDate: "2026-09-01" },
  ];
  const open = openOrdersFor(orders, "Ceylon Cement").map((o) => o.id);
  ok(open.join() === "p1,p2", "a supplier sees only their own open orders, matched without regard to case or spaces");
  ok(!open.includes("p3") && !open.includes("p5") && !open.includes("p4"), "received, cancelled and other suppliers' orders are not shown");
}

// supplier confirmation
{
  const order = { id: "p1", supplier: "Ceylon Cement", status: "ordered", orderDate: "2026-10-01", expectedDate: "2026-10-20" };
  const good = confirmOrderPlan(order, "Ceylon Cement", { confirmedDate: "2026-10-22", note: "  Truck  leaves  Monday " }, 1);
  ok(good.ok && good.patch.supplierAck.confirmedDate === "2026-10-22", "a supplier can confirm a delivery day for their open order");
  ok(good.ok && !("expectedDate" in good.patch) && Object.keys(good.patch).join() === "supplierAck", "confirming never touches the expected date the owner set (the on-time record is untouched)");
  ok(good.ok && good.patch.supplierAck.note === "Truck leaves Monday", "the note is tidied");
  ok(good.ok && !("note" in (confirmOrderPlan(order, "Ceylon Cement", { confirmedDate: "2026-10-22", note: "   " }, 1) as never as { patch: { supplierAck: object } }).patch.supplierAck), "an empty note is left out");
  ok(!confirmOrderPlan(undefined, "Ceylon Cement", { confirmedDate: "2026-10-22" }, 1).ok, "an order that does not exist is refused");
  ok(!confirmOrderPlan(order, "Someone Else", { confirmedDate: "2026-10-22" }, 1).ok, "another supplier's order is refused");
  ok(!confirmOrderPlan({ ...order, status: "received" }, "Ceylon Cement", { confirmedDate: "2026-10-22" }, 1).ok, "an order that has arrived cannot be confirmed");
  ok(!confirmOrderPlan(order, "Ceylon Cement", { confirmedDate: "22/10/2026" }, 1).ok, "a date that is not a day is refused");
  ok(!confirmOrderPlan(order, "Ceylon Cement", { confirmedDate: "2026-09-30" }, 1).ok, "a delivery day before the order date is refused");
  ok(!confirmOrderPlan(order, "Ceylon Cement", { confirmedDate: "2027-12-01" }, 1).ok, "a delivery day more than a year out is refused");
  ok(MAX_CONFIRM_NOTE === 300, "the supplier note is capped at 300 characters");
}

// SG&A
{
  ok(sgaFunctionOf("Marketing") === "selling" && sgaFunctionOf("Sales payroll") === "selling" && sgaFunctionOf("Transport & logistics") === "selling", "marketing, sales payroll and delivery are selling");
  for (const c of ["Rent & utilities", "Payroll & labor", "Software & tools", "Professional fees", "Insurance", "Bank & payment fees", "Other overhead", "Something new"]) {
    ok(sgaFunctionOf(c) === "admin", `${c} is general & administrative`);
  }
  ok(EXPENSE_CATEGORIES.includes("Sales payroll" as never), "Sales payroll is an expense category, so sales staff can be split from office staff");
  const split = sgaSplit([{ category: "Marketing", amount: 300 }, { category: "Rent & utilities", amount: 1000 }, { category: "Sales payroll", amount: 200 }, { category: "Insurance", amount: 50.5 }]);
  ok(split.selling === 500 && split.admin === 1050.5 && split.total === 1550.5, "the split sums selling and admin, and the total is their sum");
  ok(sgaSplit([]).total === 0, "no expenses, nothing in either function");
  ok(sgaPercentOfRevenue(25, 100) === 25 && sgaPercentOfRevenue(10, 0) === null, "SG&A is shown as a share of revenue, and not at all with no revenue");

  const expenses = [
    { id: "1", name: "Ads", amount: 300, category: "Marketing", kind: "expense", isRecurring: false, recurrence: "monthly", startDate: "2026-10-05" },
    { id: "2", name: "Shop rent", amount: 1000, category: "Rent & utilities", kind: "expense", isRecurring: true, recurrence: "monthly", startDate: "2026-01-01" },
    { id: "3", name: "Sales staff", amount: 200, category: "Sales payroll", kind: "expense", isRecurring: true, recurrence: "monthly", startDate: "2026-01-01" },
    { id: "4", name: "Retainer", amount: 500, category: "Other overhead", kind: "revenue", isRecurring: true, recurrence: "monthly", startDate: "2026-01-01" },
    { id: "5", name: "Last year", amount: 999, category: "Insurance", kind: "expense", isRecurring: false, recurrence: "monthly", startDate: "2025-05-01" },
  ] as never;
  const t = expenseTotalsForMonth(expenses, "2026-10");
  ok(t.expenseTotal === 1500, "the operating expenses for the month are unchanged by the split (ads, rent, sales staff)");
  ok(t.sellingExpenses + t.adminExpenses === t.expenseTotal, "selling plus admin always equals operating expenses");
  ok(t.sellingExpenses === 500 && t.adminExpenses === 1000, "the split puts ads and sales staff under selling, rent under admin");
  ok(t.recurringRevenueTotal === 500, "recurring revenue is not counted as an expense or in the split");
}

// wiring
ok(read("app/api/portal/link/route.ts").includes('requireSignedIn(req)') && read("app/api/portal/link/route.ts").includes('"manager"'), "the owner's link route is for signed-in owners and managers only");
ok(read("app/api/supplier/confirm/route.ts").includes("ref.update({ supplierAck: plan.patch.supplierAck })") && !read("app/api/supplier/confirm/route.ts").includes("expectedDate"), "the supplier route writes supplierAck only and never the expected date");
ok(read("app/api/portal/route.ts").includes("accountView(rows)") && !read("app/api/portal/route.ts").includes("cost"), "the customer account view is built by the shared rules and sends no cost figures");
const supplierCode = read("app/api/supplier/route.ts").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
ok(supplierCode.includes("openOrdersFor") && !/unitCost|totalCost|margin/.test(supplierCode), "the supplier view sends no cost or margin (checked on code, not comments)");
ok(read("app/customers/page.tsx").includes("<PortalLinkButton kind=\"customer\"") && read("app/suppliers/page.tsx").includes("<PortalLinkButton kind=\"supplier\""), "both pages can make their links");
ok(read("app/purchase-orders/page.tsx").includes("supplier confirmed"), "the owner sees the supplier's confirmation on the order");
ok(read("app/statements/page.tsx").includes("sgaPercentOfRevenue") && read("app/statements/page.tsx").includes("m.sellingExpenses"), "the income statement shows the Selling and G&A split");
ok(read("lib/signedToken.ts").includes('"portal"') && read("lib/signedToken.ts").includes('"supplier"'), "the two new link types are signed tokens of their own purpose");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
