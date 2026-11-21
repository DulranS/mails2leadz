"use client";

// Delivery run sheet: the customer orders still to deliver by a chosen day, grouped by driver and area. The driver and area are set on each order
// here; delivery is recorded per order. Prints as a sheet for the van. Owner and manager only (the tab).
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Label } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { recordPartDelivery, completeAll, outstandingOf, deliveryPosts, type PdLine } from "@/lib/partialDelivery";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { todayIso, formatMoney } from "@/lib/format";
import { deliveryRun } from "@/lib/deliveryRun";
import { MAX_ROUTE_STOPS, type RoutePlan } from "@/lib/routePlan";
import { useAuth } from "@/contexts/AuthContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";

export default function DeliveryRunPanel() {
  const { webOrders, updateWebOrder, addSale, settings } = useData();
  const toast = useToast();
  const cur = settings.currency;
  const [onDate, setOnDate] = useState(todayIso());
  const run = useMemo(() => deliveryRun(webOrders.map((o) => ({ id: o.id, customerName: o.customerName, status: o.status, promisedDate: o.promisedDate, deliveredOn: o.deliveredOn, driverName: o.driverName, area: o.area, customerAddress: o.customerAddress, total: o.total })), onDate), [webOrders, onDate]);
  const [drafts, setDrafts] = useState<Record<string, { driverName: string; area: string }>>({});
  // v319: a suggested stop order per driver (lib/routePlan.ts). A suggestion only: no order is changed by it.
  const { user, businessId } = useAuth();
  const [plans, setPlans] = useState<Record<string, { plan?: RoutePlan; error?: string; busy?: boolean; note?: string }>>({});

  async function suggestRoute(driver: string, stopIds: string[]) {
    setPlans((p) => ({ ...p, [driver]: { busy: true } }));
    try {
      if (!user) throw new Error("Sign in again to plan the route.");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/routes/plan", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
        body: JSON.stringify({ orderIds: stopIds.slice(0, MAX_ROUTE_STOPS) }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Couldn't plan the route.");
      setPlans((p) => ({ ...p, [driver]: { plan: payload as RoutePlan, note: stopIds.length > MAX_ROUTE_STOPS ? `Only the first ${MAX_ROUTE_STOPS} stops are planned; plan the rest separately.` : undefined } }));
    } catch (err) {
      setPlans((p) => ({ ...p, [driver]: { error: toastableErrorMessage(err) } }));
    }
  }

  async function save(id: string, current: { driverName?: string; area?: string }) {
    const d = drafts[id] ?? { driverName: current.driverName ?? "", area: current.area ?? "" };
    try {
      await updateWebOrder(id, { driverName: d.driverName.trim() || undefined, area: d.area.trim() || undefined });
    } catch (err) {
      toast.error("Couldn't save it", toastableErrorMessage(err));
    }
  }
  // Records the sales for what a delivery adds, for orders on delivery recognition, and counts the invoice.
  async function billDelivery(order: { id: string; recognition?: string; deliveryInvoices?: number; lines: unknown[]; customerName: string; contact?: string; paymentMethod?: string; placedOn: string }, before: PdLine[], after: PdLine[]) {
    const { posts, missing } = deliveryPosts(order as never, before, after);
    if (missing.length > 0) throw new Error(`These lines have no product, so they cannot be billed: ${missing.join(", ")}.`);
    for (const p of posts) {
      await addSale({
        productId: p.productId,
        qty: p.qty,
        unitPrice: p.unitPrice,
        date: todayIso(),
        customer: order.customerName,
        customerContact: order.contact,
        saleChannel: "Online",
        paymentMethod: (order.paymentMethod ?? "cash") as "cash",
        invoiceId: p.invoiceId,
      } as never);
    }
    if (posts.length > 0) await updateWebOrder(order.id, { deliveryInvoices: (order.deliveryInvoices ?? 0) + 1 } as never);
  }
  async function recordPart(id: string, index: number, qty: number) {
    const order = webOrders.find((o) => o.id === id);
    if (!order) return;
    const before = (order.lines ?? []) as PdLine[];
    const r = recordPartDelivery(before, index, qty, todayIso());
    if (!r.ok) { toast.error("Not recorded", r.error); return; }
    try {
      await billDelivery(order, before, r.lines);
      await updateWebOrder(id, { lines: r.lines as never, ...(r.fullyDelivered ? { deliveredOn: r.deliveredOn } : {}) });
      toast.success(r.fullyDelivered ? "Delivered in full" : "Part delivery recorded", order.customerName);
    } catch (err) {
      toast.error("Couldn't record it", toastableErrorMessage(err));
    }
  }
  async function delivered(id: string, name: string) {
    try {
      const order = webOrders.find((o) => o.id === id);
      const before = (order?.lines ?? []) as PdLine[];
      const after = completeAll(before);
      if (order) await billDelivery(order, before, after);
      await updateWebOrder(id, { lines: after as never, deliveredOn: todayIso() });
      toast.success("Delivered", name);
    } catch (err) {
      toast.error("Couldn't record it", toastableErrorMessage(err));
    }
  }

  if (run.total === 0) return <EmptyState title="Nothing to deliver by this day" body="Confirmed orders that are not yet delivered, and due by the day you choose, appear here, grouped by driver." />;
  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3 flex-wrap print:hidden">
        <Field className="max-w-[200px]"><Label>Deliveries due by</Label><Input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} /></Field>
        <Button variant="ghost" onClick={() => window.print()}>Print the run sheet</Button>
        <span className="text-xs text-muted">{run.total} stop{run.total === 1 ? "" : "s"}{run.overdue > 0 && <span className="text-bad"> · {run.overdue} overdue</span>}{run.unassigned > 0 && <> · {run.unassigned} without a driver</>}</span>
      </div>
      {run.runs.map((r) => (
        <Card key={r.driver} className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{r.driver}</span>
            <Badge>{r.stops.length} stop{r.stops.length === 1 ? "" : "s"}</Badge>
            <span className="text-xs text-muted">{formatMoney(r.value, cur)} to collect</span>
            <span className="print:hidden"><Button variant="ghost" onClick={() => suggestRoute(r.driver, r.stops.map((s) => s.id))} disabled={plans[r.driver]?.busy}>Suggest a route</Button></span>
          </div>
          {(() => {
            const pv = plans[r.driver];
            if (!pv) return null;
            if (pv.busy) return <div className="text-xs text-muted print:hidden">Working out the order…</div>;
            if (pv.error) return <div className="text-xs text-bad print:hidden">{pv.error}</div>;
            const plan = pv.plan;
            if (!plan) return null;
            if (!plan.configured || !plan.ok) return <div className="text-xs text-muted print:hidden">{plan.error}</div>;
            return (
              <div className="text-xs space-y-1 border-t border-line pt-2 print:hidden">
                <div className="text-muted">
                  Suggested order from the business address: {plan.totalKm ?? "?"} km through every stop, {plan.returnKm ?? "?"} km back. The order is a suggestion; nothing has changed.
                  {pv.note ? ` ${pv.note}` : ""}
                </div>
                <ol className="list-decimal list-inside">
                  {plan.stops.map((st) => (
                    <li key={st.id}>{st.name}: {st.legKm ?? "?"} km from the previous stop, {st.cumulativeKm ?? "?"} km in</li>
                  ))}
                </ol>
                {plan.unlocated.length > 0 && <div className="text-amber-soft">Not placed on the map: {plan.unlocated.map((u) => `${u.name} (${u.reason})`).join("; ")}</div>}
              </div>
            );
          })()}
          {r.stops.map((s) => {
            const d = drafts[s.id] ?? { driverName: s.driverName === "Not assigned" ? "" : s.driverName, area: s.area === "No area" ? "" : s.area };
            return (
              <div key={s.id} className="border-t border-line pt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">{s.customerName} {s.overdue && <Badge tone="bad">overdue</Badge>}</div>
                  {s.customerAddress && <div className="text-xs">{s.customerAddress}</div>}
                  <div className="text-xs text-muted">Promised {s.promisedDate ?? "no day set"} · <span className="num">{formatMoney(s.total, cur)}</span></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 print:hidden">
                    <Input placeholder="Driver" value={d.driverName} onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...d, driverName: e.target.value } })} onBlur={() => save(s.id, s)} maxLength={120} />
                    <Input placeholder="Area or route" value={d.area} onChange={(e) => setDrafts({ ...drafts, [s.id]: { ...d, area: e.target.value } })} onBlur={() => save(s.id, s)} maxLength={120} />
                  </div>
                </div>
                <div className="print:hidden"><Button variant="ghost" onClick={() => delivered(s.id, s.customerName)}>Delivered today</Button></div>
                <PartDeliveryRows order={webOrders.find((o) => o.id === s.id) ?? { lines: [] }} onRecord={(i, qty) => recordPart(s.id, i, qty)} />
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
}

// One line per product on an order: what is still outstanding, and a box to record how much is delivered now.
function PartDeliveryRows({ order, onRecord }: { order: { lines?: PdLine[] }; onRecord: (index: number, qty: number) => void }) {
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const lines = order.lines ?? [];
  if (lines.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-1.5 print:hidden">
      {lines.map((l, i) => {
        const left = outstandingOf(l);
        if (left <= 0) return <div key={i} className="text-xs text-muted">{l.name}: delivered in full</div>;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="flex-1">{l.name}: {left} to go</span>
            <Input className="w-24" type="number" min="0" step="any" placeholder="now" value={amounts[i] ?? ""} onChange={(e) => setAmounts({ ...amounts, [i]: e.target.value })} />
            <Button variant="ghost" onClick={() => { onRecord(i, Number(amounts[i])); setAmounts({ ...amounts, [i]: "" }); }}>Record</Button>
          </div>
        );
      })}
    </div>
  );
}
