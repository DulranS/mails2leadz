"use client";

// Price & condition: sales charged below a product's minimum advertised price (MAP), each product's MAP and condition, and the
// stock value by condition. Owner and Manager. Flags and totals only: nothing here changes a price, blocks a sale or contacts anyone.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { PRICE_FIELD_LABEL, changePercent } from "@/lib/priceHistory";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { formatMoney, todayIso } from "@/lib/format";
import { CONDITION_LABEL, PRODUCT_CONDITIONS, salesBelowMap, stockByCondition, validateMapPrice, type ProductCondition } from "@/lib/priceControl";
import { Badge, Button, Card, Field, Input, Label, PageHeader, Select, TableCardSkeleton } from "@/components/ui";
import type { Product } from "@/lib/types";

type Draft = { map: string; condition: ProductCondition };

export default function PriceControlPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager"]);
  const { products, sales, ledgers, settings, loading, updateProduct } = useData();
  const toast = useToast();
  const money = (n: number) => formatMoney(n, settings.currency);
  const today = todayIso();

  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const below = useMemo(() => salesBelowMap(sales, products, from, to), [sales, products, from, to]);
  const totalUnder = useMemo(() => Math.round(below.reduce((s, b) => s + b.shortfallTotal, 0) * 100) / 100, [below]);
  const condRows = useMemo(
    () => stockByCondition(products, (id) => ledgers.get(id)?.qtyOnHand ?? 0, (id) => ledgers.get(id)?.wac ?? 0),
    [products, ledgers]
  );
  const refurbValue = condRows.filter((r) => r.condition === "refurbished" || r.condition === "open_box").reduce((s, r) => s + r.value, 0);
  const productItems = useMemo(() => products.filter((p) => p.type === "product" && p.active), [products]);

  function draftOf(p: Product): Draft {
    return drafts[p.id] ?? { map: p.mapPrice !== undefined ? String(p.mapPrice) : "", condition: p.condition ?? "new" };
  }
  function setDraft(p: Product, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [p.id]: { ...draftOf(p), ...patch } }));
  }

  async function saveRow(p: Product) {
    const d = draftOf(p);
    const mapNum = d.map.trim() === "" ? undefined : Number(d.map);
    const problem = validateMapPrice(mapNum);
    if (problem) {
      toast.error("Check this price", problem);
      return;
    }
    setBusyId(p.id);
    try {
      await updateProduct(p.id, { mapPrice: mapNum, condition: d.condition });
      setDrafts((cur) => {
        const next = { ...cur };
        delete next[p.id];
        return next;
      });
      toast.success("Saved", p.name);
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (guardLoading || !allowed) return null;
  if (loading) return <><PageHeader title="Price & condition" /><TableCardSkeleton rows={4} cols={4} /></>;

  return (
    <>
      <PageHeader title="Price & condition" />
      <div className="text-xs text-muted mb-4 max-w-2xl">
        Set a minimum advertised price (MAP) for a product, and its condition: new, open box, refurbished or used. A sale charged below a
        product&apos;s MAP is listed here so you can see it. Nothing is blocked, changed or sent to anyone.
      </div>
      <PriceChangesCard />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <div className="text-xs text-muted">Sales below MAP</div>
          <div className="text-xl font-semibold">{below.length}</div>
          <div className="text-xs text-muted mt-1">In the period below.</div>
        </Card>
        <Card>
          <div className="text-xs text-muted">Total under MAP</div>
          <div className="text-xl font-semibold">{money(totalUnder)}</div>
          <div className="text-xs text-muted mt-1">Each unit&apos;s gap to MAP, times units sold.</div>
        </Card>
        <Card>
          <div className="text-xs text-muted">Refurbished and open-box stock</div>
          <div className="text-xl font-semibold">{money(refurbValue)}</div>
          <div className="text-xs text-muted mt-1">Value at cost, units on hand now.</div>
        </Card>
      </div>

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <Field><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div className="font-medium mb-2">Sales charged below MAP</div>
        {below.length === 0 ? (
          <div className="text-sm text-muted">No sales below MAP in this period.</div>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {below.map((b) => (
              <li key={b.saleId} className="py-2 flex flex-wrap items-center gap-2">
                <Badge tone="amber">Below MAP</Badge>
                <span className="font-medium">{b.productName}</span>
                <span className="text-muted">{b.date}{b.customer ? ` · ${b.customer}` : ""}</span>
                <span className="text-muted">
                  {b.qty} × {money(b.unitPrice)} (MAP {money(b.mapPrice)})
                </span>
                <span className="ml-auto font-semibold">{money(b.shortfallTotal)} under</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-6">
        <div className="font-medium mb-1">Products: MAP and condition</div>
        <div className="text-xs text-muted mb-3">Leave MAP blank for no minimum. Each row is saved with its own Save button.</div>
        {productItems.length === 0 ? (
          <div className="text-sm text-muted">No active products yet.</div>
        ) : (
          <ul className="divide-y divide-line">
            {productItems.map((p) => {
              const d = draftOf(p);
              const dirty = drafts[p.id] !== undefined;
              return (
                <li key={p.id} className="py-3 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[10rem] font-medium">{p.name}</div>
                  <Field>
                    <Label>MAP ({settings.currency})</Label>
                    <Input type="number" min="0" step="any" value={d.map} onChange={(e) => setDraft(p, { map: e.target.value })} />
                  </Field>
                  <Field>
                    <Label>Condition</Label>
                    <Select value={d.condition} onChange={(e) => setDraft(p, { condition: e.target.value as ProductCondition })}>
                      {PRODUCT_CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
                    </Select>
                  </Field>
                  <Button variant="primary" onClick={() => saveRow(p)} disabled={!dirty || busyId === p.id}>Save</Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <div className="font-medium mb-2">Stock on hand by condition</div>
        {condRows.length === 0 ? (
          <div className="text-sm text-muted">No stock on hand.</div>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {condRows.map((r) => (
              <li key={r.condition} className="py-2 flex flex-wrap gap-3">
                <span className="font-medium">{CONDITION_LABEL[r.condition]}</span>
                <span className="text-muted">{r.products} product{r.products === 1 ? "" : "s"} · {r.units} unit{r.units === 1 ? "" : "s"}</span>
                <span className="ml-auto font-semibold">{money(r.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

// The latest changes to sell, cost and wholesale prices, newest first, with the percentage moved and who made the change.
// Read from the append-only price history (lib/priceHistory.ts).
function PriceChangesCard() {
  const { priceHistory, settings } = useData();
  const rows = priceHistory.slice(0, 25);
  return (
    <Card className="mb-6">
      <div className="text-sm font-medium mb-1">Recent price changes</div>
      <div className="text-xs text-muted mb-3">Every change to a sell, cost or wholesale price is kept here. Old values stay as they were; nothing can be edited or removed.</div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted">No price changes recorded yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-medium">When</th>
                <th className="py-1 font-medium">Product</th>
                <th className="py-1 font-medium">Price</th>
                <th className="py-1 font-medium text-right">From</th>
                <th className="py-1 font-medium text-right">To</th>
                <th className="py-1 font-medium text-right">Change</th>
                <th className="py-1 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const pct = changePercent(c.oldValue, c.newValue);
                return (
                  <tr key={c.id} className="border-t border-line">
                    <td className="py-1.5 num">{new Date(c.changedAt).toISOString().slice(0, 10)}</td>
                    <td className="py-1.5">{c.productName}</td>
                    <td className="py-1.5">{PRICE_FIELD_LABEL[c.field]}</td>
                    <td className="py-1.5 text-right num">{c.oldValue !== undefined ? formatMoney(c.oldValue, settings.currency) : "—"}</td>
                    <td className="py-1.5 text-right num">{c.newValue !== undefined ? formatMoney(c.newValue, settings.currency) : "cleared"}</td>
                    <td className={`py-1.5 text-right num ${pct !== null && pct > 0 ? "text-amber-soft" : pct !== null && pct < 0 ? "text-good" : "text-muted"}`}>{pct !== null ? `${pct > 0 ? "+" : ""}${pct}%` : "—"}</td>
                    <td className="py-1.5 text-muted">{c.changedByName ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
