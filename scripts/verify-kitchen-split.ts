// Kitchen tickets and paying for part of a tab (lib/tabKitchen.ts): what is still unsent, ticket creation, the board's order,
// the status steps, and the part-payment plan, with hand-worked values; plus the wiring (the data context writes the sales, the
// Tabs page and the Kitchen page use them, the navigation has Kitchen). Run: npx tsx scripts/verify-kitchen-split.ts
import fs from "node:fs";
import { KITCHEN_LABEL, kitchenQueue, lineKey, newTicket, nextKitchenStatus, partPaymentPlan, sentQty, unsentLines } from "../lib/tabKitchen";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const lines = [
  { productId: "a", name: "Coffee", qty: 3, unitPrice: 150 },
  { productId: "b", name: "Cake", qty: 2, unitPrice: 300 },
];
ok(lineKey(lines[0]) === "a|150", "a line is identified by its item and price");
ok(unsentLines(lines, undefined).length === 2 && unsentLines(lines, undefined)[0].qty === 3, "nothing sent yet: all of it is unsent");

const t1 = { id: "k1", items: [{ productId: "a", name: "Coffee", qty: 2, unitPrice: 150 }], status: "new" as const, sentAt: 200 };
const unsent = unsentLines(lines, [t1]);
ok(unsent.length === 2 && unsent.find((x) => x.productId === "a")!.qty === 1 && unsent.find((x) => x.productId === "b")!.qty === 2, "after 2 coffees went up, 1 coffee and 2 cakes are still to send");
ok(sentQty([t1]).get("a|150") === 2, "the kitchen has been sent 2 coffees");
ok(unsentLines(lines, [{ ...t1, items: [{ productId: "a", name: "Coffee", qty: 3, unitPrice: 150 }] }]).length === 1, "a fully sent line is not sent again");

const ticket = newTicket(unsent, "k2", 300);
ok(!!ticket && ticket.status === "new" && ticket.items.length === 2 && ticket.sentAt === 300, "a new ticket starts as New with the unsent items");
ok(newTicket([], "k3", 1) === null, "nothing unsent makes no ticket");

ok(nextKitchenStatus("new") === "preparing" && nextKitchenStatus("preparing") === "ready" && nextKitchenStatus("ready") === "served", "tickets move New, Preparing, Ready, Served");
ok(nextKitchenStatus("served") === "served", "a served ticket stays served");
ok(KITCHEN_LABEL.ready === "Ready" && KITCHEN_LABEL.new === "New", "the labels read in plain words");

const tabs = [
  { id: "T1", table: "Table 4", status: "open", tickets: [t1, { id: "old", items: [], status: "served" as const, sentAt: 100 }] },
  { id: "T2", table: "Table 9", status: "closed", tickets: [{ id: "x", items: [], status: "new" as const, sentAt: 10 }] },
  { id: "T3", table: "Bar 2", status: "open", tickets: [{ id: "r", items: [], status: "ready" as const, sentAt: 50 }] },
];
const queue = kitchenQueue(tabs).map((q) => q.ticket.id);
ok(queue.join(",") === "r,k1", "the board shows unserved tickets from open tabs, oldest first (served and closed tabs are left out)");

const plan = partPaymentPlan(lines, { "a|150": 2 });
ok(!plan.error && plan.paid.length === 1 && plan.paid[0].qty === 2, "paying for 2 of 3 coffees pays for 2");
ok(plan.remaining.find((l) => l.productId === "a")!.qty === 1 && plan.remaining.find((l) => l.productId === "b")!.qty === 2, "the rest stays open: 1 coffee and 2 cakes");
ok(plan.paid[0].name === "Coffee" && plan.paid[0].unitPrice === 150, "the paid line keeps its name and price");
const all = partPaymentPlan(lines, { "a|150": 3, "b|300": 2 });
ok(!all.error && all.remaining.length === 0, "paying for everything leaves nothing on the tab");
ok(!!partPaymentPlan(lines, { "a|150": 4 }).error, "more than what is on the tab is refused");
ok(!!partPaymentPlan(lines, { "a|150": 1.5 }).error, "a part quantity of an item is refused (whole items only)");
ok(!!partPaymentPlan(lines, { "a|150": -1 }).error, "a negative quantity is refused");
ok(!!partPaymentPlan(lines, {}).error, "picking nothing is refused");

const dc = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(/payTabPart: async \(docId, pick, o\)/.test(dc) && /partPaymentPlan\(tab\.lines, pick\)/.test(dc), "the data context takes part payments and checks them itself");
ok(/if \(plan\.remaining\.length === 0\)/.test(dc), "the tab closes only when nothing is left on it");
ok(/setTabTickets: async \(docId, tickets\)/.test(dc), "the data context saves kitchen tickets");
const tabsPage = fs.readFileSync("app/tabs/page.tsx", "utf8");
ok(/Send new items to the kitchen/.test(tabsPage) && /unsentLines\(current\.lines, current\.tickets\)/.test(tabsPage), "the Tabs page sends only the unsent items to the kitchen");
ok(/payTabPart\(current\.id, pick,/.test(tabsPage), "the Tabs page pays for the chosen items");
const kitchen = fs.readFileSync("app/kitchen/page.tsx", "utf8");
ok(/kitchenQueue\(tabs\)/.test(kitchen) && /nextKitchenStatus/.test(kitchen), "the Kitchen page shows the queue and moves tickets on");
const shell = fs.readFileSync("components/AppShell.tsx", "utf8");
ok(/href: "\/kitchen"/.test(shell), "the navigation has Kitchen");
const nav = fs.readFileSync("lib/navPrefs.ts", "utf8");
ok(/href: "\/kitchen"/.test(nav), "the navigation preferences have Kitchen");

console.log(`verify-kitchen-split: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
