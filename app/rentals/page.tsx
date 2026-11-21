"use client";

// Rentals: things you rent out (equipment, vehicles, rooms, tools) and get back. The rent is charged on the day it comes back,
// counting each day out, so a late return costs more on its own. Damage and any deposit refund are settled on the same screen.
// The rent, damage and refund are real money and are recorded through the sales and customer deposits the books already use.
import { useMemo, useState, type FormEvent } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import {
  MAX_RENTAL_ITEM, MAX_RENTAL_NOTES, MAX_RENTAL_PERSON, cleanRentalInput, depositHeld, isRentalOverdue, lateDays, rentalCharge,
  rentalDays, sortOpenRentals, summarizeRentals, validateRentalInput, validateReturnInput, type RentalInput, type RentalReturnInput,
} from "@/lib/rentals";
import type { PaymentMethod, Rental } from "@/lib/types";
import { Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, Stat, TableCardSkeleton, Textarea } from "@/components/ui";

export default function RentalsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const { rentals, products, settings, loading, addRental, updateRental, deleteRental, returnRental } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const canWrite = can(role, "manage:rentals");
  const canDelete = can(role, "delete:records");
  const today = todayIso();
  const money = (n: number) => formatMoney(n, currency);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Rental | null>(null);
  const [returning, setReturning] = useState<Rental | null>(null);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => summarizeRentals(rentals, today), [rentals, today]);
  const open = useMemo(() => sortOpenRentals(rentals, today), [rentals, today]);
  const back = useMemo(
    () => rentals.filter((r) => r.returnedDate).sort((a, b) => (b.returnedDate ?? "").localeCompare(a.returnedDate ?? "")).slice(0, 10),
    [rentals]
  );
  const services = useMemo(() => products.filter((p) => p.active && p.type === "service"), [products]);

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Rentals" />
        <TableCardSkeleton rows={4} cols={3} />
      </>
    );
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  async function save(input: RentalInput) {
    const err = validateRentalInput(input);
    if (err) {
      toast.error("Check this rental", err);
      return;
    }
    setBusy(true);
    try {
      const clean = cleanRentalInput(input);
      if (editing) await updateRental(editing.id, clean);
      else await addRental(clean);
      toast.success(editing ? "Rental updated" : "Rental recorded");
      setFormOpen(false);
      setEditing(null);
    } catch (e) {
      toast.error("Couldn't save the rental", toastableErrorMessage(e));
    }
    setBusy(false);
  }

  async function settle(r: Rental, input: RentalReturnInput) {
    const err = validateReturnInput(r, input, today);
    if (err) {
      toast.error("Check the return", err);
      return;
    }
    setBusy(true);
    try {
      await returnRental(r.id, input);
      const charge = rentalCharge(r, input.returnedDate);
      toast.success("Returned", `Rent of ${money(charge)} recorded.`);
      setReturning(null);
    } catch (e) {
      toast.error("Couldn't record the return", toastableErrorMessage(e));
    }
    setBusy(false);
  }

  async function remove(r: Rental) {
    if (!window.confirm("Delete this rental? This can't be undone.")) return;
    try {
      await deleteRental(r.id);
      toast.success("Rental deleted");
    } catch (e) {
      toast.error("Couldn't delete", toastableErrorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Rentals"
        action={canWrite ? <Button onClick={openNew} disabled={services.length === 0}>New rental</Button> : undefined}
      />

      <Card className="mb-6">
        <div className="text-xs text-muted">
          Record what goes out, to whom, and the rate per day. Rent is charged when it comes back, counting each day out (the day it left and the day it came back). Damage is a separate charge. A deposit is money taken up front and is not income: it is refunded on return, and any part you keep stays a customer deposit until you apply it to the damage invoice. Rented items are not stock.
        </div>
        {services.length === 0 && canWrite && (
          <div className="text-xs text-amber-soft mt-2">
            Add a service on the Products page first (for example &quot;Rental income&quot;). Rent is recorded under a service, so it does not touch stock.
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <Stat label="Out now" value={String(summary.out)} />
        <Stat label="Overdue" value={String(summary.overdue)} tone={summary.overdue > 0 ? "bad" : "good"} sub="past their due-back day" />
        <Stat label="Due in 7 days" value={String(summary.dueSoon)} />
        <Stat label="Rent charged, last 30 days" value={money(summary.chargedLast30)} sub={`${summary.returnedLast30} returned`} tone="good" />
        <Stat label="Deposits held" value={money(summary.depositsHeld)} sub="not income until applied" />
      </div>

      {rentals.length === 0 ? (
        <EmptyState
          title="Nothing rented out yet"
          body="Record an item when it goes out, so you can see who has it, when it is due back, and what the rent comes to."
          action={canWrite && services.length > 0 ? <Button onClick={openNew}>New rental</Button> : undefined}
        />
      ) : (
        <>
          <div className="text-sm font-medium mb-2">Still out</div>
          {open.length === 0 ? (
            <div className="text-xs text-muted mb-6">Everything is back.</div>
          ) : (
            <div className="space-y-2.5 mb-6">
              {open.map((r) => {
                const late = isRentalOverdue(r, today);
                const days = rentalDays(r.outDate, today);
                const held = depositHeld(r);
                return (
                  <Card key={r.id} className="!p-3.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.item}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {r.customer}
                        {r.customerContact ? ` · ${r.customerContact}` : ""}
                        {` · ${money(r.dailyRate)} a day`}
                      </div>
                      <div className={`text-xs mt-1 ${late ? "text-bad" : "text-muted"}`}>
                        Out {r.outDate} · due back {r.dueBackDate}
                        {late ? ` · overdue, ${days} day${days === 1 ? "" : "s"} so far (${money(rentalCharge(r, today))} at today's count)` : ""}
                        {held > 0 ? ` · deposit held ${money(held)}` : ""}
                      </div>
                    </div>
                    {canWrite && (
                      <div className="flex flex-wrap gap-2 mt-2.5 pt-2.5 border-t border-line">
                        <Button variant="ghost" className="text-xs" disabled={busy} onClick={() => setReturning(r)}>
                          Mark returned
                        </Button>
                        <Button variant="ghost" className="text-xs" onClick={() => { setEditing(r); setFormOpen(true); }}>
                          Edit
                        </Button>
                        {canDelete && (
                          <button onClick={() => remove(r)} className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]">
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {back.length > 0 && (
            <>
              <div className="text-sm font-medium mb-2">Recently returned</div>
              <div className="space-y-2.5">
                {back.map((r) => (
                  <Card key={r.id} className="!p-3.5">
                    <div className="text-sm font-medium truncate">{r.item}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {r.customer} · back {r.returnedDate}
                      {r.returnedDate && lateDays(r, r.returnedDate) > 0 ? ` · ${lateDays(r, r.returnedDate)} day(s) late` : ""}
                      {` · rent ${money(r.charged ?? 0)}`}
                      {r.damageCharge ? ` · damage ${money(r.damageCharge)}` : ""}
                      {r.depositRefunded ? ` · deposit refunded ${money(r.depositRefunded)}` : ""}
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} title={editing ? "Edit rental" : "New rental"}>
        <RentalForm
          key={editing?.id ?? "new"}
          initial={editing}
          services={services}
          currency={currency}
          busy={busy}
          onSave={save}
          onCancel={() => { setFormOpen(false); setEditing(null); }}
        />
      </Modal>

      <Modal open={!!returning} onClose={() => setReturning(null)} title="Mark returned">
        {returning && (
          <ReturnForm
            key={returning.id}
            rental={returning}
            today={today}
            currency={currency}
            busy={busy}
            onSave={(input) => settle(returning, input)}
            onCancel={() => setReturning(null)}
          />
        )}
      </Modal>
    </>
  );
}

function RentalForm({
  initial,
  services,
  currency,
  busy,
  onSave,
  onCancel,
}: {
  initial: Rental | null;
  services: { id: string; name: string }[];
  currency: string;
  busy: boolean;
  onSave: (v: RentalInput) => void;
  onCancel: () => void;
}) {
  const [item, setItem] = useState(initial?.item ?? "");
  const [customer, setCustomer] = useState(initial?.customer ?? "");
  const [contact, setContact] = useState(initial?.customerContact ?? "");
  const [outDate, setOutDate] = useState(initial?.outDate ?? todayIso());
  const [dueBackDate, setDueBackDate] = useState(initial?.dueBackDate ?? "");
  const [dailyRate, setDailyRate] = useState(initial?.dailyRate?.toString() ?? "");
  const [deposit, setDeposit] = useState(initial?.deposit?.toString() ?? "");
  const [incomeProductId, setIncomeProductId] = useState(initial?.incomeProductId ?? services[0]?.id ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const depositLocked = !!initial && (initial.deposit ?? 0) > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    const rate = Number(dailyRate);
    const dep = Number(deposit);
    onSave({
      item,
      customer,
      customerContact: contact || undefined,
      outDate,
      dueBackDate,
      dailyRate: rate,
      deposit: depositLocked ? undefined : dep > 0 ? dep : undefined,
      incomeProductId,
      notes: notes || undefined,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field>
        <Label>What is going out</Label>
        <Input required maxLength={MAX_RENTAL_ITEM} value={item} onChange={(e) => setItem(e.target.value)} placeholder="Generator 5 kVA, Hall B, Van 2" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Who is renting it</Label>
          <Input required maxLength={MAX_RENTAL_PERSON} value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </Field>
        <Field>
          <Label>Their phone (optional)</Label>
          <Input maxLength={MAX_RENTAL_PERSON} value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Goes out on</Label>
          <Input required type="date" value={outDate} onChange={(e) => setOutDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Due back on</Label>
          <Input required type="date" min={outDate} value={dueBackDate} onChange={(e) => setDueBackDate(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Rate per day ({currency})</Label>
          <Input required type="number" min="0" step="any" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} />
        </Field>
        <Field>
          <Label>Deposit taken ({currency}, optional)</Label>
          {depositLocked ? (
            <div className="text-xs text-muted py-2">{formatMoney(initial?.deposit ?? 0, currency)} taken. It can&apos;t be changed; delete the rental to start again.</div>
          ) : (
            <Input type="number" min="0" step="any" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          )}
        </Field>
      </div>
      <Field>
        <Label>Rent is recorded under</Label>
        <Select required value={incomeProductId} onChange={(e) => setIncomeProductId(e.target.value)}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        <Label>Notes (optional)</Label>
        <Textarea maxLength={MAX_RENTAL_NOTES} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : initial ? "Save changes" : "Record rental"}
        </Button>
      </div>
    </form>
  );
}

function ReturnForm({
  rental,
  today,
  currency,
  busy,
  onSave,
  onCancel,
}: {
  rental: Rental;
  today: string;
  currency: string;
  busy: boolean;
  onSave: (v: RentalReturnInput) => void;
  onCancel: () => void;
}) {
  const money = (n: number) => formatMoney(n, currency);
  const [returnedDate, setReturnedDate] = useState(today);
  const [damageCharge, setDamageCharge] = useState("");
  const [damageNotes, setDamageNotes] = useState("");
  const [depositRefund, setDepositRefund] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, "credit">>("cash");

  const held = depositHeld(rental);
  const damage = Math.max(0, Number(damageCharge) || 0);
  const charge = rentalCharge(rental, returnedDate || today);
  const late = lateDays(rental, returnedDate || today);
  const days = rentalDays(rental.outDate, returnedDate || today);
  // Unless the person types an amount, the refund is the deposit less any damage charged against it.
  const suggestedRefund = Math.max(0, Math.round((held - damage) * 100) / 100);
  const refundValue = depositRefund ?? String(suggestedRefund);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({
      returnedDate,
      damageCharge: damage > 0 ? damage : undefined,
      damageNotes: damageNotes || undefined,
      depositRefund: held > 0 ? Math.max(0, Number(refundValue) || 0) : undefined,
      paymentMethod,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-sm">
        <span className="font-medium">{rental.item}</span>
        <span className="text-muted"> · {rental.customer}</span>
      </div>
      <Field>
        <Label>Came back on</Label>
        <Input required type="date" min={rental.outDate} max={today} value={returnedDate} onChange={(e) => setReturnedDate(e.target.value)} />
      </Field>
      <div className="rounded-md border border-line bg-panel2 px-3 py-2.5 text-xs space-y-1">
        <div>
          {days} day{days === 1 ? "" : "s"} out at {money(rental.dailyRate)} a day: <span className="num font-medium">{money(charge)}</span> rent
        </div>
        {late > 0 && <div className="text-amber-soft">{late} day{late === 1 ? "" : "s"} past the due-back day are included.</div>}
        {held > 0 && <div>Deposit held: {money(held)}</div>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Damage charge ({currency}, optional)</Label>
          <Input type="number" min="0" step="any" value={damageCharge} onChange={(e) => { setDamageCharge(e.target.value); setDepositRefund(null); }} />
        </Field>
        <Field>
          <Label>How the rent was paid</Label>
          <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
          </Select>
        </Field>
      </div>
      {damage > 0 && (
        <Field>
          <Label>What was damaged</Label>
          <Textarea maxLength={MAX_RENTAL_NOTES} value={damageNotes} onChange={(e) => setDamageNotes(e.target.value)} />
        </Field>
      )}
      {held > 0 && (
        <Field>
          <Label>Deposit to give back ({currency})</Label>
          <Input type="number" min="0" max={held} step="any" value={refundValue} onChange={(e) => setDepositRefund(e.target.value)} />
          <div className="text-[11px] text-muted mt-1">
            Up to {money(held)}. Whatever you keep stays a customer deposit until you apply it to the damage invoice.
          </div>
        </Field>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Record return"}
        </Button>
      </div>
    </form>
  );
}
