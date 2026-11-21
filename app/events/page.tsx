"use client";

// Ticketed game nights and tournaments: set up an event with its seats and ticket price, sell seats (each one a normal sale
// linked to the event), and see what the night brings in against what it costs. Food and drink sold separately is not counted here.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { formatMoney, todayIso } from "@/lib/format";
import { BOOKING_SALE_PAYMENTS } from "@/lib/bookings";
import { MAX_EVENT_CAPACITY, summarizeEvent, ticketSaleDraft, ticketSaleProblem, type GameEventInput } from "@/lib/events";
import type { GameEvent, PaymentMethod } from "@/lib/types";
import TicketLinkCard from "@/components/TicketLinkCard";
import { Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, Textarea } from "@/components/ui";

const BLANK: GameEventInput & { ticketProductId: string } = {
  name: "",
  date: "",
  startTime: "19:00",
  resource: "",
  durationMin: 180,
  capacity: 20,
  ticketPrice: 0,
  ticketProductId: "",
  otherCosts: undefined,
  notes: "",
  status: "scheduled",
  onlineRequests: false,
};

export default function EventsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "staff"]);
  const { events, sales, products, settings, addEvent, updateEvent, deleteEvent, addSale, loading } = useData();
  const currency = settings.currency;
  const toast = useToast();
  const [editing, setEditing] = useState<GameEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<GameEventInput>(BLANK);
  const [busy, setBusy] = useState(false);
  const [sellFor, setSellFor] = useState<GameEvent | null>(null);
  const [buyer, setBuyer] = useState("");
  const [contact, setContact] = useState("");
  const [seats, setSeats] = useState("1");
  const [payment, setPayment] = useState<Exclude<PaymentMethod, "credit">>("cash");
  const today = todayIso();

  const services = useMemo(() => products.filter((p) => p.active && p.type === "service"), [products]);
  const serviceName = (id: string) => services.find((p) => p.id === id)?.name ?? "—";

  const rows = useMemo(
    () =>
      events.map((e) => ({
        event: e,
        summary: summarizeEvent(e, e.id, sales),
      })),
    [events, sales]
  );

  function openNew() {
    setEditing(null);
    setForm({ ...BLANK, date: today, ticketProductId: services[0]?.id ?? "" });
    setFormOpen(true);
  }
  function openEdit(e: GameEvent) {
    setEditing(e);
    setForm({
      name: e.name,
      date: e.date,
      startTime: e.startTime,
      resource: e.resource ?? "",
      durationMin: e.durationMin ?? 180,
      capacity: e.capacity,
      ticketPrice: e.ticketPrice,
      ticketProductId: e.ticketProductId,
      otherCosts: e.otherCosts,
      notes: e.notes ?? "",
      status: e.status,
      onlineRequests: e.onlineRequests ?? false,
    });
    setFormOpen(true);
  }

  async function save() {
    setBusy(true);
    try {
      if (editing) await updateEvent(editing.id, form);
      else await addEvent(form);
      toast.success(editing ? "Event saved" : "Event added");
      setFormOpen(false);
    } catch (err) {
      toast.error("Couldn't save the event", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: GameEvent) {
    if (!window.confirm(`Delete ${e.name}? This cannot be undone.`)) return;
    try {
      await deleteEvent(e.id);
      toast.success("Event deleted");
    } catch (err) {
      toast.error("Couldn't delete the event", toastableErrorMessage(err));
    }
  }

  function openSell(e: GameEvent) {
    setSellFor(e);
    setBuyer("");
    setContact("");
    setSeats("1");
    setPayment("cash");
  }

  const sellSummary = sellFor ? summarizeEvent(sellFor, sellFor.id, sales) : null;
  const seatCount = Number(seats);
  const sellProblem = sellFor && sellSummary
    ? (buyer.trim().length < 2 ? "Enter the buyer's name." : ticketSaleProblem(seatCount, sellFor.status, sellSummary.remaining))
    : null;

  async function sell() {
    if (!sellFor || sellProblem) return;
    setBusy(true);
    try {
      await addSale(
        ticketSaleDraft({
          event: sellFor,
          seats: seatCount,
          buyer,
          contact,
          paymentMethod: payment,
          date: today,
        })
      );
      toast.success(`${seatCount} seat${seatCount === 1 ? "" : "s"} sold`, `${buyer.trim()} · ${sellFor.name}`);
      setSellFor(null);
    } catch (err) {
      toast.error("Couldn't record the tickets", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (guardLoading || !allowed) return null;

  return (
    <>
      <PageHeader
        title="Events"
        action={
          <Button onClick={openNew} disabled={services.length === 0}>
            + New event
          </Button>
        }
      />
      <div className="text-xs text-muted mb-4">
        Game nights and tournaments with a set number of seats. Each seat sold is a normal sale, so it reaches the books and reports. Food and drink sold on the night are recorded separately.
      </div>

      <TicketLinkCard anyOpen={events.some((e) => e.onlineRequests === true && e.status === "scheduled")} />

      {services.length === 0 && (
        <Card className="mb-4 !p-3.5 text-sm text-muted">Add an active service in the catalogue first (for example &quot;Game night ticket&quot;); tickets are sold under a service.</Card>
      )}

      {!loading && rows.length === 0 ? (
        <EmptyState title="No events yet" body="Add a game night or a tournament with its seats and ticket price, then sell the seats here." />
      ) : (
        <div className="space-y-3">
          {rows.map(({ event: e, summary: s }) => (
            <Card key={e.id} className="!p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {e.name}
                    {e.status === "cancelled" && <span className="ml-2 text-xs text-bad">cancelled</span>}
                  </div>
                  <div className="text-xs text-muted num">
                    {e.date} · {e.startTime} · {serviceName(e.ticketProductId)} at {formatMoney(e.ticketPrice, currency)} a seat
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  {e.status === "scheduled" && s.remaining > 0 && (
                    <button className="text-amber-soft font-medium" onClick={() => openSell(e)}>Sell seats</button>
                  )}
                  <button className="text-muted hover:text-fg" onClick={() => openEdit(e)}>Edit</button>
                  {s.sold === 0 && <button className="text-bad" onClick={() => remove(e)}>Delete</button>}
                </div>
              </div>
              <div className="mt-3">
                <div className="h-2 rounded bg-panel2 overflow-hidden">
                  <div className="h-2 bg-good" style={{ width: `${s.fillPct}%` }} />
                </div>
                <div className="text-xs text-muted mt-1 num">
                  {s.sold} of {e.capacity} seats sold{s.remaining === 0 && s.sold > 0 ? " · sold out" : ""}
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">Ticket sales</dt>
                  <dd className="num">{formatMoney(s.ticketRevenue, currency)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Other costs</dt>
                  <dd className="num">{formatMoney(s.otherCosts, currency)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Net from tickets</dt>
                  <dd className={`num font-medium ${s.net < 0 ? "text-bad" : ""}`}>{formatMoney(s.net, currency)}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit event" : "New event"}>
        <div className="space-y-4">
          <Field>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Friday tournament: Catan" maxLength={120} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field>
              <Label>Start</Label>
              <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              <Input value={form.resource ?? ""} onChange={(e) => setForm({ ...form, resource: e.target.value })} maxLength={60} placeholder="Room or stage (blank = main lane)" />
              <Input inputMode="numeric" value={form.durationMin ?? 180} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })} placeholder="Runs for (minutes)" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Seats</Label>
              <Input type="number" min={1} max={MAX_EVENT_CAPACITY} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Math.floor(Number(e.target.value)) })} />
            </Field>
            <Field>
              <Label>Ticket price ({currency})</Label>
              <Input inputMode="decimal" value={form.ticketPrice || ""} onChange={(e) => setForm({ ...form, ticketPrice: Number(e.target.value) })} />
            </Field>
          </div>
          <Field>
            <Label>Sold under (service)</Label>
            <Select value={form.ticketProductId} onChange={(e) => setForm({ ...form, ticketProductId: e.target.value })}>
              {services.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Other costs for the night ({currency}, optional)</Label>
            <Input
              inputMode="decimal"
              value={form.otherCosts ?? ""}
              onChange={(e) => setForm({ ...form, otherCosts: e.target.value === "" ? undefined : Number(e.target.value) })}
              placeholder="Prizes, venue hire, extra staff"
            />
            <div className="text-xs text-muted mt-1.5">Entered for the night&apos;s result only. Not posted as an expense.</div>
          </Field>
          <Field>
            <Label>Status</Label>
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as GameEventInput["status"] })}>
              <option value="scheduled">Scheduled</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
          <Field>
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={form.onlineRequests ?? false} onChange={(e) => setForm({ ...form, onlineRequests: e.target.checked })} />
            <span>
              <span className="font-medium">Take seat requests online.</span> Shows this event on your public ticket page with its date, price and seats left. A request
              arrives as a notification for you to confirm. It is not a sale and holds no seat until you sell it.
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save event"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={sellFor !== null} onClose={() => setSellFor(null)} title="Sell seats">
        {sellFor && sellSummary && (
          <div className="space-y-4">
            <div className="text-sm">
              {sellFor.name} · <span className="num">{sellFor.date}</span> · {sellSummary.remaining} of {sellFor.capacity} seats left
            </div>
            <Field>
              <Label>Buyer&apos;s name</Label>
              <Input value={buyer} onChange={(e) => setBuyer(e.target.value)} maxLength={120} />
            </Field>
            <Field>
              <Label>Phone or email (optional)</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>Seats</Label>
                <Input type="number" min={1} max={sellSummary.remaining} value={seats} onChange={(e) => setSeats(e.target.value)} />
              </Field>
              <Field>
                <Label>Paid by</Label>
                <Select value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)}>
                  {BOOKING_SALE_PAYMENTS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="text-sm num">
              Total: {formatMoney((Number.isFinite(seatCount) ? seatCount : 0) * sellFor.ticketPrice, currency)}
            </div>
            {sellProblem && <div className="text-xs text-bad">{sellProblem}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSellFor(null)}>Cancel</Button>
              <Button onClick={sell} disabled={busy || sellProblem !== null}>{busy ? "Recording…" : "Record the sale"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
