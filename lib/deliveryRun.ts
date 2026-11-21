// Delivery run sheet (v238): the customer orders still to deliver, grouped by driver and area, earliest promised day first, so a driver can run a
// route. Overdue ones are marked. Reads the confirmed web orders; changes nothing here. Pure.

export interface RunOrder { id: string; customerName: string; status: string; promisedDate?: string; deliveredOn?: string; driverName?: string; area?: string; customerAddress?: string; total: number }

export function deliveryRun(orders: RunOrder[], onDate: string) {
  const due = orders
    .filter((o) => o.status === "confirmed" && !o.deliveredOn && (!o.promisedDate || o.promisedDate <= onDate))
    .map((o) => ({ ...o, overdue: !!o.promisedDate && o.promisedDate < onDate, driverName: o.driverName?.trim() || "Not assigned", area: o.area?.trim() || "No area" }))
    .sort((a, b) => a.driverName.localeCompare(b.driverName) || a.area.localeCompare(b.area) || (a.customerAddress ?? "").localeCompare(b.customerAddress ?? "") || (a.promisedDate ?? "").localeCompare(b.promisedDate ?? "") || a.customerName.localeCompare(b.customerName));
  const byDriver = new Map<string, typeof due>();
  for (const o of due) byDriver.set(o.driverName, [...(byDriver.get(o.driverName) ?? []), o]);
  return {
    runs: [...byDriver.entries()].map(([driver, stops]) => ({ driver, stops, value: Math.round(stops.reduce((t, s) => t + s.total, 0) * 100) / 100 })),
    total: due.length,
    overdue: due.filter((o) => o.overdue).length,
    unassigned: due.filter((o) => o.driverName === "Not assigned").length,
  };
}
