// Printable kitchen ticket (lib/kitchenPrint.ts): the table, the items and quantities appear, names are escaped so a typed
// name cannot break the page, and the Kitchen and Tabs pages print through the shared helper. Run: npx tsx scripts/verify-kitchen-print.ts
import fs from "node:fs";
import { kitchenTicketHtml } from "../lib/kitchenPrint";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const ticket = {
  id: "k1",
  status: "new" as const,
  sentAt: 1,
  items: [
    { productId: "a", name: "Coffee", qty: 2, unitPrice: 150 },
    { productId: "b", name: "<b>Cake</b> & cream", qty: 1, unitPrice: 300 },
  ],
};
const html = kitchenTicketHtml("Table 4", ticket, "18:40");
ok(html.includes("<h1>Table 4</h1>"), "the table name is the heading");
ok(html.includes("2 ×") && html.includes(">Coffee<"), "the quantity and item name are printed");
ok(html.includes("&lt;b&gt;Cake&lt;/b&gt; &amp; cream") && !html.includes("<b>Cake</b>"), "a typed name is escaped, not read as markup");
ok(html.includes("18:40") && html.includes("new"), "the time sent and the status are shown");
ok(kitchenTicketHtml("<script>x</script>", ticket, "t").includes("&lt;script&gt;"), "the table name is escaped too");

const kitchen = fs.readFileSync("app/kitchen/page.tsx", "utf8");
ok(/printJob\(\{[\s\S]*kitchenTicketHtml\(table, ticket, sentAt\)/.test(kitchen), "the Kitchen page prints through the shared helper (printer first, then the browser)");
const tabs = fs.readFileSync("app/tabs/page.tsx", "utf8");
ok(/printJob\(\{[\s\S]*kitchenTicketHtml\(current\.table, t, sentAt\)/.test(tabs), "the Tabs page prints the ticket (printer first, then the browser)");

console.log(`verify-kitchen-print: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
