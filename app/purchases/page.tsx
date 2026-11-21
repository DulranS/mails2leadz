"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useData } from "@/contexts/DataContext";
import ReferenceRateHint from "@/components/ReferenceRateHint";
import { useFillReferenceRate, useReferenceRate } from "@/hooks/useReferenceRate";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";
import { RecordSupplierReturnForm } from "@/components/RecordSupplierReturnForm";
import { PackUnitSelect } from "@/components/PackUnitSelect";
import { baseUnitLabel, describePackEntry, resolveEntryUnit, toBaseQty, toBaseUnitAmount } from "@/lib/units";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { formatMoney, todayIso } from "@/lib/format";
import { assessmentYearStart, flagCashPayments, CASH_DEDUCTION_LIMIT } from "@/lib/cashPayments";
import { CURRENCIES, convertToBase } from "@/lib/fx";
import { SUPPLIER_RETURN_REASONS, type PaymentMethod, type Product, type Project, type Purchase, type Supplier } from "@/lib/types";
import { LocationField, defaultLocationId } from "@/components/LocationPicker";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Table,
  TableCardSkeleton,
  EmptyState,
  ShowMoreBar,
  usePagedList,
} from "@/components/ui";

export default function PurchasesPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { products, purchases, addPurchase, updatePurchase, deletePurchase, settings, loading, projects, supplierConcentration, suppliers, addSupplier, supplierReturns, deleteSupplierReturn } = useData();
  const { role } = useAuth();
  const canSendBack = can(role, "manage:products");
  const canDeleteReturn = can(role, "delete:records");
  const [returning, setReturning] = useState<Purchase | null>(null);
  // Units already sent back, per purchase — drives the badge and hides "Send back" once everything has gone.
  const sentBackByPurchase = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of supplierReturns) m.set(r.purchaseId, (m.get(r.purchaseId) ?? 0) + r.qty);
    return m;
  }, [supplierReturns]);
  const purchasePage = usePagedList(purchases);
  // Large cash purchases this year of assessment (v327). Flagged for checking; the tax figures are not changed.
  const cashFlags = useMemo(() => {
    const today = todayIso();
    return flagCashPayments(purchases, { fromIso: assessmentYearStart(today), toIso: today });
  }, [purchases]);
  const productById = useMemo(() => new Map(products.map((pr) => [pr.id, pr])), [products]);
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const currency = settings.currency;

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(p: Purchase) {
    setEditing(p);
    setModalOpen(true);
  }

  function handleDelete(id: string) {
    const sentBack = supplierReturns.filter((r) => r.purchaseId === id).length;
    if (!confirm(`Delete this? This can't be undone and will take it back out of your stock.${sentBack > 0 ? ` The ${sentBack} supplier return${sentBack === 1 ? "" : "s"} recorded against it will be deleted too.` : ""}`)) return;
    deletePurchase(id)
      .then(() => toast.success("Entry deleted"))
      .catch(() => toast.error("Couldn't delete the entry"));
  }

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Things You Bought" action={<Button disabled>+ I bought something</Button>} />
        <TableCardSkeleton rows={7} cols={5} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Things You Bought"
        action={
          <Button onClick={openNew} disabled={products.length === 0}>
            + I bought something
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-muted">
            This is what you&apos;ve already paid for and have in hand. Want to place an order with a supplier and track
            it until it arrives? Use the <span className="text-fg font-medium">Orders</span> page instead — once it
            arrives, it shows up here automatically.
          </div>
          <Link href="/purchase-orders" className="text-xs text-amber-soft shrink-0">
            Go to Orders →
          </Link>
        </div>
      </Card>

      {supplierConcentration.suppliers.length > 0 && (
        <Card className="mb-5">
          <div className="text-sm font-medium mb-0.5">Supplier concentration</div>
          <div className="text-xs text-muted mb-3">
            Share of your buying (last {supplierConcentration.trailingMonths} months) riding on one supplier. High
            concentration isn&apos;t automatically bad — just worth knowing on purpose.
          </div>
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted font-medium">Top supplier</div>
              <div className="num text-xl font-medium mt-1 flex items-center gap-2">
                {supplierConcentration.topSupplierSharePct?.toFixed(0)}%
                <Badge
                  tone={
                    (supplierConcentration.topSupplierSharePct ?? 0) >= 60
                      ? "bad"
                      : (supplierConcentration.topSupplierSharePct ?? 0) >= 35
                      ? "amber"
                      : "good"
                  }
                >
                  {supplierConcentration.suppliers[0].supplier}
                </Badge>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted font-medium">Top 3 combined</div>
              <div className="num text-xl font-medium mt-1">{supplierConcentration.top3SharePct?.toFixed(0)}%</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {supplierConcentration.suppliers.slice(0, 5).map((s) => (
              <div key={s.supplier} className="flex items-center justify-between text-xs border-b border-line last:border-0 py-1.5 gap-3">
                <div className="min-w-0 flex-1 truncate">{s.supplier}</div>
                <div className="num text-muted shrink-0">{formatMoney(s.spend, currency)}</div>
                <div className="num font-medium shrink-0 w-14 text-right">{s.sharePct.toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {products.length === 0 && (
        <EmptyState title="Add something first" body="Add a product or service before you log what it cost you." />
      )}

      {products.length > 0 && purchases.length === 0 && (
        <EmptyState
          title="Nothing bought yet"
          body="Buying stock? Log how many and what you paid each. Doing a service? Log what it costs you to deliver it — your time, a contractor, materials."
        />
      )}

      {cashFlags.length > 0 && (
        <Card>
          <p className="font-medium text-sm">Large cash purchases this year of assessment</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
            Under the Inland Revenue Act as amended, a payment of {formatMoney(CASH_DEDUCTION_LIMIT, currency)} or more made in cash cannot be deducted as an expense. This is a flag to check, not a change to your tax figures. Check each with your accountant or the IRD.
          </p>
          <ul className="mt-2 text-sm space-y-1">
            {cashFlags.map((f) => (
              <li key={f.ids.join(",")}>
                {f.date} · {f.supplier || "No supplier named"} · {formatMoney(f.total, currency)} in cash{f.reason === "same_day" ? ` (${f.ids.length} purchases the same day)` : ""}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {purchases.length > 0 && (
        <>
          <div className="sm:hidden space-y-2.5">
            {purchasePage.visible.map((p) => {
              const product = productById.get(p.productId);
              return (
                <Card key={p.id} className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{product?.name ?? "—"}</div>
                      <div className="text-xs text-muted num mt-0.5">
                        {p.date} · {p.qty} × {formatMoney(p.unitCost, currency)}
                        {(p.freightCost || p.customsCost || p.otherLandedCost) ? " (incl. landed)" : ""}
                        {p.expiryDate ? ` · expires ${p.expiryDate}` : ""}
                        {p.batchRef ? ` · batch ${p.batchRef}` : ""}
                      </div>
                    </div>
                    <div className="num font-medium shrink-0">{formatMoney(p.qty * p.unitCost, currency)}</div>
                  </div>
                  {(product?.type === "service" || p.purchaseOrderId || p.supplier || (sentBackByPurchase.get(p.id) ?? 0) > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-muted">
                      {p.supplier && <span>From {p.supplier}</span>}
                      {product?.type === "service" && <Badge tone="amber">service</Badge>}
                      {p.purchaseOrderId && <Badge tone="good">from order</Badge>}
                      {p.paymentMethod === "credit" && (
                        <Badge tone="bad">on credit{p.dueDate ? ` · due ${p.dueDate}` : ""}</Badge>
                      )}
                      {(sentBackByPurchase.get(p.id) ?? 0) > 0 && <Badge tone="amber">{sentBackByPurchase.get(p.id)} sent back</Badge>}
                    </div>
                  )}
                  <div className="flex gap-3 mt-2.5 pt-2.5 border-t border-line">
                    <button onClick={() => openEdit(p)} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
                      Edit
                    </button>
                    {canSendBack && product?.type !== "service" && (sentBackByPurchase.get(p.id) ?? 0) < p.qty && (
                      <button onClick={() => setReturning(p)} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
                        Send back
                      </button>
                    )}
                    <button onClick={() => handleDelete(p.id)} className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]">
                      Delete
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card className="hidden sm:block">
          <Table>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Item</th>
                <th className="py-2 px-3 font-medium text-right">How many</th>
                <th className="py-2 px-3 font-medium text-right">Price each</th>
                <th className="py-2 px-3 font-medium text-right">Total paid</th>
                <th className="py-2 px-3 font-medium">From</th>
                <th className="py-2 pl-3 font-medium text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {purchasePage.visible.map((p) => {
                const product = productById.get(p.productId);
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 text-muted num">{p.date}</td>
                    <td className="py-2.5 px-3 font-medium">
                      {product?.name ?? "—"}
                      {product?.type === "service" && (
                        <span className="ml-1.5">
                          <Badge tone="amber">service</Badge>
                        </span>
                      )}
                      {p.purchaseOrderId && (
                        <span className="ml-1.5">
                          <Badge tone="good">from order</Badge>
                        </span>
                      )}
                      {p.paymentMethod === "credit" && (
                        <span className="ml-1.5">
                          <Badge tone="bad">on credit{p.dueDate ? ` · due ${p.dueDate}` : ""}</Badge>
                        </span>
                      )}
                      {(sentBackByPurchase.get(p.id) ?? 0) > 0 && (
                        <span className="ml-1.5">
                          <Badge tone="amber">{sentBackByPurchase.get(p.id)} sent back</Badge>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 num text-right">{p.qty}</td>
                    <td className="py-2.5 px-3 num text-right">
                      {formatMoney(p.unitCost, currency)}
                      {p.currency && p.currency !== currency && p.foreignUnitCost !== undefined && (
                        <div className="text-[11px] text-muted">{formatMoney(p.foreignUnitCost, p.currency)}</div>
                      )}
                      {(p.freightCost || p.customsCost || p.otherLandedCost) ? (
                        <div className="text-[11px] text-muted">
                          incl. {formatMoney((p.freightCost ?? 0) + (p.customsCost ?? 0) + (p.otherLandedCost ?? 0), currency)}{" "}
                          landed
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-3 num text-right">{formatMoney(p.qty * p.unitCost, currency)}</td>
                    <td className="py-2.5 px-3 text-muted">
                      {p.supplier || "—"}
                      {(p.expiryDate || p.batchRef) && (
                        <div className="text-[11px]">
                          {p.expiryDate ? `expires ${p.expiryDate}` : ""}
                          {p.expiryDate && p.batchRef ? " · " : ""}
                          {p.batchRef ? `batch ${p.batchRef}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(p)} className="text-xs text-muted hover:text-fg mr-3">
                        Edit
                      </button>
                      {canSendBack && product?.type !== "service" && (sentBackByPurchase.get(p.id) ?? 0) < p.qty && (
                        <button onClick={() => setReturning(p)} className="text-xs text-muted hover:text-fg mr-3">
                          Send back
                        </button>
                      )}
                      <button onClick={() => handleDelete(p.id)} className="text-xs text-muted hover:text-bad">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          </Card>
          <ShowMoreBar shown={purchasePage.shown} total={purchasePage.total} remaining={purchasePage.remaining} onShowMore={purchasePage.showMore} onShowAll={purchasePage.showAll} noun="purchases" />
        </>
      )}

      {supplierReturns.length > 0 && (
        <Card className="mt-5">
          <div className="font-display text-base">Sent back to suppliers</div>
          <div className="text-xs text-muted mt-0.5">
            Goods you returned for a refund or a smaller bill. Delete one here if it was logged by mistake (open month only).
          </div>
          <div className="mt-3 space-y-1.5">
            {[...supplierReturns]
              .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
              .slice(0, 25)
              .map((r) => {
                const name = productById.get(r.productId)?.name ?? "—";
                const reason = SUPPLIER_RETURN_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason;
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-line last:border-0">
                    <div className="min-w-0">
                      <span className="font-medium">{name}</span> <span className="num text-xs text-bad">−{r.qty}</span>{" "}
                      <span className="text-muted text-xs">
                        ({r.date}
                        {r.supplier ? ` · ${r.supplier}` : ""} · {reason} ·{" "}
                        {formatMoney(r.creditAmount + (r.taxAmount ?? 0), currency)}{" "}
                        {r.settlement === "refund" ? "refunded" : r.settlement === "hold_credit" ? "kept as credit" : "off the bill"}
                        {r.notes ? ` · ${r.notes}` : ""})
                      </span>
                    </div>
                    {canDeleteReturn && (
                      <button
                        onClick={() => {
                          if (!confirm("Delete this supplier return? The units go back into your stock and the refund / bill credit is reversed.")) return;
                          deleteSupplierReturn(r.id)
                            .then(() => toast.success("Return deleted"))
                            .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                        }}
                        className="text-xs text-muted hover:text-bad shrink-0 min-h-[44px] sm:min-h-0"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      <Modal open={!!returning} onClose={() => setReturning(null)} title="Send goods back to the supplier">
        {returning && (
          <RecordSupplierReturnForm
            purchase={returning}
            productName={productById.get(returning.productId)?.name ?? "item"}
            onDone={() => setReturning(null)}
          />
        )}
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit this" : "I bought something"}>
        <PurchaseForm
          products={products}
          projects={projects}
          suppliers={suppliers}
          initial={editing}
          baseCurrency={currency}
          defaultCreditTermDays={settings.defaultCreditTermDays}
          onCancel={() => setModalOpen(false)}
          onSave={async (values) => {
            try {
              if (editing) {
                await updatePurchase(editing.id, values);
                toast.success("Updated");
              } else {
                await addPurchase(values);
                toast.success("Logged", `${values.qty} × ${formatMoney(values.unitCost, currency)} each`);
              }
              // Quietly grow the supplier directory — same best-effort,
              // silent pattern the Sale form uses for Customers: a failed
              // directory write should never block or surface an error for
              // a purchase that already saved successfully.
              if (
                values.supplier?.trim() &&
                !suppliers.some((s) => s.name.trim().toLowerCase() === values.supplier!.trim().toLowerCase())
              ) {
                addSupplier({ name: values.supplier.trim() }).catch(() => {});
              }
              setModalOpen(false);
            } catch (err) {
              toast.error("Couldn't save that", toastableErrorMessage(err));
            }
          }}
        />
      </Modal>
    </>
  );
}

function PurchaseForm({
  products,
  projects,
  suppliers,
  initial,
  baseCurrency,
  defaultCreditTermDays,
  onSave,
  onCancel,
}: {
  products: Product[];
  projects: Project[];
  suppliers: Supplier[];
  initial?: Purchase | null;
  baseCurrency: string;
  defaultCreditTermDays: number;
  onSave: (values: {
    productId: string;
    qty: number;
    unitCost: number;
    currency?: string;
    exchangeRate?: number;
    foreignUnitCost?: number;
    goodsUnitCost?: number;
    freightCost?: number;
    customsCost?: number;
    otherLandedCost?: number;
    date: string;
    supplier?: string;
    notes?: string;
    expiryDate?: string;
    batchRef?: string;
    projectId?: string;
    paymentMethod?: PaymentMethod;
    creditTermDays?: number;
    locationId?: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const { locations } = useData();
  const [productId, setProductId] = useState(initial?.productId ?? products[0]?.id ?? "");
  const [qty, setQty] = useState(initial?.qty?.toString() ?? "");
  const [unitCost, setUnitCost] = useState(
    (initial?.foreignUnitCost ?? initial?.goodsUnitCost ?? initial?.unitCost)?.toString() ??
      products[0]?.defaultCostPrice?.toString() ??
      ""
  );
  const [txCurrency, setTxCurrency] = useState(initial?.currency ?? baseCurrency);
  const [exchangeRate, setExchangeRate] = useState((initial?.exchangeRate ?? 1).toString());
  const referenceRate = useReferenceRate(txCurrency, baseCurrency);
  useFillReferenceRate({ currency: txCurrency, base: baseCurrency, rate: exchangeRate, setRate: setExchangeRate, reference: referenceRate });
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [expiryDate, setExpiryDate] = useState(initial?.expiryDate ?? "");
  const [batchRef, setBatchRef] = useState(initial?.batchRef ?? "");
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [showLanded, setShowLanded] = useState(
    !!(initial?.freightCost || initial?.customsCost || initial?.otherLandedCost)
  );
  const [freightCost, setFreightCost] = useState(initial?.freightCost?.toString() ?? "");
  const [customsCost, setCustomsCost] = useState(initial?.customsCost?.toString() ?? "");
  const [otherLandedCost, setOtherLandedCost] = useState(initial?.otherLandedCost?.toString() ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial?.paymentMethod ?? "cash");
  const [creditTermDays, setCreditTermDays] = useState(
    (initial?.creditTermDays ?? defaultCreditTermDays).toString()
  );
  const [locationId, setLocationId] = useState(initial?.locationId ?? defaultLocationId(locations));
  const [busy, setBusy] = useState(false);
  // Buying in packs (a carton of 12): qty and price are entered per pack, converted to base units before anything is
  // saved or calculated — see lib/units.ts. "" = the base unit. When editing a saved purchase it is shown in base units.
  const [entryUnitId, setEntryUnitId] = useState("");

  const selected = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const isService = selected?.type === "service";
  const entryUnit = resolveEntryUnit(isService ? undefined : selected, entryUnitId);
  const factor = entryUnit.factor;
  const unitText = baseUnitLabel(selected) || "unit";

  const qtyEntered = Number(qty) || 0; // in the entry unit (a pack, or one piece)
  const qtyNum = toBaseQty(qtyEntered, factor); // always base units from here on
  const costNum = Number(unitCost) || 0; // entered cost per ENTRY unit, in txCurrency
  const costPerBaseNum = toBaseUnitAmount(costNum, factor); // txCurrency, per base unit
  const rateNum = txCurrency === baseCurrency ? 1 : Number(exchangeRate) || 0;
  const goodsBaseCostNum = convertToBase(costPerBaseNum, rateNum); // base-currency equivalent of what you paid the supplier, per base unit

  // Landed costs are entered as ONE total for the whole purchase (that's
  // how a freight or customs bill actually arrives), then spread evenly
  // across qty to get the true all-in per-unit cost that feeds WAC/COGS —
  // see the Purchase.goodsUnitCost/freightCost/etc. comment in lib/types.ts.
  const landedTotal = (Number(freightCost) || 0) + (Number(customsCost) || 0) + (Number(otherLandedCost) || 0);
  const landedPerUnit = showLanded && qtyNum > 0 ? landedTotal / qtyNum : 0;
  const allInUnitCost = goodsBaseCostNum + landedPerUnit;

  function handleProductChange(id: string) {
    setProductId(id);
    setEntryUnitId("");
    const p = products.find((pr) => pr.id === id);
    if (p?.defaultCostPrice !== undefined) setUnitCost(p.defaultCostPrice.toString());
  }
  // Switching between pieces and a pack: carry the usual price across (default x pack size) unless the person typed their own.
  function handleEntryUnitChange(id: string) {
    const next = resolveEntryUnit(selected, id);
    const d = selected?.defaultCostPrice;
    if (d !== undefined && (unitCost === "" || Math.abs(costNum - d * factor) < 0.005)) setUnitCost((Math.round(d * next.factor * 100) / 100).toString());
    setEntryUnitId(id);
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          productId,
          qty: qtyNum,
          unitCost: allInUnitCost,
          currency: txCurrency !== baseCurrency ? txCurrency : undefined,
          exchangeRate: txCurrency !== baseCurrency ? rateNum : undefined,
          foreignUnitCost: txCurrency !== baseCurrency ? costPerBaseNum : undefined,
          goodsUnitCost: showLanded ? goodsBaseCostNum : undefined,
          freightCost: showLanded ? Number(freightCost) || 0 : undefined,
          customsCost: showLanded ? Number(customsCost) || 0 : undefined,
          otherLandedCost: showLanded ? Number(otherLandedCost) || 0 : undefined,
          date,
          supplier,
          notes: [notes, describePackEntry(qtyEntered, entryUnit, selected)].filter(Boolean).join(" · "),
          expiryDate: !isService && expiryDate ? expiryDate : undefined,
          batchRef: !isService && batchRef.trim() ? batchRef.trim() : undefined,
          projectId: projectId || undefined,
          paymentMethod,
          creditTermDays: paymentMethod === "credit" ? Number(creditTermDays) || defaultCreditTermDays : undefined,
          locationId: locationId || undefined,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>What did you buy?</Label>
        <Select required value={productId} onChange={(e) => handleProductChange(e.target.value)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.type === "service" ? "(service)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      {!isService && <PackUnitSelect product={selected} value={entryUnitId} onChange={handleEntryUnitChange} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>
            {isService
              ? "How many hours / jobs?"
              : entryUnit.id === ""
                ? "How many did you buy?"
                : `How many ${entryUnit.name}s did you buy?`}
          </Label>
          <Input required type="number" inputMode="decimal" min="0" step={selected?.allowFractionalQty ? "any" : "1"} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field>
          <Label>
            {isService ? "Price you paid per hour / job" : entryUnit.id === "" ? "Price you paid for each" : `Price you paid per ${entryUnit.name}`}
          </Label>
          <Input required type="number" inputMode="decimal" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </Field>
      </div>
      {entryUnit.id !== "" && qtyNum > 0 && costNum > 0 && (
        <div className="text-xs text-muted -mt-2" aria-live="polite">
          = {qtyNum} {unitText} in stock, at {formatMoney(goodsBaseCostNum, baseCurrency)} per {unitText}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Currency</Label>
          <Select value={txCurrency} onChange={(e) => setTxCurrency(e.target.value)}>
            {(CURRENCIES.includes(baseCurrency) ? CURRENCIES : [baseCurrency, ...CURRENCIES]).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        {txCurrency !== baseCurrency && (
          <Field>
            <Label>
              Rate (1 {txCurrency} = ? {baseCurrency})
            </Label>
            <Input
              required
              type="number"
              min="0"
              step="0.0001"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
            />
            <ReferenceRateHint currency={txCurrency} base={baseCurrency} rate={exchangeRate} setRate={setExchangeRate} reference={referenceRate} />
          </Field>
        )}
      </div>
      {txCurrency !== baseCurrency && costNum > 0 && rateNum > 0 && (
        <div className="text-xs text-muted -mt-2">= {formatMoney(goodsBaseCostNum, baseCurrency)} per {entryUnit.id === "" ? "unit" : unitText} at this rate</div>
      )}

      {!isService && (
        <div className="rounded-lg border border-line p-3">
          <button
            type="button"
            onClick={() => setShowLanded((v) => !v)}
            className="text-xs text-amber-soft hover:underline"
          >
            {showLanded ? "− Hide" : "+ Add"} freight / customs / other landed costs
          </button>
          {showLanded && (
            <>
              <div className="text-[11px] text-muted mt-1.5 mb-3">
                Enter the TOTAL for this whole delivery (not per unit) — it gets spread across the {qtyNum || "…"} units
                you&apos;re logging so your real per-unit cost, and margin, reflect what it actually cost to get this
                stock into your hands.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field>
                  <Label>Freight/shipping</Label>
                  <Input type="number" min="0" step="0.01" value={freightCost} onChange={(e) => setFreightCost(e.target.value)} />
                </Field>
                <Field>
                  <Label>Customs/duty</Label>
                  <Input type="number" min="0" step="0.01" value={customsCost} onChange={(e) => setCustomsCost(e.target.value)} />
                </Field>
                <Field>
                  <Label>Other (insurance, handling…)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={otherLandedCost}
                    onChange={(e) => setOtherLandedCost(e.target.value)}
                  />
                </Field>
              </div>
              {landedTotal > 0 && qtyNum > 0 && (
                <div className="text-xs text-muted mt-3 pt-3 border-t border-line">
                  Goods: {formatMoney(goodsBaseCostNum, baseCurrency)}/unit + landed:{" "}
                  {formatMoney(landedPerUnit, baseCurrency)}/unit ={" "}
                  <span className="text-fg font-medium">{formatMoney(allInUnitCost, baseCurrency)}/unit</span> all-in cost
                  ({formatMoney(landedTotal, baseCurrency)} total ÷ {qtyNum})
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Field>
        <Label>Date</Label>
        <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <LocationField value={locationId} onChange={setLocationId} label="Received into" />
      {/*
        Supplier-side mirror of the payment selector the Sale form has had
        all along. Without it there was no way anywhere in the app to mark
        a purchase as bought on terms — which meant Purchase.paymentMethod
        was never once set to "credit", so computePayablesAging returned an
        empty list for every business and the whole supplier-payables side
        (the Suppliers tab on Money Owed, RecordPayablePaymentForm, the
        accountsPayable line on the Balance Sheet, reconciliation
        candidates, the assistant's overdue reminders) had no way to ever
        hold a single row. Buying stock on 30-day terms is about as common
        as SME transactions get, and until now the books simply recorded it
        as cash out the door on delivery day.
      */}
      <Field>
        <Label>How did you pay?</Label>
        <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="credit">On credit — you&apos;ll pay the supplier later</option>
        </Select>
      </Field>
      {paymentMethod === "credit" && (
        <Field>
          <Label>Pay within (days)</Label>
          <Input
            type="number"
            min="1"
            step="1"
            value={creditTermDays}
            onChange={(e) => setCreditTermDays(e.target.value)}
          />
          <div className="text-[11px] text-muted mt-1.5">
            This still counts as a real cost today — it just won&apos;t show as cash leaving until you record a payment
            against it on the Money Owed page.
          </div>
        </Field>
      )}
      <Field>
        <Label>{isService ? "Who did the work (optional)" : "Bought from (optional)"}</Label>
        <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} list="supplier-directory" />
        <datalist id="supplier-directory">
          {suppliers.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
      </Field>
      {!isService && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <Label>Use-by / expiry date (optional)</Label>
            <Input type="date" min={date} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            <div className="text-[11px] text-muted mt-1">Food, medicine, cosmetics. Lets the Health page warn you before it runs out of date.</div>
          </Field>
          <Field>
            <Label>Batch / lot number (optional)</Label>
            <Input value={batchRef} onChange={(e) => setBatchRef(e.target.value)} placeholder="From the supplier's label" />
          </Field>
        </div>
      )}
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {projects.length > 0 && (
        <Field>
          <Label>Project (optional)</Label>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— not part of a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : initial ? "Save changes" : "Save"}
        </Button>
      </div>
    </form>
  );
}
