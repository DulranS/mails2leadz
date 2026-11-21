"use client";

import { useMemo, useState } from "react";
import { OFFER_TEMPLATES, suggestPrice, offerMargin, type OfferTemplate } from "@/lib/productize";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { formatMoney, formatNumber, todayIso } from "@/lib/format";
import { sumRecipeCost } from "@/lib/calculations";
import type { OfferCostLine, PaymentMethod, Product } from "@/lib/types";
import { PROJECT_COST_CATEGORIES } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Stat,
  StatGridSkeleton,
  Table,
  TableCardSkeleton,
} from "@/components/ui";

function newLineId(): string {
  return `line_${Math.random().toString(36).slice(2, 10)}`;
}

export default function OffersPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager"]);
  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    fulfillOffer,
    offerStats,
    settings,
    loading,
  } = useData();
  const toast = useToast();
  const currency = settings.currency;

  const offers = useMemo(
    () => products.filter((p) => p.recipeLines && p.recipeLines.length > 0),
    [products]
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [fulfillTarget, setFulfillTarget] = useState<Product | null>(null);

  const totals = useMemo(() => {
    let timesSold = 0;
    let revenue = 0;
    let margin = 0;
    for (const offer of offers) {
      const s = offerStats.get(offer.id);
      if (!s) continue;
      timesSold += s.timesSold;
      revenue += s.revenue;
      margin += s.margin;
    }
    return { timesSold, revenue, margin };
  }, [offers, offerStats]);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setFormOpen(true);
  }

  function handleDelete(p: Product) {
    if (
      !confirm(
        `Delete "${p.name}"? Past sales and cost entries stay on record — this only removes the offer template itself. This can't be undone.`
      )
    )
      return;
    deleteProduct(p.id)
      .then(() => toast.success("Offer deleted", p.name))
      .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
  }

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Offers" action={<Button disabled>+ New offer</Button>} />
        <StatGridSkeleton count={4} />
        <TableCardSkeleton rows={5} cols={5} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Offers" action={<Button onClick={openNew}>+ New offer</Button>} />

      {offers.length === 0 ? (
        <EmptyState
          title="No packaged offers yet"
          body="Turn a service you deliver over and over into a fixed-price, fixed-cost package — a website audit, a monthly retainer, a standard install job. Set the price and the exact recipe of what it costs you to deliver once, then hit Fulfill every time you sell it and the same economics repeat automatically, instead of getting re-typed and re-negotiated each time."
          action={<Button onClick={openNew}>+ New offer</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Stat label="Active offers" value={String(offers.filter((o) => o.active).length)} />
            <Stat label="Total delivered" value={formatNumber(totals.timesSold)} />
            <Stat label="Revenue from offers" value={formatMoney(totals.revenue, currency)} />
            <Stat
              label="Margin from offers"
              value={formatMoney(totals.margin, currency)}
              tone={totals.margin >= 0 ? "good" : "bad"}
            />
          </div>

          {/* Mobile: one card per offer. Same data as the table, never both at once. */}
          <div className="sm:hidden space-y-2.5">
            {offers.map((offer) => {
              const stats = offerStats.get(offer.id);
              const recipeCost = sumRecipeCost(offer.recipeLines);
              const sellPrice = offer.defaultSellPrice ?? 0;
              const margin = sellPrice - recipeCost;
              const marginPct = sellPrice > 0 ? (margin / sellPrice) * 100 : 0;
              return (
                <Card key={offer.id} className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{offer.name}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {formatMoney(sellPrice, currency)} · {recipeCost > 0 ? `${formatMoney(recipeCost, currency)} cost` : "no cost recipe"}
                      </div>
                    </div>
                    <Badge tone={offer.active ? "good" : "default"}>{offer.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                    <div>
                      <span className="text-muted">Margin </span>
                      <span className={`num ${margin >= 0 ? "text-good" : "text-bad"}`}>
                        {formatMoney(margin, currency)} ({marginPct.toFixed(0)}%)
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Sold </span>
                      <span className="num">{formatNumber(stats?.timesSold ?? 0)}</span>
                    </div>
                    {offer.capacityPerDelivery ? (
                      <div>
                        <span className="text-muted">Capacity used </span>
                        <span className="num">
                          {formatNumber(stats?.capacityUsed ?? 0)} {offer.capacityUnit ?? ""}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                    <Button className="!min-h-[44px] sm:!min-h-[36px] !py-1.5" onClick={() => setFulfillTarget(offer)}>
                      Fulfill
                    </Button>
                    <button onClick={() => openEdit(offer)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(offer)} className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]">
                      Delete
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Desktop: the full table. */}
          <Card className="hidden sm:block">
            <Table>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-3 font-medium">Offer</th>
                  <th className="py-2 px-3 font-medium">Price</th>
                  <th className="py-2 px-3 font-medium">Recipe cost</th>
                  <th className="py-2 px-3 font-medium">Margin</th>
                  <th className="py-2 px-3 font-medium">Times sold</th>
                  <th className="py-2 px-3 font-medium">Total margin</th>
                  <th className="py-2 px-3 font-medium">Capacity used</th>
                  <th className="py-2 px-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => {
                  const stats = offerStats.get(offer.id);
                  const recipeCost = sumRecipeCost(offer.recipeLines);
                  const sellPrice = offer.defaultSellPrice ?? 0;
                  const margin = sellPrice - recipeCost;
                  const marginPct = sellPrice > 0 ? (margin / sellPrice) * 100 : 0;
                  return (
                    <tr key={offer.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{offer.name}</div>
                        <Badge tone={offer.active ? "good" : "default"}>{offer.active ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td className="py-2.5 px-3 num">{formatMoney(sellPrice, currency)}</td>
                      <td className="py-2.5 px-3 num text-muted">{formatMoney(recipeCost, currency)}</td>
                      <td className={`py-2.5 px-3 num ${margin >= 0 ? "text-good" : "text-bad"}`}>
                        {formatMoney(margin, currency)} <span className="text-muted text-xs">({marginPct.toFixed(0)}%)</span>
                      </td>
                      <td className="py-2.5 px-3 num">{formatNumber(stats?.timesSold ?? 0)}</td>
                      <td className={`py-2.5 px-3 num ${(stats?.margin ?? 0) >= 0 ? "text-good" : "text-bad"}`}>
                        {formatMoney(stats?.margin ?? 0, currency)}
                      </td>
                      <td className="py-2.5 px-3 num text-muted">
                        {offer.capacityPerDelivery ? `${formatNumber(stats?.capacityUsed ?? 0)} ${offer.capacityUnit ?? ""}` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <Button className="!min-h-[32px] !py-1 mr-2" onClick={() => setFulfillTarget(offer)}>
                          Fulfill
                        </Button>
                        <button onClick={() => openEdit(offer)} className="text-xs text-amber-soft hover:underline mr-3">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(offer)} className="text-xs text-muted hover:text-bad">
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit offer" : "New offer"}>
        <OfferForm
          initial={editing}
          onSave={async (values) => {
            try {
              if (editing) {
                await updateProduct(editing.id, values);
                toast.success("Offer updated", values.name);
              } else {
                await addProduct(values);
                toast.success("Offer created", values.name);
              }
              setFormOpen(false);
            } catch (err) {
              toast.error("Couldn't save", toastableErrorMessage(err));
            }
          }}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <Modal open={!!fulfillTarget} onClose={() => setFulfillTarget(null)} title={`Fulfill: ${fulfillTarget?.name ?? ""}`}>
        {fulfillTarget && (
          <FulfillForm
            offer={fulfillTarget}
            currency={currency}
            onSave={async (values) => {
              try {
                await fulfillOffer(fulfillTarget.id, values);
                toast.success(
                  "Offer fulfilled",
                  `${values.qty ?? 1} × ${fulfillTarget.name} — ${formatMoney((fulfillTarget.defaultSellPrice ?? 0) * (values.qty ?? 1), currency)} sold`
                );
                setFulfillTarget(null);
              } catch (err) {
                toast.error("Couldn't fulfill", toastableErrorMessage(err));
              }
            }}
            onCancel={() => setFulfillTarget(null)}
          />
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Offer builder — name, fixed price, capacity, and the repeatable cost
// recipe. The live margin preview is exactly sellPrice - sum(recipeLines),
// the same "repeat this offer's economics" number that fulfillOffer books
// for real every time this offer is delivered.
// ---------------------------------------------------------------------------
function OfferForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Product | null;
  onSave: (values: Omit<Product, "id" | "createdAt">) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [sku] = useState(initial?.sku ?? "");
  const [category, setCategory] = useState(initial?.category ?? "Services");
  const [sellPrice, setSellPrice] = useState(initial?.defaultSellPrice?.toString() ?? "");
  const [capacityPerDelivery, setCapacityPerDelivery] = useState(
    initial?.capacityPerDelivery?.toString() ?? ""
  );
  const [capacityUnit, setCapacityUnit] = useState(initial?.capacityUnit ?? "hours");
  const [active, setActive] = useState(initial?.active ?? true);
  const [lines, setLines] = useState<OfferCostLine[]>(
    initial?.recipeLines && initial.recipeLines.length > 0
      ? initial.recipeLines
      : [{ id: newLineId(), label: "", category: PROJECT_COST_CATEGORIES[0], amount: 0 }]
  );
  const [targetMargin, setTargetMargin] = useState("40");
  const [busy, setBusy] = useState(false);
  const costPerDelivery = sumRecipeCost(lines);
  const suggested = suggestPrice(costPerDelivery, Number(targetMargin) || 0);
  const liveMargin = offerMargin(Number(sellPrice) || 0, costPerDelivery);
  function applyTemplate(t: OfferTemplate) {
    setName(t.name);
    setCategory(t.category);
    if (t.capacityPerDelivery) setCapacityPerDelivery(String(t.capacityPerDelivery));
    if (t.capacityUnit) setCapacityUnit(t.capacityUnit);
    setLines(t.costLabels.map((label) => ({ id: newLineId(), label, category: PROJECT_COST_CATEGORIES[0], amount: 0 })));
  }

  const recipeCost = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const price = Number(sellPrice) || 0;
  const margin = price - recipeCost;
  const marginPct = price > 0 ? (margin / price) * 100 : 0;

  function updateLine(id: string, patch: Partial<OfferCostLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { id: newLineId(), label: "", category: PROJECT_COST_CATEGORIES[0], amount: 0 }]);
  }
  function removeLine(id: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const cleanLines = lines
          .filter((l) => l.label.trim().length > 0 || Number(l.amount) > 0)
          .map((l) => ({ ...l, amount: Number(l.amount) || 0 }));
        await onSave({
          name,
          sku: sku || name.toLowerCase().replace(/\s+/g, "-").slice(0, 24),
          category,
          type: "service",
          active,
          defaultSellPrice: price,
          recipeLines: cleanLines,
          capacityPerDelivery: capacityPerDelivery ? Number(capacityPerDelivery) : undefined,
          capacityUnit: capacityPerDelivery ? capacityUnit : undefined,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      {!initial && (
        <div className="space-y-2">
          <Label>Start from a shape that is common for small businesses (you can change everything after)</Label>
          <div className="flex flex-wrap gap-2">
            {OFFER_TEMPLATES.map((t) => (
              <Button key={t.key} type="button" variant="ghost" onClick={() => applyTemplate(t)} title={t.hint}>{t.label}</Button>
            ))}
          </div>
        </div>
      )}
      <Field>
        <Label>Offer name</Label>
        <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website audit" />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Fixed price (per delivery)</Label>
          <Input required type="number" min="0" step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
        </Field>
        <Field>
          <Label>Target margin (%), to suggest a price</Label>
          <Input type="number" min="0" max="99" step="1" value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} />
        </Field>
        <Field>
          <Label>Category</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Services" />
        </Field>
      </div>
      <div className="text-xs text-muted">
        Cost to deliver one: <span className="num">{costPerDelivery}</span>.
        {suggested !== null && <> At a {targetMargin}% margin the price would be <span className="num">{suggested}</span>. </>}
        {liveMargin.marginPct !== null && Number(sellPrice) > 0 && <>At your price the margin is <span className="num">{liveMargin.marginPct}%</span> (<span className="num">{liveMargin.profit}</span> profit per delivery).</>}
        {suggested !== null && Number(sellPrice) !== suggested && <> <button type="button" className="underline min-h-[32px]" onClick={() => setSellPrice(String(suggested))}>Use the suggested price</button></>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Capacity per delivery (optional)</Label>
          <Input type="number" min="0" step="0.5" value={capacityPerDelivery} onChange={(e) => setCapacityPerDelivery(e.target.value)} placeholder="e.g. 3" />
        </Field>
        <Field>
          <Label>Capacity unit</Label>
          <Input value={capacityUnit} onChange={(e) => setCapacityUnit(e.target.value)} placeholder="hours, days, seats…" />
        </Field>
      </div>

      <div>
        <Label>Cost recipe — what it costs you to deliver ONE unit</Label>
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-panel2 rounded-md p-2.5">
              <Input
                className="sm:flex-1"
                placeholder="e.g. My time — 3 hrs @ $30"
                value={line.label}
                onChange={(e) => updateLine(line.id, { label: e.target.value })}
              />
              <Select
                className="sm:w-44"
                value={line.category}
                onChange={(e) => updateLine(line.id, { category: e.target.value })}
              >
                {PROJECT_COST_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Input
                className="sm:w-28"
                type="number"
                min="0"
                step="0.01"
                value={line.amount || ""}
                onChange={(e) => updateLine(line.id, { amount: Number(e.target.value) || 0 })}
              />
              <button
                type="button"
                onClick={() => removeLine(line.id)}
                className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px] shrink-0"
                aria-label="Remove line"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" className="mt-2 !min-h-[44px] sm:!min-h-[36px] !py-1.5" onClick={addLine}>
          + Add cost line
        </Button>
      </div>

      <Card className="!p-3 bg-panel2">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-muted">Recipe cost </span>
            <span className="num">{recipeCost.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-muted">Margin </span>
            <span className={`num ${margin >= 0 ? "text-good" : "text-bad"}`}>
              {margin.toFixed(2)} ({price > 0 ? marginPct.toFixed(0) : "0"}%)
            </span>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <input id="offer-active" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-4 h-4" />
        <label htmlFor="offer-active" className="text-sm text-muted">
          Active — offer it for new fulfillments
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name || price <= 0}>
          {busy ? "Saving…" : initial ? "Save changes" : "Create offer"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Fulfill — the one-click "sell one more of this" action. Everything here
// just supplies context (who, when, how they paid); the price and cost are
// already fixed by the offer template, so they're shown read-only.
// ---------------------------------------------------------------------------
function FulfillForm({
  offer,
  currency,
  onSave,
  onCancel,
}: {
  offer: Product;
  currency: string;
  onSave: (values: {
    qty?: number;
    date: string;
    customer?: string;
    customerContact?: string;
    paymentMethod?: PaymentMethod;
    creditTermDays?: number;
    notes?: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(todayIso());
  const [customer, setCustomer] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);

  const recipeCost = sumRecipeCost(offer.recipeLines);
  const sellPrice = offer.defaultSellPrice ?? 0;
  const n = Number(qty) || 1;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          qty: n,
          date,
          customer: customer || undefined,
          paymentMethod,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Card className="!p-3 bg-panel2 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-muted">Price per delivery</span>
          <span className="num">{formatMoney(sellPrice, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Cost per delivery</span>
          <span className="num">{formatMoney(recipeCost, currency)}</span>
        </div>
        <div className="flex justify-between font-medium pt-1 border-t border-line">
          <span>This fulfillment ({n}×)</span>
          <span className="num">{formatMoney((sellPrice - recipeCost) * n, currency)} margin</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>How many deliveries</Label>
          <Input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <Field>
        <Label>Customer (optional)</Label>
        <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Who this was delivered to" />
      </Field>

      <Field>
        <Label>Payment method</Label>
        <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="credit">Credit (invoice, collect later)</option>
        </Select>
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Fulfilling…" : "Fulfill"}
        </Button>
      </div>
    </form>
  );
}
