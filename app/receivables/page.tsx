"use client";

import { addressForCustomer, tinForCustomer } from "@/lib/invoiceNumber";
import LateChargeNote from "@/components/LateChargeNote";
import { lateChargeFor } from "@/lib/lateFees";
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useRequireRole } from "@/lib/roleGuard";
import { formatMoney } from "@/lib/format";
import type { ReceivableLine } from "@/lib/calculations";
import { RecordPaymentForm } from "@/components/RecordPaymentForm";
import { Badge, Card, Modal, PageHeader, Stat, StatGridSkeleton, Table, TableCardSkeleton, EmptyState } from "@/components/ui";
import { printReceivableInvoice, buildWhatsAppShareUrl, buildReceivableReminderText, type InvoicePaymentRow } from "@/lib/print";

const BUCKET_LABEL: Record<string, string> = {
  current: "Not yet due",
  "1-30": "1–30 days overdue",
  "31-60": "31–60 days overdue",
  "61-90": "61–90 days overdue",
  "90+": "90+ days overdue",
};

export default function ReceivablesPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { receivablesAging, settings, loading, receivablePayments, customers } = useData();
  const [payingFor, setPayingFor] = useState<ReceivableLine | null>(null);
  const currency = settings.currency;

  const paymentsBySaleId = useMemo(() => {
    const map = new Map<string, InvoicePaymentRow[]>();
    for (const p of receivablePayments) {
      const rows = map.get(p.saleId) ?? [];
      rows.push({ date: p.date, method: p.method, amount: p.amount });
      map.set(p.saleId, rows);
    }
    return map;
  }, [receivablePayments]);

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Owed to You" />
        <StatGridSkeleton count={3} className="lg:grid-cols-3" />
        <TableCardSkeleton rows={6} cols={6} />
      </>
    );
  }

  const overdueTotal =
    receivablesAging.byBucket["1-30"] + receivablesAging.byBucket["31-60"] + receivablesAging.byBucket["61-90"] + receivablesAging.byBucket["90+"];

  return (
    <>
      <PageHeader title="Owed to You" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <Stat label="Total outstanding" value={formatMoney(receivablesAging.totalOutstanding, currency)} />
        <Stat label="Overdue" value={formatMoney(overdueTotal, currency)} tone={overdueTotal > 0 ? "bad" : "default"} />
        <Stat label="90+ days" value={formatMoney(receivablesAging.byBucket["90+"], currency)} tone={receivablesAging.byBucket["90+"] > 0 ? "bad" : "default"} />
      </div>

      {receivablesAging.lines.length === 0 && (
        <EmptyState
          title="Nothing owed to you right now"
          body="Credit sales show up here until they're fully paid off. Mark a sale as 'credit' when you log it to start tracking it."
        />
      )}

      {receivablesAging.lines.length > 0 && (
        <>
          {/* Mobile: one card per line. Same data as the table below, never
              rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {receivablesAging.lines.map((l) => {
              const overThreshold = l.amountOutstanding >= settings.creditReviewThreshold;
              return (
                <Card key={l.saleId} className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{l.customer}</div>
                      <div className="text-xs text-muted mt-0.5 truncate">{l.productName}</div>
                    </div>
                    <div className="num font-medium shrink-0">{formatMoney(l.amountOutstanding, currency)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <Badge tone={l.bucket === "current" ? "default" : l.bucket === "1-30" ? "amber" : "bad"}>
                      {BUCKET_LABEL[l.bucket]}
                    </Badge>
                    {overThreshold && <Badge tone="bad">large</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                    <div>
                      <span className="text-muted">Due </span>
                      <span className="num">{l.dueDate}</span>
                    </div>
                    <div>
                      <span className="text-muted">Owed </span>
                      <span className="num">{formatMoney(l.amountDue, currency)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Collected </span>
                      <span className="num">{formatMoney(l.amountPaid, currency)}</span>
                    </div>
                  </div>
                  <LateChargeNote line={l} variant="row" />
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                    {!l.isOpeningBalance && (
                      <button
                        onClick={() =>
                          printReceivableInvoice(l, l.saleIds.flatMap((id) => paymentsBySaleId.get(id) ?? []), settings, tinForCustomer(customers, l.customer), addressForCustomer(customers, l.customer))
                        }
                        className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]"
                      >
                        Print invoice
                      </button>
                    )}
                    <button onClick={() => setPayingFor(l)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                      Record payment
                    </button>
                    <a
                      href={buildWhatsAppShareUrl(
                        buildReceivableReminderText({
                          businessName: settings.businessName,
                          customer: l.customer,
                          itemName: l.productName,
                          amountOutstanding: l.amountOutstanding,
                          dueDate: l.dueDate,
                          daysOverdue: l.daysOverdue,
                          currency,
                          lateCharge: lateChargeFor(l, settings),
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
              );
            })}
          </div>

          {/* Desktop: the full table, unchanged. */}
          <Card className="hidden sm:block">
          <Table>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="py-2 pr-3 font-medium">Customer</th>
                <th className="py-2 px-3 font-medium">Item(s)</th>
                <th className="py-2 px-3 font-medium">Due</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium text-right">Owed</th>
                <th className="py-2 px-3 font-medium text-right">Collected</th>
                <th className="py-2 px-3 font-medium text-right">Still owed</th>
                <th className="py-2 pl-3 font-medium text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {receivablesAging.lines.map((l) => {
                const overThreshold = l.amountOutstanding >= settings.creditReviewThreshold;
                return (
                  <tr key={l.saleId} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 font-medium">
                      {l.customer}
                      {l.customerContact && <div className="text-[11px] text-muted font-normal">{l.customerContact}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-muted">{l.productName}</td>
                    <td className="py-2.5 px-3 num text-muted">{l.dueDate}</td>
                    <td className="py-2.5 px-3">
                      <Badge tone={l.bucket === "current" ? "default" : l.bucket === "1-30" ? "amber" : "bad"}>
                        {BUCKET_LABEL[l.bucket]}
                      </Badge>
                      {overThreshold && (
                        <span className="ml-1.5">
                          <Badge tone="bad">large</Badge>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 num text-right">{formatMoney(l.amountDue, currency)}</td>
                    <td className="py-2.5 px-3 num text-right text-muted">{formatMoney(l.amountPaid, currency)}</td>
                    <td className="py-2.5 px-3 num text-right font-medium">{formatMoney(l.amountOutstanding, currency)}<LateChargeNote line={l} variant="cell" /></td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      {!l.isOpeningBalance && (
                        <button
                          onClick={() =>
                            printReceivableInvoice(l, l.saleIds.flatMap((id) => paymentsBySaleId.get(id) ?? []), settings, tinForCustomer(customers, l.customer), addressForCustomer(customers, l.customer))
                          }
                          className="text-xs text-muted hover:text-fg mr-3"
                        >
                          Print invoice
                        </button>
                      )}
                      <button onClick={() => setPayingFor(l)} className="text-xs text-amber-soft hover:underline">
                        Record payment
                      </button>
                      <a
                        href={buildWhatsAppShareUrl(
                          buildReceivableReminderText({
                            businessName: settings.businessName,
                            customer: l.customer,
                            itemName: l.productName,
                            amountOutstanding: l.amountOutstanding,
                            dueDate: l.dueDate,
                            daysOverdue: l.daysOverdue,
                            currency,
                            lateCharge: lateChargeFor(l, settings),
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
                );
              })}
            </tbody>
          </Table>
          </Card>
        </>
      )}

      <Modal open={!!payingFor} onClose={() => setPayingFor(null)} title="Record a payment">
        {payingFor && <RecordPaymentForm line={payingFor} onDone={() => setPayingFor(null)} />}
      </Modal>
    </>
  );
}
