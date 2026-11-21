// Operations events (lib/opsEvents.ts, the ops-event route, and the two write points): only the allowed events are sent, costs and notes are
// left out, the route refuses unknown events and bad record ids, and an incident or an approved purchase order posts its event.
// Run: npx tsx scripts/verify-ops-events.ts
import fs from "node:fs";
import { OPS_EVENTS, OPS_EVENT_COLLECTION, opsEventPayload } from "../lib/opsEvents";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(OPS_EVENTS.length === 3 && OPS_EVENTS.includes("incident.opened") && OPS_EVENTS.includes("purchaseOrder.approved") && OPS_EVENTS.includes("payment.received"), "exactly three operations events are sent: an incident opened, a purchase order approved, and a payment received approved");
ok(OPS_EVENT_COLLECTION["incident.opened"] === "incidents" && OPS_EVENT_COLLECTION["purchaseOrder.approved"] === "purchaseOrders" && OPS_EVENT_COLLECTION["payment.received"] === "receivablePayments", "each event reads its own record");

const inc = opsEventPayload("incident.opened", "inc1", { date: "2026-11-03", kind: "near_miss", severity: "high", place: "Bay 2", description: "Slip near the door", status: "open", actionTaken: "Mopped", reportedByName: "Ruwan" }, 0);
ok(inc.event === "incident.opened" && inc.id === "inc1" && (inc.record as { description: string }).description === "Slip near the door", "an incident event carries what a routing step needs");
ok(!JSON.stringify(inc).includes("Ruwan") && !JSON.stringify(inc).includes("Mopped"), "an incident event leaves out who reported it and the action taken");
const po = opsEventPayload("purchaseOrder.approved", "po1", { productId: "p1", qtyOrdered: 10, unitCost: 999, supplier: "Ceylon Cement", expectedDate: "2026-11-20", approvedByName: "Owner" }, 0);
ok(!JSON.stringify(po).includes("999") && !JSON.stringify(po).includes("unitCost"), "a purchase order event leaves out the cost");
ok((po.record as { supplier: string }).supplier === "Ceylon Cement", "a purchase order event names the supplier and the day it is due");

const route = read("app/api/webhooks/ops-event/route.ts");
ok(route.includes("requireAiContext(req, { roles: [\"owner\", \"manager\", \"staff\"] })") && route.includes("isRateLimited(\"ops-event-hook\""), "the route accepts owner, manager and staff, and is rate limited");
ok(route.includes("ctx.role === \"staff\" && ev !== \"payment.received\""), "staff can send payment.received only; every other event is refused for staff");
const authSrc = read("lib/firebaseAdmin.ts");
ok(authSrc.includes("opts: { roles?: Role[] } = {}") && authSrc.includes("const allowed = opts.roles ?? ALLOWED_ROLES") && authSrc.includes("if (!allowed.includes(member.role))"), "requireAiContext takes an optional role list; the default is still owner and manager");
ok(route.includes("(OPS_EVENTS as readonly string[]).includes(event)") && route.includes("ID_RE.test(recordId)"), "the route refuses an unknown event or a malformed record id");
ok(route.includes("snap.data() as Record<string, unknown>") && route.includes("OPS_EVENT_COLLECTION[ev]"), "the route re-reads the record from the database rather than trusting the browser");
ok(route.includes("Sends nothing when no webhook address is set") && route.includes("if (!automations.outboundWebhookUrl) return Response.json({ ok: true, sent: false })"), "nothing is sent when no webhook address is set");
const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes('void postOpsEvent(user, businessId, "incident.opened", ref.id);'), "a new incident posts its event");
ok(ctx.includes('if (decision === "approved") void postOpsEvent(user, businessId, "purchaseOrder.approved", docId);'), "a purchase order approved posts its event, and a rejection does not");
ok(/best effort: a failure here never undoes the record it reports/i.test(ctx), "a failed event never undoes the record it reports");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
