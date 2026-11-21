"use client";

// Money lent out: loans to customers, staff advances, money placed with other traders, equipment on instalments.
// Management accounting only: the owner records what was lent and every repayment actually received. Nothing
// here connects to a bank, a credit bureau or any authority, and it never moves money (see lib/lending.ts for
// how it ties into the books). Interest counts as profit when it is RECEIVED, never before.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRequireRole } from "@/lib/roleGuard";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import {
  LENT_STYLE_LABELS, lendingPresentValue, lentSchedule, settleInFullAmount, summarizeLentLoan, validateLentTxn,
  type LentLoanStatus, type LentLoanSummary,
} from "@/lib/lending";
import type { LentLoan, LentLoanStyle, LentLoanTxn, LentLoanTxnKind } from "@/lib/types";
import { CollectorSelect, useCollectorChoices } from "@/components/CollectorSelect";
import { LogContactForm, type ContactSubject } from "@/components/LogContactForm";
import { useCollections } from "@/lib/useCollections";
import { CHANNEL_LABELS, OUTCOME_LABELS, buildCollectionMessage, customerKey } from "@/lib/collections";
import { buildShareTargets } from "@/lib/share";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, Stat, StatGridSkeleton, Table, TableCardSkeleton } from "@/components/ui";

const pct = (v: number | null, digits = 1) => (v == null ? "—" : `${v.toFixed(digits)}%`);

function StatusBadge({ s }: { s: LentLoanSummary }) {
  const tone: Record<LentLoanStatus, "good" | "bad" | "amber" | "default"> = { current: "good", overdue: "bad", repaid: "default", written_off: "amber" };
  const text: Record<LentLoanStatus, string> = {
    current: "On time",
    overdue: s.daysOverdue > 0 ? `Late ${s.daysOverdue} day${s.daysOverdue === 1 ? "" : "s"}` : "Late",
    repaid: "Paid off",
    written_off: "Written off",
  };
  return <Badge tone={tone[s.status]}>{text[s.status]}</Badge>;
}

export default function LendingPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const canEdit = role === "owner";
  const { lentLoans, lentLoanTxns, lendingPortfolio: pf, settings, loading, addLentLoan, updateLentLoan, deleteLentLoan, addLentLoanTxn, deleteLentLoanTxn, addCustomer, customers } = useData();
  const { items: collectionItems } = useCollections();
  const canLogContact = role === "owner" || role === "manager";
  const toast = useToast();
  const currency = settings.currency;
  const money = (n: number) => formatMoney(n, currency);

  const [loanModal, setLoanModal] = useState<{ editing: LentLoan | null } | null>(null);
  const [txnModal, setTxnModal] = useState<{ loanId: string; kind: LentLoanTxnKind } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [contactFor, setContactFor] = useState<ContactSubject | null>(null);
  const [elsewhere, setElsewhere] = useState("10");

  const elsewherePct = Number.isFinite(Number(elsewhere)) ? Math.max(0, Number(elsewhere)) : 0;
  const presentValue = useMemo(() => lendingPresentValue(pf, elsewherePct), [pf, elsewherePct]);
  const everythingToCome = useMemo(() => lendingPresentValue(pf, 0), [pf]);

  if (guardLoading || !allowed) return null;
  if (loading) {
    return (
      <>
        <PageHeader title="Money lent out" action={<Button disabled>+ Lend money</Button>} />
        <StatGridSkeleton count={4} />
        <TableCardSkeleton rows={4} cols={5} />
      </>
    );
  }

  const summaryOf = (id: string) => pf.loans.find((s) => s.loan.id === id);
  const txnsOf = (id: string) => lentLoanTxns.filter((t) => t.loanId === id);
  const open = (s: LentLoanSummary) => s.status === "current" || s.status === "overdue";
  const detail = detailId ? summaryOf(detailId) : undefined;
  const txnLoan = txnModal ? summaryOf(txnModal.loanId) : undefined;

  // The collections view of a loan (late, due this week, last contact, promise), when it has anything to chase.
  const queueItemOf = (loanId: string) => collectionItems.find((i) => i.loanId === loanId);
  const reminderUrl = (loanId: string): string | null => {
    const it = queueItemOf(loanId);
    if (!it) return null;
    const text = buildCollectionMessage(it, settings.businessName, money);
    return buildShareTargets(text, `Loan payment, ${it.label}`, it.contact).whatsappUrl;
  };

  const actions = (s: LentLoanSummary) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      <button onClick={() => setDetailId(s.loan.id)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">Details</button>
      {open(s) && reminderUrl(s.loan.id) && (
        <a href={reminderUrl(s.loan.id)!} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px] inline-flex items-center">Remind on WhatsApp</a>
      )}
      {canLogContact && open(s) && (
        <button onClick={() => setContactFor({ kind: "lent_loan", key: s.loan.id, label: s.loan.borrower, suggestedAmount: s.overdueAmount > 0.5 ? s.overdueAmount : s.nextDueAmount ?? undefined })} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">Log contact</button>
      )}
      {canEdit && open(s) && <button onClick={() => setTxnModal({ loanId: s.loan.id, kind: "repayment" })} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">Record payment</button>}
      {canEdit && open(s) && <button onClick={() => setTxnModal({ loanId: s.loan.id, kind: "writeoff" })} className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]">Write off</button>}
      {canEdit && <button onClick={() => setLoanModal({ editing: s.loan })} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px]">Edit</button>}
    </div>
  );

  const lateLoans = pf.loans.filter((s) => s.status === "overdue");

  return (
    <>
      <PageHeader title="Money lent out" action={canEdit ? <Button onClick={() => setLoanModal({ editing: null })}>+ Lend money</Button> : undefined} />

      {lentLoans.length === 0 ? (
        <EmptyState
          title="No money lent out yet"
          body="If the business lends money and earns interest on it (to a customer, a staff member, another trader, or equipment sold on instalments), record it here. You will see what is still owed to you, the interest you have earned, who is late, and what is still to come. It all flows into your cash flow, profit and balance sheet. Interest counts as profit when it is received, never before. Nothing connects to a bank; you record what really happens."
          action={canEdit ? <Button onClick={() => setLoanModal({ editing: null })}>+ Record your first loan</Button> : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Stat label="Still owed to you" value={money(pf.principalOutstanding)} sub={`${pf.openCount} open loan${pf.openCount === 1 ? "" : "s"}${pf.accruedInterest > 0.5 ? ` · plus ${money(pf.accruedInterest)} interest owed` : ""}`} />
            <Stat label="Interest earned" value={money(pf.interestReceived)} tone={pf.interestReceived > 0 ? "good" : "default"} sub="received so far, counted as profit" />
            <Stat label="Late" value={money(pf.overdueAmount)} tone={pf.overdueAmount > 0.5 ? "bad" : "default"} sub={pf.overdueCount > 0 ? `${pf.overdueCount} loan${pf.overdueCount === 1 ? "" : "s"} behind` : "nobody is behind"} />
            <Stat label="Coming in, next 12 months" value={money(pf.expectedNext12m)} sub="if everyone pays as agreed" />
          </div>

          {lateLoans.length > 0 && (
            <div className="mb-5 rounded-md border border-bad/30 bg-bad/5 px-4 py-3 text-sm text-fg">
              <span className="font-medium">{lateLoans.length === 1 ? "One borrower is" : `${lateLoans.length} borrowers are`} behind on payments: </span>
              {lateLoans.slice(0, 4).map((s, i) => (
                <span key={s.loan.id}>{i > 0 ? ", " : ""}{s.loan.borrower} ({money(s.overdueAmount)}, {s.daysOverdue} days)</span>
              ))}
              {lateLoans.length > 4 ? ` and ${lateLoans.length - 4} more` : ""}. Late interest keeps building on what they owe. Contact them, then record what they pay; if you decide it will never come, use Write off.
            </div>
          )}

          {/* Loans: cards on phones, table from sm up. Never both at once. */}
          <div className="sm:hidden space-y-2.5">
            {pf.loans.map((s) => (
              <Card key={s.loan.id} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{s.loan.borrower}</div>
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      <StatusBadge s={s} />
                      <span className="text-xs text-muted">{s.loan.purpose ? `${s.loan.purpose} · ` : ""}{s.loan.annualInterestRatePct}% a year</span>
                    </div>
                    {(s.loan.borrowerContact || s.loan.collectorName) && (
                      <div className="text-xs text-muted mt-0.5 truncate">{s.loan.borrowerContact}{s.loan.borrowerContact && s.loan.collectorName ? " · " : ""}{s.loan.collectorName ? `Collector: ${s.loan.collectorName}` : ""}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num font-medium">{money(s.principalOutstanding)}</div>
                    <div className="text-xs text-muted">still owed</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                  <div><span className="text-muted">Lent </span><span className="num">{money(s.loan.principal)}</span></div>
                  <div><span className="text-muted">Interest received </span><span className="num">{money(s.interestReceived)}</span></div>
                  {s.overdueAmount > 0 && <div><span className="text-muted">Late </span><span className="num text-bad">{money(s.overdueAmount)}</span></div>}
                  {s.nextDueDate && s.overdueAmount === 0 && <div><span className="text-muted">Next </span><span className="num">{money(s.nextDueAmount ?? 0)}</span> <span className="text-muted">on {formatDate(s.nextDueDate)}</span></div>}
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-line">{actions(s)}</div>
              </Card>
            ))}
          </div>
          <Card className="hidden sm:block">
            <div className="table-container">
              <Table>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                    <th className="py-2 pr-3 font-medium">Borrower</th>
                    <th className="py-2 px-3 font-medium text-right">Lent</th>
                    <th className="py-2 px-3 font-medium text-right">Still owed</th>
                    <th className="py-2 px-3 font-medium text-right">Interest received</th>
                    <th className="py-2 px-3 font-medium">Next payment</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 pl-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {pf.loans.map((s) => (
                    <tr key={s.loan.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{s.loan.borrower}</div>
                        <div className="text-xs text-muted">{s.loan.purpose ? `${s.loan.purpose} · ` : ""}{s.loan.annualInterestRatePct}% a year · from {formatDate(s.loan.startDate)}</div>
                        {(s.loan.borrowerContact || s.loan.collectorName) && (
                          <div className="text-xs text-muted">{s.loan.borrowerContact}{s.loan.borrowerContact && s.loan.collectorName ? " · " : ""}{s.loan.collectorName ? `Collector: ${s.loan.collectorName}` : ""}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right num whitespace-nowrap">{money(s.loan.principal)}</td>
                      <td className="py-2.5 px-3 text-right num whitespace-nowrap">
                        {money(s.principalOutstanding)}
                        {s.accruedInterest > 0.5 && <div className="text-xs text-muted">+ {money(s.accruedInterest)} interest</div>}
                      </td>
                      <td className="py-2.5 px-3 text-right num whitespace-nowrap">{money(s.interestReceived)}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {s.overdueAmount > 0 ? <span className="num text-bad">{money(s.overdueAmount)} late</span>
                          : s.nextDueDate ? <><span className="num">{money(s.nextDueAmount ?? 0)}</span><div className="text-xs text-muted">{formatDate(s.nextDueDate)}</div></>
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="py-2.5 px-3"><StatusBadge s={s} /></td>
                      <td className="py-2.5 pl-3">{actions(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>

          {/* Past, present, future in one place. */}
          <div className="grid lg:grid-cols-2 gap-4 mt-6">
            <Card>
              <div className="font-medium mb-3">Past, present, future</div>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted mb-0.5">Past</div>
                  You have lent {money(pf.totalLent)} and had {money(pf.principalReceived)} of it back, plus {money(pf.interestReceived)} in interest.
                  {pf.writtenOff > 0.5 && <> You gave up on {money(pf.writtenOff)} ({pct(pf.badDebtPct)} of everything lent).</>}
                  {pf.annualizedReturnPct != null && <> Your money has earned about <span className="num font-medium">{pct(pf.annualizedReturnPct)}</span> a year on average.</>}
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted mb-0.5">Present</div>
                  Borrowers owe you <span className="num font-medium">{money(pf.principalOutstanding)}</span>
                  {pf.accruedInterest > 0.5 && <> and {money(pf.accruedInterest)} of interest that has built up but has not been paid (it only counts as profit once it is)</>}.
                  {pf.overdueAmount > 0.5 && <> Of that, <span className="num text-bad">{money(pf.overdueAmount)}</span> is late.</>}
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted mb-0.5">Future</div>
                  If everyone pays as agreed you will collect about <span className="num font-medium">{money(everythingToCome)}</span> in total, including <span className="num">{money(pf.interestStillToEarn)}</span> of interest still to earn. {money(pf.expectedNext12m)} of it arrives in the next 12 months.
                </div>
              </div>
            </Card>

            <Card>
              <div className="font-medium mb-1">Is lending worth it?</div>
              <div className="text-xs text-muted mb-3">Money owed to you is not money you can use. Compare it with what the same cash could earn elsewhere (a fixed deposit, treasury bills, paying down your own debt). This is a way to think, not a forecast.</div>
              <Field className="max-w-[12rem]"><Label>It could earn elsewhere, % a year</Label><Input type="number" min="0" step="0.5" value={elsewhere} onChange={(e) => setElsewhere(e.target.value)} /></Field>
              <div className="mt-3 space-y-1.5 text-sm">
                <div>Everything still to be collected is worth about <span className="num font-medium">{money(presentValue)}</span> today at {elsewherePct}%, against {money(everythingToCome)} on paper.</div>
                {pf.annualizedReturnPct != null && (
                  <div className={pf.annualizedReturnPct >= elsewherePct ? "text-good" : "text-bad"}>
                    {pf.annualizedReturnPct >= elsewherePct
                      ? `Your lending has earned ${pct(pf.annualizedReturnPct)} a year, more than ${elsewherePct}%.`
                      : `Your lending has earned ${pct(pf.annualizedReturnPct)} a year, less than ${elsewherePct}%. Late payments and write-offs eat into the headline rate.`}
                  </div>
                )}
                {pf.largestBorrower && pf.largestBorrower.sharePct >= 50 && pf.loanCount > 1 && (
                  <div className="text-muted">{pf.largestBorrower.name} accounts for {pf.largestBorrower.sharePct.toFixed(0)}% of what is owed to you. If they stop paying, it hurts.</div>
                )}
                {pf.largestBorrower && pf.largestBorrower.sharePct >= 50 && pf.loanCount === 1 && (
                  <div className="text-muted">All of it is with one borrower. Spreading it across a few borrowers lowers the risk.</div>
                )}
              </div>
            </Card>
          </div>

          <Card className="mt-6">
            <div className="font-medium mb-3">Activity</div>
            {lentLoanTxns.length === 0 ? (
              <div className="text-sm text-muted">No repayments recorded yet.</div>
            ) : (
              <div className="divide-y divide-line">
                {lentLoanTxns.slice(0, 30).map((t) => (
                  <div key={t.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm"><Badge tone={t.kind === "repayment" ? "good" : "amber"}>{t.kind === "repayment" ? "Received" : "Written off"}</Badge> <span className="ml-1">{lentLoans.find((l) => l.id === t.loanId)?.borrower ?? "—"}</span></div>
                      <div className="text-xs text-muted mt-0.5">{formatDate(t.date)}{t.notes ? ` · ${t.notes}` : ""}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="num text-sm">{money(t.amount)}</div>
                      {canEdit && <DeleteTxnButton id={t.id} deleteLentLoanTxn={deleteLentLoanTxn} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[11px] text-muted mt-3">
              Lending money takes cash out. Repayments bring cash back; the interest part counts as profit (below your operating profit, and taxed with it) and the rest just turns the loan back into cash. A write-off is a loss in that month. What is still owed sits on the balance sheet as an asset. See{" "}
              <a href="/statements" className="text-amber-soft">Reports</a>.
            </div>
          </Card>
        </>
      )}

      <Modal open={!!loanModal} onClose={() => setLoanModal(null)} title={loanModal?.editing ? "Edit loan" : "Lend money"}>
        {loanModal && (
          <LoanForm
            initial={loanModal.editing}
            hasEntries={!!loanModal.editing && txnsOf(loanModal.editing.id).length > 0}
            currency={currency}
            onCancel={() => setLoanModal(null)}
            onSave={async (values, addToDirectory) => {
              try {
                if (loanModal.editing) {
                  await updateLentLoan(loanModal.editing.id, values);
                  toast.success("Loan updated", values.borrower);
                  setLoanModal(null);
                } else {
                  await addLentLoan(values);
                  toast.success("Loan recorded", `${money(values.principal)} to ${values.borrower}. Your cash is down by that amount.`);
                  setLoanModal(null);
                  // Ticked "add to my customers": the borrower record lives in the customer directory too, so the
                  // same person has one place for phone, address and guarantor. Skipped when the name is already there.
                  if (addToDirectory && !customers.some((c) => customerKey(c.name) === customerKey(values.borrower))) {
                    try {
                      await addCustomer({
                        name: values.borrower.trim(),
                        contact: values.borrowerContact,
                        guarantorName: values.guarantorName,
                        guarantorContact: values.guarantorContact,
                        ...(values.collectorUid ? { collectorUid: values.collectorUid, collectorName: values.collectorName } : {}),
                      });
                    } catch (err) {
                      toast.error("Loan saved, but couldn't add them to your customers", toastableErrorMessage(err));
                    }
                  }
                }
              } catch (err) {
                toast.error("Couldn't save the loan", toastableErrorMessage(err));
              }
            }}
            onDelete={
              loanModal.editing && txnsOf(loanModal.editing.id).length === 0
                ? async () => {
                    if (!loanModal.editing || !confirm(`Delete the loan to "${loanModal.editing.borrower}"? Your cash goes back up by the amount lent.`)) return;
                    try { await deleteLentLoan(loanModal.editing.id); toast.success("Loan deleted"); setLoanModal(null); } catch (err) { toast.error("Couldn't delete it", toastableErrorMessage(err)); }
                  }
                : undefined
            }
          />
        )}
      </Modal>

      <Modal open={!!txnModal && !!txnLoan} onClose={() => setTxnModal(null)} title={txnModal?.kind === "writeoff" ? "Write off bad debt" : "Record a payment received"}>
        {txnModal && txnLoan && (
          <TxnForm
            summary={txnLoan}
            txns={txnsOf(txnLoan.loan.id)}
            kind={txnModal.kind}
            money={money}
            onCancel={() => setTxnModal(null)}
            onSave={async (values) => {
              try {
                await addLentLoanTxn({ loanId: txnLoan.loan.id, kind: txnModal.kind, ...values });
                toast.success(txnModal.kind === "repayment" ? "Payment recorded" : "Written off", txnLoan.loan.borrower);
                setTxnModal(null);
              } catch (err) {
                toast.error("Couldn't save the entry", toastableErrorMessage(err));
              }
            }}
          />
        )}
      </Modal>

      <Modal open={!!contactFor} onClose={() => setContactFor(null)} title="Log a contact">
        {contactFor && <LogContactForm subject={contactFor} onDone={() => setContactFor(null)} />}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetailId(null)} title={detail ? `Loan to ${detail.loan.borrower}` : ""}>
        {detail && (
          <LoanDetail
            s={detail}
            txns={txnsOf(detail.loan.id)}
            money={money}
            canEdit={canEdit}
            onDeleteTxn={async (id) => {
              if (!confirm("Delete this entry? Your cash and profit will adjust.")) return;
              try { await deleteLentLoanTxn(id); toast.success("Entry deleted"); } catch (err) { toast.error("Couldn't delete the entry", toastableErrorMessage(err)); }
            }}
          />
        )}
      </Modal>
    </>
  );
}

function DeleteTxnButton({ id, deleteLentLoanTxn }: { id: string; deleteLentLoanTxn: (id: string) => Promise<void> }) {
  const toast = useToast();
  return (
    <button
      onClick={async () => {
        if (!confirm("Delete this entry? Your cash and profit will adjust.")) return;
        try { await deleteLentLoanTxn(id); toast.success("Entry deleted"); } catch (err) { toast.error("Couldn't delete the entry", toastableErrorMessage(err)); }
      }}
      className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[28px]"
    >Delete</button>
  );
}

function LoanForm({ initial, hasEntries, currency, onSave, onCancel, onDelete }: {
  initial: LentLoan | null;
  hasEntries: boolean;
  currency: string;
  onSave: (v: Omit<LentLoan, "id" | "createdAt">, addToDirectory: boolean) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const { customers } = useData();
  const collectorChoices = useCollectorChoices(initial?.collectorUid, initial?.collectorName);
  const [borrower, setBorrower] = useState(initial?.borrower ?? "");
  const [borrowerContact, setBorrowerContact] = useState(initial?.borrowerContact ?? "");
  const [guarantorName, setGuarantorName] = useState(initial?.guarantorName ?? "");
  const [guarantorContact, setGuarantorContact] = useState(initial?.guarantorContact ?? "");
  const [collateral, setCollateral] = useState(initial?.collateral ?? "");
  const [collectorUid, setCollectorUid] = useState(initial?.collectorUid ?? "");
  const [collectorName, setCollectorName] = useState(initial?.collectorName ?? "");
  const [addToDirectory, setAddToDirectory] = useState(true);
  // The borrower is "in the directory" when the name matches a customer (same name matching as everywhere else).
  const match = customers.find((c) => customerKey(c.name) === customerKey(borrower));
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [principal, setPrincipal] = useState(initial?.principal?.toString() ?? "");
  const [rate, setRate] = useState(initial?.annualInterestRatePct?.toString() ?? "");
  const [term, setTerm] = useState(initial?.termMonths?.toString() ?? "12");
  const [style, setStyle] = useState<LentLoanStyle>(initial?.repaymentStyle ?? "installments");
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayIso());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const draft: LentLoan = {
    id: "draft", borrower, principal: Number(principal), annualInterestRatePct: Number(rate), termMonths: Math.round(Number(term)),
    repaymentStyle: style, startDate, createdAt: 0,
  };
  const rows = lentSchedule(draft);
  const totalInterest = rows.reduce((t, r) => t + r.interest, 0);
  const money = (n: number) => formatMoney(n, currency);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          borrower,
          customerId: match?.id,
          borrowerContact: borrowerContact.trim() || undefined,
          guarantorName: guarantorName.trim() || undefined,
          guarantorContact: guarantorContact.trim() || undefined,
          collateral: collateral.trim() || undefined,
          collectorUid: collectorUid || undefined,
          collectorName: collectorUid ? collectorName || undefined : undefined,
          purpose: purpose.trim() || undefined,
          principal: Number(principal),
          annualInterestRatePct: Number(rate),
          termMonths: Math.round(Number(term)),
          repaymentStyle: style,
          startDate,
          notes: notes.trim() || undefined,
        }, addToDirectory && !initial && !match);
        setBusy(false);
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Who is borrowing</Label>
          <Input
            required
            list="lend-borrowers"
            value={borrower}
            onChange={(e) => {
              const v = e.target.value;
              setBorrower(v);
              // Picking someone from your customers brings their phone along, unless one was already typed.
              const hit = customers.find((c) => customerKey(c.name) === customerKey(v));
              if (hit && !borrowerContact.trim() && hit.contact) setBorrowerContact(hit.contact);
              if (hit && !guarantorName.trim() && hit.guarantorName) setGuarantorName(hit.guarantorName);
              if (hit && !guarantorContact.trim() && hit.guarantorContact) setGuarantorContact(hit.guarantorContact);
            }}
            placeholder="e.g. Nimal Perera"
          />
          <datalist id="lend-borrowers">{customers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          {match && <div className="text-xs text-muted mt-1">One of your customers.</div>}
        </Field>
        <Field><Label>What is it for (optional)</Label><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. stock advance, equipment" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field><Label>Amount lent</Label><Input required type="number" min="0" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></Field>
        <Field><Label>Interest, % a year</Label><Input required type="number" min="0" max="1000" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 18" /></Field>
        <Field><Label>Monthly payments</Label><Input required type="number" min="1" max="600" step="1" value={term} onChange={(e) => setTerm(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field><Label>How they repay</Label>
          <Select value={style} onChange={(e) => setStyle(e.target.value as LentLoanStyle)}>
            {(Object.keys(LENT_STYLE_LABELS) as LentLoanStyle[]).map((k) => <option key={k} value={k}>{LENT_STYLE_LABELS[k]}</option>)}
          </Select>
        </Field>
        <Field><Label>Date the money was handed over</Label><Input required type="date" max={todayIso()} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
      </div>
      <div className="rounded-md border border-line bg-panel2/40 px-3 py-3 space-y-3">
        <div className="text-sm font-medium">Borrower record (optional)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Their phone or email</Label><Input value={borrowerContact} onChange={(e) => setBorrowerContact(e.target.value)} placeholder="So you can remind them in one tap" /></Field>
          <Field><Label>What backs the loan</Label><Input value={collateral} onChange={(e) => setCollateral(e.target.value)} placeholder="e.g. gold chain, lorry WP-1234, post-dated cheques" /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Guarantor</Label><Input value={guarantorName} onChange={(e) => setGuarantorName(e.target.value)} /></Field>
          <Field><Label>Guarantor phone</Label><Input value={guarantorContact} onChange={(e) => setGuarantorContact(e.target.value)} /></Field>
        </div>
        {collectorChoices.length > 0 && (
          <Field>
            <Label>Who collects it</Label>
            <CollectorSelect value={collectorUid} onChange={(uid, name) => { setCollectorUid(uid); setCollectorName(name); }} choices={collectorChoices} emptyLabel="Nobody assigned (I chase it myself)" />
          </Field>
        )}
        {!initial && !match && borrower.trim() && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={addToDirectory} onChange={(e) => setAddToDirectory(e.target.checked)} />
            Also add {borrower.trim()} to my customers
          </label>
        )}
      </div>
      <Field><Label>Notes (optional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. agreement date, anything else worth remembering" /></Field>

      {rows.length > 0 && (
        <div className="rounded-md border border-line bg-panel2 px-3 py-2.5 text-sm space-y-0.5">
          {style === "installments"
            ? <div>They pay <span className="num font-medium">{money(rows[0].payment)}</span> a month for {rows.length} months.</div>
            : <div>They pay <span className="num font-medium">{money(rows[0].interest)}</span> interest a month, and the full {money(draft.principal)} on the last payment.</div>}
          <div className="text-muted">You would earn about {money(totalInterest)} in interest and collect {money(draft.principal + totalInterest)} in all.</div>
        </div>
      )}
      <div className="text-[11px] text-muted -mt-2">
        {initial ? "Changing the amount, rate, term or date re-works the interest on every payment already recorded." : "This takes the amount out of your cash on that date. It comes back as the borrower pays."}
        {hasEntries && initial ? " This loan has payments recorded, so only terms that still fit them are accepted." : ""}
      </div>
      <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
        <div>{onDelete && <Button type="button" variant="danger" onClick={onDelete}>Delete</Button>}</div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </form>
  );
}

function TxnForm({ summary, txns, kind, money, onSave, onCancel }: {
  summary: LentLoanSummary;
  txns: LentLoanTxn[];
  kind: LentLoanTxnKind;
  money: (n: number) => string;
  onSave: (v: { date: string; amount: number; notes?: string; collectedByUid?: string; collectedByName?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const loan = summary.loan;
  const isRepayment = kind === "repayment";
  const collectorChoices = useCollectorChoices(loan.collectorUid, loan.collectorName);
  const [collectorUid, setCollectorUid] = useState(loan.collectorUid ?? "");
  const [collectorName, setCollectorName] = useState(loan.collectorName ?? "");
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const at = useMemo(() => summarizeLentLoan(loan, txns, date), [loan, txns, date]);
  const amt = Number(amount);
  const valid = Number.isFinite(amt) && amt > 0;
  const problem = valid ? validateLentTxn(loan, txns, { kind, date, amount: amt }, todayIso()) : null;
  const preview = useMemo(() => {
    if (!valid || problem) return null;
    const probe: LentLoanTxn = { id: "__probe__", loanId: loan.id, kind, date, amount: amt, createdAt: Number.MAX_SAFE_INTEGER };
    const after = summarizeLentLoan(loan, [...txns, probe], date);
    return { interest: after.interestReceived - at.interestReceived, principal: after.principalReceived - at.principalReceived, left: after.owedTotal };
  }, [valid, problem, loan, txns, kind, date, amt, at]);

  const dueNow = at.overdueAmount > 0.5 ? at.overdueAmount : at.nextDueAmount ?? 0;
  const settle = settleInFullAmount(loan, txns, date);
  const round2 = (n: number) => String(Math.round(n * 100) / 100);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || problem) return;
        setBusy(true);
        await onSave({
          date, amount: Math.round(amt * 100) / 100, notes: notes.trim() || undefined,
          ...(isRepayment && collectorUid ? { collectedByUid: collectorUid, collectedByName: collectorName || undefined } : {}),
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <div className="text-sm text-muted">
        {loan.borrower} owes <span className="num text-fg">{money(at.principalOutstanding)}</span>
        {at.accruedInterest > 0.5 ? <> plus <span className="num text-fg">{money(at.accruedInterest)}</span> interest</> : null} on {formatDate(date)}.
        {at.overdueAmount > 0.5 ? <> <span className="text-bad">{money(at.overdueAmount)} of it is late.</span></> : null}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field><Label>Date</Label><Input required type="date" min={loan.startDate} max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field><Label>{isRepayment ? "Amount received" : "Principal to write off"}</Label><Input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap gap-2 -mt-2">
        {isRepayment && dueNow > 0.5 && <button type="button" onClick={() => setAmount(round2(dueNow))} className="text-xs px-2.5 py-1.5 rounded border border-line text-amber-soft hover:bg-panel2 min-h-[36px]">{at.overdueAmount > 0.5 ? "Amount late" : "Next payment"}: {money(dueNow)}</button>}
        {isRepayment && settle > 0.5 && <button type="button" onClick={() => setAmount(round2(settle))} className="text-xs px-2.5 py-1.5 rounded border border-line text-amber-soft hover:bg-panel2 min-h-[36px]">Settle in full: {money(settle)}</button>}
        {!isRepayment && at.principalOutstanding > 0.5 && <button type="button" onClick={() => setAmount(round2(at.principalOutstanding))} className="text-xs px-2.5 py-1.5 rounded border border-line text-amber-soft hover:bg-panel2 min-h-[36px]">Everything still owed: {money(at.principalOutstanding)}</button>}
      </div>
      {isRepayment && collectorChoices.length > 0 && (
        <Field>
          <Label>Collected by (optional)</Label>
          <CollectorSelect value={collectorUid} onChange={(uid, name) => { setCollectorUid(uid); setCollectorName(name); }} choices={collectorChoices} emptyLabel="Me (whoever is recording this)" />
        </Field>
      )}
      <Field><Label>Notes (optional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isRepayment ? "e.g. bank transfer, cash, cheque no." : "e.g. borrower cannot be reached"} /></Field>
      {problem && <div className="text-sm text-bad">{problem}</div>}
      {preview && isRepayment && (
        <div className="rounded-md border border-line bg-panel2 px-3 py-2.5 text-sm space-y-0.5">
          <div>Of this, <span className="num font-medium">{money(preview.interest)}</span> is interest (your profit) and <span className="num font-medium">{money(preview.principal)}</span> pays back what you lent.</div>
          <div className="text-muted">{preview.left < 0.5 ? "That clears the loan." : `They would still owe ${money(preview.left)}.`}</div>
        </div>
      )}
      {preview && !isRepayment && (
        <div className="rounded-md border border-bad/30 bg-bad/5 px-3 py-2.5 text-sm">
          This is a loss of <span className="num font-medium">{money(amt)}</span> in the month of {formatDate(date)}. No cash moves, and any unpaid interest on a fully written-off loan is dropped. You can undo it by deleting the entry.
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy || !valid || !!problem}>{busy ? "Saving…" : isRepayment ? "Record payment" : "Write off"}</Button>
      </div>
    </form>
  );
}

function LoanDetail({ s, txns, money, canEdit, onDeleteTxn }: {
  s: LentLoanSummary;
  txns: LentLoanTxn[];
  money: (n: number) => string;
  canEdit: boolean;
  onDeleteTxn: (id: string) => Promise<void>;
}) {
  const loan = s.loan;
  const { collectionNotes } = useData();
  const diary = collectionNotes
    .filter((n) => n.subjectKind === "lent_loan" && n.subjectKey === loan.id)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  const sorted = [...txns].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  const Row = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="flex justify-between gap-3 text-sm py-1"><span className="text-muted">{label}</span><span className={`num text-right ${tone ?? ""}`}>{value}</span></div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge s={s} />
        <span className="text-xs text-muted">{loan.purpose ? `${loan.purpose} · ` : ""}{loan.annualInterestRatePct}% a year · {LENT_STYLE_LABELS[loan.repaymentStyle ?? "installments"].toLowerCase()}</span>
      </div>
      {(loan.borrowerContact || loan.guarantorName || loan.guarantorContact || loan.collateral || loan.collectorName) && (
        <div className="rounded-md border border-line bg-panel2/40 px-3 py-2 text-sm divide-y divide-line">
          {loan.borrowerContact && <Row label="Borrower contact" value={loan.borrowerContact} />}
          {(loan.guarantorName || loan.guarantorContact) && <Row label="Guarantor" value={[loan.guarantorName, loan.guarantorContact].filter(Boolean).join(" · ")} />}
          {loan.collateral && <Row label="Backed by" value={loan.collateral} />}
          {loan.collectorName && <Row label="Collector" value={loan.collectorName} />}
        </div>
      )}
      <div className="divide-y divide-line">
        <Row label={`Lent on ${formatDate(loan.startDate)}`} value={money(loan.principal)} />
        <Row label="Principal still owed" value={money(s.principalOutstanding)} />
        <Row label="Interest owed, not paid yet" value={money(s.accruedInterest)} />
        <Row label="Interest received so far" value={money(s.interestReceived)} tone="text-good" />
        <Row label="Principal paid back" value={money(s.principalReceived)} />
        {s.writtenOff > 0.5 && <Row label="Written off" value={money(s.writtenOff)} tone="text-bad" />}
        {s.overdueAmount > 0.5 && <Row label={`Late (${s.daysOverdue} days)`} value={money(s.overdueAmount)} tone="text-bad" />}
        {s.endDate && <Row label="Final payment due" value={formatDate(s.endDate)} />}
        {s.interestStillToEarn > 0.5 && <Row label="Interest still to earn, if paid as agreed" value={money(s.interestStillToEarn)} />}
      </div>
      {s.future.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted mb-1">Coming up, if paid as agreed</div>
          <div className="divide-y divide-line">
            {s.future.slice(0, 6).map((f) => (
              <div key={f.date} className="flex justify-between gap-3 text-sm py-1.5">
                <span>{formatDate(f.date)}</span>
                <span className="num text-right">{money(f.total)}<span className="text-xs text-muted"> · {money(f.interest)} interest</span></span>
              </div>
            ))}
          </div>
          {s.future.length > 6 && <div className="text-xs text-muted mt-1">and {s.future.length - 6} more payments.</div>}
        </div>
      )}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted mb-1">What has been recorded</div>
        {sorted.length === 0 ? (
          <div className="text-sm text-muted">Nothing yet.</div>
        ) : (
          <div className="divide-y divide-line">
            {sorted.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 py-1.5 text-sm">
                <div className="min-w-0"><Badge tone={t.kind === "repayment" ? "good" : "amber"}>{t.kind === "repayment" ? "Received" : "Written off"}</Badge> <span className="text-muted ml-1">{formatDate(t.date)}{t.collectedByName ? ` · collected by ${t.collectedByName}` : ""}{t.notes ? ` · ${t.notes}` : ""}</span></div>
                <div className="text-right shrink-0"><span className="num">{money(t.amount)}</span>{canEdit && <button onClick={() => onDeleteTxn(t.id)} className="block ml-auto text-xs text-muted hover:text-bad min-h-[36px]">Delete</button>}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {diary.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted mb-1">Contact diary</div>
          <div className="divide-y divide-line">
            {diary.slice(0, 8).map((n) => (
              <div key={n.id} className="py-1.5 text-sm">
                <div><span className="text-muted">{formatDate(n.date)}</span> · {CHANNEL_LABELS[n.channel]} · {OUTCOME_LABELS[n.outcome]}</div>
                {(n.promisedDate || n.nextFollowUpDate || n.note) && (
                  <div className="text-xs text-muted">
                    {n.promisedDate ? `Promised ${formatDate(n.promisedDate)}${n.promisedAmount ? ` (${money(n.promisedAmount)})` : ""}. ` : ""}
                    {n.nextFollowUpDate ? `Try again ${formatDate(n.nextFollowUpDate)}. ` : ""}
                    {n.note ?? ""}
                    {n.createdByName ? ` — ${n.createdByName}` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {loan.notes && <div className="text-xs text-muted">Notes: {loan.notes}</div>}
    </div>
  );
}
