"use client";

import { addressForCustomer, tinForCustomer } from "@/lib/invoiceNumber";
import { useMemo, useState } from "react";
import { displayInvoiceRef } from "@/lib/invoiceNumber";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import type { ReceivableLine } from "@/lib/calculations";
import { groupSalesByInvoice } from "@/lib/calculations";
import type { Sale, Settings, Recurrence } from "@/lib/types";
import { RecordPaymentForm } from "@/components/RecordPaymentForm";
import { RecordBatchDiscountForm } from "@/components/RecordBatchDiscountForm";
import { QuickSaleForm, MultiItemInvoiceForm, RecurringInvoiceForm } from "@/components/QuickForms";
import { Badge, Button, Card, Modal, PageHeader, Table, TableCardSkeleton, EmptyState, Select, ShowMoreBar, usePagedList } from "@/components/ui";
import { openPrintWindow, buildSaleInvoiceHtml, buildMultiItemInvoiceHtml, type InvoicePaymentRow } from "@/lib/print";
import { buildPickListHtml, pickLinesFor } from "@/lib/pickList";
import { ShareButton } from "@/components/ShareButton";
import InvoiceLinkButton from "@/components/InvoiceLinkButton";

// Shared by both invoice views: prints a single-item invoice for a lone
// sale, or a proper multi-line invoice once ≥2 sales share an invoiceId.
function printInvoiceGroup(params: {
  sales: Sale[];
  products: { id: string; name: string }[];
  payments: InvoicePaymentRow[];
  settings: Settings;
  customers: { name: string; tin?: string }[];
  totalAmount: number; // TAX INCLUDED
  taxAmount: number;
}) {
  const { sales, products, payments, settings, customers, totalAmount, taxAmount } = params;
  const primary = sales[0];
  if (sales.length === 1) {
    const product = products.find((p) => p.id === primary.productId);
    openPrintWindow(
      buildSaleInvoiceHtml({
        saleId: primary.id,
        itemName: product?.name ?? "Item",
        amount: totalAmount,
        taxAmount,
        customer: primary.customer,
        customerContact: primary.customerContact,
        customerTin: tinForCustomer(customers, primary.customer),
        customerAddress: addressForCustomer(customers, primary.customer),
        supplyDate: primary.supplyDate,
        issueDate: primary.date,
        dueDate: primary.dueDate,
        payments,
        settings,
      })
    );
    return;
  }
  openPrintWindow(
    buildMultiItemInvoiceHtml({
      invoiceRef: displayInvoiceRef(primary.invoiceNo, primary.invoiceId ?? primary.id),
      items: sales.map((s) => {
        const product = products.find((p) => p.id === s.productId);
        return { name: product?.name ?? "Item", qty: s.qty, unitPrice: s.unitPrice, amount: s.qty * s.unitPrice };
      }),
      taxAmount,
      customer: primary.customer,
      customerContact: primary.customerContact,
      customerTin: tinForCustomer(customers, primary.customer),
      customerAddress: addressForCustomer(customers, primary.customer),
      supplyDate: primary.supplyDate,
      issueDate: primary.date,
      dueDate: primary.dueDate,
      payments,
      settings,
    })
  );
}

export default function InvoicesPage() {
  const { role } = useAuth();
  if (role === "staff") return <StaffInvoicesView />;
  return <FullInvoicesView />;
}

// Owner/Manager: full invoice management
function FullInvoicesView() {
  const {
    products,
    sales,
    saleEconomics,
    settings,
    loading,
    receivablesAging,
    receivablePayments,
    recurringInvoices,
    discounts,
    updateRecurringInvoice,
    deleteRecurringInvoice,
    generateRecurringInvoiceNow,
    customers,
  } = useData();
  const toast = useToast();
  const [payingFor, setPayingFor] = useState<ReceivableLine | null>(null);
  const [discountGroup, setDiscountGroup] = useState<{ invoiceId: string; sales: Sale[] } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "outstanding" | "paid">("all");
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [newMultiInvoiceOpen, setNewMultiInvoiceOpen] = useState(false);
  const [newRecurringOpen, setNewRecurringOpen] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const currency = settings.currency;

  const discountedBySaleId = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of discounts) map.set(d.saleId, (map.get(d.saleId) ?? 0) + d.amount);
    return map;
  }, [discounts]);

  // Builds the per-line breakdown RecordBatchDiscountForm needs from an
  // invoice group's underlying Sales — grossRevenue minus whatever's
  // already been discounted off each line.
  function batchLinesFor(groupSales: Sale[]) {
    return groupSales.map((s) => ({
      sale: s,
      productName: products.find((p) => p.id === s.productId)?.name ?? "Item",
      remaining: Math.max(s.qty * s.unitPrice - (discountedBySaleId.get(s.id) ?? 0), 0),
    }));
  }

  const handlePaymentSuccess = () => {
    setPayingFor(null);
    toast.success("Payment recorded");
  };

  async function handleTogglePause(id: string, active: boolean) {
    try {
      await updateRecurringInvoice(id, { active: !active });
      toast.success(active ? "Schedule paused" : "Schedule resumed");
    } catch (err) {
      toast.error("Couldn't update that schedule", toastableErrorMessage(err));
    }
  }

  async function handleDeleteRecurring(id: string, customer: string) {
    if (!window.confirm(`Delete the recurring invoice schedule for ${customer}? Invoices it already created stay on the books — this only stops future ones.`)) return;
    try {
      await deleteRecurringInvoice(id);
      toast.success("Schedule deleted");
    } catch (err) {
      toast.error("Couldn't delete that schedule", toastableErrorMessage(err));
    }
  }

  async function handleGenerateNow(id: string) {
    setGeneratingId(id);
    try {
      const invoiceId = await generateRecurringInvoiceNow(id);
      toast.success(invoiceId ? "Invoice generated" : "Already generated today", invoiceId ? undefined : "This schedule already created today's invoice.");
    } catch (err) {
      toast.error("Couldn't generate that invoice", toastableErrorMessage(err));
    } finally {
      setGeneratingId(null);
    }
  }

  const econById = useMemo(() => new Map(saleEconomics.map((e) => [e.saleId, e])), [saleEconomics]);
  // Keyed by every underlying sale id in a group, not just the primary —
  // so a lookup by any line of a multi-item invoice finds the same
  // (grouped) ReceivableLine.
  const receivableBySaleId = useMemo(() => {
    const map = new Map<string, ReceivableLine>();
    for (const l of receivablesAging.lines) for (const id of l.saleIds) map.set(id, l);
    return map;
  }, [receivablesAging]);
  const paymentsBySaleId = useMemo(() => {
    const map = new Map<string, InvoicePaymentRow[]>();
    for (const p of receivablePayments) {
      const rows = map.get(p.saleId) ?? [];
      rows.push({ date: p.date, method: p.method, amount: p.amount });
      map.set(p.saleId, rows);
    }
    return map;
  }, [receivablePayments]);

  // Filter for credit sales only (invoices), then collapse any sharing an
  // invoiceId into one invoice group so a multi-item invoice is one row.
  const creditSales = useMemo(() => sales.filter((s) => (s.paymentMethod ?? "cash") === "credit"), [sales]);
  const invoiceGroups = useMemo(() => groupSalesByInvoice(creditSales), [creditSales]);

  // Apply status filter
  const filteredGroups = useMemo(() => {
    if (statusFilter === "all") return invoiceGroups;
    return invoiceGroups.filter((g) => {
      const receivable = receivableBySaleId.get(g.primary.id);
      if (statusFilter === "outstanding") return !!receivable;
      if (statusFilter === "paid") return !receivable;
      return true;
    });
  }, [invoiceGroups, receivableBySaleId, statusFilter]);

  // Draw (and price up) only the newest page of invoices; the counts in the filter above still
  // cover every invoice. Resets to the first page when the status filter changes.
  const invoicePage = usePagedList(filteredGroups, statusFilter);
  const rows = useMemo(
    () =>
      invoicePage.visible.map((g) => {
        const receivable = receivableBySaleId.get(g.primary.id);
        const payments = g.sales.flatMap((s) => paymentsBySaleId.get(s.id) ?? []);
        const taxAmount = g.sales.reduce((sum, s) => sum + (s.taxAmount ?? 0), 0);
        const totalAmount = g.sales.reduce((sum, s) => sum + (econById.get(s.id)?.revenue ?? s.qty * s.unitPrice), 0) + taxAmount;
        const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const balanceDue = Math.max(totalAmount - amountPaid, 0);
        return { group: g, receivable, payments, totalAmount, taxAmount, balanceDue };
      }),
    [invoicePage.visible, econById, receivableBySaleId, paymentsBySaleId]
  );

  const outstandingCount = invoiceGroups.filter((g) => !!receivableBySaleId.get(g.primary.id)).length;
  const paidCount = invoiceGroups.filter((g) => !receivableBySaleId.get(g.primary.id)).length;

  if (loading) {
    return (
      <>
        <PageHeader title="Invoices" />
        <TableCardSkeleton rows={7} cols={6} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        action={
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "outstanding" | "paid")}
              className="w-32"
            >
              <option value="all">All ({invoiceGroups.length})</option>
              <option value="outstanding">Outstanding ({outstandingCount})</option>
              <option value="paid">Paid ({paidCount})</option>
            </Select>
            <Button variant="ghost" onClick={() => setNewRecurringOpen(true)} disabled={products.length === 0}>
              + Recurring invoice
            </Button>
            <Button variant="ghost" onClick={() => setNewMultiInvoiceOpen(true)} disabled={products.length === 0}>
              + Multi-item invoice
            </Button>
            <Button onClick={() => setNewInvoiceOpen(true)} disabled={products.length === 0}>
              + New invoice
            </Button>
          </div>
        }
      />

      {products.length === 0 && (
        <EmptyState title="Add something to sell first" body="Add a product or service before you can create an invoice." />
      )}

      {products.length > 0 && invoiceGroups.length === 0 && (
        <EmptyState
          title="No invoices yet"
          body="Create your first invoice to bill a customer on credit."
          action={<Button onClick={() => setNewInvoiceOpen(true)}>+ New invoice</Button>}
        />
      )}

      {filteredGroups.length === 0 && invoiceGroups.length > 0 && (
        <EmptyState
          title={`No ${statusFilter} invoices`}
          body="Try changing the filter to see other invoices."
        />
      )}

      {filteredGroups.length > 0 && (
        <>
          {/* Mobile: one card per invoice. Same data as the table below,
              never rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {rows.map(({ group, receivable, payments, totalAmount, taxAmount, balanceDue }) => {
              const primary = group.primary;
              const invoiceRef = displayInvoiceRef(primary.invoiceNo, group.invoiceId ?? primary.id);
              const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
              const isOverdue = balanceDue > 0.005 && !!primary.dueDate && primary.dueDate < todayIso();
              const status = balanceDue <= 0.005 ? "paid" : isOverdue ? "overdue" : "outstanding";
              return (
                <Card key={group.invoiceId ?? primary.id} className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{primary.customer ?? "—"}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {invoiceRef} · <span className="num">{primary.date}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="num font-medium">{formatMoney(balanceDue, currency)}</div>
                      <div className="mt-1">
                        <Badge tone={status === "paid" ? "good" : status === "overdue" ? "bad" : "amber"}>{status}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                    <div>
                      <span className="text-muted">Items </span>
                      <span>
                        {group.sales.length > 1 ? `${group.sales.length} items` : (products.find((p) => p.id === primary.productId)?.name ?? "—")}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Amount </span>
                      <span className="num">{formatMoney(totalAmount, currency)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Paid </span>
                      <span className="num">{formatMoney(amountPaid, currency)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                    {receivable && (
                      <button
                        onClick={() => setPayingFor(receivable)}
                        className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
                      >
                        Record payment
                      </button>
                    )}
                    <button
                      onClick={() => setDiscountGroup({ invoiceId: group.invoiceId ?? primary.id, sales: group.sales })}
                      className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]"
                    >
                      Discount
                    </button>
                    <button
                      onClick={() => {
                        const lines = pickLinesFor(group.sales.map((x) => ({ productId: x.productId, qty: x.qty })), (id) => products.find((pr) => pr.id === id)?.name ?? "Item");
                        const ref = displayInvoiceRef(group.sales[0].invoiceNo, group.sales[0].invoiceId ?? group.sales[0].id);
                        openPrintWindow(buildPickListHtml({ businessName: settings.businessName ?? "", invoiceRef: ref, customer: group.sales[0].customer ?? "", date: group.sales[0].date, lines }));
                      }}
                      className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]"
                    >
                      Pick list
                    </button>
                    <button
                      onClick={() =>
                        printInvoiceGroup({ customers,
                          sales: group.sales,
                          products,
                          payments,
                          settings,
                          totalAmount,
                          taxAmount,
                        })
                      }
                      className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]"
                    >
                      Print
                    </button>
                    <InvoiceLinkButton invoiceKey={group.invoiceId ?? primary.id} />
                    <ShareButton
                      title={invoiceRef}
                      business={settings.businessName}
                      customer={primary.customer}
                      contact={primary.customerContact}
                      amountLine={`Total: ${formatMoney(totalAmount, currency)}${balanceDue > 0.005 ? ` (balance due: ${formatMoney(balanceDue, currency)})` : " (paid in full)"}`}
                      extraLines={primary.dueDate ? [`Due: ${primary.dueDate}`] : undefined}
                      className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]"
                    />
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
                <th className="py-2 pr-3 font-medium">Invoice #</th>
                <th className="py-2 px-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Customer</th>
                <th className="py-2 px-3 font-medium">Items</th>
                <th className="py-2 px-3 font-medium text-right">Amount</th>
                <th className="py-2 px-3 font-medium text-right">Paid</th>
                <th className="py-2 px-3 font-medium text-right">Balance</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 pl-3 font-medium text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ group, receivable, payments, totalAmount, taxAmount, balanceDue }) => {
                const primary = group.primary;
                const invoiceRef = displayInvoiceRef(primary.invoiceNo, group.invoiceId ?? primary.id);
                const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
                const isOverdue = balanceDue > 0.005 && !!primary.dueDate && primary.dueDate < todayIso();
                const status = balanceDue <= 0.005 ? "paid" : isOverdue ? "overdue" : "outstanding";

                return (
                  <tr key={group.invoiceId ?? primary.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-xs">{invoiceRef}</td>
                    <td className="py-2.5 px-3 text-muted num">{primary.date}</td>
                    <td className="py-2.5 px-3 font-medium">{primary.customer ?? "—"}</td>
                    <td className="py-2.5 px-3 text-muted">
                      {group.sales.length > 1 ? `${group.sales.length} items` : (products.find((p) => p.id === primary.productId)?.name ?? "—")}
                    </td>
                    <td className="py-2.5 px-3 num text-right">{formatMoney(totalAmount, currency)}</td>
                    <td className="py-2.5 px-3 num text-right">{formatMoney(amountPaid, currency)}</td>
                    <td className="py-2.5 px-3 num text-right font-medium">{formatMoney(balanceDue, currency)}</td>
                    <td className="py-2.5 px-3">
                      <Badge
                        tone={status === "paid" ? "good" : status === "overdue" ? "bad" : "amber"}
                      >
                        {status}
                      </Badge>
                    </td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      {receivable && (
                        <button
                          onClick={() => setPayingFor(receivable)}
                          className="text-xs text-amber-soft hover:underline mr-3"
                        >
                          Record payment
                        </button>
                      )}
                      <button
                        onClick={() => setDiscountGroup({ invoiceId: group.invoiceId ?? primary.id, sales: group.sales })}
                        className="text-xs text-muted hover:text-fg mr-3"
                      >
                        Discount
                      </button>
                      <button
                        onClick={() =>
                          printInvoiceGroup({ customers,
                            sales: group.sales,
                            products,
                            payments,
                            settings,
                            totalAmount,
                            taxAmount,
                          })
                        }
                        className="text-xs text-muted hover:text-fg"
                      >
                        Print
                      </button>
                      <InvoiceLinkButton invoiceKey={group.invoiceId ?? primary.id} />
                      <ShareButton
                        title={invoiceRef}
                        business={settings.businessName}
                        customer={primary.customer}
                        contact={primary.customerContact}
                        amountLine={`Total: ${formatMoney(totalAmount, currency)}${balanceDue > 0.005 ? ` (balance due: ${formatMoney(balanceDue, currency)})` : " (paid in full)"}`}
                        extraLines={primary.dueDate ? [`Due: ${primary.dueDate}`] : undefined}
                        className="text-xs text-muted hover:text-fg ml-3"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          </Card>
          <ShowMoreBar shown={invoicePage.shown} total={invoicePage.total} remaining={invoicePage.remaining} onShowMore={invoicePage.showMore} onShowAll={invoicePage.showAll} noun="invoices" />
        </>
      )}

      {payingFor && (
        <RecordPaymentForm
          line={payingFor}
          onDone={handlePaymentSuccess}
        />
      )}

      <Modal
        open={!!discountGroup}
        onClose={() => setDiscountGroup(null)}
        title={discountGroup && discountGroup.sales.length > 1 ? "Batch discount this invoice" : "Record a discount"}
      >
        {discountGroup && (
          <RecordBatchDiscountForm
            lines={batchLinesFor(discountGroup.sales)}
            onDone={() => setDiscountGroup(null)}
          />
        )}
      </Modal>

      <div className="mt-8 mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Recurring invoices</h2>
          <p className="text-xs text-muted mt-0.5">Retainer or repeat-billing clients — an invoice is created for you automatically each cycle.</p>
        </div>
      </div>

      {recurringInvoices.length === 0 && (
        <EmptyState
          title="No recurring invoices set up"
          body="Bill a retainer client automatically every week, month, or year instead of re-entering the same invoice by hand."
          action={<Button onClick={() => setNewRecurringOpen(true)} disabled={products.length === 0}>+ Recurring invoice</Button>}
        />
      )}

      {recurringInvoices.length > 0 && (
        <>
          {/* Mobile: one card per recurring invoice. Same data as the table
              below, never rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {recurringInvoices.map((r) => {
              const total = r.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
              const itemsLabel =
                r.lines.length > 1
                  ? `${r.lines.length} items`
                  : products.find((p) => p.id === r.lines[0]?.productId)?.name ?? "—";
              const cadence: Record<Exclude<Recurrence, "none">, string> = { weekly: "week", monthly: "month", yearly: "year" };
              return (
                <Card key={r.id} className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{r.customer}</div>
                      <div className="text-xs text-muted mt-0.5">{itemsLabel}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="num font-medium">{formatMoney(total, currency)}</div>
                      <div className="mt-1">
                        <Badge tone={r.active ? "good" : "amber"}>{r.active ? "active" : "paused"}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                    <div>
                      <span className="text-muted">Bills every </span>
                      <span>{cadence[r.recurrence]}</span>
                    </div>
                    <div>
                      <span className="text-muted">Next </span>
                      <span className="num">{r.active ? r.nextDueDate : "—"}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                    <button
                      onClick={() => handleGenerateNow(r.id)}
                      disabled={!r.active || generatingId === r.id}
                      className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px] disabled:opacity-40 disabled:no-underline"
                    >
                      {generatingId === r.id ? "Generating…" : "Generate now"}
                    </button>
                    <button
                      onClick={() => handleTogglePause(r.id, r.active)}
                      className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]"
                    >
                      {r.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => handleDeleteRecurring(r.id, r.customer)}
                      className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]"
                    >
                      Delete
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
                <th className="py-2 pr-3 font-medium">Customer</th>
                <th className="py-2 px-3 font-medium">Items</th>
                <th className="py-2 px-3 font-medium">Bills every</th>
                <th className="py-2 px-3 font-medium text-right">Amount</th>
                <th className="py-2 px-3 font-medium">Next invoice</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 pl-3 font-medium text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {recurringInvoices.map((r) => {
                const total = r.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
                const itemsLabel =
                  r.lines.length > 1
                    ? `${r.lines.length} items`
                    : products.find((p) => p.id === r.lines[0]?.productId)?.name ?? "—";
                const cadence: Record<Exclude<Recurrence, "none">, string> = { weekly: "week", monthly: "month", yearly: "year" };
                return (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{r.customer}</td>
                    <td className="py-2.5 px-3 text-muted">{itemsLabel}</td>
                    <td className="py-2.5 px-3 text-muted">{cadence[r.recurrence]}</td>
                    <td className="py-2.5 px-3 num text-right">{formatMoney(total, currency)}</td>
                    <td className="py-2.5 px-3 text-muted num">{r.active ? r.nextDueDate : "—"}</td>
                    <td className="py-2.5 px-3">
                      <Badge tone={r.active ? "good" : "amber"}>{r.active ? "active" : "paused"}</Badge>
                    </td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleGenerateNow(r.id)}
                        disabled={!r.active || generatingId === r.id}
                        className="text-xs text-amber-soft hover:underline mr-3 disabled:opacity-40 disabled:no-underline"
                      >
                        {generatingId === r.id ? "Generating…" : "Generate now"}
                      </button>
                      <button
                        onClick={() => handleTogglePause(r.id, r.active)}
                        className="text-xs text-muted hover:text-fg mr-3"
                      >
                        {r.active ? "Pause" : "Resume"}
                      </button>
                      <button
                        onClick={() => handleDeleteRecurring(r.id, r.customer)}
                        className="text-xs text-muted hover:text-bad"
                      >
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

      <Modal open={newInvoiceOpen} onClose={() => setNewInvoiceOpen(false)} title="New invoice">
        <QuickSaleForm
          initial={{ paymentMethod: "credit" }}
          onDone={() => {
            setNewInvoiceOpen(false);
            toast.success("Invoice created");
          }}
        />
      </Modal>

      <Modal open={newMultiInvoiceOpen} onClose={() => setNewMultiInvoiceOpen(false)} title="New multi-item invoice">
        <MultiItemInvoiceForm onDone={() => setNewMultiInvoiceOpen(false)} />
      </Modal>

      <Modal open={newRecurringOpen} onClose={() => setNewRecurringOpen(false)} title="New recurring invoice">
        <RecurringInvoiceForm onDone={() => setNewRecurringOpen(false)} />
      </Modal>
    </>
  );
}

// Staff: read-only view of invoices they created
function StaffInvoicesView() {
  const { user } = useAuth();
  const { sales, products, saleEconomics, settings, loading, receivablePayments } = useData();
  const currency = settings.currency;

  const econById = useMemo(() => new Map(saleEconomics.map((e) => [e.saleId, e])), [saleEconomics]);
  const paymentsBySaleId = useMemo(() => {
    const map = new Map<string, InvoicePaymentRow[]>();
    for (const p of receivablePayments) {
      const rows = map.get(p.saleId) ?? [];
      rows.push({ date: p.date, method: p.method, amount: p.amount });
      map.set(p.saleId, rows);
    }
    return map;
  }, [receivablePayments]);

  // Staff only sees their own credit sales, grouped back into one row per
  // multi-item invoice the same way the Owner/Manager view is.
  const myCreditSales = useMemo(
    () => sales.filter((s) => (s.paymentMethod ?? "cash") === "credit" && s.createdByUid === user?.uid),
    [sales, user?.uid]
  );
  const invoiceGroups = useMemo(() => groupSalesByInvoice(myCreditSales), [myCreditSales]);
  const staffInvoicePage = usePagedList(invoiceGroups);

  const rows = useMemo(
    () =>
      staffInvoicePage.visible.map((g) => {
        const payments = g.sales.flatMap((s) => paymentsBySaleId.get(s.id) ?? []);
        const taxAmount = g.sales.reduce((sum, s) => sum + (s.taxAmount ?? 0), 0);
        const totalAmount = g.sales.reduce((sum, s) => sum + (econById.get(s.id)?.revenue ?? s.qty * s.unitPrice), 0) + taxAmount;
        const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const balanceDue = Math.max(totalAmount - amountPaid, 0);
        const isOverdue = balanceDue > 0.005 && !!g.primary.dueDate && g.primary.dueDate < todayIso();
        const status = balanceDue <= 0.005 ? "paid" : isOverdue ? "overdue" : "outstanding";
        return { group: g, totalAmount, taxAmount, balanceDue, status, payments };
      }),
    [staffInvoicePage.visible, econById, paymentsBySaleId]
  );

  if (loading) {
    return (
      <>
        <PageHeader title="My Invoices" />
        <TableCardSkeleton rows={5} cols={5} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="My Invoices" />

      {invoiceGroups.length === 0 && (
        <EmptyState
          title="No invoices yet"
          body="Create a credit sale to generate an invoice."
        />
      )}

      {invoiceGroups.length > 0 && (
        <>
          {/* Mobile: one card per invoice. Same data as the table below,
              never rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {rows.map(({ group, totalAmount, taxAmount, balanceDue, status, payments }) => {
              const primary = group.primary;
              const invoiceRef = displayInvoiceRef(primary.invoiceNo, group.invoiceId ?? primary.id);
              return (
                <Card key={group.invoiceId ?? primary.id} className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{primary.customer ?? "—"}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {invoiceRef} · <span className="num">{primary.date}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="num font-medium">{formatMoney(balanceDue, currency)}</div>
                      <div className="mt-1">
                        <Badge tone={status === "paid" ? "good" : status === "overdue" ? "bad" : "amber"}>{status}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                    <div>
                      <span className="text-muted">Items </span>
                      <span>
                        {group.sales.length > 1 ? `${group.sales.length} items` : (products.find((p) => p.id === primary.productId)?.name ?? "—")}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Amount </span>
                      <span className="num">{formatMoney(totalAmount, currency)}</span>
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2.5 border-t border-line">
                    <button
                      onClick={() =>
                        printInvoiceGroup({ customers,
                          sales: group.sales,
                          products,
                          payments,
                          settings,
                          totalAmount,
                          taxAmount,
                        })
                      }
                      className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]"
                    >
                      Print
                    </button>
                    <InvoiceLinkButton invoiceKey={group.invoiceId ?? primary.id} />
                    <ShareButton
                      title={invoiceRef}
                      business={settings.businessName}
                      customer={primary.customer}
                      contact={primary.customerContact}
                      amountLine={`Total: ${formatMoney(totalAmount, currency)}${balanceDue > 0.005 ? ` (balance due: ${formatMoney(balanceDue, currency)})` : " (paid in full)"}`}
                      extraLines={primary.dueDate ? [`Due: ${primary.dueDate}`] : undefined}
                      className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px] ml-3"
                    />
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
                <th className="py-2 pr-3 font-medium">Invoice #</th>
                <th className="py-2 px-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Customer</th>
                <th className="py-2 px-3 font-medium">Items</th>
                <th className="py-2 px-3 font-medium text-right">Amount</th>
                <th className="py-2 px-3 font-medium text-right">Balance</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 pl-3 font-medium text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ group, totalAmount, taxAmount, balanceDue, status, payments }) => {
                const primary = group.primary;
                const invoiceRef = displayInvoiceRef(primary.invoiceNo, group.invoiceId ?? primary.id);

                return (
                  <tr key={group.invoiceId ?? primary.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-xs">{invoiceRef}</td>
                    <td className="py-2.5 px-3 text-muted num">{primary.date}</td>
                    <td className="py-2.5 px-3 font-medium">{primary.customer ?? "—"}</td>
                    <td className="py-2.5 px-3 text-muted">
                      {group.sales.length > 1 ? `${group.sales.length} items` : (products.find((p) => p.id === primary.productId)?.name ?? "—")}
                    </td>
                    <td className="py-2.5 px-3 num text-right">{formatMoney(totalAmount, currency)}</td>
                    <td className="py-2.5 px-3 num text-right font-medium">{formatMoney(balanceDue, currency)}</td>
                    <td className="py-2.5 px-3">
                      <Badge
                        tone={status === "paid" ? "good" : status === "overdue" ? "bad" : "amber"}
                      >
                        {status}
                      </Badge>
                    </td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      <button
                        onClick={() =>
                          printInvoiceGroup({ customers,
                            sales: group.sales,
                            products,
                            payments,
                            settings,
                            totalAmount,
                            taxAmount,
                          })
                        }
                        className="text-xs text-muted hover:text-fg"
                      >
                        Print
                      </button>
                      <InvoiceLinkButton invoiceKey={group.invoiceId ?? primary.id} />
                      <ShareButton
                        title={invoiceRef}
                        business={settings.businessName}
                        customer={primary.customer}
                        contact={primary.customerContact}
                        amountLine={`Total: ${formatMoney(totalAmount, currency)}${balanceDue > 0.005 ? ` (balance due: ${formatMoney(balanceDue, currency)})` : " (paid in full)"}`}
                        extraLines={primary.dueDate ? [`Due: ${primary.dueDate}`] : undefined}
                        className="text-xs text-muted hover:text-fg ml-3"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          </Card>
          <ShowMoreBar shown={staffInvoicePage.shown} total={staffInvoicePage.total} remaining={staffInvoicePage.remaining} onShowMore={staffInvoicePage.showMore} onShowAll={staffInvoicePage.showAll} noun="invoices" />
        </>
      )}
    </>
  );
}
