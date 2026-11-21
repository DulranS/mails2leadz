// Order cycle time and buffer (v319). An order has a started time and a finished time (epoch ms, set with buttons on the orders screen) and a
// promised day. For each finished order: the cycle is the days from start to finish (only when it was started); the buffer is the promised day
// less the finished day (positive: finished before the promise; negative: late). Averages cover only the orders each measure can judge. Pure.

const DAY_MS = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export interface CycleOrder {
  id: string;
  customerName: string;
  status: string;
  promisedDate?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface FinishedOrderRow {
  id: string;
  customerName: string;
  finishedOn: string;
  cycleDays: number | null; // null when the order was never started
  bufferDays: number | null; // null when there is no promised day
}

export function orderCycle(orders: CycleOrder[]) {
  const rows: FinishedOrderRow[] = orders
    .filter((o) => o.status === "confirmed" && typeof o.finishedAt === "number" && Number.isFinite(o.finishedAt))
    .map((o) => {
      const finishedOn = dayOf(o.finishedAt as number);
      const started = typeof o.startedAt === "number" && o.startedAt <= (o.finishedAt as number);
      const cycleDays = started ? r1(((o.finishedAt as number) - (o.startedAt as number)) / DAY_MS) : null;
      const bufferDays = o.promisedDate ? daysBetween(finishedOn, o.promisedDate) : null;
      return { id: o.id, customerName: o.customerName, finishedOn, cycleDays, bufferDays };
    })
    .sort((a, b) => b.finishedOn.localeCompare(a.finishedOn));
  const cycles = rows.map((r) => r.cycleDays).filter((x): x is number => x !== null);
  const buffers = rows.map((r) => r.bufferDays).filter((x): x is number => x !== null);
  const avg = (xs: number[]) => (xs.length ? r1(xs.reduce((t, x) => t + x, 0) / xs.length) : null);
  return {
    rows,
    finished: rows.length,
    averageCycleDays: avg(cycles),
    cycleJudged: cycles.length,
    averageBufferDays: avg(buffers),
    bufferJudged: buffers.length,
    onTime: buffers.filter((b) => b >= 0).length,
    late: buffers.filter((b) => b < 0).length,
  };
}

// Whether the orders screen may set a start or a finish stamp: only on a confirmed order, once each. An order may be finished without a start; its
// cycle is then left out of the average (it has no start to measure from).
export function stampProblem(kind: "start" | "finish", order: { status: string; startedAt?: number; finishedAt?: number }, now: number): string | null {
  if (order.status !== "confirmed") return "Only a confirmed order can be started or finished.";
  if (kind === "start" && order.startedAt) return "This order was already started.";
  if (kind === "finish" && order.finishedAt) return "This order was already finished.";
  if (kind === "finish" && order.startedAt && order.startedAt > now) return "The start time is in the future.";
  return null;
}
