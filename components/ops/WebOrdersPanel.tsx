"use client";

// Web orders waiting for the owner. Match each line to a product, then confirm: each line is recorded as a sale through the same path as
// any other sale (so stock and payment follow the usual rules), or decline. Nothing is recorded until the owner presses Confirm.
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { Badge, Button, Card, EmptyState, Field, Select } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { confirmProblem } from "@/lib/webOrders";
import { stampProblem } from "@/lib/orderCycle";
import type { WebOrder } from "@/lib/types";

// v319: when the owner started and finished an order, its promised day, and the delivery address. Stamps are the time the button was pressed
// (epoch ms); the cycle and buffer are worked out from them on the Cycle time screen (lib/orderCycle.ts).
const stampText = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";

function OrderTimes({ o }: { o: WebOrder }) {
  const { updateWebOrder } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function stamp(kind: "start" | "finish") {
    const problem = stampProblem(kind, o, Date.now());
    if (problem) return toast.error("Not yet", problem);
    setBusy(true);
    try {
      await updateWebOrder(o.id, kind === "start" ? { startedAt: Date.now() } : { finishedAt: Date.now() });
      toast.success(kind === "start" ? "Started" : "Finished", o.customerName);
    } catch (err) {
      toast.error("Couldn't record it", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs mt-1">
      <label className="flex items-center gap-1 text-muted">
        Promised
        <input
          type="date"
          value={o.promisedDate ?? ""}
          onChange={(e) => updateWebOrder(o.id, { promisedDate: e.target.value }).catch((err) => toast.error("Couldn't save the promise", toastableErrorMessage(err)))}
          className="bg-panel2 border border-line rounded-md px-2 py-1 text-xs text-fg"
        />
      </label>
      {o.startedAt ? <span className="text-muted">started {stampText(o.startedAt)}</span> : <button onClick={() => stamp("start")} disabled={busy} className="text-muted hover:text-fg min-h-[32px]">Start</button>}
      {o.finishedAt ? <span className="text-muted">finished {stampText(o.finishedAt)}</span> : <button onClick={() => stamp("finish")} disabled={busy} className="text-muted hover:text-fg min-h-[32px]">Finish</button>}
    </div>
  );
}

// v319: the delivery address, for the route planner (lib/routePlan.ts). Blank clears it.
function OrderAddress({ o }: { o: WebOrder }) {
  const { updateWebOrder } = useData();
  const toast = useToast();
  const [text, setText] = useState(o.customerAddress ?? "");
  const [busy, setBusy] = useState(false);
  const changed = text.trim() !== (o.customerAddress ?? "");
  async function save() {
    setBusy(true);
    try {
      await updateWebOrder(o.id, { customerAddress: text.trim() });
      toast.success("Address saved", o.customerName);
    } catch (err) {
      toast.error("Couldn't save the address", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs mt-2">
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Delivery address" className="bg-panel2 border border-line rounded-md px-2 py-1 text-xs text-fg flex-1 min-w-[220px]" />
      <button onClick={save} disabled={busy || !changed} className="text-muted hover:text-fg min-h-[32px] disabled:opacity-50">Save address</button>
    </div>
  );
}

const PAYMENTS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "credit", label: "On credit (owed by the customer)" },
] as const;

export default function WebOrdersPanel() {
  const { webOrders, products, updateWebOrder, addSale, settings } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pay, setPay] = useState<Record<string, string>>({});
  const [perDelivery, setPerDelivery] = useState<Record<string, boolean>>({});
  const open = webOrders.filter((o) => o.status === "new").sort((a, b) => a.placedOn.localeCompare(b.placedOn));
  const done = webOrders.filter((o) => o.status !== "new").sort((a, b) => b.placedOn.localeCompare(a.placedOn)).slice(0, 30);

  async function matchLine(o: WebOrder, idx: number, productId: string) {
    const lines = o.lines.map((l, i) => (i === idx ? { ...l, productId: productId || undefined } : l));
    try {
      await updateWebOrder(o.id, { lines });
    } catch (err) {
      toast.error("Couldn't match that line", toastableErrorMessage(err));
    }
  }

  async function decline(o: WebOrder) {
    if (!confirm(`Decline the order from ${o.customerName}? No sale is recorded.`)) return;
    try {
      await updateWebOrder(o.id, { status: "declined" });
      toast.success("Declined", "No sale was recorded");
    } catch (err) {
      toast.error("Couldn't decline it", toastableErrorMessage(err));
    }
  }

  async function confirmOrder(o: WebOrder) {
    const problem = confirmProblem(o);
    if (problem) return toast.error("Not yet", problem);
    const priced = o.lines.map((l) => ({ ...l, price: l.unitPrice ?? products.find((p) => p.id === l.productId)?.defaultSellPrice }));
    if (priced.some((l) => typeof l.price !== "number")) return toast.error("Not yet", "Some lines have no price. Set the price on the product, or it will be taken from the order.");
    setBusy(o.id);
    let recorded = 0;
    try {
      if (perDelivery[o.id]) {
        // Sales are recorded as each part is delivered (see the delivery run). Confirming only accepts the order.
        await updateWebOrder(o.id, { status: "confirmed", recognition: "delivery", paymentMethod: pay[o.id] ?? "cash", deliveryInvoices: 0 });
        toast.success("Order confirmed", "Sales will be recorded as each part is delivered");
        return;
      }
      for (const l of priced) {
        await addSale({
          productId: l.productId as string,
          qty: l.qty,
          unitPrice: l.price as number,
          date: o.placedOn,
          customer: o.customerName,
          customerContact: o.contact,
          saleChannel: "Online",
          paymentMethod: (pay[o.id] ?? "cash") as "cash",
          invoiceId: o.id,
        } as never);
        recorded++;
      }
      await updateWebOrder(o.id, { status: "confirmed" });
      toast.success("Order confirmed", `${recorded} sale${recorded === 1 ? "" : "s"} recorded`);
    } catch (err) {
      toast.error(
        `Stopped after ${recorded} of ${o.lines.length} line${o.lines.length === 1 ? "" : "s"}`,
        `${toastableErrorMessage(err)} The lines already recorded are in Sales; check them before trying again.`,
      );
    } finally {
      setBusy(null);
    }
  }

  if (webOrders.length === 0) {
    return (
      <EmptyState
        title="No web orders yet"
        body="When an order is placed on your shop or site, and your platform or a form tool sends it through the order API, it appears here to confirm. Nothing is recorded as a sale until you confirm it."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted">
        {open.length} waiting to be confirmed. Confirming records one sale per line; declining records nothing.
      </div>
      {open.map((o) => (
        <Card key={o.id} className="p-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{o.customerName}</span>
            <Badge>{o.placedOn}</Badge>
            <Badge tone="amber">{o.lines.filter((l) => !l.productId).length ? "lines to match" : "ready"}</Badge>
          </div>
          {o.contact && <div className="text-xs text-muted mt-1">{o.contact}</div>}
          {o.note && <div className="text-xs mt-1 whitespace-pre-wrap">{o.note}</div>}
          <OrderAddress o={o} />
          <div className="mt-3 space-y-2">
            {o.lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center text-xs">
                <div className="min-w-0 truncate">{l.name}</div>
                <div className="num text-muted">× {l.qty}{l.unitPrice !== undefined ? ` at ${formatMoney(l.unitPrice, settings.currency)}` : ""}</div>
                {l.productId ? (
                  <span className="text-good">matched</span>
                ) : (
                  <Select value="" onChange={(e) => matchLine(o, idx, e.target.value)} className="!py-1">
                    <option value="">Match to a product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-line">
            <span className="num text-sm font-medium">{formatMoney(o.total, settings.currency)}</span>
            <Field className="min-w-[180px]">
              <Select value={pay[o.id] ?? "cash"} onChange={(e) => setPay({ ...pay, [o.id]: e.target.value })}>
                {PAYMENTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!perDelivery[o.id]} onChange={(e) => setPerDelivery({ ...perDelivery, [o.id]: e.target.checked })} />Record each part as it is delivered (one invoice per delivery)</label>
            <Button onClick={() => confirmOrder(o)} disabled={busy === o.id}>{busy === o.id ? "Recording…" : perDelivery[o.id] ? "Confirm order" : "Confirm and record sales"}</Button>
            <button onClick={() => decline(o)} className="text-xs text-muted hover:text-fg min-h-[32px]">Decline</button>
          </div>
        </Card>
      ))}
      {done.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted">Dealt with</div>
          {done.map((o) => (
            <div key={o.id} className="text-xs flex items-center gap-2 flex-wrap">
              <span>{o.placedOn} · {o.customerName}</span>
              <Badge tone={o.status === "confirmed" ? "good" : "default"}>{o.status}</Badge>
              <span className="num text-muted">{formatMoney(o.total, settings.currency)}</span>
              {o.promisedDate && <span className="text-muted">promised {o.promisedDate}</span>}
              {o.status === "confirmed" && !o.deliveredOn && (
                <button onClick={() => updateWebOrder(o.id, { deliveredOn: new Date().toISOString().slice(0, 10) }).then(() => toast.success("Marked delivered", o.customerName)).catch((err) => toast.error("Couldn't record it", toastableErrorMessage(err)))} className="text-amber-soft hover:underline min-h-[32px]">Mark delivered today</button>
              )}
              {o.deliveredOn && <span className="text-muted">delivered {o.deliveredOn}</span>}
              {o.status === "confirmed" && <div className="w-full"><OrderTimes o={o} /><OrderAddress o={o} /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
