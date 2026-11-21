"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { formatDate, formatMoney, formatNumber, todayIso } from "@/lib/format";
import { computeSlowStock } from "@/lib/stockHealth";
import type { BomComponent, OfferingType, PackSize, Product, VariableCost } from "@/lib/types";
import { baseUnitLabel, cleanPackSizes, packBreakdown } from "@/lib/units";
import { STOCK_ADJUSTMENT_REASONS } from "@/lib/types";
import { QuickStockForm, QuickSaleForm } from "@/components/QuickForms";
import { StockAdjustmentForm } from "@/components/StockAdjustmentForm";
import StockCountSheet from "@/components/StockCountSheet";
import { AddVariantsForm } from "@/components/AddVariantsForm";
import { summarizeVariantGroups } from "@/lib/variants";
import { ProduceForm } from "@/components/ProduceForm";
import ProductionSuggestionsCard from "@/components/ProductionSuggestionsCard";
import { formatTiers, parseTiers } from "@/lib/priceTiers";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import LostSalesSection from "@/components/LostSalesSection";
import { ECO_TAG_PRESETS, cleanEcoTags } from "@/lib/ecoTags";
import { cleanBin } from "@/lib/bins";
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Table,
  TableCardSkeleton,
  Badge,
  EmptyState,
  CollapsibleSection,
} from "@/components/ui";

// Local id for a bill-of-materials line's React key / edit-remove — not a
// Firestore document id (BomComponent[] is stored as a plain array on the
// Product doc, same reasoning as OfferCostLine in lib/types.ts). Mirrors
// newLineId() in app/offers/page.tsx.
function newBomLineId(): string {
  return `bom_${Math.random().toString(36).slice(2, 10)}`;
}

export default function ProductsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const canDelete = can(role, "delete:records");
  const {
    products,
    ledgers,
    settings,
    deleteProduct,
    addProduct,
    updateProduct,
    bulkDiscountProducts,
    locations,
    locationStockLevels,
    loading,
  } = useData();

  // "Main: 12 · Kandy: 5" style breakdown per product, only meaningful once
  // a business has more than one active Location — see locationStockLevels
  // in DataContext. The headline qty stays the consolidated total; this is
  // purely an extra hover detail, so nothing changes visually for a
  // single-location business.
  const locationBreakdownByProduct = useMemo(() => {
    if (locations.filter((l) => l.active).length <= 1) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const level of locationStockLevels) {
      const locName = locations.find((l) => l.id === level.locationId)?.name ?? "?";
      const existing = map.get(level.productId);
      const part = `${locName}: ${formatNumber(level.qtyOnHand)}`;
      map.set(level.productId, existing ? `${existing} · ${part}` : part);
    }
    return map;
  }, [locations, locationStockLevels]);
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [stockTarget, setStockTarget] = useState<Product | null>(null);
  const [sellTarget, setSellTarget] = useState<Product | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [countOpen, setCountOpen] = useState(false);
  const [produceTarget, setProduceTarget] = useState<Product | null>(null);
  // Batch discounting — select any mix of products/services (goods or
  // services, retail or wholesale; there's no separate B2B/B2C price tier
  // in this app, so one flow covers both) and knock a % off all of their
  // sell prices in one go.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [discountModalOpen, setDiscountModalOpen] = useState(false);

  const currency = settings.currency;

  const selectedCount = selectedIds.size;
  const allSelected = products.length > 0 && selectedIds.size === products.length;

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(products.map((p) => p.id)) : new Set());
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const [bulkDeleting, setBulkDeleting] = useState(false);
  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (
      !confirm(
        `Delete ${ids.length} item${ids.length === 1 ? "" : "s"}? This can't be undone. Items with sales or buys on record can't be deleted, so they will be refused; archive those instead.`
      )
    )
      return;
    setBulkDeleting(true);
    let failed = 0;
    for (const id of ids) {
      try {
        await deleteProduct(id);
      } catch {
        failed++;
      }
    }
    setBulkDeleting(false);
    clearSelection();
    if (failed === 0) toast.success(`${ids.length} item${ids.length === 1 ? "" : "s"} deleted`);
    else toast.error("Some items couldn't be deleted", `${ids.length - failed} deleted, ${failed} failed`);
  }

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setModalOpen(true);
  }

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="What You Sell" action={<Button disabled>+ Add something new</Button>} />
        <TableCardSkeleton rows={7} cols={5} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="What You Sell"
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setCountOpen(true)}>
              Count stock
            </Button>
            <Button variant="ghost" onClick={() => setVariantsOpen(true)}>
              + Sizes / colours
            </Button>
            <Button onClick={openNew}>+ Add something new</Button>
          </div>
        }
      />

      <ProductionSuggestionsCard />

      {selectedCount > 0 && (
        <Card className="!p-3 mb-4 flex flex-wrap items-center justify-between gap-3 bg-panel2">
          <div className="text-sm">
            <span className="font-medium">{selectedCount}</span>{" "}
            <span className="text-muted">selected</span>
          </div>
          <div className="flex items-center flex-wrap gap-3">
            <button onClick={clearSelection} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
              Clear
            </button>
            <Button className="!min-h-[44px] sm:!min-h-[36px] !py-1.5" onClick={() => setDiscountModalOpen(true)}>
              Apply % discount…
            </Button>
            {canDelete && (
              <Button
                variant="danger"
                className="!min-h-[44px] sm:!min-h-[36px] !py-1.5"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? "Deleting…" : "Delete selected"}
              </Button>
            )}
          </div>
        </Card>
      )}

      {products.length === 0 ? (
        <EmptyState
          title="Nothing set up yet"
          body="Add something you sell — a physical item you buy and keep in stock, or a service where you sell your time."
        />
      ) : (
        <>
          {/* Mobile: one card per offering, most important number first. Same
              data as the table below — never rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {products.map((p) => {
              const l = ledgers.get(p.id);
              const qty = l?.qtyOnHand ?? 0;
              return (
                <Card key={p.id} className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-2.5">
                      <Checkbox
                        className="mt-1 shrink-0"
                        checked={selectedIds.has(p.id)}
                        onCheckedChange={(checked) => toggleOne(p.id, checked)}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{p.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge tone={p.type === "service" ? "amber" : "default"}>{p.type}</Badge>
                          {!p.active && <Badge>inactive</Badge>}
                          {p.sku && <span className="text-xs text-muted">{p.sku}</span>}
                        </div>
                      </div>
                    </div>
                    {p.type !== "service" && (
                      <div className="text-right shrink-0" title={locationBreakdownByProduct.get(p.id)}>
                        <div className={clsx("num font-medium", qty < 0 && "text-bad")}>
                          {formatNumber(qty)}
                          {baseUnitLabel(p) && <span className="text-xs text-muted font-normal"> {baseUnitLabel(p)}</span>}
                        </div>
                        <div className="text-[11px] text-muted mt-0.5">{packBreakdown(qty, p) ?? "in stock"}</div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                    <div>
                      <span className="text-muted">Paid </span>
                      <span className="num">{formatMoney(l?.wac ?? 0, currency)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Sells for </span>
                      <span className="num">
                        {p.defaultSellPrice ? formatMoney(p.defaultSellPrice, currency) : "—"}
                      </span>
                    </div>
                    {p.type !== "service" && (
                      <div>
                        <span className="text-muted">Worth </span>
                        <span className="num">{formatMoney(l?.inventoryValue ?? 0, currency)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                    {p.type === "product" && (
                      <button onClick={() => setStockTarget(p)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                        Buy more
                      </button>
                    )}
                    <button onClick={() => setSellTarget(p)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                      Sell
                    </button>
                    {p.type === "product" && (
                      <button onClick={() => setAdjustTarget(p)} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
                        Adjust stock
                      </button>
                    )}
                    {p.components && p.components.length > 0 && (
                      <button onClick={() => setProduceTarget(p)} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
                        Produce
                      </button>
                    )}
                    <button onClick={() => openEdit(p)} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
                      Edit
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Desktop: the full table, unchanged. */}
          <Card className="hidden sm:block">
          <Table>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="py-2 pr-2 font-medium w-8">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 px-3 font-medium">Type</th>
                <th className="py-2 px-3 font-medium text-right">You have</th>
                <th className="py-2 px-3 font-medium text-right">What you paid</th>
                <th className="py-2 px-3 font-medium text-right">You sell for</th>
                <th className="py-2 px-3 font-medium text-right">Worth</th>
                <th className="py-2 pl-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const l = ledgers.get(p.id);
                const qty = l?.qtyOnHand ?? 0;
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-2">
                      <Checkbox
                        checked={selectedIds.has(p.id)}
                        onCheckedChange={(checked) => toggleOne(p.id, checked)}
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="flex gap-1 mt-0.5">
                        {!p.active && <Badge>inactive</Badge>}
                        {p.sku && <span className="text-xs text-muted">{p.sku}</span>}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge tone={p.type === "service" ? "amber" : "default"}>{p.type}</Badge>
                    </td>
                    <td className="py-2.5 px-3 num text-right" title={locationBreakdownByProduct.get(p.id)}>
                      {p.type === "service" ? (
                        <span className="text-muted">—</span>
                      ) : qty < 0 ? (
                        <span className="text-bad">{formatNumber(qty)}</span>
                      ) : (
                        <>
                          {formatNumber(qty)}
                          {baseUnitLabel(p) && <span className="text-xs text-muted"> {baseUnitLabel(p)}</span>}
                          {packBreakdown(qty, p) && <div className="text-[11px] text-muted">{packBreakdown(qty, p)}</div>}
                        </>
                      )}
                    </td>
                    <td className="py-2.5 px-3 num text-right text-muted">
                      {formatMoney(l?.wac ?? 0, currency)}
                    </td>
                    <td className="py-2.5 px-3 num text-right text-muted">
                      {p.defaultSellPrice ? formatMoney(p.defaultSellPrice, currency) : "—"}
                    </td>
                    <td className="py-2.5 px-3 num text-right">
                      {p.type === "service" ? (
                        <span className="text-muted">—</span>
                      ) : (
                        formatMoney(l?.inventoryValue ?? 0, currency)
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      {p.type === "product" && (
                        <button onClick={() => setStockTarget(p)} className="text-xs text-amber-soft hover:underline mr-3">
                          Buy more
                        </button>
                      )}
                      <button onClick={() => setSellTarget(p)} className="text-xs text-amber-soft hover:underline mr-3">
                        Sell
                      </button>
                      {p.type === "product" && (
                        <button onClick={() => setAdjustTarget(p)} className="text-xs text-muted hover:text-fg mr-3">
                          Adjust stock
                        </button>
                      )}
                      {p.components && p.components.length > 0 && (
                        <button onClick={() => setProduceTarget(p)} className="text-xs text-muted hover:text-fg mr-3">
                          Produce
                        </button>
                      )}
                      <button onClick={() => openEdit(p)} className="text-xs text-muted hover:text-fg">
                        Edit
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

      <VariantGroupsSection />
      <SlowStockSection />
      <ReorderPlanningSection />
      <VariableCostsSection />
      <LostSalesSection />
      <RecentAdjustmentsSection />

      <Modal open={variantsOpen} onClose={() => setVariantsOpen(false)} title="Add sizes / colours">
        {variantsOpen && <AddVariantsForm onDone={() => setVariantsOpen(false)} />}
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit this" : "Add something new"}>
        <ProductForm
          initial={editing}
          currency={currency}
          products={products}
          onCancel={() => setModalOpen(false)}
          onSave={async (values) => {
            try {
              if (editing) await updateProduct(editing.id, values);
              else await addProduct(values);
              toast.success(editing ? "Offering updated" : "Offering added", values.name);
              setModalOpen(false);
            } catch (err) {
              toast.error("Couldn't save", toastableErrorMessage(err));
            }
          }}
          onDelete={
            editing && canDelete
              ? async () => {
                  if (!confirm(`Delete "${editing.name}"? This can't be undone. A product with sales or buys on record can't be deleted, so it will be refused; archive it instead.`)) return;
                  try {
                    await deleteProduct(editing.id);
                    toast.success("Offering deleted", editing.name);
                    setModalOpen(false);
                  } catch (err) {
                    toast.error("Couldn't delete", toastableErrorMessage(err));
                  }
                }
              : undefined
          }
        />
      </Modal>

      <Modal open={!!stockTarget} onClose={() => setStockTarget(null)} title={stockTarget ? `Add stock — ${stockTarget.name}` : "Add stock"}>
        {stockTarget && <QuickStockForm fixedProduct={stockTarget} onDone={() => setStockTarget(null)} />}
      </Modal>

      <Modal open={!!sellTarget} onClose={() => setSellTarget(null)} title={sellTarget ? `Log sale — ${sellTarget.name}` : "Log sale"}>
        {sellTarget && <QuickSaleForm fixedProduct={sellTarget} onDone={() => setSellTarget(null)} />}
      </Modal>

      <Modal open={countOpen} onClose={() => setCountOpen(false)} title="Count stock">
        {countOpen && <StockCountSheet onDone={() => setCountOpen(false)} />}
      </Modal>

      <Modal open={!!adjustTarget} onClose={() => setAdjustTarget(null)} title={adjustTarget ? `Adjust stock — ${adjustTarget.name}` : "Adjust stock"}>
        {adjustTarget && (
          <StockAdjustmentForm
            product={adjustTarget}
            currentQty={ledgers.get(adjustTarget.id)?.qtyOnHand ?? 0}
            onDone={() => setAdjustTarget(null)}
          />
        )}
      </Modal>

      <Modal open={!!produceTarget} onClose={() => setProduceTarget(null)} title={produceTarget ? `Record production — ${produceTarget.name}` : "Record production"}>
        {produceTarget && <ProduceForm product={produceTarget} onDone={() => setProduceTarget(null)} />}
      </Modal>

      <Modal
        open={discountModalOpen}
        onClose={() => setDiscountModalOpen(false)}
        title={`Discount ${selectedCount} item${selectedCount === 1 ? "" : "s"}`}
      >
        <BulkDiscountForm
          items={products.filter((p) => selectedIds.has(p.id))}
          currency={currency}
          onCancel={() => setDiscountModalOpen(false)}
          onApply={async (pct) => {
            const ids = Array.from(selectedIds);
            const { updatedIds, skippedIds } = await bulkDiscountProducts(ids, pct);
            const verb = pct >= 0 ? "discount" : "markup";
            if (updatedIds.length > 0) {
              toast.success(
                `${Math.abs(pct)}% ${verb} applied`,
                `${updatedIds.length} item${updatedIds.length === 1 ? "" : "s"} updated${
                  skippedIds.length > 0 ? ` · ${skippedIds.length} skipped (no price set)` : ""
                }`
              );
            } else {
              toast.error("Nothing to update", "None of the selected items have a sell price set yet.");
            }
            setDiscountModalOpen(false);
            clearSelection();
          }}
        />
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Batch discounting — pick a % off (or, with a negative number, a % markup)
// and preview exactly what every selected product/service's price will
// become before committing. Deliberately just operates on Product.defaultSellPrice,
// the same field every other price display and form on this page already
// reads/writes — there's no separate wholesale/retail price on a Product,
// so this one flow covers both a B2B "10% off for this bulk order" case and
// a B2C "everything 20% off this weekend" case equally.
// ---------------------------------------------------------------------------
function BulkDiscountForm({
  items,
  currency,
  onApply,
  onCancel,
}: {
  items: Product[];
  currency: string;
  onApply: (discountPercent: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [pct, setPct] = useState("10");
  const [busy, setBusy] = useState(false);
  const pctNum = Number(pct) || 0;

  const priced = items.filter((p) => (p.defaultSellPrice ?? 0) > 0);
  const unpriced = items.length - priced.length;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onApply(pctNum);
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Discount %</Label>
        <Input
          required
          autoFocus
          type="number"
          step="0.1"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          placeholder="e.g. 10"
        />
        <div className="text-xs text-muted mt-1">
          Applies to the sell price of every selected item. Use a negative number (e.g. -10) to mark up instead.
        </div>
      </Field>

      {items.length === 0 ? (
        <div className="text-sm text-muted">Nothing selected.</div>
      ) : (
        <div className="max-h-56 overflow-y-auto space-y-1 border border-line rounded-md p-2 bg-panel2">
          {items.map((p) => {
            const oldPrice = p.defaultSellPrice ?? 0;
            const hasPrice = oldPrice > 0;
            const newPrice = hasPrice ? Math.max(0, Math.round(oldPrice * (1 - pctNum / 100) * 100) / 100) : 0;
            return (
              <div key={p.id} className="flex items-center justify-between text-sm py-1">
                <span className="truncate pr-2">{p.name}</span>
                {hasPrice ? (
                  <span className="num shrink-0 whitespace-nowrap">
                    <span className="text-muted line-through mr-1.5">{formatMoney(oldPrice, currency)}</span>
                    {formatMoney(newPrice, currency)}
                  </span>
                ) : (
                  <span className="text-xs text-muted shrink-0">no price set — skipped</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unpriced > 0 && (
        <div className="text-xs text-muted">
          {unpriced} of {items.length} selected {unpriced === 1 ? "item has" : "items have"} no sell price set and
          will be left as-is.
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || priced.length === 0 || pctNum === 0}>
          {busy ? "Applying…" : `Apply to ${priced.length} item${priced.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </form>
  );
}

function ProductForm({
  initial,
  currency,
  products,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Product | null;
  currency: string;
  products: Product[];
  onSave: (values: Omit<Product, "id" | "createdAt">) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [type, setType] = useState<OfferingType>(initial?.type ?? "product");
  const [active, setActive] = useState(initial?.active ?? true);
  const [orderingCost, setOrderingCost] = useState(initial?.orderingCost?.toString() ?? "");
  const [holdingCostPct, setHoldingCostPct] = useState(initial?.holdingCostPct?.toString() ?? "");
  const [leadTimeDays, setLeadTimeDays] = useState(initial?.leadTimeDays?.toString() ?? "");
  const [defaultCostPrice, setDefaultCostPrice] = useState(initial?.defaultCostPrice?.toString() ?? "");
  const [defaultSellPrice, setDefaultSellPrice] = useState(initial?.defaultSellPrice?.toString() ?? "");
  const [contractorName, setContractorName] = useState(initial?.contractorName ?? "");
  const [contractorSharePct, setContractorSharePct] = useState(initial?.contractorSharePct?.toString() ?? "");
  const [marketRate, setMarketRate] = useState(initial?.marketRate?.toString() ?? "");
  const [marketRateSource, setMarketRateSource] = useState(initial?.marketRateSource ?? "");
  const [marketRateCheckedOn, setMarketRateCheckedOn] = useState(initial?.marketRateCheckedOn ?? "");
  const [marketCost, setMarketCost] = useState(initial?.marketCost?.toString() ?? "");
  const [marketCostSource, setMarketCostSource] = useState(initial?.marketCostSource ?? "");
  const [marketCostCheckedOn, setMarketCostCheckedOn] = useState(initial?.marketCostCheckedOn ?? "");
  const { settings: formSettings } = useData();
  const [wholesalePrice, setWholesalePrice] = useState(initial?.wholesalePrice?.toString() ?? "");
  const [priceTiersText, setPriceTiersText] = useState(formatTiers(initial?.priceTiers));
  const [warrantyMonths, setWarrantyMonths] = useState(initial?.warrantyMonths?.toString() ?? "");
  const [ecoTagsText, setEcoTagsText] = useState((initial?.ecoTags ?? []).join(", "));
  const [binText, setBinText] = useState(initial?.binLocation ?? "");
  // Blank = use the shop's tax rate. "0" is a real answer: tax-free. So only an empty box means "no override".
  const [taxRatePct, setTaxRatePct] = useState(initial?.taxRatePct !== undefined && initial?.taxRatePct !== null ? String(initial.taxRatePct) : "");
  const [laborCostPerUnit, setLaborCostPerUnit] = useState(initial?.laborCostPerUnit?.toString() ?? "");
  const [components, setComponents] = useState<BomComponent[]>(initial?.components ?? []);
  // Units of measure (see Product.baseUnit / packSizes in lib/types.ts and lib/units.ts). Pack quantities are kept
  // as text while typing, then checked by cleanPackSizes on save.
  const [baseUnit, setBaseUnit] = useState(initial?.baseUnit ?? "");
  const [allowFractionalQty, setAllowFractionalQty] = useState(initial?.allowFractionalQty ?? false);
  const [packRows, setPackRows] = useState<{ id: string; name: string; qty: string }[]>(
    (initial?.packSizes ?? []).map((k) => ({ id: k.id, name: k.name, qty: k.qty.toString() }))
  );
  const [busy, setBusy] = useState(false);
  const { user, businessId: activeBusinessId } = useAuth();
  const toast = useToast();
  const [suggesting, setSuggesting] = useState(false);
  const [priceSuggestion, setPriceSuggestion] = useState<{
    suggestedPrice: number;
    reasoning: string;
    lowEstimate?: number;
    highEstimate?: number;
  } | null>(null);

  async function handleSuggestPrice() {
    if (!user || !name.trim()) return;
    setSuggesting(true);
    setPriceSuggestion(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai/suggest-price", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(activeBusinessId ? { [BUSINESS_ID_HEADER]: activeBusinessId } : {}) },
        body: JSON.stringify({
          name,
          category,
          type,
          defaultCostPrice: defaultCostPrice ? Number(defaultCostPrice) : undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Couldn't get a suggestion.");
      setPriceSuggestion(payload);
    } catch (err) {
      toast.error("Couldn't get a price suggestion", toastableErrorMessage(err));
    } finally {
      setSuggesting(false);
    }
  }

  const cost = Number(defaultCostPrice) || 0;
  const sell = Number(defaultSellPrice) || 0;
  const labor = Number(laborCostPerUnit) || 0;
  const marginPerUnit = sell - cost;
  const marginPct = sell > 0 ? (marginPerUnit / sell) * 100 : null;
  const fullyLoadedMarginPerUnit = sell - cost - labor;
  const fullyLoadedMarginPct = sell > 0 ? (fullyLoadedMarginPerUnit / sell) * 100 : null;

  // Bill of materials — see the `components` doc comment on Product in
  // lib/types.ts. Only other product-type Products can be a component
  // (not this product itself, and not a service — a service's per-unit
  // labor cost belongs in ProduceForm's separate "labor/overhead" field
  // instead, so it isn't double-counted as both a "component" and a
  // recurring cost entry).
  const componentCandidates = products.filter((p) => p.type === "product" && p.id !== initial?.id);
  function addComponentLine() {
    if (componentCandidates.length === 0) return;
    setComponents((prev) => [...prev, { id: newBomLineId(), componentProductId: componentCandidates[0].id, qtyPerUnit: 1 }]);
  }
  function updateComponentLine(id: string, patch: Partial<BomComponent>) {
    setComponents((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeComponentLine(id: string) {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }

  const priceTiersParsed = parseTiers(priceTiersText);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const checked = type === "product" ? cleanPackSizes(packRows, baseUnit) : { packs: [] as PackSize[] };
        if (checked.error) {
          toast.error("Check the pack sizes", checked.error);
          return;
        }
        if (priceTiersParsed.error) {
          toast.error("Check the quantity price breaks", priceTiersParsed.error);
          return;
        }
        setBusy(true);
        await onSave({
          name,
          sku,
          category,
          type,
          active,
          // `undefined` here means "emptied" and becomes a real delete in updateProduct (PRODUCT_CLEARABLE_FIELDS).
          baseUnit: type === "product" && baseUnit.trim() ? baseUnit.trim() : undefined,
          packSizes: checked.packs.length > 0 ? checked.packs : undefined,
          allowFractionalQty: type === "product" ? allowFractionalQty : false,
          variantGroup: initial?.variantGroup,
          variantLabel: initial?.variantLabel,
          orderingCost: orderingCost ? Number(orderingCost) : undefined,
          holdingCostPct: holdingCostPct ? Number(holdingCostPct) : undefined,
          leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
          defaultCostPrice: defaultCostPrice ? Number(defaultCostPrice) : undefined,
          defaultSellPrice: defaultSellPrice ? Number(defaultSellPrice) : undefined,
          contractorName: contractorName.trim() || undefined,
          contractorSharePct: contractorSharePct.trim() ? Number(contractorSharePct) : undefined,
          marketRate: marketRate && Number(marketRate) > 0 ? Number(marketRate) : undefined,
          marketRateSource: marketRate && marketRateSource.trim() ? marketRateSource.trim() : undefined,
          // The check date moves to today whenever the market figure changes; otherwise it keeps the day it was first checked.
          marketRateCheckedOn: marketRate && Number(marketRate) > 0 ? (Number(marketRate) !== initial?.marketRate ? todayIso() : marketRateCheckedOn || todayIso()) : undefined,
          marketCost: marketCost && Number(marketCost) > 0 ? Number(marketCost) : undefined,
          marketCostSource: marketCost && marketCostSource.trim() ? marketCostSource.trim() : undefined,
          marketCostCheckedOn: marketCost && Number(marketCost) > 0 ? (Number(marketCost) !== initial?.marketCost ? todayIso() : marketCostCheckedOn || todayIso()) : undefined,
          wholesalePrice: wholesalePrice && Number(wholesalePrice) > 0 ? Number(wholesalePrice) : undefined,
          priceTiers: priceTiersParsed.tiers.length > 0 ? priceTiersParsed.tiers : undefined,
          warrantyMonths: warrantyMonths && Number(warrantyMonths) > 0 ? Math.min(120, Math.round(Number(warrantyMonths))) : undefined,
          ecoTags: cleanEcoTags(ecoTagsText),
          binLocation: cleanBin(binText),
          taxRatePct: formSettings.salesTaxEnabled && taxRatePct.trim() !== "" && Number.isFinite(Number(taxRatePct)) ? Math.min(100, Math.max(0, Number(taxRatePct))) : initial?.taxRatePct !== undefined && !formSettings.salesTaxEnabled ? initial.taxRatePct : undefined,
          laborCostPerUnit: laborCostPerUnit ? Number(laborCostPerUnit) : undefined,
          components:
            type === "product" && components.length > 0
              ? components.map((c) => ({ ...c, qtyPerUnit: Number(c.qtyPerUnit) || 0 })).filter((c) => c.qtyPerUnit > 0)
              : undefined,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Type</Label>
        <Select value={type} onChange={(e) => setType(e.target.value as OfferingType)}>
          <option value="product">Something I buy and keep in stock</option>
          <option value="service">Something I do (a service — no stock)</option>
        </Select>
      </Field>
      <Field>
        <Label>Name</Label>
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === "service" ? "e.g. Interior detailing" : "e.g. Suzuki Alto GF"}
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>SKU / barcode</Label>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="optional — the code a scanner reads" />
        </Field>
        <Field>
          <Label>Category</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="optional" />
        </Field>
      </div>

      <div className="border border-line rounded-md p-3 space-y-3">
        <div className="text-xs font-medium text-muted">
          Usual prices (optional) — fills these in for you every time you buy or sell this, so you don&apos;t have
          to type them again. You can always change them for a one-off deal.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <Label>{type === "service" ? "What it usually costs you" : "What you usually pay for one"}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={defaultCostPrice}
              onChange={(e) => setDefaultCostPrice(e.target.value)}
            />
          </Field>
          <Field>
            <Label>Contractor or talent who earns a share (optional)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input value={contractorName} onChange={(e) => setContractorName(e.target.value)} placeholder="Name" />
              <Input type="number" min="0" max="100" step="0.01" value={contractorSharePct} onChange={(e) => setContractorSharePct(e.target.value)} placeholder="Share of revenue, %" />
            </div>
          </Field>
          <Field>
            <Label>{type === "service" ? "What you usually charge" : "What you usually sell it for"}</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={defaultSellPrice}
                onChange={(e) => setDefaultSellPrice(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                disabled={!name.trim() || suggesting}
                onClick={handleSuggestPrice}
                title="Ask the AI Assistant for a rough starting price — an estimate from general knowledge, not a live market quote"
              >
                {suggesting ? "Asking…" : "Suggest"}
              </Button>
            </div>
            {priceSuggestion && (
              <div className="mt-2 text-xs border border-line rounded-md p-2 bg-panel2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    AI estimate: <strong>{formatMoney(priceSuggestion.suggestedPrice, currency)}</strong>
                    {priceSuggestion.lowEstimate && priceSuggestion.highEstimate
                      ? ` (range ${formatMoney(priceSuggestion.lowEstimate, currency)}–${formatMoney(priceSuggestion.highEstimate, currency)})`
                      : ""}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDefaultSellPrice(priceSuggestion.suggestedPrice.toString());
                      setPriceSuggestion(null);
                    }}
                  >
                    Use this
                  </Button>
                </div>
                <div className="text-muted">{priceSuggestion.reasoning}</div>
                <div className="text-muted italic">
                  Not a real market quote — a rough estimate from general knowledge. Check it against what you
                  actually see charged locally before relying on it.
                </div>
              </div>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <Label>Market rate (optional): what the market charges for this</Label>
            <Input type="number" min="0" step="0.01" value={marketRate} onChange={(e) => setMarketRate(e.target.value)} />
            <Input className="mt-2" value={marketRateSource} onChange={(e) => setMarketRateSource(e.target.value)} placeholder="Where you checked it (optional)" maxLength={200} />
          </Field>
          <Field>
            <Label>Market cost (optional): what suppliers charge the market for this</Label>
            <Input type="number" min="0" step="0.01" value={marketCost} onChange={(e) => setMarketCost(e.target.value)} />
            <Input className="mt-2" value={marketCostSource} onChange={(e) => setMarketCostSource(e.target.value)} placeholder="Where you checked it (optional)" maxLength={200} />
          </Field>
          <Field>
            <Label>Wholesale price (optional)</Label>
            <Input type="number" min="0" step="0.01" value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value)} />
            <div className="text-[11px] text-muted mt-1">
              What a wholesale customer usually pays. On a sale to a customer marked wholesale, it is offered as a one-tap suggestion. It never changes a price by itself.
            </div>
          </Field>
          <Field>
            <Label>Warranty, in months (optional)</Label>
            <Input type="number" min="0" max="120" step="1" value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)} />
            <div className="text-[11px] text-muted mt-1">
              A sale of this item then asks for the serial number or IMEI, and the receipt shows when the warranty ends. Information only.
            </div>
          </Field>
          <Field>
            <Label>Shelf or bin (optional)</Label>
            <Input value={binText} onChange={(e) => setBinText(e.target.value)} placeholder="e.g. A-03" />
            <div className="text-[11px] text-muted mt-1">
              Where it sits in the shop. The stock count lists items in shelf order, so you walk the shop once. Information only.
            </div>
          </Field>
          <Field>
            <Label>Eco and sustainability tags (optional)</Label>
            <Input value={ecoTagsText} onChange={(e) => setEcoTagsText(e.target.value)} list="eco-tag-presets" placeholder="Vegan, Recyclable packaging" />
            <datalist id="eco-tag-presets">
              {ECO_TAG_PRESETS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <div className="text-[11px] text-muted mt-1">
              Separate tags with commas. The Profit page then shows how much of the sales in the period came from tagged products. Information only.
            </div>
          </Field>
          <Field>
            <Label>Quantity price breaks (optional)</Label>
            <Input value={priceTiersText} onChange={(e) => setPriceTiersText(e.target.value)} placeholder="10:90, 50:80" />
            <div className={`text-[11px] mt-1 ${priceTiersParsed.error ? "text-bad" : "text-muted"}`}>
              {priceTiersParsed.error ??
                "Buy this many or more, pay this each: 10:90, 50:80 means 90 each from 10 pieces and 80 each from 50. Offered as a one-tap suggestion on the sale form; it never changes a price by itself."}
            </div>
          </Field>
          {formSettings.salesTaxEnabled && (
            <Field>
              <Label>{formSettings.salesTaxLabel?.trim() || "Tax"} rate for this item (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={taxRatePct}
                onChange={(e) => setTaxRatePct(e.target.value)}
                placeholder={`Shop rate (${formSettings.salesTaxRatePct ?? 0}%)`}
              />
              <div className="text-[11px] text-muted mt-1">
                Leave empty to use your shop rate. Enter 0 if this item is tax-free. It applies to new sales and purchases of this item only; past ones keep the tax they were saved with.
              </div>
            </Field>
          )}
        </div>
        <Field>
          <Label>Your own time on this (optional)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={laborCostPerUnit}
            onChange={(e) => setLaborCostPerUnit(e.target.value)}
            placeholder="e.g. what an employee's time is worth to make/deliver one"
          />
          <div className="text-[11px] text-muted mt-1">
            Only fill this in if a paid employee does the work themselves (not a contractor you already log as a
            purchase). It won&apos;t change the price you paid — it just shows you the real profit after their time
            is counted too, on the Profit page.
          </div>
        </Field>
        {(cost > 0 || sell > 0) && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">You&apos;d make per one</span>
              <span className={`num font-medium ${marginPerUnit >= 0 ? "text-good" : "text-bad"}`}>
                {formatMoney(marginPerUnit, currency)}
                {marginPct !== null && <span className="text-muted font-normal ml-1">({marginPct.toFixed(0)}%)</span>}
              </span>
            </div>
            {labor > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">...after your time too</span>
                <span className={`num font-medium ${fullyLoadedMarginPerUnit >= 0 ? "text-good" : "text-bad"}`}>
                  {formatMoney(fullyLoadedMarginPerUnit, currency)}
                  {fullyLoadedMarginPct !== null && (
                    <span className="text-muted font-normal ml-1">({fullyLoadedMarginPct.toFixed(0)}%)</span>
                  )}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {type === "product" && (
        <div className="border border-line rounded-md p-3 space-y-3">
          <div className="text-xs font-medium text-muted">
            Units (optional) — you count and sell in one unit, but you can buy in bigger ones. Costs, prices and stock
            always stay per single unit, so your profit figures are never affected.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field>
              <Label>You count and sell in</Label>
              <Input value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} placeholder="e.g. pc, kg, m, litre" maxLength={20} />
            </Field>
            <Field>
              <Label>Sold in parts?</Label>
              <label className="flex items-center gap-2 min-h-[44px] sm:min-h-[36px] text-sm cursor-pointer">
                <Checkbox checked={allowFractionalQty} onCheckedChange={setAllowFractionalQty} />
                Yes, allow 2.5 (kg, litres, metres)
              </label>
            </Field>
          </div>
          <div>
            <div className="text-xs text-muted mb-1.5">Bigger units you buy in (optional)</div>
            <div className="space-y-2">
              {packRows.map((r) => (
                <div key={r.id} className="grid grid-cols-[1fr_96px_44px] sm:grid-cols-[1fr_120px_32px] gap-2 items-center">
                  <Input
                    aria-label="Pack name"
                    value={r.name}
                    onChange={(e) => setPackRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                    placeholder="e.g. Carton"
                    maxLength={20}
                  />
                  <Input
                    aria-label={`How many ${baseUnit.trim() || "units"} in this pack`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={r.qty}
                    onChange={(e) => setPackRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, qty: e.target.value } : x)))}
                    placeholder={`${baseUnit.trim() || "units"} in it`}
                  />
                  <button
                    type="button"
                    aria-label="Remove this pack size"
                    onClick={() => setPackRows((rows) => rows.filter((x) => x.id !== r.id))}
                    className="text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {packRows.length < 5 && (
              <button
                type="button"
                onClick={() => setPackRows((rows) => [...rows, { id: newBomLineId(), name: "", qty: "" }])}
                className="text-xs text-amber-soft hover:underline mt-2 min-h-[44px] sm:min-h-[32px]"
              >
                + Add a pack size
              </button>
            )}
            {packRows.length > 0 && (
              <div className="text-[11px] text-muted mt-1">
                When you log a purchase you&apos;ll be able to choose one of these, e.g. 5 cartons at a carton price — it&apos;s saved as single units.
              </div>
            )}
          </div>
        </div>
      )}

      {type === "product" && (
        <div className="border border-line rounded-md p-3 space-y-3">
          <div className="text-xs font-medium text-muted">Reorder planning (optional — falls back to Settings defaults)</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Field>
              <Label>Ordering cost</Label>
              <Input type="number" min="0" step="0.01" value={orderingCost} onChange={(e) => setOrderingCost(e.target.value)} />
            </Field>
            <Field>
              <Label>Holding cost %/yr</Label>
              <Input type="number" min="0" step="0.5" value={holdingCostPct} onChange={(e) => setHoldingCostPct(e.target.value)} />
            </Field>
            <Field className="col-span-2 sm:col-span-1">
              <Label>Lead time (days)</Label>
              <Input type="number" min="0" step="1" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} />
            </Field>
          </div>
        </div>
      )}

      {type === "product" && (
        <div className="border border-line rounded-md p-3 space-y-3">
          <div className="text-xs font-medium text-muted">
            Bill of materials (optional) — made from other products you already stock, instead of bought
            ready-to-sell. Once set, a &quot;Produce&quot; action appears on this item that consumes the
            components below and adds finished stock at the computed cost.
          </div>
          {components.length === 0 && componentCandidates.length === 0 && (
            <div className="text-xs text-muted italic">
              Add another product first (e.g. a raw material) before building a recipe here.
            </div>
          )}
          {components.length > 0 && (
            <div className="space-y-2">
              {components.map((c) => (
                <div key={c.id} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-panel2 rounded-md p-2.5">
                  <Select
                    className="sm:flex-1"
                    value={c.componentProductId}
                    onChange={(e) => updateComponentLine(c.id, { componentProductId: e.target.value })}
                  >
                    {componentCandidates.map((cp) => (
                      <option key={cp.id} value={cp.id}>
                        {cp.name}
                      </option>
                    ))}
                  </Select>
                  <div className="flex items-center gap-2">
                    <Input
                      className="sm:w-28"
                      type="number"
                      min="0"
                      step="0.01"
                      value={c.qtyPerUnit}
                      onChange={(e) => updateComponentLine(c.id, { qtyPerUnit: Number(e.target.value) })}
                    />
                    <span className="text-xs text-muted whitespace-nowrap">per unit made</span>
                  </div>
                  <Button type="button" variant="ghost" onClick={() => removeComponentLine(c.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
          {componentCandidates.length > 0 && (
            <Button type="button" variant="ghost" onClick={addComponentLine}>
              + Add component
            </Button>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-amber" />
        Active
      </label>
      <div className="flex items-center justify-between pt-2">
        <div>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ReorderPlanningSection() {
  const { products, ledgers, eoqByProduct, onOrderByProduct } = useData();
  const stockProducts = useMemo(() => products.filter((p) => p.type === "product" && p.active), [products]);

  if (stockProducts.length === 0) return null;

  return (
    <CollapsibleSection
      title="Reorder planning (EOQ)"
      subtitle="Economic order quantity — the batch size that minimizes ordering + holding cost, based on your last 90 days of sales. Set ordering cost / holding % / lead time per-product for accuracy, or use the Settings defaults."
      storageKey="products-reorder-planning"
      defaultOpen={false}
      className="mt-6"
      badge={
        <Link href="/purchase-orders" className="text-xs text-amber-soft font-normal" onClick={(e) => e.stopPropagation()}>
          Place order →
        </Link>
      }
    >
      {/* Mobile: one card per product — this table has 7 columns, which on
          a phone left "On hand" wrapping to two lines and the last two
          columns (Reorder point, Status) pushed off-screen with nothing
          to signal they existed. Same data as the table below, laid out
          top-to-bottom instead of squeezed sideways. Never rendered at
          the same time as the table. */}
      <div className="sm:hidden space-y-2.5">
        {stockProducts.map((p) => {
          const eoq = eoqByProduct.get(p.id);
          const qty = ledgers.get(p.id)?.qtyOnHand ?? 0;
          const onOrder = onOrderByProduct.get(p.id) ?? 0;
          const needsReorder = eoq && eoq.reorderPoint > 0 && qty + onOrder <= eoq.reorderPoint;
          return (
            <Card key={p.id} className="!p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 font-medium text-sm truncate">{p.name}</div>
                <div className="shrink-0">
                  {!eoq || eoq.eoq === 0 ? (
                    <span className="text-[11px] text-muted">need more data</span>
                  ) : needsReorder ? (
                    <Badge tone="bad">reorder now</Badge>
                  ) : (
                    <Badge tone="good">ok</Badge>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2.5 text-xs">
                <div>
                  <div className="text-muted">On hand</div>
                  <div className="num font-medium mt-0.5">{formatNumber(qty)}</div>
                </div>
                <div>
                  <div className="text-muted">On order</div>
                  <div className="num font-medium mt-0.5">{onOrder > 0 ? formatNumber(onOrder) : "—"}</div>
                </div>
                <div>
                  <div className="text-muted">Annual demand</div>
                  <div className="num font-medium mt-0.5">{formatNumber(eoq?.annualDemand ?? 0)}</div>
                </div>
                <div>
                  <div className="text-muted">EOQ</div>
                  <div className="num font-medium mt-0.5">{eoq && eoq.eoq > 0 ? formatNumber(Math.ceil(eoq.eoq)) : "—"}</div>
                </div>
                <div>
                  <div className="text-muted">Reorder point</div>
                  <div className="num font-medium mt-0.5">
                    {eoq && eoq.reorderPoint > 0 ? formatNumber(Math.ceil(eoq.reorderPoint)) : "—"}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Desktop: the full table, unchanged. */}
      <div className="hidden sm:block">
      <Table>
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
            <th className="py-2 pr-3 font-medium whitespace-nowrap">Product</th>
            <th className="py-2 px-3 font-medium text-right whitespace-nowrap">On hand</th>
            <th className="py-2 px-3 font-medium text-right whitespace-nowrap">On order</th>
            <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Annual demand</th>
            <th className="py-2 px-3 font-medium text-right whitespace-nowrap">EOQ</th>
            <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Reorder point</th>
            <th className="py-2 pl-3 font-medium text-right whitespace-nowrap">Status</th>
          </tr>
        </thead>
        <tbody>
          {stockProducts.map((p) => {
            const eoq = eoqByProduct.get(p.id);
            const qty = ledgers.get(p.id)?.qtyOnHand ?? 0;
            const onOrder = onOrderByProduct.get(p.id) ?? 0;
            // Stock already on order counts toward the reorder point, so a
            // pending delivery doesn't get double-flagged as "reorder now".
            const needsReorder = eoq && eoq.reorderPoint > 0 && qty + onOrder <= eoq.reorderPoint;
            return (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="py-2.5 pr-3 font-medium">{p.name}</td>
                <td className="py-2.5 px-3 num text-right">{formatNumber(qty)}</td>
                <td className="py-2.5 px-3 num text-right text-muted">{onOrder > 0 ? formatNumber(onOrder) : "—"}</td>
                <td className="py-2.5 px-3 num text-right text-muted">{formatNumber(eoq?.annualDemand ?? 0)}</td>
                <td className="py-2.5 px-3 num text-right">
                  {eoq && eoq.eoq > 0 ? formatNumber(Math.ceil(eoq.eoq)) : "—"}
                </td>
                <td className="py-2.5 px-3 num text-right text-muted">
                  {eoq && eoq.reorderPoint > 0 ? formatNumber(Math.ceil(eoq.reorderPoint)) : "—"}
                </td>
                <td className="py-2.5 pl-3 text-right">
                  {!eoq || eoq.eoq === 0 ? (
                    <span className="text-xs text-muted">need more data</span>
                  ) : needsReorder ? (
                    <Badge tone="bad">reorder now</Badge>
                  ) : (
                    <Badge tone="good">ok</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      </div>
      <div className="text-[11px] text-muted mt-3">
        &quot;need more data&quot; means ordering cost, holding %, or sales history isn&apos;t set/available yet for that
        product — check Settings defaults or the product&apos;s own EOQ fields.
      </div>
    </CollapsibleSection>
  );
}

function VariableCostsSection() {
  const { products, variableCosts, addVariableCost, updateVariableCost, deleteVariableCost, settings } = useData();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<VariableCost["type"]>("per_unit");
  const [amount, setAmount] = useState("");
  const [productId, setProductId] = useState("");
  const [includeInCogs, setIncludeInCogs] = useState(false);
  const currency = settings.currency;

  function resetForm() {
    setEditingId(null);
    setName("");
    setType("per_unit");
    setAmount("");
    setProductId("");
    setIncludeInCogs(false);
  }

  function openAdd() {
    resetForm();
    setOpen(true);
  }

  function openEdit(v: VariableCost) {
    setEditingId(v.id);
    setName(v.name);
    setType(v.type);
    setAmount(v.amount.toString());
    setProductId(v.productId ?? "");
    setIncludeInCogs(v.includeInCogs ?? false);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const values = { name, type, amount: Number(amount), productId: productId || undefined, includeInCogs };
    try {
      if (editingId) {
        await updateVariableCost(editingId, values);
        toast.success("Variable cost updated");
      } else {
        await addVariableCost(values);
        toast.success("Variable cost added");
      }
      setOpen(false);
      resetForm();
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    }
  }

  return (
    <CollapsibleSection
      title="Variable costs per unit"
      subtitle="Selling fees, fulfillment, contractor/variable labor, variable marketing — applied automatically against Gross Profit for Contribution Margin. Tick “counts toward COGS” for things like outbound shipping instead, which reduce Gross Profit itself. Works for products and services alike."
      storageKey="products-variable-costs"
      defaultOpen={false}
      className="mt-6"
      badge={
        <button
          onClick={(e) => { e.stopPropagation(); open ? (setOpen(false), resetForm()) : openAdd(); }}
          className="text-xs text-amber-soft font-normal"
        >
          {open ? "Close" : "+ Add"}
        </button>
      }
    >
      {open && (
        <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 items-end">
          <Field>
            <Label>Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Payment fee" />
          </Field>
          <Field>
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value as VariableCost["type"])}>
              <option value="per_unit">Flat / unit</option>
              <option value="percent">% of sale price</option>
            </Select>
          </Field>
          <Field>
            <Label>{type === "per_unit" ? `Amount (${currency})` : "Amount (%)"}</Label>
            <Input required type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field>
            <Label>Applies to</Label>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">All offerings</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-muted col-span-2 sm:col-span-1">
            <input
              type="checkbox"
              checked={includeInCogs}
              onChange={(e) => setIncludeInCogs(e.target.checked)}
              className="accent-amber"
            />
            Counts toward COGS (e.g. shipping)
          </label>
          <div className="flex gap-2">
            <Button type="submit">{editingId ? "Save changes" : "Add"}</Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={() => { setOpen(false); resetForm(); }}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}

      {variableCosts.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {variableCosts.map((v) => {
            const product = products.find((p) => p.id === v.productId);
            return (
              <div key={v.id} className="flex items-center justify-between text-sm py-1.5 border-b border-line last:border-0">
                <div>
                  <span className="font-medium">{v.name}</span>{" "}
                  <span className="text-muted text-xs">
                    ({v.type === "per_unit" ? formatMoney(v.amount, currency) : `${v.amount}%`} ·{" "}
                    {product ? product.name : "all offerings"}
                    {v.includeInCogs ? " · counts toward COGS" : ""})
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => openEdit(v)} className="text-xs text-muted hover:text-fg">
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm("Delete this variable cost?")) return;
                      deleteVariableCost(v.id)
                        .then(() => toast.success("Deleted"))
                        .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                    }}
                    className="text-xs text-muted hover:text-bad"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}

// Read-only history of manual stock corrections (damage, theft, counts,
// production use — see StockAdjustmentReason), with delete for the owner.
// StockAdjustmentForm above only ever creates one; there was previously no
// way to see or undo a fat-fingered entry (typo'd qty, wrong reason) short
// of asking support — deleteStockAdjustment already existed in DataContext
// (period-locked, same as everything else here) but had no UI calling it.
// Owner-only in the UI to match deleteStockAdjustment's own
// requirePermission("delete:records") — a Manager would otherwise see a
// working-looking button that fails with a permission error on click.
// Cash sitting on the shelf: items with units on hand that have not sold for 90+ days (never-sold
// items count from the day they were first bought). Same stock-at-cost figure as the Balance Sheet.
// Read-only: it points at the problem; what to do (discount, bundle, stop reordering) stays the owner's call.
function SlowStockSection() {
  const { products, ledgers, sales, purchases, settings } = useData();
  const currency = settings.currency;
  const summary = useMemo(
    () => computeSlowStock(products, ledgers, sales, purchases, todayIso()),
    [products, ledgers, sales, purchases]
  );

  if (summary.items.length === 0) return null;
  const days = summary.thresholdDays;

  return (
    <CollapsibleSection
      title="Slow stock"
      subtitle={`Items you still hold that have not sold in ${days}+ days. This is cash sitting on the shelf. A discount or bundle, or simply not reordering, frees it up.`}
      storageKey="products-slow-stock"
      defaultOpen
      className="mt-6"
      badge={<Badge tone="amber">{formatMoney(summary.totalValue, currency)} tied up</Badge>}
    >
      <div className="text-xs text-muted mb-3">
        {summary.sharePct >= 1 ? `${Math.round(summary.sharePct)}% of your stock value (at cost) is in these ${summary.items.length} item${summary.items.length === 1 ? "" : "s"}.` : `${summary.items.length} item${summary.items.length === 1 ? "" : "s"}, a small part of your stock value.`}
      </div>

      <div className="sm:hidden space-y-2.5">
        {summary.items.map((i) => (
          <div key={i.productId} className="rounded-lg border border-line p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm min-w-0 break-words">{i.name}</div>
              <div className="text-sm tabular-nums shrink-0">{formatMoney(i.value, currency)}</div>
            </div>
            <div className="text-xs text-muted mt-1">
              {formatNumber(i.qtyOnHand)} on hand · {i.neverSold ? `never sold, bought ${i.idleDays} days ago` : `last sold ${formatDate(i.lastSoldDate as string)} (${i.idleDays} days ago)`}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden sm:block">
        <Table>
          <thead>
            <tr className="text-left text-xs text-muted border-b border-line">
              <th className="py-2 px-3 font-medium">Item</th>
              <th className="py-2 px-3 font-medium text-right whitespace-nowrap">On hand</th>
              <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Cash tied up</th>
              <th className="py-2 px-3 font-medium whitespace-nowrap">Last sold</th>
              <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Days idle</th>
            </tr>
          </thead>
          <tbody>
            {summary.items.map((i) => (
              <tr key={i.productId} className="border-b border-line/50">
                <td className="py-2 px-3">{i.name}</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatNumber(i.qtyOnHand)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatMoney(i.value, currency)}</td>
                <td className="py-2 px-3 whitespace-nowrap">{i.neverSold ? <Badge tone="bad">never sold</Badge> : formatDate(i.lastSoldDate as string)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{i.idleDays}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </CollapsibleSection>
  );
}

// One line per item that comes in sizes/colours: total stock and worth across all of them, and which ones have run
// out — the thing a reseller otherwise has to hunt for across a long flat list. Only appears once a group exists.
function VariantGroupsSection() {
  const { products, ledgers, settings } = useData();
  const groups = useMemo(() => summarizeVariantGroups(products, (id) => ledgers.get(id)), [products, ledgers]);
  if (groups.length === 0) return null;
  return (
    <CollapsibleSection
      title="Sizes & colours"
      subtitle="Everything that comes in more than one size or colour — total stock, and which ones have run out."
      storageKey="products-variant-groups"
      defaultOpen
      className="mt-6"
    >
      <div className="mt-4 space-y-3">
        {groups.map((g) => (
          <div key={g.group} className="border-b border-line last:border-0 pb-3 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <div className="font-medium text-sm">{g.group}</div>
              <div className="text-xs text-muted num shrink-0">
                {formatNumber(g.totalQty)} in stock · {formatMoney(g.totalValue, settings.currency)}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {g.variants.map((v) => (
                <span
                  key={v.id}
                  className={clsx(
                    "text-[11px] px-2 py-0.5 rounded border num",
                    !v.active ? "border-line text-muted opacity-60" : v.qty <= 0 ? "border-bad text-bad" : "border-line text-muted"
                  )}
                >
                  {v.label}: {formatNumber(v.qty)}
                </span>
              ))}
            </div>
            {g.outOfStock.length > 0 && <div className="text-xs text-bad mt-1.5">Out of: {g.outOfStock.join(", ")}</div>}
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

function RecentAdjustmentsSection() {
  const { role } = useAuth();
  const { products, stockAdjustments, deleteStockAdjustment, locations } = useData();
  const toast = useToast();
  const canDelete = can(role, "delete:records");
  const reasonLabel = (r: string) => STOCK_ADJUSTMENT_REASONS.find((x) => x.value === r)?.label ?? r;

  if (stockAdjustments.length === 0) return null;
  const recent = [...stockAdjustments].sort((a, b) => b.createdAt - a.createdAt).slice(0, 25);

  return (
    <CollapsibleSection
      title="Recent stock adjustments"
      subtitle="Manual corrections — damage, theft, counts, production use. Delete one here if it was logged by mistake (open month only)."
      storageKey="products-recent-adjustments"
      defaultOpen={false}
      className="mt-6"
    >
      <div className="mt-4 space-y-1.5">
        {recent.map((a) => {
          const product = products.find((p) => p.id === a.productId);
          const loc = a.locationId ? locations.find((l) => l.id === a.locationId)?.name : null;
          return (
            <div key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b border-line last:border-0 gap-3">
              <div className="min-w-0">
                <span className="font-medium">{product?.name ?? "—"}</span>{" "}
                <span className={clsx("num text-xs", a.qty >= 0 ? "text-good" : "text-bad")}>
                  {a.qty >= 0 ? "+" : ""}
                  {formatNumber(a.qty)}
                </span>{" "}
                <span className="text-muted text-xs">
                  ({reasonLabel(a.reason)} · {a.date}
                  {loc ? ` · ${loc}` : ""}
                  {a.notes ? ` · ${a.notes}` : ""})
                </span>
              </div>
              {canDelete && (
                <button
                  onClick={() => {
                    if (!confirm("Delete this stock adjustment? This reverses its effect on stock on hand.")) return;
                    deleteStockAdjustment(a.id)
                      .then(() => toast.success("Adjustment deleted"))
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
    </CollapsibleSection>
  );
}
