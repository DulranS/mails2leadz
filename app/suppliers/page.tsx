"use client";

import { printSupplierStatement } from "@/lib/print";
import { supplierStatementLines, type SupplierStatementLine } from "@/lib/supplierStatement";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import { computeSupplierDelivery, deliveryLabel, deliveryTone, supplierKey, type SupplierDelivery } from "@/lib/supplierDelivery";
import type { Supplier } from "@/lib/types";
import SupplierCreditPanel from "@/components/SupplierCreditPanel";
import SupplierPriceWatch from "@/components/SupplierPriceWatch";
import PortalLinkButton from "@/components/PortalLinkButton";
import {
  Button,
  Card,
  Field,
  Input,
  Label,
  Modal,
  PageHeader,
  Stat,
  StatGridSkeleton,
  Table,
  TableCardSkeleton,
  EmptyState,
} from "@/components/ui";

type SupplierStats = { spent: number; billCount: number; purchaseCount: number; lastDate: string; owed: number };

const deliveryToneClass = (d: SupplierDelivery | undefined) => {
  const t = deliveryTone(d);
  return t === "good" ? "text-good" : t === "warn" ? "text-amber-soft" : t === "bad" ? "text-bad" : "text-muted";
};

// Mobile card for one supplier — same data as the desktop table below,
// never rendered at the same time. Deliberately leaner than the Customer
// equivalent: no unit-economics disclosure, since CAC/LTV/payback are
// sales-specific concepts that don't map to a supplier relationship.
function SupplierCard({
  supplier,
  stats,
  delivery,
  currency,
  canEdit,
  onEdit,
  onStatement,
}: {
  supplier: Supplier;
  stats?: SupplierStats;
  delivery?: SupplierDelivery;
  currency: string;
  canEdit: boolean;
  onEdit: () => void;
  onStatement?: () => void;
}) {
  return (
    <Card className="!p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{supplier.name}</div>
          <div className="text-xs text-muted mt-0.5 truncate">{supplier.contact || "No contact on file"}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onStatement && (
            <button onClick={onStatement} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px] px-1">
              Statement
            </button>
          )}
          {canEdit && <PortalLinkButton kind="supplier" id={supplier.id} label="Order link" />}
          {canEdit && (
            <button onClick={onEdit} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-[32px] px-1">
              Edit
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
        <div>
          <span className="text-muted">Spent </span>
          <span className="num">{formatMoney(stats?.spent ?? 0, currency)}</span>
        </div>
        <div>
          <span className="text-muted">Owed </span>
          {stats?.owed ? (
            <span className="num text-amber-soft">{formatMoney(stats.owed, currency)}</span>
          ) : (
            <span className="num text-muted">—</span>
          )}
        </div>
        <div>
          <span className="text-muted">Last </span>
          <span className="num">{stats?.lastDate || "—"}</span>
        </div>
        {deliveryLabel(delivery) && (
          <div>
            <span className="text-muted">Delivery </span>
            <span className={deliveryToneClass(delivery)}>{deliveryLabel(delivery)}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function SuppliersPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { suppliers, addSupplier, updateSupplier, deleteSupplier, purchases, purchaseOrders, expenses, payablesAging, billsPayable, settings, role, loading, supplierCreditSummary } =
    useData();
  const toast = useToast();
  const currency = settings.currency;
  const canEdit = can(role, "manage:suppliers");
  const canDelete = can(role, "delete:records");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  // The supplier whose credit panel is open (any name seen on a return, deposit or your supplier list).
  const [creditFor, setCreditFor] = useState<string | null>(null);
  const creditRows = supplierCreditSummary.bySupplier.filter((b) => Math.abs(b.balance) > 0.005 || b.deposits + b.fromReturns + b.applied + b.refunded > 0);

  // Spend, bills, and last-activity date per supplier name — matched the
  // same way Customer stats are: by lowercased name against the free-text
  // Purchase.supplier / Expense.payee fields, not a foreign key. See the
  // Supplier doc comment in lib/types.ts for why.
  const statsByName = useMemo(() => {
    const map = new Map<string, SupplierStats>();
    const key = (name: string) => name.trim().toLowerCase();
    for (const p of purchases) {
      if (!p.supplier) continue;
      const k = key(p.supplier);
      const entry = map.get(k) ?? { spent: 0, billCount: 0, purchaseCount: 0, lastDate: "", owed: 0 };
      entry.spent += p.unitCost * p.qty;
      entry.purchaseCount += 1;
      if (!entry.lastDate || p.date > entry.lastDate) entry.lastDate = p.date;
      map.set(k, entry);
    }
    for (const e of expenses) {
      if (e.kind !== "expense" || !e.payee) continue;
      const k = key(e.payee);
      const entry = map.get(k) ?? { spent: 0, billCount: 0, purchaseCount: 0, lastDate: "", owed: 0 };
      entry.spent += e.amount;
      entry.billCount += 1;
      if (!entry.lastDate || e.startDate > entry.lastDate) entry.lastDate = e.startDate;
      map.set(k, entry);
    }
    for (const line of payablesAging.lines) {
      const k = key(line.supplier);
      const entry = map.get(k) ?? { spent: 0, billCount: 0, purchaseCount: 0, lastDate: "", owed: 0 };
      entry.owed += line.amountOutstanding;
      map.set(k, entry);
    }
    for (const line of billsPayable.lines) {
      const k = key(line.payee);
      const entry = map.get(k) ?? { spent: 0, billCount: 0, purchaseCount: 0, lastDate: "", owed: 0 };
      entry.owed += line.amountOutstanding;
      map.set(k, entry);
    }
    return map;
  }, [purchases, expenses, payablesAging, billsPayable]);

  const deliveryByName = useMemo(() => computeSupplierDelivery(purchaseOrders, todayIso()), [purchaseOrders]);

  // One-page statement of what is still owed to a supplier (print / save as PDF), from the same lines as Money owed.
  const statementLinesBySupplier = useMemo(() => {
    const m = new Map<string, SupplierStatementLine[]>();
    for (const s of suppliers) m.set(s.id, supplierStatementLines(payablesAging.lines, billsPayable.lines, s.name));
    return m;
  }, [suppliers, payablesAging, billsPayable]);
  const anyStatement = [...statementLinesBySupplier.values()].some((l) => l.length > 0);
  const printStatementFor = (s: Supplier) => {
    const lines = statementLinesBySupplier.get(s.id) ?? [];
    if (lines.length === 0) return;
    printSupplierStatement(s.name, s.contact || undefined, lines, settings);
  };

  const totalOwed = useMemo(
    () => suppliers.reduce((sum, s) => sum + (statsByName.get(s.name.trim().toLowerCase())?.owed ?? 0), 0),
    [suppliers, statsByName]
  );
  const totalSpent = useMemo(
    () => suppliers.reduce((sum, s) => sum + (statsByName.get(s.name.trim().toLowerCase())?.spent ?? 0), 0),
    [suppliers, statsByName]
  );

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(s: Supplier) {
    setEditing(s);
    setModalOpen(true);
  }

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Suppliers" action={<Button disabled>+ Add supplier</Button>} />
        <StatGridSkeleton count={3} />
        <TableCardSkeleton rows={6} cols={4} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Suppliers" action={<Button onClick={openNew}>+ Add supplier</Button>} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <Stat label="Suppliers" value={suppliers.length.toString()} />
        <Stat label="Spent with them, all time" value={formatMoney(totalSpent, currency)} />
        <Stat label="You owe" value={formatMoney(totalOwed, currency)} tone={totalOwed > 0 ? "bad" : "good"} />
      </div>

      <SupplierPriceWatch />

      {(creditRows.length > 0 || (canEdit && suppliers.length > 0)) && (
        <Card className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium text-sm">Credit held with suppliers</div>
              <div className="text-xs text-muted mt-0.5">
                Credit notes you kept for a later order and deposits you paid in advance. {creditRows.length > 0 ? `${formatMoney(supplierCreditSummary.total, currency)} in all.` : ""}
              </div>
            </div>
            {canEdit && suppliers.length > 0 && (
              <select
                aria-label="Record a deposit with"
                className="text-xs bg-panel2 border border-line rounded-md px-2 py-1.5"
                value=""
                onChange={(e) => e.target.value && setCreditFor(e.target.value)}
              >
                <option value="">Record a deposit…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
          {creditRows.length > 0 && (
            <div className="mt-3 space-y-1">
              {creditRows.map((b) => (
                <div key={b.key} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-line last:border-0">
                  <div className="min-w-0 truncate font-medium">{b.supplier}</div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="num">{formatMoney(Math.max(0, b.balance), currency)}</span>
                    <button onClick={() => setCreditFor(b.supplier)} className="text-xs text-amber-soft font-medium min-h-[32px]">
                      {canEdit ? "Manage" : "View"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers yet"
          body="Add regulars here so their name shows up as a pick on the Buying and Bills forms instead of getting retyped — and slightly misspelled — every time, which quietly splits one supplier's spend and payables history in two. Every new name you type on a purchase or a bill is also added here automatically."
        />
      ) : (
        <>
          <div className="sm:hidden space-y-2.5">
            {suppliers.map((s) => (
              <SupplierCard
                key={s.id}
                supplier={s}
                stats={statsByName.get(s.name.trim().toLowerCase())}
                delivery={deliveryByName.get(supplierKey(s.name))}
                currency={currency}
                canEdit={canEdit}
                onEdit={() => openEdit(s)}
                onStatement={(statementLinesBySupplier.get(s.id)?.length ?? 0) > 0 ? () => printStatementFor(s) : undefined}
              />
            ))}
          </div>

          <Card className="hidden sm:block">
            <Table>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">Name</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Contact</th>
                  <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Purchases</th>
                  <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Bills</th>
                  <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Spent</th>
                  <th className="py-2 px-3 font-medium text-right whitespace-nowrap">You owe</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Last activity</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Delivery</th>
                  {(canEdit || anyStatement) && <th className="py-2 pl-3 font-medium text-right">·</th>}
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => {
                  const stats = statsByName.get(s.name.trim().toLowerCase());
                  return (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3 font-medium">{s.name}</td>
                      <td className="py-2.5 px-3 text-muted">{s.contact || "—"}</td>
                      <td className="py-2.5 px-3 num text-right text-muted">{stats?.purchaseCount ?? 0}</td>
                      <td className="py-2.5 px-3 num text-right text-muted">{stats?.billCount ?? 0}</td>
                      <td className="py-2.5 px-3 num text-right">{formatMoney(stats?.spent ?? 0, currency)}</td>
                      <td className="py-2.5 px-3 num text-right">
                        {stats?.owed ? (
                          <span className="text-amber-soft">{formatMoney(stats.owed, currency)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-muted">{stats?.lastDate || "—"}</td>
                      <td className={`py-2.5 px-3 whitespace-nowrap ${deliveryToneClass(deliveryByName.get(supplierKey(s.name)))}`}>
                        {deliveryLabel(deliveryByName.get(supplierKey(s.name))) ?? "—"}
                      </td>
                      {(canEdit || anyStatement) && (
                        <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                          {(statementLinesBySupplier.get(s.id)?.length ?? 0) > 0 && (
                            <button onClick={() => printStatementFor(s)} className="text-xs text-amber-soft hover:underline mr-3">
                              Statement
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => openEdit(s)} className="text-xs text-muted hover:text-fg">
                              Edit
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      <Modal open={creditFor !== null} onClose={() => setCreditFor(null)} title={creditFor ? `Credit held · ${creditFor}` : "Credit held"}>
        {creditFor !== null && <SupplierCreditPanel key={creditFor} supplier={creditFor} onDone={() => setCreditFor(null)} />}
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit supplier" : "Add supplier"}>
        <SupplierForm
          initial={editing}
          onCancel={() => setModalOpen(false)}
          onSave={async (values) => {
            try {
              if (editing) await updateSupplier(editing.id, values);
              else await addSupplier(values);
              toast.success(editing ? "Supplier updated" : "Supplier added", values.name);
              setModalOpen(false);
            } catch (err) {
              toast.error("Couldn't save", toastableErrorMessage(err));
            }
          }}
          onDelete={
            editing && canDelete
              ? async () => {
                  if (!confirm(`Remove "${editing.name}" from the directory? Past purchases and bills aren't affected.`)) return;
                  try {
                    await deleteSupplier(editing.id);
                    toast.success("Supplier removed", editing.name);
                    setModalOpen(false);
                  } catch (err) {
                    toast.error("Couldn't remove supplier", toastableErrorMessage(err));
                  }
                }
              : undefined
          }
        />
      </Modal>
    </>
  );
}

function SupplierForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Supplier | null;
  onSave: (values: Omit<Supplier, "id" | "createdAt" | "createdByUid" | "createdByName">) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [relatedParty, setRelatedParty] = useState(initial?.relatedParty ?? false);
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          name,
          contact: contact || undefined,
          notes: notes || undefined,
          relatedParty: relatedParty || undefined,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Name</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. City Electric Co." />
      </Field>
      <Field>
        <Label>Phone or email (optional)</Label>
        <Input value={contact} onChange={(e) => setContact(e.target.value)} />
      </Field>
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. payment terms, account number" />
      </Field>
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <Checkbox checked={relatedParty} onCheckedChange={setRelatedParty} className="mt-0.5" />
        <span>
          Related party
          <span className="block text-xs text-muted">A family member, a company you control or a director. Purchases from them count in the related-party red flag.</span>
        </span>
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
