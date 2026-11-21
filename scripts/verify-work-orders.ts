// Work orders (lib/workOrders.ts): numbering, totals, validation, the status flow, overdue and the job board, and the estimate lines.
// Hand-worked values throughout. Run: npx tsx scripts/verify-work-orders.ts
import fs from "node:fs";
import {
  canMove,
  estimateLinesFromJob,
  isOverdue,
  jobBoard,
  labourTotal,
  nextWorkOrderNumber,
  partsTotal,
  validateWorkOrder,
  workOrderTotal,
  type WorkOrder,
  type WorkOrderInput,
  type WorkOrderLine,
} from "../lib/workOrders";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const labour: WorkOrderLine = { kind: "labour", productId: "svc-1", name: "Screen repair labour", qty: 1.5, unitPrice: 2000 };
const part: WorkOrderLine = { kind: "part", productId: "p-9", name: "Screen panel", qty: 2, unitPrice: 4500 };
const lines = [labour, part];
ok(workOrderTotal(lines) === 12000, "1.5 x 2000 plus 2 x 4500 is 12000");
ok(labourTotal(lines) === 3000 && partsTotal(lines) === 9000, "labour and parts are totalled separately");
ok(workOrderTotal([{ ...part, qty: 0.333, unitPrice: 10 }]) === 3.33, "totals are rounded to the cent");

ok(nextWorkOrderNumber([]) === "WO-0001", "the first job is WO-0001");
ok(nextWorkOrderNumber([{ number: "WO-0007" }, { number: "WO-0003" }]) === "WO-0008", "the next job follows the highest number used");

const base: WorkOrderInput = { item: "Samsung A12", problem: "Cracked screen", openedDate: "2026-11-01", lines, customer: "Ruwan" };
ok(validateWorkOrder(base) === null, "a complete job is accepted");
ok(validateWorkOrder({ ...base, item: "  " }) !== null, "the item is required");
ok(validateWorkOrder({ ...base, dueDate: "2026-10-30" }) !== null, "a due date before the job was opened is refused");
ok(validateWorkOrder({ ...base, dueDate: "2026-11-05" }) === null, "a later due date is accepted");
ok(validateWorkOrder({ ...base, lines: [{ ...part, productId: "" }] }) !== null, "each line needs a product");
ok(validateWorkOrder({ ...base, lines: [{ ...part, qty: 0 }] }) !== null, "a line quantity must be above zero");
ok(validateWorkOrder({ ...base, lines: [{ ...part, unitPrice: -1 }] }) !== null, "a line price cannot be negative");
ok(validateWorkOrder({ ...base, lines: new Array(61).fill(part) }) !== null, "a job has a line limit");

ok(canMove("open", "in_progress") && canMove("waiting_parts", "ready"), "the normal steps are allowed");
ok(canMove("ready", "collected") && canMove("open", "cancelled"), "collect and cancel are allowed at the right times");
ok(!canMove("collected", "open") && !canMove("cancelled", "in_progress"), "a finished job cannot be reopened");
ok(!canMove("open", "collected"), "a job cannot be collected before it is ready");

ok(isOverdue({ status: "in_progress", dueDate: "2026-10-30" }, "2026-11-01"), "a job past its due date and still open is overdue");
ok(!isOverdue({ status: "collected", dueDate: "2026-10-30" }, "2026-11-01"), "a collected job is never overdue");
ok(!isOverdue({ status: "open" }, "2026-11-01"), "a job with no due date is never overdue");

const orders: WorkOrder[] = [
  { id: "a", number: "WO-0001", item: "A", status: "open", openedDate: "2026-10-28", dueDate: "2026-10-30", lines, createdAt: 1 },
  { id: "b", number: "WO-0002", item: "B", status: "ready", openedDate: "2026-10-30", lines: [labour], createdAt: 2 },
  { id: "c", number: "WO-0003", item: "C", status: "waiting_parts", openedDate: "2026-11-01", lines: [part], createdAt: 3 },
  { id: "d", number: "WO-0004", item: "D", status: "collected", openedDate: "2026-10-01", lines: [labour], createdAt: 4 },
  { id: "e", number: "WO-0005", item: "E", status: "cancelled", openedDate: "2026-10-01", lines: [labour], createdAt: 5 },
];
const board = jobBoard(orders, "2026-11-01");
ok(board.open === 3, "three jobs are open (collected and cancelled are not)");
ok(board.overdue === 1 && board.readyToCollect === 1 && board.waitingParts === 1, "one overdue, one ready, one waiting for parts");
ok(board.openValue === 12000 + 3000 + 9000, "open value adds up the open jobs");

const est = estimateLinesFromJob({ lines });
ok(JSON.stringify(est) === JSON.stringify([{ productId: "svc-1", qty: 1.5, unitPrice: 2000 }, { productId: "p-9", qty: 2, unitPrice: 4500 }]), "estimate lines carry the same products, quantities and prices");

const dc = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(dc.includes('collection(db, "users", businessId, "workOrders")'), "work orders are listened to");
ok(dc.includes("makeEstimateFromWorkOrder") && dc.includes("estimateLinesFromJob"), "a job turns into an estimate");
ok(dc.includes('requireAnyPermission(["manage:sales", "create:sale"])') && dc.includes("deleteWorkOrder: async"), "front desk can open jobs, and only deleting needs delete rights");
const rules = fs.readFileSync("firestore.rules", "utf8");
ok(rules.includes("match /workOrders/{docId}"), "work orders have rules");
ok(fs.readFileSync("lib/backupPayload.ts", "utf8").includes("workOrders: data.workOrders"), "the full backup includes work orders");
ok(fs.readFileSync("components/AppShell.tsx", "utf8").includes('href: "/jobs"'), "the menu links to Jobs");
const page = fs.readFileSync("app/jobs/page.tsx", "utf8");
ok(page.includes("validateWorkOrder(") && page.includes("makeEstimateFromWorkOrder("), "the page validates jobs and makes estimates");
ok(page.includes("openPrintWindow(") && page.includes("escapeHtml("), "the job card prints with escaped text");

console.log(`verify-work-orders: ${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
