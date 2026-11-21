// Web orders (lib/webOrders.ts), the order API route, the owner's queue, the pause switch on automations, and the wiring.
// Run: npx tsx scripts/verify-web-orders.ts
import fs from "node:fs";
import { cleanWebOrder, confirmProblem, matchLines, orderTotal } from "../lib/webOrders";
import { resolveAutomations, DEFAULT_AUTOMATIONS } from "../lib/leadIntake";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";

const good = cleanWebOrder({ externalId: "SHOP-1001", customerName: "  Amal  P ", contact: "077 123 4567", lines: [{ name: "Blue mug", sku: "MUG-B", qty: 2, unitPrice: 800 }, { name: "Tea 250g", qty: 1 }] }, TODAY);
ok(good.ok && good.value.lines.length === 2 && good.value.customerName === "Amal P" && good.value.placedOn === TODAY, "a valid order is cleaned; the day defaults to today");
ok(!cleanWebOrder({ customerName: "x", lines: [{ name: "a", qty: 1 }] }, TODAY).ok, "an order needs an externalId so a retry is not queued twice");
ok(!cleanWebOrder({ externalId: "E1", lines: [] }, TODAY).ok, "an order needs at least one line");
ok(!cleanWebOrder({ externalId: "E1", lines: [{ name: "a", qty: 0 }] }, TODAY).ok, "a line needs a quantity of at least 1");
ok(!cleanWebOrder({ externalId: "E1", lines: [{ name: "a", qty: 1, unitPrice: -5 }] }, TODAY).ok, "a negative price is refused");
ok(!cleanWebOrder({ externalId: "E1", lines: [{ qty: 1 }] }, TODAY).ok, "a line needs a name");
ok(!cleanWebOrder({ externalId: "E1", placedOn: "2026-02-30", lines: [{ name: "a", qty: 1 }] }, TODAY).ok, "an impossible date is refused");
ok(!cleanWebOrder({ externalId: "E1", lines: Array.from({ length: 51 }, () => ({ name: "a", qty: 1 })) }, TODAY).ok, "an order is capped at 50 lines");

const products = [
  { id: "p-mug", name: "Blue Mug", sku: "MUG-B", price: 800 },
  { id: "p-tea", name: "Tea 250g", barcode: "4790001", defaultSellPrice: 450 } as never,
];
const m = matchLines([{ name: "Blue mug", sku: "MUG-B", qty: 2 }, { name: "tea  250G", qty: 1 }, { name: "Scarf", qty: 1 }], products as never);
ok(m[0].productId === "p-mug" && m[1].productId === "p-tea" && m[2].productId === undefined, "lines match by sku, or by name ignoring case and spaces; an unknown line stays unmatched");
ok(matchLines([{ name: "Something", sku: "4790001", qty: 1 }], products as never)[0].productId === "p-tea", "a barcode in the sku field matches the product");
ok(orderTotal([{ qty: 2, unitPrice: 800 }, { qty: 1, unitPrice: 450.5 }]) === 2050.5, "the order total is quantity times price, summed");
ok(orderTotal([{ qty: 3 }]) === 0, "a line with no price adds nothing to the total (it cannot be confirmed without one)");
ok(confirmProblem({ status: "new", lines: [{ productId: "p" }] }) === null, "an order with every line matched can be confirmed");
ok(confirmProblem({ status: "new", lines: [{ productId: "p" }, {}] }) !== null, "an order with an unmatched line cannot be confirmed");
ok(confirmProblem({ status: "confirmed", lines: [{ productId: "p" }] }) !== null, "an order already dealt with cannot be confirmed again");

// pause switch
ok(DEFAULT_AUTOMATIONS.automationsPaused === false, "automations are not paused by default");
const paused = resolveAutomations({ automationsPaused: true, autoAssignInbound: true, autoFollowUpInbound: true, autoSequenceInbound: true, autoRevisitLostDays: 30, autoFollowUpAfterProposalDays: 3, outboundWebhookUrl: "https://hooks.example.com/x", alertLowReviews: true, mergeDuplicateInbound: true });
ok(!paused.autoAssignInbound && !paused.autoFollowUpInbound && !paused.autoSequenceInbound && paused.autoRevisitLostDays === 0 && paused.autoFollowUpAfterProposalDays === 0, "pausing stops every automatic change to leads");
ok(paused.outboundWebhookUrl === "", "pausing stops the webhook push");
ok(paused.alertLowReviews === true && paused.mergeDuplicateInbound === true, "pausing keeps the alerts and the duplicate merging working");
ok(resolveAutomations({ automationsPaused: false, autoAssignInbound: true }).autoAssignInbound === true, "switching the pause off restores the automations as set");

// wiring
const route = read("app/api/v1/businesses/[businessId]/orders/route.ts");
ok(route.includes("authoriseLeadApi(req, businessId)") && route.includes('status: "new"') && !route.includes("addSale"), "the order route queues the order and records no sale");
ok(route.includes('status: "duplicate"') && route.includes('where("externalId", "==", o.externalId)'), "a repeated order number is not queued twice");
ok(read("firestore.rules").includes("allow create: if false;") && read("firestore.rules").includes("affectedKeys().hasOnly(['status', 'decidedAt', 'decidedByName', 'lines', 'deliveredOn', 'driverName', 'area', 'startedAt', 'finishedAt', 'promisedDate', 'customerAddress'])"), "rules: clients cannot create a web order, and only the owner or manager can change it (status, decision, lines, delivery and v319 timing or address fields)");
const panel = read("components/ops/WebOrdersPanel.tsx");
ok(panel.includes("addSale(") && panel.includes("confirmProblem(o)") && !panel.includes("confirm(o)"), "confirming records each line through addSale, after every line is matched");
ok(panel.includes("Nothing is recorded until"), "the queue says nothing is recorded until confirmed");
ok(tabsForRole("owner").includes("webOrders") && tabsForRole("manager").includes("webOrders") && !tabsForRole("staff").includes("webOrders"), "web orders are for the owner and manager");
ok(read("contexts/DataContext.tsx").includes('requirePermission("manage:sales")') && read("contexts/DataContext.tsx").includes("updateWebOrder: async"), "updating an order needs manage:sales");
ok(read("lib/backupPayload.ts").includes("webOrders: data.webOrders"), "the backup carries web orders");
ok(read("components/AutomationsCard.tsx").includes("automationsPaused"), "the pause switch is on the Integrations page");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
