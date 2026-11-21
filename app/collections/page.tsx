"use client";

// Collections: everyone who owes the business money and is late (or about to be), in one ranked list, with who is
// chasing them, what they last said, and a one-tap way to nudge them. Covers customer invoices (Owed to you) and
// loans the business made (Money lent out). It works the same for a shop chasing credit customers, a distributor
// with reps on the road, and a lender chasing instalments.
//
// Management only: the WhatsApp and call buttons open the owner's own WhatsApp / phone with the words filled in.
// Nothing is sent from here, nothing is booked here (a payment is still recorded on the payment form when the
// money really arrives), and nothing connects to any outside service. See lib/collections.ts for the ranking rules.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRequireRole } from "@/lib/roleGuard";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { formatDate, formatMoney } from "@/lib/format";
import { useCollections } from "@/lib/useCollections";
import {
  CHANNEL_LABELS, OUTCOME_LABELS, UNASSIGNED_NAME, buildCollectionMessage,
  type CollectionItem, type CollectionState,
} from "@/lib/collections";
import { buildShareTargets } from "@/lib/share";
import type { ReceivableLine } from "@/lib/calculations";
import { CollectorSelect, useCollectorChoices } from "@/components/CollectorSelect";
import { LogContactForm, type ContactSubject } from "@/components/LogContactForm";
import { RecordPaymentForm } from "@/components/RecordPaymentForm";
import { Badge, Button, Card, EmptyState, Field, Label, Modal, PageHeader, Select, Stat, StatGridSkeleton, Table, TableCardSkeleton } from "@/components/ui";

const STATE_LABEL: Record<CollectionState, string> = {
  broken_promise: "Broken promise",
  follow_up_due: "Follow up today",
  untouched: "Not contacted yet",
  contacted: "Contacted",
  promised: "Promised",
  due_soon: "Due soon",
};
const STATE_TONE: Record<CollectionState, "good" | "bad" | "amber" | "default"> = {
  broken_promise: "bad", follow_up_due: "amber", untouched: "amber", contacted: "default", promised: "good", due_soon: "default",
};

function ago(days: number | null): string {
  if (days == null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

// Only a number can be called; an email contact gets no Call button.
function telHref(contact?: string): string | null {
  const c = contact?.trim();
  if (!c || c.includes("@")) return null;
  const digits = c.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 6 ? `tel:${digits}` : null;
}

export default function CollectionsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const { settings, loading, collectionNotes, updateCustomer, addCustomer, updateLentLoan, deleteCollectionNote } = useData();
  const { today, items, totals, board } = useCollections();
  const toast = useToast();
  const currency = settings.currency;
  const money = (n: number) => formatMoney(n, currency);

  const canLog = can(role, "manage:collections");
  const canPay = can(role, "create:receivablePayment");
  const canAssign = role === "owner";
  const canDeleteNote = can(role, "delete:records");
  const choices = useCollectorChoices();

  const [collector, setCollector] = useState("all"); // "all" | "none" | a uid
  const [kind, setKind] = useState<"all" | "customer" | "lent_loan">("all");
  const [showSoon, setShowSoon] = useState(true);
  const [contactFor, setContactFor] = useState<ContactSubject | null>(null);
  const [payFor, setPayFor] = useState<{ item: CollectionItem; line: ReceivableLine | null } | null>(null);

  const collectorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of choices) seen.set(c.uid, c.name);
    for (const i of items) if (i.collectorUid && !seen.has(i.collectorUid)) seen.set(i.collectorUid, i.collectorName || "Team member");
    return [...seen.entries()].map(([uid, name]) => ({ uid, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [choices, items]);

  const visible = useMemo(
    () =>
      items.filter((i) => {
        if (kind !== "all" && i.kind !== kind) return false;
        if (!showSoon && i.state === "due_soon") return false;
        if (collector === "none") return !i.collectorUid;
        if (collector !== "all") return i.collectorUid === collector;
        return true;
      }),
    [items, kind, collector, showSoon]
  );

  if (guardLoading || !allowed) return null;
  if (loading) {
    return (
      <>
        <PageHeader title="Collections" />
        <StatGridSkeleton count={4} />
        <TableCardSkeleton rows={4} cols={4} />
      </>
    );
  }

  async function assign(item: CollectionItem, uid: string, name: string) {
    try {
      if (item.kind === "lent_loan" && item.loanId) {
        await updateLentLoan(item.loanId, { collectorUid: uid || undefined, collectorName: uid ? name || undefined : undefined });
      } else if (item.customerId) {
        await updateCustomer(item.customerId, { collectorUid: uid || undefined, collectorName: uid ? name || undefined : undefined });
      } else if (uid) {
        // Not in the customer directory yet (typed freely on a sale): add them, with the collector, so it sticks.
        await addCustomer({ name: item.label, contact: item.contact, collectorUid: uid, collectorName: name || undefined });
      }
      toast.success(uid ? "Assigned" : "Unassigned", item.label);
    } catch (err) {
      toast.error("Couldn't change the collector", toastableErrorMessage(err));
    }
  }

  const recentNotes = [...collectionNotes].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)).slice(0, 12);
  const overdueItems = items.filter((i) => i.overdue > 0.5);

  const card = (it: CollectionItem) => {
    const late = it.overdue > 0.5;
    const text = buildCollectionMessage(it, settings.businessName, money);
    const targets = buildShareTargets(text, it.kind === "lent_loan" ? `Loan payment, ${it.label}` : `Payment reminder, ${it.label}`, it.contact);
    const isEmail = !!it.contact && it.contact.includes("@");
    const tel = telHref(it.contact);
    return (
      <Card key={it.key} className="!p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{it.label}</div>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <Badge tone={STATE_TONE[it.state]}>{it.state === "promised" && it.promisedDate ? `Promised ${formatDate(it.promisedDate)}` : STATE_LABEL[it.state]}</Badge>
              <Badge>{it.kind === "lent_loan" ? "Loan" : it.invoiceCount > 1 ? `${it.invoiceCount} invoices` : "Invoice"}</Badge>
              {late && it.daysOverdue > 0 && <Badge tone="bad">{it.daysOverdue} day{it.daysOverdue === 1 ? "" : "s"} late</Badge>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`num font-medium ${late ? "text-bad" : ""}`}>{money(late ? it.overdue : it.dueSoon)}</div>
            <div className="text-xs text-muted">{late ? "late" : it.nextDueDate ? `due ${formatDate(it.nextDueDate)}` : "due soon"}</div>
          </div>
        </div>

        <div className="mt-2.5 space-y-0.5 text-xs text-muted">
          <div>
            {it.contact ? <span className="text-fg">{it.contact}</span> : <span>No phone on file</span>}
            {it.outstanding - (late ? it.overdue : it.dueSoon) > 0.5 && <span> · {money(it.outstanding)} owed in all</span>}
          </div>
          <div>
            Last contact: <span className="text-fg">{ago(it.daysSinceContact)}</span>
            {it.lastNote ? ` · ${CHANNEL_LABELS[it.lastNote.channel]}, ${OUTCOME_LABELS[it.lastNote.outcome].toLowerCase()}` : ""}
            {it.lastNote?.note ? ` · “${it.lastNote.note}”` : ""}
          </div>
          {it.promisedDate && (
            <div>
              {it.promiseKept ? "Promise kept: money arrived after they promised." : <>Promised <span className="text-fg">{formatDate(it.promisedDate)}</span>{it.promisedAmount ? ` (${money(it.promisedAmount)})` : ""}{it.state === "broken_promise" ? <span className="text-bad"> · not honoured</span> : null}</>}
            </div>
          )}
          {it.followUpDate && <div>Try again <span className={it.followUpDate <= today ? "text-amber-soft" : "text-fg"}>{formatDate(it.followUpDate)}</span></div>}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {canAssign && choices.length > 0 ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted shrink-0">Collector</span>
              <div className="min-w-[10rem]">
                <CollectorSelect value={it.collectorUid ?? ""} onChange={(uid, name) => assign(it, uid, name)} choices={choices} emptyLabel="Nobody assigned" />
              </div>
            </div>
          ) : (
            <span className="text-muted">Collector: <span className="text-fg">{it.collectorName ?? "nobody assigned"}</span></span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 pt-2.5 border-t border-line">
          {it.contact && (
            <a href={isEmail ? targets.mailtoUrl : targets.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px] inline-flex items-center">
              {isEmail ? "Email reminder" : "Remind on WhatsApp"}
            </a>
          )}
          {!it.contact && (
            <a href={targets.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px] inline-flex items-center">Remind on WhatsApp</a>
          )}
          {tel && <a href={tel} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px] inline-flex items-center">Call</a>}
          {canLog && (
            <button
              onClick={() => setContactFor({ kind: it.kind, key: it.kind === "customer" ? it.label : it.subjectKey, label: it.label, suggestedAmount: late ? it.overdue : it.dueSoon })}
              className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
            >Log contact</button>
          )}
          {canPay && it.kind === "customer" && (
            <button
              onClick={() => setPayFor({ item: it, line: it.lines.length === 1 ? it.lines[0] : null })}
              className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
            >Record payment</button>
          )}
          {it.kind === "lent_loan" && (
            <Link href="/lending" className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px] inline-flex items-center">Open loan</Link>
          )}
        </div>
      </Card>
    );
  };

  return (
    <>
      <PageHeader title="Collections" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Stat label="Late" value={money(totals.overdueTotal)} tone={totals.overdueTotal > 0.5 ? "bad" : "default"} sub={totals.overdueCount > 0 ? `${totals.overdueCount} ${totals.overdueCount === 1 ? "person" : "people"} behind` : "nobody is behind"} />
        <Stat label="Needs a move today" value={String(totals.actionToday)} tone={totals.actionToday > 0 ? "bad" : "good"} sub="not contacted, or a follow-up is due" />
        <Stat label="Broken promises" value={String(totals.brokenPromises)} tone={totals.brokenPromises > 0 ? "bad" : "default"} sub="named a date and missed it" />
        <Stat label="Promised, waiting" value={money(totals.promisedAmount)} sub={totals.dueSoonTotal > 0.5 ? `plus ${money(totals.dueSoonTotal)} due this week` : "what people said they'd pay"} />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Nobody is late, and nothing falls due this week"
          body="When a customer's invoice or a borrower's payment goes past its due date, they appear here, most urgent first, with a one-tap reminder. You can note every call and promise so nobody is chased twice or forgotten."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Field>
              <Label>Who chases</Label>
              <Select value={collector} onChange={(e) => setCollector(e.target.value)}>
                <option value="all">Everyone</option>
                <option value="none">Nobody assigned</option>
                {collectorOptions.map((c) => <option key={c.uid} value={c.uid}>{c.name}</option>)}
              </Select>
            </Field>
            <Field>
              <Label>Owed by</Label>
              <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="all">Customers and borrowers</option>
                <option value="customer">Customer invoices</option>
                <option value="lent_loan">Loans I made</option>
              </Select>
            </Field>
            <label className="flex items-end pb-2 gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={showSoon} onChange={(e) => setShowSoon(e.target.checked)} />
              Include payments due this week
            </label>
          </div>

          {visible.length === 0 ? (
            <Card className="text-sm text-muted">Nothing matches those filters.</Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{visible.map(card)}</div>
          )}
        </>
      )}

      {(board.length > 0) && (
        <Card className="mt-8">
          <div className="font-medium mb-1">Field officers and collectors</div>
          <div className="text-xs text-muted mb-3">
            Who is chasing what this month. &ldquo;Collected&rdquo; counts payments credited to a person (the person who recorded it, or the one named in Collected by). {overdueItems.length > 0 ? "" : "Nothing is late right now."}
          </div>

          <div className="sm:hidden space-y-2.5">
            {board.map((r) => (
              <div key={r.uid || "none"} className="rounded-md border border-line px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium text-sm truncate">{r.name}</div>
                  <div className="num text-sm text-good shrink-0">{money(r.collectedThisMonth)}</div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted">
                  <span>Assigned {r.assigned}</span>
                  <span>Late <span className={r.overdueAmount > 0.5 ? "text-bad num" : "num"}>{money(r.overdueAmount)}</span></span>
                  {r.actionToday > 0 && <span className="text-amber-soft">{r.actionToday} to act on</span>}
                  {r.brokenPromises > 0 && <span className="text-bad">{r.brokenPromises} broken promise{r.brokenPromises === 1 ? "" : "s"}</span>}
                  <span>{r.contactsThisMonth} contact{r.contactsThisMonth === 1 ? "" : "s"} logged</span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block table-container">
            <Table>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-3 font-medium">Who</th>
                  <th className="py-2 px-3 font-medium text-right">Assigned</th>
                  <th className="py-2 px-3 font-medium text-right">Late</th>
                  <th className="py-2 px-3 font-medium text-right">To act on today</th>
                  <th className="py-2 px-3 font-medium text-right">Broken promises</th>
                  <th className="py-2 px-3 font-medium text-right">Contacts this month</th>
                  <th className="py-2 pl-3 font-medium text-right">Collected this month</th>
                </tr>
              </thead>
              <tbody>
                {board.map((r) => (
                  <tr key={r.uid || "none"} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{r.name}{r.uid === "" && <div className="text-xs text-muted font-normal">{UNASSIGNED_NAME}: nobody owns these yet</div>}</td>
                    <td className="py-2.5 px-3 text-right num">{r.assigned}</td>
                    <td className={`py-2.5 px-3 text-right num whitespace-nowrap ${r.overdueAmount > 0.5 ? "text-bad" : "text-muted"}`}>{money(r.overdueAmount)}</td>
                    <td className={`py-2.5 px-3 text-right num ${r.actionToday > 0 ? "text-amber-soft" : "text-muted"}`}>{r.actionToday}</td>
                    <td className={`py-2.5 px-3 text-right num ${r.brokenPromises > 0 ? "text-bad" : "text-muted"}`}>{r.brokenPromises}</td>
                    <td className="py-2.5 px-3 text-right num">{r.contactsThisMonth}</td>
                    <td className="py-2.5 pl-3 text-right num whitespace-nowrap text-good">{money(r.collectedThisMonth)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="text-[11px] text-muted mt-3">
            Collection by field officers is only credited when it is recorded against them. The Owner can name who collected a payment on the payment form; a team login that records its own payments is credited automatically.
          </div>
        </Card>
      )}

      {recentNotes.length > 0 && (
        <Card className="mt-6">
          <div className="font-medium mb-3">Recent contacts</div>
          <div className="divide-y divide-line">
            {recentNotes.map((n) => (
              <div key={n.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm"><span className="font-medium">{n.subjectLabel}</span> <span className="text-muted">· {CHANNEL_LABELS[n.channel]} · {OUTCOME_LABELS[n.outcome]}</span></div>
                  <div className="text-xs text-muted mt-0.5">
                    {formatDate(n.date)}
                    {n.promisedDate ? ` · promised ${formatDate(n.promisedDate)}${n.promisedAmount ? ` (${money(n.promisedAmount)})` : ""}` : ""}
                    {n.nextFollowUpDate ? ` · try again ${formatDate(n.nextFollowUpDate)}` : ""}
                    {n.createdByName ? ` · ${n.createdByName}` : ""}
                  </div>
                  {n.note && <div className="text-xs text-muted mt-0.5">{n.note}</div>}
                </div>
                {canDeleteNote && (
                  <button
                    onClick={async () => {
                      if (!confirm("Delete this diary line? It can't be edited, only removed.")) return;
                      try { await deleteCollectionNote(n.id); toast.success("Line deleted"); } catch (err) { toast.error("Couldn't delete it", toastableErrorMessage(err)); }
                    }}
                    className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[28px] shrink-0"
                  >Delete</button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={!!contactFor} onClose={() => setContactFor(null)} title="Log a contact">
        {contactFor && <LogContactForm subject={contactFor} onDone={() => setContactFor(null)} />}
      </Modal>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={payFor?.line ? "Record a payment received" : payFor ? `Which invoice did ${payFor.item.label} pay?` : ""}>
        {payFor && payFor.line && <RecordPaymentForm line={payFor.line} onDone={() => setPayFor(null)} />}
        {payFor && !payFor.line && (
          <div className="divide-y divide-line">
            {payFor.item.lines.map((l) => (
              <div key={l.saleId} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="truncate">{l.productName}</div>
                  <div className="text-xs text-muted">Sold {formatDate(l.date)} · due {formatDate(l.dueDate)}{l.daysOverdue > 0 ? ` · ${l.daysOverdue} days late` : ""}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="num text-sm">{money(l.amountOutstanding)}</span>
                  <Button onClick={() => setPayFor({ item: payFor.item, line: l })}>Pay</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
