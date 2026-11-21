// Delivery promises to customers (v228b): for web orders that carry a promised delivery day. A delivered order is judged against its promise
// (positive buffer: delivered early). A confirmed order past its promised day with nothing recorded as delivered is overdue. Pure: reads only.

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export interface PromisedOrder { id: string; customerName: string; status: string; promisedDate?: string; deliveredOn?: string }

export function deliveryPromises(orders: PromisedOrder[], todayIso: string) {
  const delivered = orders
    .filter((o) => o.status === "confirmed" && o.promisedDate && o.deliveredOn)
    .map((o) => ({ id: o.id, customerName: o.customerName, promisedDate: o.promisedDate as string, deliveredOn: o.deliveredOn as string, bufferDays: days(o.deliveredOn as string, o.promisedDate as string) }));
  const overdue = orders
    .filter((o) => o.status === "confirmed" && o.promisedDate && !o.deliveredOn && (o.promisedDate as string) < todayIso)
    .map((o) => ({ id: o.id, customerName: o.customerName, promisedDate: o.promisedDate as string, daysLate: days(o.promisedDate as string, todayIso) }))
    .sort((a, b) => b.daysLate - a.daysLate);
  const onTime = delivered.filter((d) => d.bufferDays >= 0).length;
  const averageBufferDays = delivered.length ? Math.round((delivered.reduce((t, d) => t + d.bufferDays, 0) / delivered.length) * 10) / 10 : null;
  return { delivered, overdue, onTime, late: delivered.length - onTime, averageBufferDays };
}
