"use client";

import { customerIsTaxExempt } from "@/lib/tax";
import PromisedStockCard from "@/components/PromisedStockCard";
import { taxFor } from "@/lib/tax";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import { buildEstimateHtml, openPrintWindow } from "@/lib/print";
import { ShareButton } from "@/components/ShareButton";
import type { Estimate, EstimateStatus } from "@/lib/types";
import { Button, Field, Input, Label, Select, Card, Modal, PageHeader, EmptyState, Badge, Table, TableCardSkeleton, ShowMoreBar, usePagedList } from "@/components/ui";
import { InvoiceLineDraft, newLineDraft } from "@/components/QuickForms";
import { LocationField, defaultLocationId } from "@/components/LocationPicker";
import { customerDepositKey } from "@/lib/customerDeposits";
import { computeRevisionSettlement, quotesNeedingFollowUp, settlementMessage, QUOTE_CHASE_WINDOW_DAYS } from "@/lib/quoteRevision";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";

const STATUS_TONE: Record<EstimateStatus, "default" | "good" | "bad" | "amber"> = {
  draft: "default",
  sent: "amber",
  accepted: "good",
  declined: "bad",
  expired: "bad",
  converted: "good",
  revised: "default",
};

function estimateRef(id: string) {
  return `EST-${id.slice(-6).toUpperCase()}`;
}

function estimateTotal(e: Pick<Estimate, "lines">) {
  return e.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
}

export default function EstimatesPage() {
  const { role } = useAuth();
  const { estimates, products, settings, loading, leads } = useData();
  // "Make a quote" on a lead opens this page with ?lead=<id>. The id is read once, the URL is cleared, and the new quote
  // starts with that lead's customer details. The id is cleared once used, so a later "New estimate" starts blank.
  const [leadId, setLeadId] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("lead");
    if (!id) return;
    setLeadId(id);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const leadPrefill = useMemo(() => {
    if (!leadId) return null;
    const lead = leads.find((l) => l.id === leadId);
    return lead ? { customer: lead.name, customerContact: lead.contact ?? "", notes: lead.notes ?? "" } : null;
  }, [leadId, leads]);
  // The form's own copy of the pre-fill, set when the modal opens and cleared when it closes.
  const [formPrefill, setFormPrefill] = useState<{ customer: string; customerContact: string; notes: string } | null>(null);
  useEffect(() => {
    if (!leadPrefill) return;
    setLeadId(null);
    setEditing(null);
    setRevising(null);
    setFormPrefill(leadPrefill);
    setFormOpen(true);
  }, [leadPrefill]);
  const toast = useToast();
  const currency = settings.currency;
  const canWrite = can(role, "manage:sales");
  const canCreate = canWrite || can(role, "create:sale");
  const canDelete = can(role, "delete:sales");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Estimate | null>(null);
  // Set while a quote is being revised: the form then writes a new version and marks this one replaced.
  const [revising, setRevising] = useState<Estimate | null>(null);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const sorted = useMemo(() => [...estimates].sort((a, b) => (a.date < b.date ? 1 : -1)), [estimates]);
  // Quotes sent, still unanswered, expiring soon or already past their date. Hooks stay above the loading return.
  const chase = useMemo(() => quotesNeedingFollowUp(estimates, todayIso()), [estimates]);
  const estimatePage = usePagedList(sorted);

  function handlePrint(e: Estimate) {
    const items = e.lines.map((l) => ({
      name: productById.get(l.productId)?.name ?? "Item",
      qty: l.qty,
      unitPrice: l.unitPrice,
      amount: l.qty * l.unitPrice,
    }));
    openPrintWindow(
      buildEstimateHtml({
        estimateRef: estimateRef(e.id),
        items,
        taxAmount: e.lines.reduce((sum, l) => sum + taxFor(l.qty * l.unitPrice, productById.get(l.productId), settings), 0),
        customer: e.customer,
        customerContact: e.customerContact,
        issueDate: e.date,
        validUntil: e.validUntil,
        status: e.status,
        notes: e.notes,
        settings,
      })
    );
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Estimates" />
        <TableCardSkeleton rows={5} cols={5} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Estimates"
        action={
          canCreate ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              + New estimate
            </Button>
          ) : undefined
        }
      />

      {can(role, "view:products") && <PromisedStockCard />}

      {sorted.length === 0 && (
        <EmptyState
          title="No estimates yet"
          body="Send a customer a quote before you commit any stock or revenue — accept it later to turn it straight into an invoice."
          action={
            canCreate ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                + New estimate
              </Button>
            ) : undefined
          }
        />
      )}

      {canWrite && chase.length > 0 && (
        <Card className="mb-4 !p-3.5">
          <div className="text-sm font-medium">Quotes to chase ({chase.length})</div>
          <div className="text-xs text-muted mb-2.5">
            Sent, still unanswered, and expiring within {QUOTE_CHASE_WINDOW_DAYS} days or already past their date.
          </div>
          <div className="space-y-2">
            {chase.map((f) => (
              <div key={f.estimate.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate">
                    {f.estimate.customer ?? "—"} · <span className="num text-muted">{estimateRef(f.estimate.id)}</span>
                  </div>
                  <div className={`text-xs ${f.state === "expired" ? "text-bad" : "text-muted"}`}>
                    {f.state === "expired"
                      ? `Expired ${Math.abs(f.daysLeft)} day${Math.abs(f.daysLeft) === 1 ? "" : "s"} ago`
                      : f.daysLeft === 0
                      ? "Expires today"
                      : `Expires in ${f.daysLeft} day${f.daysLeft === 1 ? "" : "s"}`}
                  </div>
                </div>
                <ShareButton
                  title={`Quote ${estimateRef(f.estimate.id)}`}
                  business={settings.businessName}
                  customer={f.estimate.customer}
                  contact={f.estimate.customerContact}
                  amountLine={`Total: ${formatMoney(estimateTotal(f.estimate), currency)}`}
                  extraLines={f.estimate.validUntil ? [`Valid until: ${f.estimate.validUntil}`] : undefined}
                  label="Chase"
                  className="text-amber-soft font-medium shrink-0"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {sorted.length > 0 && (
        <>
          {/* Mobile: one card per estimate. */}
          <div className="sm:hidden space-y-2.5">
            {estimatePage.visible.map((e) => (
              <Card key={e.id} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{e.customer ?? "—"}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {estimateRef(e.id)}{e.revision && e.revision > 1 ? ` · rev ${e.revision}` : ""} · <span className="num">{e.date}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num font-medium">{formatMoney(estimateTotal(e), currency)}</div>
                    <div className="mt-1">
                      <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 text-xs">
                  <button className="text-amber-soft font-medium" onClick={() => handlePrint(e)}>
                    Print / share
                  </button>
                  <ShareButton
                    title={`Quote ${estimateRef(e.id)}`}
                    business={settings.businessName}
                    customer={e.customer}
                    contact={e.customerContact}
                    amountLine={`Total: ${formatMoney(estimateTotal(e), currency)}`}
                    extraLines={e.validUntil ? [`Valid until: ${e.validUntil}`] : undefined}
                    label="Send"
                    className="text-amber-soft font-medium"
                  />
                  {canWrite && e.status !== "converted" && (
                    <button
                      className="text-amber-soft font-medium"
                      onClick={() => {
                        setEditing(e);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </button>
                  )}
                  {canWrite && <QuoteLinkButton estimate={e} />}
                  {canWrite && <ReviseButton estimate={e} onRevise={() => {
                    setEditing(null);
                    setRevising(e);
                    setFormOpen(true);
                  }} />}
                  {canWrite && e.status === "accepted" && (
                    <ConvertButton estimate={e} onDone={() => toast.success("Converted to invoice")} />
                  )}
                  {canDelete && e.status !== "converted" && (
                    <DeleteButton estimate={e} />
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: table. */}
          <Card className="hidden sm:block !p-0 overflow-x-auto">
            <Table>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-3 font-medium">Estimate #</th>
                  <th className="py-2 px-3 font-medium">Date</th>
                  <th className="py-2 px-3 font-medium">Customer</th>
                  <th className="py-2 px-3 font-medium">Items</th>
                  <th className="py-2 px-3 font-medium text-right">Total</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 pl-3 font-medium text-right">·</th>
                </tr>
              </thead>
              <tbody>
                {estimatePage.visible.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 num">
                      {estimateRef(e.id)}
                      {e.revision && e.revision > 1 && <span className="text-muted"> · rev {e.revision}</span>}
                    </td>
                    <td className="py-2.5 px-3 num">{e.date}</td>
                    <td className="py-2.5 px-3">{e.customer ?? "—"}</td>
                    <td className="py-2.5 px-3 text-muted">
                      {e.lines.length} item{e.lines.length === 1 ? "" : "s"}
                    </td>
                    <td className="py-2.5 px-3 text-right num">{formatMoney(estimateTotal(e), currency)}</td>
                    <td className="py-2.5 px-3">
                      <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
                    </td>
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-3 text-xs">
                        <button className="text-amber-soft font-medium" onClick={() => handlePrint(e)}>
                          Print
                        </button>
                        <ShareButton
                          title={`Quote ${estimateRef(e.id)}`}
                          business={settings.businessName}
                          customer={e.customer}
                          contact={e.customerContact}
                          amountLine={`Total: ${formatMoney(estimateTotal(e), currency)}`}
                          extraLines={e.validUntil ? [`Valid until: ${e.validUntil}`] : undefined}
                          label="Send"
                          className="text-amber-soft font-medium"
                        />
                        {canWrite && e.status !== "converted" && (
                          <button
                            className="text-amber-soft font-medium"
                            onClick={() => {
                              setEditing(e);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        {canWrite && <QuoteLinkButton estimate={e} />}
                        {canWrite && <ReviseButton estimate={e} onRevise={() => {
                          setEditing(null);
                          setRevising(e);
                          setFormOpen(true);
                        }} />}
                        {canWrite && e.status === "accepted" && (
                          <ConvertButton estimate={e} onDone={() => toast.success("Converted to invoice")} />
                        )}
                        {canDelete && e.status !== "converted" && <DeleteButton estimate={e} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <ShowMoreBar shown={estimatePage.shown} total={estimatePage.total} remaining={estimatePage.remaining} onShowMore={estimatePage.showMore} onShowAll={estimatePage.showAll} noun="estimates" />
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setRevising(null);
          setFormPrefill(null);
        }}
        title={revising ? "Revise quote" : editing ? "Edit estimate" : "New estimate"}
      >
        <EstimateForm
          initial={revising ?? editing}
          isRevision={revising !== null}
          prefill={formPrefill}
          onDone={() => {
            setFormOpen(false);
            toast.success(revising ? "Revised quote saved" : editing ? "Estimate updated" : "Estimate created");
            setRevising(null);
            setFormPrefill(null);
          }}
        />
      </Modal>
    </>
  );
}

function ConvertButton({ estimate, onDone }: { estimate: Estimate; onDone: () => void }) {
  const { convertEstimateToInvoice } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="text-good font-medium disabled:opacity-50"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await convertEstimateToInvoice(estimate.id);
          onDone();
        } catch (err) {
          toast.error("Couldn't convert that estimate", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Converting…" : "Convert to invoice"}
    </button>
  );
}

// The customer link for one quote. Asks the server for a signed link (owner/manager only) and copies it. Shown only while the
// quote can still be answered (a draft or sent quote).
function QuoteLinkButton({ estimate }: { estimate: Estimate }) {
  const { user, businessId } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (estimate.status !== "draft" && estimate.status !== "sent") return null;
  return (
    <button
      className="text-amber-soft font-medium disabled:opacity-50"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          if (!user) throw new Error("Sign in again to create a link.");
          const idToken = await user.getIdToken();
          const res = await fetch("/api/quotes/link", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${idToken}`,
              ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}),
            },
            body: JSON.stringify({ estimateId: estimate.id }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Couldn't create the link.");
          try {
            await navigator.clipboard.writeText(String(data.url));
            toast.success("Customer link copied", `Valid for ${data.validDays} days. Paste it into WhatsApp or email.`);
          } catch {
            toast.success("Customer link ready", String(data.url));
          }
        } catch (err) {
          toast.error("Couldn't create the link", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Creating…" : "Customer link"}
    </button>
  );
}

// Revising makes a new version and replaces this one. Hidden once a quote is converted, or already replaced.
function ReviseButton({ estimate, onRevise }: { estimate: Estimate; onRevise: () => void }) {
  if (estimate.status === "converted" || estimate.status === "revised" || estimate.supersededBy) return null;
  return (
    <button className="text-amber-soft font-medium" onClick={onRevise}>
      Revise
    </button>
  );
}

function DeleteButton({ estimate }: { estimate: Estimate }) {
  const { deleteEstimate } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="text-bad font-medium disabled:opacity-50"
      disabled={busy}
      onClick={async () => {
        if (!confirm("Delete this estimate? This can't be undone.")) return;
        setBusy(true);
        try {
          await deleteEstimate(estimate.id);
          toast.success("Estimate deleted");
        } catch (err) {
          toast.error("Couldn't delete that estimate", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}

// Create/edit form. Deliberately its own thing rather than a repurposed
// MultiItemInvoiceForm: an Estimate has no payment method, no credit
// terms, no stock/oversell checks (nothing has left the shelf yet) — just
// a customer, a validity window, and a set of priced lines.
function EstimateForm({
  initial,
  isRevision = false,
  prefill,
  onDone,
}: {
  initial: Estimate | null;
  isRevision?: boolean;
  prefill?: { customer: string; customerContact: string; notes: string } | null;
  onDone: () => void;
}) {
  const { addEstimate, updateEstimate, reviseEstimate, products, settings, customers, locations, customerDepositSummary } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const sellable = useMemo(() => products.filter((p) => p.active), [products]);

  const [customer, setCustomer] = useState(initial?.customer ?? prefill?.customer ?? "");
  const [customerContact, setCustomerContact] = useState(initial?.customerContact ?? prefill?.customerContact ?? "");
  // A revision is a new quote, so it is dated today; its validity date carries over unless changed.
  const [date, setDate] = useState(isRevision ? todayIso() : initial?.date ?? todayIso());
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [status, setStatus] = useState<EstimateStatus>(initial?.status ?? "draft");
  const [notes, setNotes] = useState(initial?.notes ?? prefill?.notes ?? "");
  const [locationId, setLocationId] = useState(initial?.locationId ?? defaultLocationId(locations));
  const [lines, setLines] = useState<InvoiceLineDraft[]>(
    initial && initial.lines.length > 0
      ? initial.lines.map((l) => ({ key: Math.random().toString(36).slice(2), productId: l.productId, qty: String(l.qty), unitPrice: String(l.unitPrice) }))
      : [newLineDraft(sellable[0]?.id ?? "")]
  );
  const [busy, setBusy] = useState(false);

  function updateLine(key: string, patch: Partial<InvoiceLineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, newLineDraft(sellable[0]?.id ?? "")]);
  }
  function removeLine(key: string) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }
  function handleProductChange(key: string, productId: string) {
    const price = sellable.find((p) => p.id === productId)?.defaultSellPrice;
    updateLine(key, { productId, unitPrice: price !== undefined ? String(price) : "" });
  }

  const parsedLines = lines
    .map((l) => ({ productId: l.productId, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0 }))
    .filter((l) => l.productId && l.qty > 0);
  const total = parsedLines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  // Revision only: what the customer already holds with us, against the revised total including tax. Money is never moved
  // here; any surplus stays a credit (see lib/quoteRevision.ts).
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const exemptCustomer = customerIsTaxExempt(customers, customer);
  const taxOnLines = parsedLines.reduce((sum, l) => sum + taxFor(l.qty * l.unitPrice, productById.get(l.productId), settings, exemptCustomer), 0);
  const heldBalance = customerDepositSummary.byCustomer.find((b) => b.key === customerDepositKey(customer))?.balance ?? 0;
  const settleNote = isRevision ? settlementMessage(computeRevisionSettlement(total + taxOnLines, heldBalance), customer) : null;

  async function handleSubmit(evt: React.FormEvent) {
    evt.preventDefault();
    if (parsedLines.length === 0) {
      toast.error("Add at least one item with a quantity and price");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        date,
        validUntil: validUntil || undefined,
        customer: customer || undefined,
        customerContact: customerContact || undefined,
        lines: parsedLines,
        notes: notes || undefined,
        locationId: locationId || undefined,
      };
      if (isRevision && initial) {
        await reviseEstimate(initial.id, payload);
      } else if (initial) {
        await updateEstimate(initial.id, { ...payload, status });
      } else {
        await addEstimate(payload);
      }
      onDone();
    } catch (err) {
      toast.error("Couldn't save that estimate", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Customer</Label>
          <Input value={customer} list="customer-directory-estimate" onChange={(e) => setCustomer(e.target.value)} />
          <datalist id="customer-directory-estimate">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </Field>
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Valid until (optional)</Label>
          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
        <LocationField value={locationId} onChange={setLocationId} label="Sold from" />
        <Field>
          <Label>Their phone / contact (optional)</Label>
          <Input value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} />
        </Field>
      </div>

      {initial && !isRevision && (
        <Field>
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as EstimateStatus)} disabled={initial.status === "converted" || initial.status === "revised"}>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="expired">Expired</option>
            {initial.status === "converted" && <option value="converted">Converted</option>}
            {initial.status === "revised" && <option value="revised">Revised</option>}
          </Select>
        </Field>
      )}

      <div className="space-y-2">
        <Label>Items</Label>
        {lines.map((l) => {
          const qty = Number(l.qty) || 0;
          const unitPrice = Number(l.unitPrice) || 0;
          return (
            <div key={l.key} className="grid grid-cols-[1fr_70px_100px_24px] gap-2 items-end">
              <Select value={l.productId} onChange={(e) => handleProductChange(l.key, e.target.value)}>
                {sellable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.type === "service" ? "(service)" : ""}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step={sellable.find((p) => p.id === l.productId)?.allowFractionalQty ? "any" : "1"}
                placeholder="Qty"
                value={l.qty}
                onChange={(e) => updateLine(l.key, { qty: e.target.value })}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Price"
                value={l.unitPrice}
                onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeLine(l.key)}
                disabled={lines.length === 1}
                className="text-muted hover:text-bad text-sm disabled:opacity-30"
                title="Remove line"
              >
                ✕
              </button>
              {qty > 0 && unitPrice >= 0 && (
                <div className="col-span-4 text-xs text-muted -mt-1 text-right">= {formatMoney(qty * unitPrice, currency)}</div>
              )}
            </div>
          );
        })}
        <button type="button" onClick={addLine} className="text-xs text-amber-soft font-medium">
          + Add another item
        </button>
      </div>

      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Terms, delivery timeline, anything the customer should know" />
      </Field>

      {settleNote && (
        <div className="rounded-md border border-line bg-panel2 px-3 py-2.5 text-sm">
          <div className="text-muted text-xs uppercase tracking-wider mb-1">Deposit already held</div>
          {settleNote}
        </div>
      )}

      <div className="rounded-md border border-line bg-panel2 px-3 py-2.5">
        <div className="flex justify-between text-sm">
          <span className="text-muted">Estimated total</span>
          <span className="num font-medium">{formatMoney(total, currency)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || total <= 0}>
          {busy ? "Saving…" : isRevision ? "Save revision" : initial ? "Save changes" : "Create estimate"}
        </Button>
      </div>
    </form>
  );
}
