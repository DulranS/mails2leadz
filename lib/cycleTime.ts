// Cycle time and delivery promises (v227b). Two measures the business can read from dates it already records: (1) procurement: how many days
// a supplier takes from order to receipt, and how far past the day it promised; (2) projects: how many days a completed project took from its
// start, and how much of its promised window it kept (the buffer: positive means it finished before the promised end). Pure: reads only.

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface PO { supplier?: string; status: string; orderDate: string; expectedDate?: string; receivedDate?: string }
export interface SupplierCycle { supplier: string; receipts: number; averageDaysOrderToReceipt: number; averageDaysLate: number; lateCount: number }

export function procurementCycle(orders: PO[]): SupplierCycle[] {
  const bySupplier = new Map<string, { lead: number[]; late: number[] }>();
  for (const o of orders) {
    if (o.status !== "received" || !o.receivedDate || !o.orderDate || o.receivedDate < o.orderDate) continue;
    const supplier = (o.supplier ?? "").trim() || "No supplier recorded";
    const entry = bySupplier.get(supplier) ?? { lead: [], late: [] };
    entry.lead.push(days(o.orderDate, o.receivedDate));
    if (o.expectedDate) entry.late.push(Math.max(0, days(o.expectedDate, o.receivedDate)));
    bySupplier.set(supplier, entry);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0);
  return [...bySupplier.entries()].map(([supplier, e]) => ({
    supplier,
    receipts: e.lead.length,
    averageDaysOrderToReceipt: r1(avg(e.lead)),
    averageDaysLate: r1(avg(e.late)),
    lateCount: e.late.filter((d) => d > 0).length,
  })).sort((a, b) => b.averageDaysLate - a.averageDaysLate);
}

export interface PJ { name: string; status: string; startDate: string; targetEndDate?: string; completedDate?: string }
export interface ProjectCycle { name: string; actualDays: number; promisedDays: number | null; bufferDays: number | null; keptPromise: boolean | null }

export function projectCycle(projects: PJ[]): { rows: ProjectCycle[]; kept: number; missed: number; averageBufferDays: number | null } {
  const rows: ProjectCycle[] = projects
    .filter((p) => p.status === "completed" && p.completedDate && p.startDate && p.completedDate >= p.startDate)
    .map((p) => {
      const actualDays = days(p.startDate, p.completedDate as string);
      const promisedDays = p.targetEndDate && p.targetEndDate >= p.startDate ? days(p.startDate, p.targetEndDate) : null;
      const bufferDays = p.targetEndDate ? days(p.completedDate as string, p.targetEndDate) : null;
      return { name: p.name, actualDays, promisedDays, bufferDays, keptPromise: bufferDays === null ? null : bufferDays >= 0 };
    })
    .sort((a, b) => (a.bufferDays ?? 0) - (b.bufferDays ?? 0));
  const judged = rows.filter((r) => r.keptPromise !== null);
  const buffers = judged.map((r) => r.bufferDays as number);
  return {
    rows,
    kept: judged.filter((r) => r.keptPromise).length,
    missed: judged.filter((r) => !r.keptPromise).length,
    averageBufferDays: buffers.length ? r1(buffers.reduce((t, x) => t + x, 0) / buffers.length) : null,
  };
}
