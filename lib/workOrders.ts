// Work orders (job cards) for repair, trade, service and made-to-order work: a customer's item or job, the problem, the labour and
// parts, and the status from opened to collected. A job turns into an estimate (lib/types.ts Estimate) with one button, and the
// estimate then follows the usual path to a sale, so stock, tax and profit are handled exactly as they are everywhere else.
// Pure: validation, numbering, totals and the job board summary.

export const WORK_ORDER_STATUSES = ["open", "in_progress", "waiting_parts", "ready", "collected", "cancelled"] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  open: "Opened",
  in_progress: "In progress",
  waiting_parts: "Waiting for parts",
  ready: "Ready to collect",
  collected: "Collected",
  cancelled: "Cancelled",
};

// Where a job can move next. Collected and cancelled are the end: a job is not reopened (open a new one instead).
export const NEXT_STATUSES: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: ["in_progress", "waiting_parts", "ready", "cancelled"],
  in_progress: ["waiting_parts", "ready", "cancelled"],
  waiting_parts: ["in_progress", "ready", "cancelled"],
  ready: ["collected", "in_progress", "cancelled"],
  collected: [],
  cancelled: [],
};

export interface WorkOrderLine {
  kind: "labour" | "part";
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface WorkOrder {
  id: string;
  number: string; // WO-0001, numbered in the order jobs are opened
  customer?: string;
  customerContact?: string;
  item: string; // what the work is on: a device, a vehicle, a piece of furniture, the job itself
  problem?: string; // what the customer says is wrong or wanted
  status: WorkOrderStatus;
  openedDate: string; // ISO day
  dueDate?: string; // ISO day
  lines: WorkOrderLine[];
  notes?: string;
  estimateId?: string; // set once the job has been turned into an estimate
  createdByUid?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt?: number;
}

export type WorkOrderInput = Omit<WorkOrder, "id" | "number" | "status" | "estimateId" | "createdAt" | "createdByUid" | "createdByName" | "updatedAt">;

export const MAX_JOB_LINES = 60;
export const MAX_ITEM_LENGTH = 120;
export const MAX_PROBLEM_LENGTH = 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function workOrderTotal(lines: WorkOrderLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0));
}

export function labourTotal(lines: WorkOrderLine[]): number {
  return round2(lines.filter((l) => l.kind === "labour").reduce((s, l) => s + l.qty * l.unitPrice, 0));
}

export function partsTotal(lines: WorkOrderLine[]): number {
  return round2(lines.filter((l) => l.kind === "part").reduce((s, l) => s + l.qty * l.unitPrice, 0));
}

// The next number in sequence, from the highest already used.
export function nextWorkOrderNumber(existing: { number: string }[]): string {
  const top = existing.reduce((m, o) => {
    const n = Number(/(\d+)$/.exec(o.number)?.[1] ?? 0);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `WO-${String(top + 1).padStart(4, "0")}`;
}

export function validateWorkOrder(input: WorkOrderInput): string | null {
  if (!(input.item ?? "").trim()) return "Say what the work is on (the item or the job).";
  if ((input.item ?? "").trim().length > MAX_ITEM_LENGTH) return `Keep the item description under ${MAX_ITEM_LENGTH} characters.`;
  if ((input.problem ?? "").length > MAX_PROBLEM_LENGTH) return `Keep the problem description under ${MAX_PROBLEM_LENGTH} characters.`;
  if (!ISO_DAY.test(input.openedDate ?? "")) return "Pick the date the job was opened.";
  if (input.dueDate && (!ISO_DAY.test(input.dueDate) || input.dueDate < input.openedDate)) return "The due date can't be before the job was opened.";
  if (!Array.isArray(input.lines)) return "Add the labour and parts.";
  if (input.lines.length > MAX_JOB_LINES) return `A job can have at most ${MAX_JOB_LINES} lines.`;
  for (const l of input.lines) {
    if (!l.productId) return `Choose the ${l.kind === "labour" ? "service" : "part"} for each line.`;
    if (!Number.isFinite(Number(l.qty)) || Number(l.qty) <= 0) return `Enter a quantity above zero for ${l.name || "each line"}.`;
    if (!Number.isFinite(Number(l.unitPrice)) || Number(l.unitPrice) < 0) return `Enter a price of zero or more for ${l.name || "each line"}.`;
  }
  return null;
}

export function canMove(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return NEXT_STATUSES[from].includes(to);
}

// A job is overdue when it has a due date that has passed and it is not yet collected or cancelled.
export function isOverdue(o: Pick<WorkOrder, "status" | "dueDate">, today: string): boolean {
  return !!o.dueDate && o.dueDate < today && o.status !== "collected" && o.status !== "cancelled";
}

export interface JobBoard {
  open: number; // not collected or cancelled
  overdue: number;
  readyToCollect: number;
  waitingParts: number;
  openValue: number; // what the open jobs are worth at their listed prices
}

export function jobBoard(orders: WorkOrder[], today: string): JobBoard {
  const board: JobBoard = { open: 0, overdue: 0, readyToCollect: 0, waitingParts: 0, openValue: 0 };
  for (const o of orders) {
    if (o.status === "collected" || o.status === "cancelled") continue;
    board.open++;
    board.openValue += workOrderTotal(o.lines);
    if (isOverdue(o, today)) board.overdue++;
    if (o.status === "ready") board.readyToCollect++;
    if (o.status === "waiting_parts") board.waitingParts++;
  }
  board.openValue = round2(board.openValue);
  return board;
}

// The estimate lines for a job: the same labour and parts, priced as listed on the job.
export function estimateLinesFromJob(o: Pick<WorkOrder, "lines">): { productId: string; qty: number; unitPrice: number }[] {
  return o.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice }));
}
