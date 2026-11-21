"use client";

// Cycle time from recorded dates: how long suppliers take from order to receipt and how often they are late, and how long projects take and how
// much of their promised window they keep. Reads records only. Owner and manager only (the tab).
import { useMemo } from "react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { procurementCycle, projectCycle } from "@/lib/cycleTime";
import { deliveryPromises } from "@/lib/deliveryPromise";
import { orderCycle } from "@/lib/orderCycle";
import { todayIso } from "@/lib/format";

export default function CycleTimePanel() {
  const { purchaseOrders, projects, webOrders } = useData();
  const customers = useMemo(() => deliveryPromises(webOrders, todayIso()), [webOrders]);
  const procurement = useMemo(() => procurementCycle(purchaseOrders), [purchaseOrders]);
  const delivery = useMemo(() => projectCycle(projects), [projects]);
  // v319: orders started and finished on the orders screen: cycle time and the buffer against the promised day.
  const orders = useMemo(() => orderCycle(webOrders), [webOrders]);
  if (procurement.length === 0 && delivery.rows.length === 0 && customers.delivered.length === 0 && customers.overdue.length === 0 && orders.finished === 0) {
    return <EmptyState title="Nothing to measure yet" body="Once purchase orders are received, or projects are completed with their dates, this shows how long each takes and whether promises are kept." />;
  }
  return (
    <div className="space-y-6">
      {(customers.delivered.length > 0 || customers.overdue.length > 0) && (
        <div>
          <div className="text-sm font-medium mb-1">Customers: delivered against the promise</div>
          <div className="text-xs text-muted mb-2">
            {customers.delivered.length > 0 && <>Delivered on time {customers.onTime}, late {customers.late}{customers.averageBufferDays !== null && <>; average buffer {customers.averageBufferDays} days</>}.</>}
          </div>
          <div className="space-y-2">
            {customers.overdue.map((o) => (
              <Card key={o.id} className="p-3.5">
                <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium">{o.customerName}</span><Badge tone="bad">{o.daysLate} days overdue</Badge></div>
                <div className="text-xs text-muted mt-1">Promised {o.promisedDate}, not yet recorded as delivered</div>
              </Card>
            ))}
          </div>
        </div>
      )}
      {orders.finished > 0 && (
        <div>
          <div className="text-sm font-medium mb-1">Orders: start to finish</div>
          <div className="text-xs text-muted mb-2">
            {orders.finished} finished order{orders.finished === 1 ? "" : "s"}.
            {orders.averageCycleDays !== null && <> Average cycle {orders.averageCycleDays} days from start to finish, over {orders.cycleJudged} started.</>}
            {orders.averageBufferDays !== null && <> Average buffer {orders.averageBufferDays} days against the promised day (negative means late); on time {orders.onTime}, late {orders.late}.</>}
            {orders.averageCycleDays === null && <> No cycle yet: press Start on an order to measure it.</>}
          </div>
          <div className="space-y-2">
            {orders.rows.slice(0, 20).map((r) => (
              <Card key={r.id} className="p-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{r.customerName}</span>
                  {r.bufferDays !== null && <Badge tone={r.bufferDays >= 0 ? "good" : "bad"}>{r.bufferDays >= 0 ? "on time" : "late"}</Badge>}
                </div>
                <div className="text-xs text-muted mt-1">
                  Finished {r.finishedOn}
                  {r.cycleDays !== null && <> · took <span className="num">{r.cycleDays}</span> days</>}
                  {r.bufferDays !== null && <> · buffer <span className="num">{r.bufferDays}</span> days</>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
      {procurement.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-1">Suppliers: order to receipt</div>
          <div className="space-y-2">
            {procurement.map((s) => (
              <Card key={s.supplier} className="p-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{s.supplier}</span>
                  {s.lateCount > 0 && <Badge tone="amber">{s.lateCount} late</Badge>}
                </div>
                <div className="text-xs text-muted mt-1">{s.receipts} receipt{s.receipts === 1 ? "" : "s"} · {s.averageDaysOrderToReceipt} days on average from order · {s.averageDaysLate} days late on average against the promised day</div>
              </Card>
            ))}
          </div>
        </div>
      )}
      {delivery.rows.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-1">Projects: promises kept</div>
          <div className="text-xs text-muted mb-2">Buffer: days finished before the promised end (negative means late).{delivery.averageBufferDays !== null && <> Average buffer {delivery.averageBufferDays} days; kept {delivery.kept}, missed {delivery.missed}.</>}</div>
          <div className="space-y-2">
            {delivery.rows.map((r) => (
              <Card key={r.name} className="p-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{r.name}</span>
                  {r.keptPromise !== null && <Badge tone={r.keptPromise ? "good" : "bad"}>{r.keptPromise ? "promise kept" : "promise missed"}</Badge>}
                </div>
                <div className="text-xs text-muted mt-1">Took {r.actualDays} days{r.promisedDays !== null && <> against {r.promisedDays} promised</>}{r.bufferDays !== null && <> · buffer <span className="num">{r.bufferDays}</span> days</>}</div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
