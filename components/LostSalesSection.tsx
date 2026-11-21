"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { formatMoney, formatNumber, todayIso } from "@/lib/format";
import { summarizeStockOuts, stockOutsByProduct, stockOutMargin, stockOutRevenue } from "@/lib/stockOuts";
import { baseUnitLabel } from "@/lib/units";
import { Button, CollapsibleSection, Field, Input, Label, Modal, Select } from "@/components/ui";

const WINDOW_DAYS = 90;
const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// What a customer wanted that you had none of. Logged by hand, so every number here is one you recorded, never an
// estimate of demand you didn't see. Memo only: it never changes stock, sales, profit or any statement.
export default function LostSalesSection() {
  const { role } = useAuth();
  const { products, stockOuts, settings, deleteStockOut } = useData();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const currency = settings.currency;
  const canDelete = can(role, "delete:records");
  const canLog = can(role, "manage:products");

  const from = isoDaysAgo(WINDOW_DAYS);
  const total = useMemo(() => summarizeStockOuts(stockOuts, { fromISO: from }), [stockOuts, from]);
  const byProduct = useMemo(() => stockOutsByProduct(stockOuts, products, { fromISO: from }), [stockOuts, products, from]);
  const recent = useMemo(() => [...stockOuts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 25), [stockOuts]);

  if (!canLog && stockOuts.length === 0) return null;

  return (
    <CollapsibleSection
      title="Lost sales (out of stock)"
      subtitle={
        total.events > 0
          ? `Last ${WINDOW_DAYS} days: ${formatMoney(total.lostMargin, currency)} of margin lost on ${formatNumber(total.units)} units you couldn't supply.`
          : "Log what customers asked for when you had none, so running out has a number on it."
      }
      storageKey="products-lost-sales"
      defaultOpen={false}
      className="mt-6"
    >
      <div className="mt-4 space-y-4">
        <div className="text-xs text-muted">
          Only what you log is counted: revenue lost is the price you would have charged, margin lost is that less what the item costs you. It is a memo. It never changes your stock, sales, profit or statements.
        </div>
        {canLog && (
          <Button type="button" onClick={() => setOpen(true)}>
            Log a lost sale
          </Button>
        )}

        {byProduct.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted mb-1.5">By item, last {WINDOW_DAYS} days (most margin lost first)</div>
            <div className="space-y-1">
              {byProduct.map((r) => (
                <div key={r.productId} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-line last:border-0">
                  <div className="min-w-0">
                    <span className="font-medium">{r.productName}</span>{" "}
                    <span className="text-xs text-muted">
                      {formatNumber(r.units)} units · {r.events} time{r.events === 1 ? "" : "s"} · last {r.lastDate}
                    </span>
                  </div>
                  <div className="num text-right shrink-0">
                    <div>{formatMoney(r.lostMargin, currency)}</div>
                    <div className="text-[11px] text-muted">of {formatMoney(r.lostRevenue, currency)} sales</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted mb-1.5">Recent entries</div>
            <div className="space-y-1">
              {recent.map((r) => {
                const p = products.find((x) => x.id === r.productId);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-line last:border-0">
                    <div className="min-w-0">
                      <span className="font-medium">{p?.name ?? "—"}</span>{" "}
                      <span className="num text-xs">
                        × {formatNumber(r.qty)}
                        {baseUnitLabel(p) ? ` ${baseUnitLabel(p)}` : ""}
                      </span>{" "}
                      <span className="text-xs text-muted">
                        ({r.date} · {formatMoney(stockOutRevenue(r), currency)} sales, {formatMoney(stockOutMargin(r), currency)} margin{r.notes ? ` · ${r.notes}` : ""})
                      </span>
                    </div>
                    {canDelete && (
                      <button
                        onClick={() => {
                          if (!confirm("Delete this lost-sale entry? It only removes the note; nothing else changes.")) return;
                          deleteStockOut(r.id)
                            .then(() => toast.success("Entry deleted"))
                            .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                        }}
                        className="text-xs text-muted hover:text-bad shrink-0"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Log a lost sale">
        {open && <LostSaleForm onDone={() => setOpen(false)} />}
      </Modal>
    </CollapsibleSection>
  );
}

export function LostSaleForm({ initialProductId, initialQty, initialPrice, onDone }: { initialProductId?: string; initialQty?: number; initialPrice?: number; onDone: () => void }) {
  const { products, ledgers, addStockOut, settings } = useData();
  const toast = useToast();
  const goods = useMemo(() => products.filter((p) => p.active && p.type === "product"), [products]);
  const [productId, setProductId] = useState(initialProductId ?? goods[0]?.id ?? "");
  const product = goods.find((p) => p.id === productId);
  const [qty, setQty] = useState(initialQty ? String(initialQty) : "1");
  const [price, setPrice] = useState((initialPrice ?? product?.defaultSellPrice)?.toString() ?? "");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const qtyNum = Number(qty) || 0;
  const priceNum = Number(price) || 0;
  const wac = ledgers.get(productId)?.wac;

  if (goods.length === 0) return <div className="text-sm text-muted">Add a product first.</div>;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!product || qtyNum <= 0) return;
        setBusy(true);
        try {
          await addStockOut({
            productId,
            qty: qtyNum,
            unitPrice: priceNum,
            unitCost: wac !== undefined && wac > 0 ? wac : undefined,
            date,
            notes: notes || undefined,
          });
          toast.success("Lost sale logged", `${product.name}: ${formatNumber(qtyNum)} × ${formatMoney(priceNum, settings.currency)}`);
          onDone();
        } catch (err) {
          toast.error("Couldn't save that", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Which item was out of stock?</Label>
        <Select
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            const p = goods.find((x) => x.id === e.target.value);
            if (p?.defaultSellPrice !== undefined) setPrice(p.defaultSellPrice.toString());
          }}
        >
          {goods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>How many did they want{baseUnitLabel(product) ? ` (${baseUnitLabel(product)})` : ""}?</Label>
          <Input required type="number" inputMode="decimal" min="0" step={product?.allowFractionalQty ? "any" : "1"} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field>
          <Label>Price you would have charged for each</Label>
          <Input required type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Note (optional)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {qtyNum > 0 && (
        <div className="rounded-md border border-line bg-panel2 px-3 py-2.5 text-sm space-y-1">
          <div className="flex justify-between"><span>Sales lost</span><span className="num">{formatMoney(qtyNum * priceNum, settings.currency)}</span></div>
          {wac !== undefined && wac > 0 && (
            <div className="flex justify-between"><span>Margin lost (at today&apos;s cost of {formatMoney(wac, settings.currency)})</span><span className="num">{formatMoney(qtyNum * (priceNum - wac), settings.currency)}</span></div>
          )}
          <div className="text-xs text-muted">A memo only. Nothing is added to your sales or stock.</div>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy || qtyNum <= 0}>{busy ? "Saving…" : "Log it"}</Button>
      </div>
    </form>
  );
}
