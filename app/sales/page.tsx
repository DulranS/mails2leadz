"use client";

import { addressForCustomer, tinForCustomer } from "@/lib/invoiceNumber";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import type { ReceivableLine } from "@/lib/calculations";
import type { Sale, Settings } from "@/lib/types";
import { RETURN_REASONS, DISCOUNT_REASONS } from "@/lib/types";
import { QuickSaleForm } from "@/components/QuickForms";
import { repeatSaleInitial } from "@/lib/repeatSale";
import SalesByChannelCard from "@/components/SalesByChannelCard";
import TillDayCheck from "@/components/TillDayCheck";
import PosDaysCard from "@/components/PosDaysCard";
import TipsCard from "@/components/TipsCard";
import PromoUsageCard from "@/components/PromoUsageCard";
import { RecordPaymentForm } from "@/components/RecordPaymentForm";
import { RecordReturnForm } from "@/components/RecordReturnForm";
import { RecordDiscountForm } from "@/components/RecordDiscountForm";
import { Badge, Button, Card, CollapsibleSection, Modal, PageHeader, Table, TableCardSkeleton, EmptyState, ShowMoreBar, usePagedList } from "@/components/ui";
import { serialDetail, serialMatches, warrantyEndDate, warrantyState } from "@/lib/warranty";
import { escapeHtml, openPrintWindow, printBaseStyles, buildLetterheadHtml, buildSaleInvoiceHtml, type InvoicePaymentRow } from "@/lib/print";

export default function SalesPage() {
  const { role } = useAuth();
  if (role === "staff") return <StaffSalesView />;
  return <FullSalesView />;
}

// Owner/Manager: the complete record, with edit/delete and full economics.
function FullSalesView() {
  const { products, customers, sales, saleEconomics, deleteSale, settings, loading, receivablesAging, receivablePayments, saleReturns, discounts, customerConcentration } = useData();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [repeatFrom, setRepeatFrom] = useState<Sale | null>(null);
  const [payingFor, setPayingFor] = useState<ReceivableLine | null>(null);
  const [returnTarget, setReturnTarget] = useState<Sale | null>(null);
  const [discountTarget, setDiscountTarget] = useState<Sale | null>(null);
  const currency = settings.currency;

  const econById = useMemo(() => new Map(saleEconomics.map((e) => [e.saleId, e])), [saleEconomics]);
  const receivableBySaleId = useMemo(() => new Map(receivablesAging.lines.map((l) => [l.saleId, l])), [receivablesAging]);
  const paymentsBySaleId = useMemo(() => {
    const map = new Map<string, InvoicePaymentRow[]>();
    for (const p of receivablePayments) {
      const rows = map.get(p.saleId) ?? [];
      rows.push({ date: p.date, method: p.method, amount: p.amount });
      map.set(p.saleId, rows);
    }
    return map;
  }, [receivablePayments]);
  const returnedQtyBySaleId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of saleReturns) map.set(r.saleId, (map.get(r.saleId) ?? 0) + r.qty);
    return map;
  }, [saleReturns]);
  const discountedBySaleId = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of discounts) map.set(d.saleId, (map.get(d.saleId) ?? 0) + d.amount);
    return map;
  }, [discounts]);

  // One shared row-view computed per sale, consumed by both the desktop
  // table and the mobile card list below — so the two layouts can never
  // drift out of sync with each other.
  // Only the newest page of sales is turned into row views (and drawn); totals and KPIs elsewhere
  // still use every sale. Product lookup is a Map so a 100k-sale account isn't O(sales x products).
  const salesPage = usePagedList(sales);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const rows = useMemo(
    () =>
      salesPage.visible.map((s) => {
        const product = productById.get(s.productId);
        const econ = econById.get(s.id);
        const receivable = receivableBySaleId.get(s.id);
        const isCredit = (s.paymentMethod ?? "cash") === "credit";
        const returnedQty = returnedQtyBySaleId.get(s.id) ?? 0;
        const discountedAmount = discountedBySaleId.get(s.id) ?? 0;
        return { sale: s, product, econ, receivable, isCredit, returnedQty, discountedAmount };
      }),
    [salesPage.visible, productById, econById, receivableBySaleId, returnedQtyBySaleId, discountedBySaleId]
  );

  function openNew() {
    setEditing(null);
    setRepeatFrom(null);
    setModalOpen(true);
  }
  function openEdit(s: Sale) {
    setRepeatFrom(null);
    setEditing(s);
    setModalOpen(true);
  }
  // Sell again: a new sale prefilled from this one (what, how many, price, customer, how they pay). Today's date.
  function openRepeat(s: Sale) {
    setEditing(null);
    setRepeatFrom(s);
    setModalOpen(true);
  }

  function handleDelete(saleId: string) {
    if (!confirm("Delete this sale? This can't be undone — it'll put the stock back.")) return;
    deleteSale(saleId)
      .then(() => toast.success("Sale deleted"))
      .catch(() => toast.error("Couldn't delete the sale"));
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Things You Sold" action={<Button disabled>+ I sold something</Button>} />
        <TableCardSkeleton rows={7} cols={5} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Things You Sold"
        action={
          <Button onClick={openNew} disabled={products.length === 0}>
            + I sold something
          </Button>
        }
      />

      {products.length === 0 && (
        <EmptyState title="Add something to sell first" body="Add a product or service before you record a sale." />
      )}

      {products.length > 0 && sales.length === 0 && (
        <EmptyState title="Nothing sold yet" body="Record a sale and we'll work out your profit for you, automatically." />
      )}

      <TillDayCheck />
      <PosDaysCard />
      {sales.length > 0 && <SalesByChannelCard />}
      {sales.length > 0 && <TipsCard sales={sales} currency={currency} />}
      {sales.length > 0 && <PromoUsageCard sales={sales} economics={saleEconomics} spend={settings.campaignSpend} currency={currency} />}

      {customerConcentration.customers.length > 0 && (
        <Card className="mb-5">
          <div className="text-sm font-medium mb-0.5">Customer concentration</div>
          <div className="text-xs text-muted mb-3">
            Share of your revenue (last {customerConcentration.trailingMonths} months) riding on one customer. High
            concentration isn&apos;t automatically bad — just worth knowing on purpose, since losing that one
            customer would hit cash flow the same way losing your only supplier would.
          </div>
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted font-medium">Top customer</div>
              <div className="num text-xl font-medium mt-1 flex items-center gap-2">
                {customerConcentration.topCustomerSharePct?.toFixed(0)}%
                <Badge
                  tone={
                    (customerConcentration.topCustomerSharePct ?? 0) >= 60
                      ? "bad"
                      : (customerConcentration.topCustomerSharePct ?? 0) >= 35
                      ? "amber"
                      : "good"
                  }
                >
                  {customerConcentration.customers[0].customer}
                </Badge>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted font-medium">Top 3 combined</div>
              <div className="num text-xl font-medium mt-1">{customerConcentration.top3SharePct?.toFixed(0)}%</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {customerConcentration.customers.slice(0, 5).map((c) => (
              <div key={c.customer} className="flex items-center justify-between text-xs border-b border-line last:border-0 py-1.5 gap-3">
                <div className="min-w-0 flex-1 truncate">{c.customer}</div>
                <div className="num text-muted shrink-0">{formatMoney(c.revenue, currency)}</div>
                <div className="num font-medium shrink-0 w-14 text-right">{c.sharePct.toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {sales.some((x) => x.serialNo) && <SerialLookup sales={sales} products={products} />}

      {sales.length > 0 && (
        <>
          {/* Mobile: one card per sale, most important number first. Same
              data as the table below — never rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {rows.map(({ sale: s, product, econ, receivable, isCredit, returnedQty, discountedAmount }) => (
              <Card key={s.id} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{product?.name ?? "—"}</div>
                    <div className="text-xs text-muted num mt-0.5">
                      {s.date} · {s.qty} × {formatMoney(s.unitPrice, currency)}
                    </div>
                    <SerialLine sale={s} warrantyMonths={product?.warrantyMonths} />
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num font-medium">{formatMoney(econ?.revenue ?? 0, currency)}</div>
                    <div className={clsx("num text-xs mt-0.5", econ && econ.grossProfit >= 0 ? "text-good" : "text-bad")}>
                      {formatMoney(econ?.grossProfit ?? 0, currency)} profit
                    </div>
                  </div>
                </div>
                {(product?.type === "service" || econ?.oversold || isCredit || returnedQty > 0 || discountedAmount > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {product?.type === "service" && <Badge tone="amber">service</Badge>}
                    {(econ?.oversold && product?.type !== "service") && <Badge tone="bad">oversold</Badge>}
                    {isCredit && (
                      <Badge tone={receivable ? "bad" : "good"}>
                        {receivable ? `owed · due ${s.dueDate}` : "paid off"}
                      </Badge>
                    )}
                    {returnedQty > 0 && <Badge tone="bad">{returnedQty} returned</Badge>}
                    {discountedAmount > 0 && <Badge tone="amber">{formatMoney(discountedAmount, currency)} discounted</Badge>}
                  </div>
                )}
                <div className="text-[11px] text-muted mt-2">Rung up by {s.createdByName ?? "—"}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                  {receivable && (
                    <button onClick={() => setPayingFor(receivable)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                      Record payment
                    </button>
                  )}
                  <button onClick={() => setReturnTarget(s)} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
                    Return
                  </button>
                  <button onClick={() => setDiscountTarget(s)} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
                    Discount
                  </button>
                  <button
                    onClick={() => openPrintWindow(buildSaleReceiptHtml(s, product?.name ?? "Item", settings, product?.warrantyMonths))}
                    className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]"
                  >
                    Print receipt
                  </button>
                  {isCredit && (
                    <button
                      onClick={() =>
                        openPrintWindow(
                          buildSaleInvoiceHtml({
                            saleId: s.id,
                            customerTin: tinForCustomer(customers, s.customer),
                            customerAddress: addressForCustomer(customers, s.customer),
                            supplyDate: s.supplyDate,
                            itemName: product?.name ?? "Item",
                            itemDetail: serialDetail(s, product?.warrantyMonths),
                            amount: econ?.revenue ?? s.qty * s.unitPrice,
                            customer: s.customer,
                            customerContact: s.customerContact,
                            issueDate: s.date,
                            dueDate: s.dueDate,
                            payments: paymentsBySaleId.get(s.id) ?? [],
                            settings,
                          })
                        )
                      }
                      className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]"
                    >
                      Print invoice
                    </button>
                  )}
                  {!s.isDelivery && (
                    <button onClick={() => openRepeat(s)} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
                      Sell again
                    </button>
                  )}
                  <button onClick={() => openEdit(s)} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]">
                    Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: the full table, unchanged. */}
          <Card className="hidden sm:block">
          <Table>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Item</th>
                <th className="py-2 px-3 font-medium text-right">How many</th>
                <th className="py-2 px-3 font-medium text-right">Price each</th>
                <th className="py-2 px-3 font-medium text-right">Money in</th>
                <th className="py-2 px-3 font-medium text-right">Profit</th>
                <th className="py-2 px-3 font-medium">Who rang it up</th>
                <th className="py-2 pl-3 font-medium text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ sale: s, product, econ, receivable, isCredit, returnedQty, discountedAmount }) => {
                return (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 text-muted num">{s.date}</td>
                    <td className="py-2.5 px-3 font-medium">
                      {product?.name ?? "—"}
                      <SerialLine sale={s} warrantyMonths={product?.warrantyMonths} />
                      {product?.type === "service" && (
                        <span className="ml-1.5">
                          <Badge tone="amber">service</Badge>
                        </span>
                      )}
                      {(econ?.oversold && product?.type !== "service") && (
                        <span className="ml-1.5">
                          <Badge tone="bad">oversold</Badge>
                        </span>
                      )}
                      {isCredit && (
                        <span className="ml-1.5">
                          <Badge tone={receivable ? "bad" : "good"}>{receivable ? `owed · due ${s.dueDate}` : "paid off"}</Badge>
                        </span>
                      )}
                      {returnedQty > 0 && (
                        <span className="ml-1.5">
                          <Badge tone="bad">{returnedQty} returned</Badge>
                        </span>
                      )}
                      {discountedAmount > 0 && (
                        <span className="ml-1.5">
                          <Badge tone="amber">{formatMoney(discountedAmount, currency)} off</Badge>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 num text-right">{s.qty}</td>
                    <td className="py-2.5 px-3 num text-right">
                      {formatMoney(s.unitPrice, currency)}
                      {s.currency && s.currency !== currency && s.foreignUnitPrice !== undefined && (
                        <div className="text-[11px] text-muted">{formatMoney(s.foreignUnitPrice, s.currency)}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 num text-right">{formatMoney(econ?.revenue ?? 0, currency)}</td>
                    <td className="py-2.5 px-3 num text-right">
                      <span className={econ && econ.grossProfit >= 0 ? "text-good" : "text-bad"}>
                        {formatMoney(econ?.grossProfit ?? 0, currency)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted text-xs">{s.createdByName ?? "—"}</td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      {receivable && (
                        <button onClick={() => setPayingFor(receivable)} className="text-xs text-amber-soft hover:underline mr-3">
                          Record payment
                        </button>
                      )}
                      <button onClick={() => setReturnTarget(s)} className="text-xs text-muted hover:text-fg mr-3">
                        Return
                      </button>
                      <button onClick={() => setDiscountTarget(s)} className="text-xs text-muted hover:text-fg mr-3">
                        Discount
                      </button>
                      <button
                        onClick={() => openPrintWindow(buildSaleReceiptHtml(s, product?.name ?? "Item", settings, product?.warrantyMonths))}
                        className="text-xs text-muted hover:text-fg mr-3"
                      >
                        Print receipt
                      </button>
                      {isCredit && (
                        <button
                          onClick={() =>
                            openPrintWindow(
                              buildSaleInvoiceHtml({
                                saleId: s.id,
                                customerTin: tinForCustomer(customers, s.customer),
                                customerAddress: addressForCustomer(customers, s.customer),
                                supplyDate: s.supplyDate,
                                itemName: product?.name ?? "Item",
                            itemDetail: serialDetail(s, product?.warrantyMonths),
                                amount: econ?.revenue ?? s.qty * s.unitPrice,
                                customer: s.customer,
                                customerContact: s.customerContact,
                                issueDate: s.date,
                                dueDate: s.dueDate,
                                payments: paymentsBySaleId.get(s.id) ?? [],
                                settings,
                              })
                            )
                          }
                          className="text-xs text-muted hover:text-fg mr-3"
                        >
                          Print invoice
                        </button>
                      )}
                      {!s.isDelivery && (
                        <button onClick={() => openRepeat(s)} className="text-xs text-muted hover:text-fg mr-3">
                          Sell again
                        </button>
                      )}
                      <button onClick={() => openEdit(s)} className="text-xs text-muted hover:text-fg mr-3">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="text-xs text-muted hover:text-bad">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          </Card>
          <ShowMoreBar shown={salesPage.shown} total={salesPage.total} remaining={salesPage.remaining} onShowMore={salesPage.showMore} onShowAll={salesPage.showAll} noun="sales" />
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit this sale" : "I sold something"}>
        <QuickSaleForm
          key={editing?.id ?? repeatFrom?.id ?? "new"}
          existingSale={editing ?? undefined}
          initial={repeatFrom ? repeatSaleInitial(repeatFrom) ?? undefined : undefined}
          onDone={() => setModalOpen(false)}
        />
      </Modal>

      <Modal open={!!payingFor} onClose={() => setPayingFor(null)} title="Record a payment">
        {payingFor && <RecordPaymentForm line={payingFor} onDone={() => setPayingFor(null)} />}
      </Modal>

      <Modal open={!!returnTarget} onClose={() => setReturnTarget(null)} title="Record a return">
        {returnTarget && (
          <RecordReturnForm
            sale={returnTarget}
            productName={products.find((p) => p.id === returnTarget.productId)?.name ?? "Item"}
            alreadyReturnedQty={returnedQtyBySaleId.get(returnTarget.id) ?? 0}
            onDone={() => setReturnTarget(null)}
          />
        )}
      </Modal>

      <Modal open={!!discountTarget} onClose={() => setDiscountTarget(null)} title="Record a discount">
        {discountTarget && (
          <RecordDiscountForm
            sale={discountTarget}
            productName={products.find((p) => p.id === discountTarget.productId)?.name ?? "Item"}
            alreadyDiscounted={discountedBySaleId.get(discountTarget.id) ?? 0}
            onDone={() => setDiscountTarget(null)}
          />
        )}
      </Modal>

      <RecentReturnsAndDiscountsSection />
    </>
  );
}

// Staff: log a sale, see only what they personally rang up, no cost/margin,
// no edit, no delete. Record a payment against their own credit sales.
// This is the whole point of the role — a floor employee's entire footprint
// in the ledger is create-only, which is exactly what makes "log it low,
// pocket the difference" not work: there's nothing to quietly correct
// afterward.
function StaffSalesView() {
  const { catalog, sales, settings, loading, receivablesAging, receivablePayments, customers } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [repeatFrom, setRepeatFrom] = useState<Sale | null>(null);
  function openRepeat(s: Sale) {
    setRepeatFrom(s);
    setModalOpen(true);
  }
  const [payingFor, setPayingFor] = useState<ReceivableLine | null>(null);
  const currency = settings.currency;
  const staffPage = usePagedList(sales);
  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  const receivableBySaleId = useMemo(() => new Map(receivablesAging.lines.map((l) => [l.saleId, l])), [receivablesAging]);
  const paymentsBySaleId = useMemo(() => {
    const map = new Map<string, InvoicePaymentRow[]>();
    for (const p of receivablePayments) {
      const rows = map.get(p.saleId) ?? [];
      rows.push({ date: p.date, method: p.method, amount: p.amount });
      map.set(p.saleId, rows);
    }
    return map;
  }, [receivablePayments]);

  if (loading) {
    return (
      <>
        <PageHeader title="Your Sales Today" action={<Button disabled>+ I sold something</Button>} />
        <TableCardSkeleton rows={6} cols={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Your Sales Today"
        action={
          <Button onClick={() => { setRepeatFrom(null); setModalOpen(true); }} disabled={catalog.length === 0}>
            + I sold something
          </Button>
        }
      />

      {catalog.length === 0 && (
        <EmptyState title="Nothing set up to sell yet" body="Ask your manager to add products before you can log a sale." />
      )}

      {catalog.length > 0 && sales.length === 0 && (
        <EmptyState title="Nothing logged yet" body="Every sale you log shows up here — you can't edit or delete once it's saved." />
      )}

      {sales.length > 0 && (
        <>
          <div className="sm:hidden space-y-2.5">
            {staffPage.visible.map((s) => {
              const item = catalogById.get(s.productId);
              const receivable = receivableBySaleId.get(s.id);
              const isCredit = (s.paymentMethod ?? "cash") === "credit";
              return (
                <Card key={s.id} className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{item?.name ?? "—"}</div>
                      <div className="text-xs text-muted num mt-0.5">{s.date} · {s.qty}</div>
                    </div>
                    <div className="num font-medium shrink-0">{formatMoney(s.qty * s.unitPrice, currency)}</div>
                  </div>
                  {isCredit && (
                    <div className="mt-2">
                      <Badge tone={receivable ? "bad" : "good"}>{receivable ? `owed · due ${s.dueDate}` : "paid off"}</Badge>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                    {receivable && (
                      <button onClick={() => setPayingFor(receivable)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                        Record payment
                      </button>
                    )}
                    {!s.isDelivery && (
                      <button onClick={() => openRepeat(s)} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">
                        Sell again
                      </button>
                    )}
                    <button
                      onClick={() => openPrintWindow(buildSaleReceiptHtml(s, item?.name ?? "Item", settings, item?.warrantyMonths))}
                      className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]"
                    >
                      Print receipt
                    </button>
                    {isCredit && (
                      <button
                        onClick={() =>
                          openPrintWindow(
                            buildSaleInvoiceHtml({
                              saleId: s.id,
                              customerTin: tinForCustomer(customers, s.customer),
                              customerAddress: addressForCustomer(customers, s.customer),
                              supplyDate: s.supplyDate,
                              itemName: item?.name ?? "Item",
                            itemDetail: serialDetail(s, item?.warrantyMonths),
                              amount: s.qty * s.unitPrice,
                              customer: s.customer,
                              customerContact: s.customerContact,
                              issueDate: s.date,
                              dueDate: s.dueDate,
                              payments: paymentsBySaleId.get(s.id) ?? [],
                              settings,
                            })
                          )
                        }
                        className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]"
                      >
                        Print invoice
                      </button>
                    )}
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
                <th className="py-2 px-3 font-medium text-right">Total</th>
                <th className="py-2 pl-3 font-medium">·</th>
              </tr>
            </thead>
            <tbody>
              {staffPage.visible.map((s) => {
                const item = catalogById.get(s.productId);
                const receivable = receivableBySaleId.get(s.id);
                const isCredit = (s.paymentMethod ?? "cash") === "credit";
                return (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 text-muted num">{s.date}</td>
                    <td className="py-2.5 px-3 font-medium">
                      {item?.name ?? "—"}
                      {isCredit && (
                        <span className="ml-1.5">
                          <Badge tone={receivable ? "bad" : "good"}>{receivable ? `owed · due ${s.dueDate}` : "paid off"}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 num text-right">{s.qty}</td>
                    <td className="py-2.5 px-3 num text-right">{formatMoney(s.qty * s.unitPrice, currency)}</td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      {receivable && (
                        <button onClick={() => setPayingFor(receivable)} className="text-xs text-amber-soft hover:underline mr-3">
                          Record payment
                        </button>
                      )}
                      {!s.isDelivery && (
                        <button onClick={() => openRepeat(s)} className="text-xs text-muted hover:text-fg mr-3">
                          Sell again
                        </button>
                      )}
                      <button
                        onClick={() => openPrintWindow(buildSaleReceiptHtml(s, item?.name ?? "Item", settings, item?.warrantyMonths))}
                        className="text-xs text-muted hover:text-fg"
                      >
                        Print receipt
                      </button>
                      {isCredit && (
                        <button
                          onClick={() =>
                            openPrintWindow(
                              buildSaleInvoiceHtml({
                                saleId: s.id,
                                customerTin: tinForCustomer(customers, s.customer),
                                customerAddress: addressForCustomer(customers, s.customer),
                                supplyDate: s.supplyDate,
                                itemName: item?.name ?? "Item",
                            itemDetail: serialDetail(s, item?.warrantyMonths),
                                amount: s.qty * s.unitPrice,
                                customer: s.customer,
                                customerContact: s.customerContact,
                                issueDate: s.date,
                                dueDate: s.dueDate,
                                payments: paymentsBySaleId.get(s.id) ?? [],
                                settings,
                              })
                            )
                          }
                          className="text-xs text-muted hover:text-fg ml-3"
                        >
                          Print invoice
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          </Card>
          <ShowMoreBar shown={staffPage.shown} total={staffPage.total} remaining={staffPage.remaining} onShowMore={staffPage.showMore} onShowAll={staffPage.showAll} noun="sales" />
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="I sold something">
        <QuickSaleForm
          key={repeatFrom?.id ?? "new"}
          initial={repeatFrom ? repeatSaleInitial(repeatFrom) ?? undefined : undefined}
          onDone={() => setModalOpen(false)}
        />
      </Modal>

      <Modal open={!!payingFor} onClose={() => setPayingFor(null)} title="Record a payment">
        {payingFor && <RecordPaymentForm line={payingFor} onDone={() => setPayingFor(null)} />}
      </Modal>
    </>
  );
}

// Serial number and warranty under a sale's item name. Nothing when the sale has no serial.
function SerialLine({ sale, warrantyMonths }: { sale: Sale; warrantyMonths?: number }) {
  if (!sale.serialNo) return null;
  const w = warrantyState(sale.date, warrantyMonths, todayIso());
  return (
    <div className="text-[11px] text-muted font-normal mt-0.5">
      Serial {sale.serialNo}
      {w && (
        <span className={w.active ? "text-good" : "text-bad"}>
          {" "}· warranty {w.active ? "until" : "ended"} {w.endsOn}
        </span>
      )}
    </div>
  );
}

// "Find by serial / IMEI": a customer comes back with a unit; type (part of) its serial and see the sale, who bought it
// and whether it is still under warranty. Looks at every sale, not just the page of sales drawn below.
function SerialLookup({ sales, products }: { sales: Sale[]; products: { id: string; name: string; warrantyMonths?: number }[] }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => (q.trim().length >= 3 ? sales.filter((x) => serialMatches(x.serialNo, q)).slice(0, 10) : []), [q, sales]);
  const { settings } = useData();
  return (
    <Card className="mb-4">
      <div className="text-sm font-medium mb-1">Find by serial number / IMEI</div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Type at least 3 characters"
        className="w-full rounded-md border border-line bg-panel2 px-3 py-2 text-sm"
      />
      {q.trim().length >= 3 && hits.length === 0 && <div className="text-xs text-muted mt-2">No sale has that serial number.</div>}
      {hits.map((h) => {
        const p = products.find((x) => x.id === h.productId);
        const w = warrantyState(h.date, p?.warrantyMonths, todayIso());
        return (
          <div key={h.id} className="text-xs border-t border-line mt-2 pt-2">
            <div className="font-medium">{p?.name ?? "Item"} · serial {h.serialNo}</div>
            <div className="text-muted num">
              Sold {h.date}{h.customer ? ` to ${h.customer}` : ""}{h.customerContact ? ` (${h.customerContact})` : ""} · {h.qty} × {formatMoney(h.unitPrice, settings.currency)}
            </div>
            {w ? (
              <div className={w.active ? "text-good" : "text-bad"}>
                {w.active ? `Under warranty until ${w.endsOn} (${w.daysLeft} day${w.daysLeft === 1 ? "" : "s"} left)` : `Warranty ended ${w.endsOn}`}
              </div>
            ) : (
              <div className="text-muted">No warranty length set on this item.</div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// A printable receipt for a single sale — the retail/walk-in counterpart to
// the project quote/invoice in app/projects/page.tsx, sharing the same
// print machinery from lib/print.ts (letterhead, base styles, print
// trigger). Every SME sells *something* to a walk-in or one-off customer at
// some point, project-based or not, and until now there was no way to hand
// them anything on paper — every sale record just sat in the app. This
// covers a single sale line; a combined multi-item receipt for one register
// transaction isn't modeled here since Sale itself is one line per record.
// ---------------------------------------------------------------------------
function buildSaleReceiptHtml(sale: Sale, productName: string, settings: Settings, warrantyMonths?: number | null): string {
  const currency = settings.currency;
  const isCredit = (sale.paymentMethod ?? "cash") === "credit";
  const subtotal = sale.qty * sale.unitPrice;
  const taxAmount = sale.taxAmount ?? 0;
  const total = subtotal + taxAmount;
  const taxLabel = settings.salesTaxLabel?.trim() || "Tax";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt — ${escapeHtml(productName)}</title>${printBaseStyles()}</head>
    <body>
      ${buildLetterheadHtml(settings, "Receipt")}
      <div class="meta">
        <div>${sale.customer ? `<strong>Customer:</strong> ${escapeHtml(sale.customer)}` : ""}</div>
        <div><strong>Date:</strong> ${sale.date}</div>
      </div>
      <table>
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
        <tbody>
          <tr>
            <td>${escapeHtml(productName)}${sale.serialNo ? `<div style="font-size:11px;color:#555">Serial: ${escapeHtml(sale.serialNo)}</div>` : ""}</td>
            <td class="num">${sale.qty}</td>
            <td class="num">${formatMoney(sale.unitPrice, currency)}</td>
            <td class="num">${formatMoney(subtotal, currency)}</td>
          </tr>
        </tbody>
        <tfoot>
          ${
            taxAmount > 0.005
              ? `<tr><td colspan="3">Subtotal</td><td class="num">${formatMoney(subtotal, currency)}</td></tr>
                 <tr><td colspan="3">${escapeHtml(taxLabel)}</td><td class="num">${formatMoney(taxAmount, currency)}</td></tr>`
              : ""
          }
          <tr class="total-row"><td colspan="3">Total</td><td class="num">${formatMoney(total, currency)}</td></tr>
        </tfoot>
      </table>
      ${
        isCredit
          ? `<div class="footer">Sold on credit${sale.dueDate ? ` — payment due ${sale.dueDate}` : ""}.</div>`
          : `<div class="footer">Paid${sale.paymentMethod ? ` by ${sale.paymentMethod.replace("_", " ")}` : ""} on ${sale.date}.</div>`
      }
      ${(() => { const w = warrantyEndDate(sale.date, warrantyMonths); return w ? `<div class="footer">Warranty: ${warrantyMonths} months, until ${w}.</div>` : ""; })()}
      <div class="footer">Printed ${todayIso()}.</div>
    </body></html>`;
}

// Read-only history of returns and discounts logged against sales, with
// delete for the owner. RecordReturnForm/RecordDiscountForm above only
// ever create one; there was previously no way to undo a fat-fingered
// entry (wrong qty returned, wrong discount amount) — deleteSaleReturn and
// deleteDiscount already existed in DataContext (period-locked like
// everything else here) but had no UI calling either. Owner-only in the UI
// to match their own requirePermission("delete:records") — a Manager would
// otherwise see a working-looking button that fails with a permission
// error on click.
function RecentReturnsAndDiscountsSection() {
  const { role } = useAuth();
  const { products, sales, saleReturns, discounts, deleteSaleReturn, deleteDiscount, settings } = useData();
  const toast = useToast();
  const canDelete = can(role, "delete:records");
  const currency = settings.currency;

  if (saleReturns.length === 0 && discounts.length === 0) return null;

  const productNameFor = (saleId: string) => {
    const sale = sales.find((s) => s.id === saleId);
    return sale ? products.find((p) => p.id === sale.productId)?.name ?? "Item" : "Item (sale removed)";
  };
  const returnReasonLabel = (r: string) => RETURN_REASONS.find((x) => x.value === r)?.label ?? r;
  const discountReasonLabel = (r: string) => DISCOUNT_REASONS.find((x) => x.value === r)?.label ?? r;
  const recentReturns = [...saleReturns].sort((a, b) => b.createdAt - a.createdAt).slice(0, 25);
  const recentDiscounts = [...discounts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 25);

  return (
    <CollapsibleSection
      title="Recent returns & discounts"
      subtitle="Delete one here if it was logged by mistake (open month only). Stock and revenue recalculate automatically once it's gone — no separate stock re-adjustment needed."
      storageKey="sales-recent-returns-discounts"
      defaultOpen={false}
      className="mt-6"
    >
      {recentReturns.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-muted mb-1.5">Returns</div>
          <div className="space-y-1.5">
            {recentReturns.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-line last:border-0 gap-3">
                <div className="min-w-0">
                  <span className="font-medium">{productNameFor(r.saleId)}</span>{" "}
                  <span className="text-muted text-xs">
                    ({r.qty} unit{r.qty === 1 ? "" : "s"} · {formatMoney(r.refundAmount, currency)} refunded ·{" "}
                    {r.restock ? "restocked" : "written off"} · {returnReasonLabel(r.reason)} · {r.date})
                  </span>
                </div>
                {canDelete && (
                  <button
                    onClick={() => {
                      if (!confirm("Delete this return? Stock and revenue recalculate automatically.")) return;
                      deleteSaleReturn(r.id)
                        .then(() => toast.success("Return deleted"))
                        .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                    }}
                    className="text-xs text-muted hover:text-bad shrink-0"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {recentDiscounts.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-muted mb-1.5">Discounts</div>
          <div className="space-y-1.5">
            {recentDiscounts.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm py-1.5 border-b border-line last:border-0 gap-3">
                <div className="min-w-0">
                  <span className="font-medium">{productNameFor(d.saleId)}</span>{" "}
                  <span className="text-muted text-xs">
                    ({formatMoney(d.amount, currency)} off · {discountReasonLabel(d.reason)})
                  </span>
                </div>
                {canDelete && (
                  <button
                    onClick={() => {
                      if (!confirm("Delete this discount?")) return;
                      deleteDiscount(d.id)
                        .then(() => toast.success("Discount deleted"))
                        .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                    }}
                    className="text-xs text-muted hover:text-bad shrink-0"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
