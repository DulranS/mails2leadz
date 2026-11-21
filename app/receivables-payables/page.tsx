"use client";

import { addressForCustomer, tinForCustomer } from "@/lib/invoiceNumber";
import LateChargeNote from "@/components/LateChargeNote";
import { lateChargeFor } from "@/lib/lateFees";
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRequireRole } from "@/lib/roleGuard";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import type { ReceivableLine, PayableLine, BillPayableLine } from "@/lib/calculations";
import type { ReceivablePayment, PayablePayment, BillPayment, ReceivableWriteOff } from "@/lib/types";
import { RecordPaymentForm } from "@/components/RecordPaymentForm";
import { RecordPayablePaymentForm } from "@/components/RecordPayablePaymentForm";
import { RecordBillPaymentForm } from "@/components/RecordBillPaymentForm";
import { WriteOffReceivableForm } from "@/components/WriteOffReceivableForm";
import { OpeningBalanceForm } from "@/components/OpeningBalanceForm";
import FxExposureCard from "@/components/FxExposureCard";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, Stat, StatGridSkeleton, Table, TableCardSkeleton, Tabs } from "@/components/ui";
import { printReceivableInvoice, buildWhatsAppShareUrl, buildReceivableReminderText, type InvoicePaymentRow } from "@/lib/print";

type Tab = "receivables" | "payables" | "bills";
type AnyPayment = ReceivablePayment | PayablePayment | BillPayment;

const BUCKET_LABEL: Record<string, string> = {
  current: "Not yet due",
  "1-30": "1–30 days overdue",
  "31-60": "31–60 days overdue",
  "61-90": "61–90 days overdue",
  "90+": "90+ days overdue",
};

export default function ReceivablesPayablesPage() {
  // Not in Staff's nav, but the URL was reachable; it would have shown them a
  // page built from their own partial data. Same guard as the other money pages.
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const {
    receivablesAging,
    payablesAging,
    billsPayable,
    receivablePayments,
    receivableWriteOffs,
    payablePayments,
    billPayments,
    openingBalances,
    deleteOpeningBalance,
    updateReceivablePayment,
    deleteReceivablePayment,
    deleteReceivableWriteOff,
    updatePayablePayment,
    deletePayablePayment,
    updateBillPayment,
    deleteBillPayment,
    settings,
    loading,
    customers,
  } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const isOwner = role === "owner";
  const isOwnerOrManager = role === "owner" || role === "manager";
  const [tab, setTab] = useState<Tab>("receivables");
  const [payingReceivable, setPayingReceivable] = useState<ReceivableLine | null>(null);
  const [payingPayable, setPayingPayable] = useState<PayableLine | null>(null);
  const [payingBill, setPayingBill] = useState<BillPayableLine | null>(null);
  const [writingOffReceivable, setWritingOffReceivable] = useState<ReceivableLine | null>(null);
  const [addingOpening, setAddingOpening] = useState(false);
  const [editingReceivablePayment, setEditingReceivablePayment] = useState<ReceivablePayment | null>(null);
  const [editingPayablePayment, setEditingPayablePayment] = useState<PayablePayment | null>(null);
  const [editingBillPayment, setEditingBillPayment] = useState<BillPayment | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showWriteOffHistory, setShowWriteOffHistory] = useState(false);

  const paymentsBySaleId = useMemo(() => {
    const map = new Map<string, InvoicePaymentRow[]>();
    for (const p of receivablePayments) {
      const rows = map.get(p.saleId) ?? [];
      rows.push({ date: p.date, method: p.method, amount: p.amount });
      map.set(p.saleId, rows);
    }
    return map;
  }, [receivablePayments]);

  const receivablesData = {
    lines: receivablesAging.lines,
    totalOutstanding: receivablesAging.totalOutstanding,
    overdueTotal: receivablesAging.byBucket["1-30"] + receivablesAging.byBucket["31-60"] + receivablesAging.byBucket["61-90"] + receivablesAging.byBucket["90+"],
    byBucket: receivablesAging.byBucket,
  };

  const payablesData = {
    lines: payablesAging.lines,
    totalOutstanding: payablesAging.totalOutstanding,
    overdueTotal: payablesAging.byBucket["1-30"] + payablesAging.byBucket["31-60"] + payablesAging.byBucket["61-90"] + payablesAging.byBucket["90+"],
    byBucket: payablesAging.byBucket,
  };

  const billsData = {
    lines: billsPayable.lines,
    totalOutstanding: billsPayable.totalOutstanding,
    overdueTotal: billsPayable.byBucket["1-30"] + billsPayable.byBucket["31-60"] + billsPayable.byBucket["61-90"] + billsPayable.byBucket["90+"],
    byBucket: billsPayable.byBucket,
  };

  const active = tab === "receivables" ? receivablesData : tab === "payables" ? payablesData : billsData;
  const historyForTab: AnyPayment[] = [
    ...(tab === "receivables" ? receivablePayments : tab === "payables" ? payablePayments : billPayments),
  ].sort((a, b) => b.createdAt - a.createdAt);

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Money owed" />
        <Tabs
          tabs={[
            { key: "receivables", label: "Owed to you" },
            { key: "payables", label: "Suppliers" },
            { key: "bills", label: "Bills" },
          ]}
          value={tab}
          onChange={setTab}
          className="mb-5"
        />
        <StatGridSkeleton count={5} className="xl:grid-cols-5" />
        <TableCardSkeleton rows={6} cols={7} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Money owed"
        action={
          <Button variant="ghost" onClick={() => setAddingOpening(true)}>
            Add opening balance
          </Button>
        }
      />

      <Tabs
        tabs={[
          { key: "receivables", label: `Owed to you (${receivablesData.lines.length})` },
          { key: "payables", label: `Suppliers (${payablesData.lines.length})` },
          { key: "bills", label: `Bills (${billsData.lines.length})` },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-5"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <Stat label="Total outstanding" value={formatMoney(active.totalOutstanding, currency)} tone={tab === "receivables" ? "good" : "bad"} />
        <Stat label="Overdue" value={formatMoney(active.overdueTotal, currency)} tone={active.overdueTotal > 0 ? "bad" : undefined} />
        <Stat label="1-30 days" value={formatMoney(active.byBucket["1-30"], currency)} />
        <Stat label="31-60 days" value={formatMoney(active.byBucket["31-60"], currency)} />
        <Stat label="60+ days" value={formatMoney(active.byBucket["61-90"] + active.byBucket["90+"], currency)} tone={active.byBucket["61-90"] + active.byBucket["90+"] > 0 ? "bad" : undefined} />
      </div>

      {tab !== "bills" && <FxExposureCard />}

      {tab === "payables" && payablesData.lines.length === 0 && billsData.totalOutstanding > 0 && (
        <div className="text-xs text-muted mb-4">
          Nothing owed to suppliers on credit — but you do have unpaid bills. See the Bills tab.
        </div>
      )}
      {tab === "bills" && billsData.lines.length === 0 && payablesData.totalOutstanding > 0 && (
        <div className="text-xs text-muted mb-4">
          No unpaid bills — but you do owe suppliers on credit. See the Suppliers tab.
        </div>
      )}

      {active.lines.length === 0 ? (
        <EmptyState
          title={tab === "receivables" ? "Nothing outstanding" : tab === "payables" ? "Nothing owed" : "No unpaid bills"}
          body={
            tab === "receivables"
              ? "Every sale is fully paid. When you record a sale on credit terms — mark it as \"credit\" with a due date on the Selling page — it'll show up here and age automatically."
              : tab === "payables"
              ? "Every purchase is fully paid. When you record a purchase on credit terms — mark it as \"credit\" with a due date on the Buying page — it'll show up here and age automatically."
              : "Rent, utilities, contractor invoices, an employee's pay run — any one-off cost on the Expenses page can be marked \"owed — not paid yet\" instead of paid. Do that and it'll show up here until you record a payment."
          }
        />
      ) : (
        <>
          {/* Mobile: one card per line. Same data as the table below, never
              rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {tab === "receivables"
              ? receivablesData.lines.map((line: ReceivableLine) => (
                  <Card key={line.saleId} className="!p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{line.customer}</div>
                        <div className="text-xs text-muted mt-0.5 truncate">{line.productName}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="num font-medium">{formatMoney(line.amountOutstanding, currency)}</div>
                        <div className="mt-1">
                          <Badge tone={line.bucket === "current" ? "default" : line.bucket === "1-30" ? "amber" : "bad"}>
                            {BUCKET_LABEL[line.bucket]}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                      <div>
                        <span className="text-muted">Due </span>
                        <span className="num">{line.dueDate}</span>
                      </div>
                      <div>
                        <span className="text-muted">Owed </span>
                        <span className="num">{formatMoney(line.amountDue, currency)}</span>
                      </div>
                      <div>
                        <span className="text-muted">Paid </span>
                        <span className="num">{formatMoney(line.amountPaid, currency)}</span>
                      </div>
                    </div>
                    <LateChargeNote line={line} variant="row" />
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                      {!line.isOpeningBalance && (
                        <button
                          onClick={() =>
                            printReceivableInvoice(line, line.saleIds.flatMap((id) => paymentsBySaleId.get(id) ?? []), settings, tinForCustomer(customers, line.customer), addressForCustomer(customers, line.customer))
                          }
                          className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]"
                        >
                          Print invoice
                        </button>
                      )}
                      <button onClick={() => setPayingReceivable(line)} className="text-xs text-amber-soft hover:opacity-80 min-h-[44px] sm:min-h-[32px]">
                        Record payment
                      </button>
                      {isOwnerOrManager && (
                        <button
                          onClick={() => setWritingOffReceivable(line)}
                          className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]"
                        >
                          Write off
                        </button>
                      )}
                      <a
                        href={buildWhatsAppShareUrl(
                          buildReceivableReminderText({
                            businessName: settings.businessName,
                            customer: line.customer,
                            itemName: line.productName,
                            amountOutstanding: line.amountOutstanding,
                            dueDate: line.dueDate,
                            daysOverdue: line.daysOverdue,
                            currency,
                            lateCharge: lateChargeFor(line, settings),
                          })
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-good hover:underline min-h-[44px] sm:min-h-[32px]"
                      >
                        Remind on WhatsApp
                      </a>
                    </div>
                  </Card>
                ))
              : tab === "payables"
              ? payablesData.lines.map((line: PayableLine) => (
                  <Card key={line.purchaseId} className="!p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{line.supplier}</div>
                        <div className="text-xs text-muted mt-0.5 truncate">{line.productName}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="num font-medium">{formatMoney(line.amountOutstanding, currency)}</div>
                        <div className="mt-1">
                          <Badge tone={line.bucket === "current" ? "default" : line.bucket === "1-30" ? "amber" : "bad"}>
                            {BUCKET_LABEL[line.bucket]}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                      <div>
                        <span className="text-muted">Due </span>
                        <span className="num">{line.dueDate}</span>
                      </div>
                      <div>
                        <span className="text-muted">Owed </span>
                        <span className="num">{formatMoney(line.amountDue, currency)}</span>
                      </div>
                      <div>
                        <span className="text-muted">Paid </span>
                        <span className="num">{formatMoney(line.amountPaid, currency)}</span>
                      </div>
                      {line.amountCredited > 0.005 && (
                        <div>
                          <span className="text-muted">Credited (goods sent back or supplier credit) </span>
                          <span className="num">{formatMoney(line.amountCredited, currency)}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2.5 pt-2.5 border-t border-line">
                      <button onClick={() => setPayingPayable(line)} className="text-xs text-amber-soft hover:opacity-80 min-h-[44px] sm:min-h-[32px]">
                        Record payment
                      </button>
                    </div>
                  </Card>
                ))
              : billsData.lines.map((line: BillPayableLine) => (
                  <Card key={line.expenseId} className="!p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{line.payee}</div>
                        <div className="text-xs text-muted mt-0.5 truncate">{line.category}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="num font-medium">{formatMoney(line.amountOutstanding, currency)}</div>
                        <div className="mt-1">
                          <Badge tone={line.bucket === "current" ? "default" : line.bucket === "1-30" ? "amber" : "bad"}>
                            {BUCKET_LABEL[line.bucket]}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                      <div>
                        <span className="text-muted">Due </span>
                        <span className="num">{line.dueDate}</span>
                      </div>
                      <div>
                        <span className="text-muted">Owed </span>
                        <span className="num">{formatMoney(line.amountDue, currency)}</span>
                      </div>
                      <div>
                        <span className="text-muted">Paid </span>
                        <span className="num">{formatMoney(line.amountPaid, currency)}</span>
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2.5 border-t border-line">
                      <button onClick={() => setPayingBill(line)} className="text-xs text-amber-soft hover:opacity-80 min-h-[44px] sm:min-h-[32px]">
                        Record payment
                      </button>
                    </div>
                  </Card>
                ))}
            <div className="text-[11px] text-muted">
              {tab === "receivables"
                ? "Aging is measured against the due date you set on the credit sale. Record payments to reduce outstanding amounts — each payment is its own dated record, so partial payments are tracked exactly."
                : tab === "payables"
                ? "Aging is measured against the due date you set on the credit purchase. Record payments to reduce outstanding amounts — each payment is its own dated record, so partial payments are tracked exactly."
                : "Aging is measured against the due date you set when marking the expense \"owed — not paid yet\". Record payments to reduce outstanding amounts — each payment is its own dated record, so partial payments are tracked exactly."}
            </div>
          </div>

          {/* Desktop: the full table, unchanged. */}
          <Card className="hidden sm:block">
          <div className="table-container">
            <Table>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-3 font-medium">{tab === "receivables" ? "Customer" : tab === "payables" ? "Supplier" : "Owed to"}</th>
                  <th className="py-2 px-3 font-medium">{tab === "receivables" ? "Item(s)" : tab === "payables" ? "Item" : "Category"}</th>
                  <th className="py-2 px-3 font-medium">Due</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 px-3 font-medium text-right">Owed</th>
                  <th className="py-2 px-3 font-medium text-right">Paid</th>
                  <th className="py-2 px-3 font-medium text-right">Still owed</th>
                  <th className="py-2 pl-3 font-medium text-right">·</th>
                </tr>
              </thead>
              <tbody>
                {tab === "receivables" ? (
                  receivablesData.lines.map((line: ReceivableLine) => (
                    <tr key={line.saleId} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3 font-medium">
                        {line.customer}
                        {line.customerContact && <div className="text-[11px] text-muted font-normal">{line.customerContact}</div>}
                      </td>
                      <td className="py-2.5 px-3 text-muted">{line.productName}</td>
                      <td className="py-2.5 px-3 num text-muted">{line.dueDate}</td>
                      <td className="py-2.5 px-3">
                        <Badge tone={line.bucket === "current" ? "default" : line.bucket === "1-30" ? "amber" : "bad"}>
                          {BUCKET_LABEL[line.bucket]}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 num text-right">{formatMoney(line.amountDue, currency)}</td>
                      <td className="py-2.5 px-3 num text-right text-muted">{formatMoney(line.amountPaid, currency)}</td>
                      <td className="py-2.5 px-3 num text-right font-medium">{formatMoney(line.amountOutstanding, currency)}<LateChargeNote line={line} variant="cell" /></td>
                      <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                        {!line.isOpeningBalance && (
                          <button
                            onClick={() =>
                              printReceivableInvoice(line, line.saleIds.flatMap((id) => paymentsBySaleId.get(id) ?? []), settings, tinForCustomer(customers, line.customer), addressForCustomer(customers, line.customer))
                            }
                            className="text-xs text-muted hover:text-fg mr-3"
                          >
                            Print invoice
                          </button>
                        )}
                        <button onClick={() => setPayingReceivable(line)} className="text-xs text-amber-soft hover:opacity-80">
                          Record payment
                        </button>
                        {isOwnerOrManager && (
                          <button
                            onClick={() => setWritingOffReceivable(line)}
                            className="text-xs text-muted hover:text-bad ml-3"
                          >
                            Write off
                          </button>
                        )}
                        <a
                          href={buildWhatsAppShareUrl(
                            buildReceivableReminderText({
                              businessName: settings.businessName,
                              customer: line.customer,
                              itemName: line.productName,
                              amountOutstanding: line.amountOutstanding,
                              dueDate: line.dueDate,
                              daysOverdue: line.daysOverdue,
                              currency,
                              lateCharge: lateChargeFor(line, settings),
                            })
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-good hover:underline ml-3"
                        >
                          Remind on WhatsApp
                        </a>
                      </td>
                    </tr>
                  ))
                ) : tab === "payables" ? (
                  payablesData.lines.map((line: PayableLine) => (
                    <tr key={line.purchaseId} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3 font-medium">{line.supplier}</td>
                      <td className="py-2.5 px-3 text-muted">{line.productName}</td>
                      <td className="py-2.5 px-3 num text-muted">{line.dueDate}</td>
                      <td className="py-2.5 px-3">
                        <Badge tone={line.bucket === "current" ? "default" : line.bucket === "1-30" ? "amber" : "bad"}>
                          {BUCKET_LABEL[line.bucket]}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 num text-right">{formatMoney(line.amountDue, currency)}</td>
                      <td className="py-2.5 px-3 num text-right text-muted">
                        {formatMoney(line.amountPaid, currency)}
                        {line.amountCredited > 0.005 && (
                          <div className="text-[11px]">+ {formatMoney(line.amountCredited, currency)} credited</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 num text-right font-medium">{formatMoney(line.amountOutstanding, currency)}</td>
                      <td className="py-2.5 pl-3 text-right">
                        <button onClick={() => setPayingPayable(line)} className="text-xs text-amber-soft hover:opacity-80">
                          Record payment
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  billsData.lines.map((line: BillPayableLine) => (
                    <tr key={line.expenseId} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3 font-medium">{line.payee}</td>
                      <td className="py-2.5 px-3 text-muted">{line.category}</td>
                      <td className="py-2.5 px-3 num text-muted">{line.dueDate}</td>
                      <td className="py-2.5 px-3">
                        <Badge tone={line.bucket === "current" ? "default" : line.bucket === "1-30" ? "amber" : "bad"}>
                          {BUCKET_LABEL[line.bucket]}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 num text-right">{formatMoney(line.amountDue, currency)}</td>
                      <td className="py-2.5 px-3 num text-right text-muted">{formatMoney(line.amountPaid, currency)}</td>
                      <td className="py-2.5 px-3 num text-right font-medium">{formatMoney(line.amountOutstanding, currency)}</td>
                      <td className="py-2.5 pl-3 text-right">
                        <button onClick={() => setPayingBill(line)} className="text-xs text-amber-soft hover:opacity-80">
                          Record payment
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
          <div className="text-[11px] text-muted mt-3">
            {tab === "receivables"
              ? "Aging is measured against the due date you set on the credit sale. Record payments to reduce outstanding amounts — each payment is its own dated record, so partial payments are tracked exactly."
              : tab === "payables"
              ? "Aging is measured against the due date you set on the credit purchase. Record payments to reduce outstanding amounts — each payment is its own dated record, so partial payments are tracked exactly."
              : "Aging is measured against the due date you set when marking the expense \"owed — not paid yet\". Record payments to reduce outstanding amounts — each payment is its own dated record, so partial payments are tracked exactly."}
          </div>
          </Card>
        </>
      )}

      {isOwner && historyForTab.length > 0 && (
        <Card className="mt-6">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Payment history &amp; corrections</div>
              <div className="text-xs text-muted mt-0.5">
                Every payment ever recorded on this tab. As owner, you can fix a mis-keyed amount, date or method —
                everyone else can only ever add a new payment, never edit one.
              </div>
            </div>
            <button onClick={() => setShowHistory((v) => !v)} className="text-xs text-amber-soft shrink-0">
              {showHistory ? "Hide" : `Show (${historyForTab.length})`}
            </button>
          </div>

          {showHistory && (
            <div className="mt-4 space-y-1.5">
              {historyForTab.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-line last:border-0">
                  <div>
                    <span className="num font-medium">{formatMoney(p.amount, currency)}</span>{" "}
                    <span className="text-muted text-xs">
                      · {p.date} · {p.method.replace("_", " ")} · {p.createdByName ?? "—"}
                      {p.note ? ` · ${p.note}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() =>
                        tab === "receivables"
                          ? setEditingReceivablePayment(p as ReceivablePayment)
                          : tab === "payables"
                          ? setEditingPayablePayment(p as PayablePayment)
                          : setEditingBillPayment(p as BillPayment)
                      }
                      className="text-xs text-muted hover:text-fg"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm("Delete this payment record? This can't be undone.")) return;
                        const del = tab === "receivables" ? deleteReceivablePayment : tab === "payables" ? deletePayablePayment : deleteBillPayment;
                        del(p.id)
                          .then(() => toast.success("Deleted"))
                          .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                      }}
                      className="text-xs text-muted hover:text-bad"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "receivables" && isOwnerOrManager && receivableWriteOffs.length > 0 && (
        <Card className="mt-6">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Bad debt write-offs</div>
              <div className="text-xs text-muted mt-0.5">
                {isOwner
                  ? "Every write-off ever recorded. You can reverse one — that puts the amount straight back into receivables and undoes the bad debt expense."
                  : "Every write-off ever recorded. Only the owner can reverse one."}
              </div>
            </div>
            <button onClick={() => setShowWriteOffHistory((v) => !v)} className="text-xs text-amber-soft shrink-0">
              {showWriteOffHistory ? "Hide" : `Show (${receivableWriteOffs.length})`}
            </button>
          </div>

          {showWriteOffHistory && (
            <div className="mt-4 space-y-1.5">
              {[...receivableWriteOffs]
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((w: ReceivableWriteOff) => (
                  <div key={w.id} className="flex items-center justify-between text-sm py-1.5 border-b border-line last:border-0">
                    <div>
                      <span className="num font-medium">{formatMoney(w.amount, currency)}</span>{" "}
                      <span className="text-muted text-xs">
                        · {w.date} · {w.createdByName ?? "—"}
                        {w.reason ? ` · ${w.reason}` : ""}
                      </span>
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => {
                          if (!confirm("Reverse this write-off? The amount goes back into receivables.")) return;
                          deleteReceivableWriteOff(w.id)
                            .then(() => toast.success("Write-off reversed"))
                            .catch((err) => toast.error("Couldn't reverse", toastableErrorMessage(err)));
                        }}
                        className="text-xs text-muted hover:text-bad shrink-0"
                      >
                        Reverse
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </Card>
      )}

      {openingBalances.length > 0 && (
        <Card className="mt-6">
          <div className="text-sm font-medium mb-1">Opening balances</div>
          <div className="text-xs text-muted mb-3">
            Money already owed on the day you started using the app. These add no sales or costs. Record payments
            against them in the tabs above.
          </div>
          <div className="divide-y divide-line">
            {[...openingBalances]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((o) => (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">
                      {o.party}{" "}
                      <span className="text-xs text-muted">
                        · {o.kind === "receivable" ? "owes you" : "you owe"} · {o.date}
                        {o.note ? ` · ${o.note}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="num">{formatMoney(o.amount, currency)}</span>
                    {isOwner && (
                      <button
                        type="button"
                        className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px] px-1"
                        onClick={async () => {
                          if (
                            !confirm(
                              "Delete this opening balance? Any payments or write-offs recorded against it are deleted too. This can't be undone."
                            )
                          )
                            return;
                          try {
                            await deleteOpeningBalance(o.id);
                            toast.success("Opening balance deleted");
                          } catch (err) {
                            toast.error("Couldn't delete that", toastableErrorMessage(err));
                          }
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      <Modal open={addingOpening} onClose={() => setAddingOpening(false)} title="Add an opening balance">
        {addingOpening && (
          <OpeningBalanceForm
            initialKind={tab === "payables" ? "payable" : "receivable"}
            onDone={() => setAddingOpening(false)}
          />
        )}
      </Modal>

      <Modal open={!!payingReceivable} onClose={() => setPayingReceivable(null)} title="Record a payment">
        {payingReceivable && <RecordPaymentForm line={payingReceivable} onDone={() => setPayingReceivable(null)} />}
      </Modal>

      <Modal open={!!payingPayable} onClose={() => setPayingPayable(null)} title="Record a payment">
        {payingPayable && <RecordPayablePaymentForm line={payingPayable} onDone={() => setPayingPayable(null)} />}
      </Modal>

      <Modal open={!!payingBill} onClose={() => setPayingBill(null)} title="Record a payment">
        {payingBill && <RecordBillPaymentForm line={payingBill} onDone={() => setPayingBill(null)} />}
      </Modal>

      <Modal open={!!writingOffReceivable} onClose={() => setWritingOffReceivable(null)} title="Write off as bad debt">
        {writingOffReceivable && (
          <WriteOffReceivableForm line={writingOffReceivable} onDone={() => setWritingOffReceivable(null)} />
        )}
      </Modal>

      <Modal open={!!editingReceivablePayment} onClose={() => setEditingReceivablePayment(null)} title="Correct this payment">
        {editingReceivablePayment && (
          <EditPaymentForm
            payment={editingReceivablePayment}
            currency={currency}
            onSave={async (patch) => {
              try {
                await updateReceivablePayment(editingReceivablePayment.id, patch);
                toast.success("Payment corrected");
                setEditingReceivablePayment(null);
              } catch (err) {
                toast.error("Couldn't save", toastableErrorMessage(err));
              }
            }}
            onCancel={() => setEditingReceivablePayment(null)}
          />
        )}
      </Modal>

      <Modal open={!!editingPayablePayment} onClose={() => setEditingPayablePayment(null)} title="Correct this payment">
        {editingPayablePayment && (
          <EditPaymentForm
            payment={editingPayablePayment}
            currency={currency}
            onSave={async (patch) => {
              try {
                await updatePayablePayment(editingPayablePayment.id, patch);
                toast.success("Payment corrected");
                setEditingPayablePayment(null);
              } catch (err) {
                toast.error("Couldn't save", toastableErrorMessage(err));
              }
            }}
            onCancel={() => setEditingPayablePayment(null)}
          />
        )}
      </Modal>

      <Modal open={!!editingBillPayment} onClose={() => setEditingBillPayment(null)} title="Correct this payment">
        {editingBillPayment && (
          <EditPaymentForm
            payment={editingBillPayment}
            currency={currency}
            onSave={async (patch) => {
              try {
                await updateBillPayment(editingBillPayment.id, patch);
                toast.success("Payment corrected");
                setEditingBillPayment(null);
              } catch (err) {
                toast.error("Couldn't save", toastableErrorMessage(err));
              }
            }}
            onCancel={() => setEditingBillPayment(null)}
          />
        )}
      </Modal>
    </>
  );
}

function EditPaymentForm({
  payment,
  currency,
  onSave,
  onCancel,
}: {
  payment: AnyPayment;
  currency: string;
  onSave: (patch: { amount?: number; date?: string; method?: "cash" | "card" | "bank_transfer"; note?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(payment.amount.toString());
  const [date, setDate] = useState(payment.date);
  const [method, setMethod] = useState<"cash" | "card" | "bank_transfer">(payment.method);
  const [note, setNote] = useState(payment.note ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({ amount: Number(amount), date, method, note: note || undefined });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Amount</Label>
          <Input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayIso()} />
        </Field>
      </div>
      <Field>
        <Label>Method</Label>
        <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank transfer</option>
        </Select>
      </Field>
      <Field>
        <Label>Note (optional)</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="text-[11px] text-muted">Currency: {currency}</div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save correction"}
        </Button>
      </div>
    </form>
  );
}
