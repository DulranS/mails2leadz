// Purchase order approval (lib/poApproval.ts): when an order needs approval, who may decide, and what each decision changes.
import { decidePoApproval, needsPoApproval, orderCost, isCommitted, validatePoThreshold } from "../lib/poApproval";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

ok(orderCost(3, 19.99) === 59.97, "an order's cost is quantity times unit cost, to the cent");
ok(!needsPoApproval(10, 100, undefined) && !needsPoApproval(10, 100, 0), "with no threshold set, no order needs approval");
ok(needsPoApproval(10, 100, 500) && !needsPoApproval(5, 100, 500) && !needsPoApproval(5, 100, 500.0), "an order above the amount needs approval; one at or below it does not");
ok(validatePoThreshold(0) === null && validatePoThreshold(5000) === null && validatePoThreshold(-1) !== null, "the amount must be zero or more (zero turns it off)");
ok(!isCommitted("awaiting_approval") && isCommitted("ordered") && isCommitted("received") && !isCommitted("cancelled"), "only approved, placed or received orders count as committed");

const waiting = { status: "awaiting_approval" as const };
ok(decidePoApproval(waiting, "approved", { role: "owner", name: "Owner" }, 1).ok, "an owner can approve a waiting order");
const approved = decidePoApproval(waiting, "approved", { role: "manager", name: "Mgr" }, 5);
ok(approved.ok && approved.patch.status === "ordered" && approved.patch.approvedByName === "Mgr", "approving places the order and records who approved it");
const rejected = decidePoApproval(waiting, "rejected", { role: "owner", name: "Owner" }, 5, "  Too expensive this month  ");
ok(rejected.ok && rejected.patch.status === "cancelled" && rejected.patch.rejectionNote === "Too expensive this month", "rejecting cancels the order and keeps the reason, tidied");
ok(!decidePoApproval(waiting, "approved", { role: "staff", name: "S" }, 1).ok, "staff cannot approve an order");
ok(!decidePoApproval({ status: "ordered" }, "approved", { role: "owner", name: "O" }, 1).ok, "an order that is not waiting cannot be approved again");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
