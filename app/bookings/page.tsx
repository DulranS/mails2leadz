"use client";

// Bookings: appointments and reservations. The week at a glance, what is still to come, and the seasonal pattern once there is a
// year of history. Booking a time that clashes with another booking on the same resource is refused before anything is saved.
// Nothing is sent to the customer, and a deposit is only recorded. No figure in the books changes.
import { useMemo, useState, type FormEvent } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import BookingLinkCard from "@/components/BookingLinkCard";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import {
  BOOKING_SALE_PAYMENTS, BOOKING_STATUSES, MAX_BOOKING_NAME, MAX_BOOKING_NOTES, MAX_BOOKING_RESOURCE, MAX_BOOKING_SALE_LIST,
    MAX_BOOKING_SERVICE, bookingDeleteProblem, bookingSaleProblem, bookingStatusProblem, cleanBookingInput, clashes, demandByMonth,
    demandByWeekday, saleAmountProblem, saleDraftFor, saleOfferings, seasonalReady, summarizeBookings, validateBookingInput, weekPlan,
    type BookingInput,
  suggestBookingPrice,
} from "@/lib/bookings";
import { SALE_CHANNEL_PRESETS } from "@/lib/salesChannels";
import type { Booking, BookingStatus, Membership } from "@/lib/types";
import { membershipBalance, membershipsFor } from "@/lib/memberships";
import TablePricingCard from "@/components/TablePricingCard";
import { Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, Stat, TableCardSkeleton, Textarea } from "@/components/ui";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toInput(b: Booking): BookingInput {
  return {
    customerName: b.customerName,
    contact: b.contact,
    service: b.service,
    resource: b.resource,
    date: b.date,
    startTime: b.startTime,
    durationMin: b.durationMin,
    status: b.status,
    depositAmount: b.depositAmount,
    partySize: b.partySize,
    membershipId: b.membershipId,
    notes: b.notes,
  };
}

export default function BookingsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "staff", "accountant"]);
  const { role } = useAuth();
  const { bookings, settings, loading, addBooking, updateBooking, deleteBooking, recordBookingSale, products, memberships } = useData();
  const toast = useToast();
  const canWrite = can(role, "manage:bookings");
  const canDelete = can(role, "delete:records");
  const canSell = can(role, "manage:sales") || can(role, "create:sale");
  const today = todayIso();
  const currency = settings.currency;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => summarizeBookings(bookings, today), [bookings, today]);
  const week = useMemo(() => weekPlan(bookings, today), [bookings, today]);
  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => b.date >= today && b.status === "booked")
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [bookings, today]
  );
  const ready = useMemo(() => seasonalReady(bookings), [bookings]);

  // Done bookings still waiting for their sale: the most recent first, at most MAX_BOOKING_SALE_LIST of them.
  const toRecord = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "done" && !b.saleId && !b.membershipId && b.date <= today)
        .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
        .slice(0, MAX_BOOKING_SALE_LIST),
    [bookings, today]
  );
  const offerings = useMemo(() => saleOfferings(products), [products]);

  // The "Record as sale" form.
  const [saleFor, setSaleFor] = useState<Booking | null>(null);
  const [saleProduct, setSaleProduct] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [salePay, setSalePay] = useState<(typeof BOOKING_SALE_PAYMENTS)[number]["value"]>("cash");
  const [saleChannel, setSaleChannel] = useState("");

  if (guardLoading || !allowed) return null;
  if (loading) {
    return (
      <>
        <PageHeader title="Bookings" />
        <TableCardSkeleton rows={4} cols={3} />
      </>
    );
  }

  async function save(input: BookingInput) {
    const clean = cleanBookingInput(input);
    const problem = validateBookingInput(clean);
    if (problem) {
      toast.error("Can't save yet", problem);
      return;
    }
    if (clean.status === "booked") {
      const clash = clashes(clean, bookings, editing?.id)[0];
      if (clash) {
        toast.error(
          "That time is taken",
          `${clash.customerName} is booked ${clash.startTime} for ${clash.durationMin} minutes${clash.resource ? ` with ${clash.resource}` : ""}.`
        );
        return;
      }
    }
    setBusy(true);
    try {
      if (editing) await updateBooking(editing.id, clean);
      else await addBooking(clean);
      toast.success(editing ? "Saved" : "Booked", `${clean.customerName}, ${clean.date} ${clean.startTime}`);
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function openSale(b: Booking) {
    const first = offerings[0];
    setSaleFor(b);
    setSaleProduct(first?.id ?? "");
    const suggested = suggestBookingPrice(first, b.durationMin, { minMinutes: settings.bookingMinMinutes, blockMinutes: settings.bookingBlockMinutes, perPerson: settings.bookingPerPerson }, b.partySize);
    setSalePrice(suggested ? String(suggested.amount) : first?.defaultSellPrice !== undefined ? String(first.defaultSellPrice) : "");
    setSalePay("cash");
    setSaleChannel("");
  }

  function pickSaleProduct(id: string) {
    setSaleProduct(id);
    const p = offerings.find((o) => o.id === id);
    const suggested = saleFor ? suggestBookingPrice(p, saleFor.durationMin, { minMinutes: settings.bookingMinMinutes, blockMinutes: settings.bookingBlockMinutes, perPerson: settings.bookingPerPerson }, saleFor.partySize) : null;
    setSalePrice(suggested ? String(suggested.amount) : p?.defaultSellPrice !== undefined ? String(p.defaultSellPrice) : "");
  }

  async function recordSale() {
    if (!saleFor) return;
    const price = Number(salePrice);
    const problem =
      bookingSaleProblem(saleFor, today) ?? (saleProduct ? null : "Choose the service that was given.") ?? saleAmountProblem(price);
    if (problem) {
      toast.error("Can't record the sale", problem);
      return;
    }
    setBusy(true);
    try {
      await recordBookingSale(saleFor.id, saleDraftFor(saleFor, saleProduct, price, salePay, saleChannel));
      toast.success("Sale recorded", `${saleFor.customerName}, ${formatMoney(price, currency)}`);
      setSaleFor(null);
    } catch (err) {
      toast.error("Couldn't record the sale", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(b: Booking, status: BookingStatus) {
    const statusProblem = bookingStatusProblem(b, status);
    if (statusProblem) {
      toast.error("Can't change the status", statusProblem);
      return;
    }
    if (status === "booked") {
      // Only the slot matters for a clash; the candidate is the booking as it would be once it is booked again.
      const clash = clashes({ date: b.date, startTime: b.startTime, durationMin: b.durationMin, resource: b.resource }, bookings, b.id)[0];
      if (clash) {
        toast.error("That time is taken", `${clash.customerName} is booked ${clash.startTime} at the same time.`);
        return;
      }
    }
    try {
      await updateBooking(b.id, { ...toInput(b), status });
    } catch (err) {
      toast.error("Couldn't update", toastableErrorMessage(err));
    }
  }

  async function remove(b: Booking) {
    const problem = bookingDeleteProblem(b);
    if (problem) {
      toast.error("Can't delete", problem);
      return;
    }
    if (!window.confirm(`Delete the booking for ${b.customerName}? This can't be undone.`)) return;
    try {
      await deleteBooking(b.id);
      toast.success("Booking deleted");
    } catch (err) {
      toast.error("Couldn't delete", toastableErrorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        action={canWrite ? <Button onClick={() => { setEditing(null); setFormOpen(true); }}>New booking</Button> : undefined}
      />

      <BookingLinkCard />
      <TablePricingCard />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Stat label="This week" value={String(summary.thisWeekCount)} sub={`${summary.thisWeekHours} hours booked`} />
        <Stat label="Still to come" value={String(summary.upcomingBooked)} />
        <Stat label="Deposits held" value={formatMoney(summary.depositsHeld, currency)} />
        <Stat
          label="No-shows"
          value={summary.noShowRate === null ? "—" : `${Math.round(summary.noShowRate * 100)}%`}
          tone={summary.noShowRate !== null && summary.noShowRate >= 0.2 ? "bad" : "default"}
          sub="of finished or missed bookings"
        />
        <Stat label="Cancelled, 90 days" value={summary.cancelledRate === null ? "—" : `${Math.round(summary.cancelledRate * 100)}%`} sub="of bookings in that time" />
      </div>

      <Card className="mb-5">
        <div className="text-sm font-medium mb-3">The week from {week[0].date}</div>
        <div className="grid grid-cols-7 gap-2">
          {week.map((d) => {
            const dow = new Date(d.date + "T00:00:00Z").getUTCDay();
            const isToday = d.date === today;
            return (
              <div key={d.date} className={`rounded-md border p-2 text-center ${isToday ? "border-amber/60" : "border-line"}`}>
                <div className="text-[11px] text-muted">{WEEKDAYS[dow]}</div>
                <div className="text-xs text-muted">{d.date.slice(8)}</div>
                <div className="num text-base font-medium mt-1">{d.count}</div>
                <div className="text-[11px] text-muted">{Math.round((d.minutes / 60) * 10) / 10} h</div>
              </div>
            );
          })}
        </div>
      </Card>

      {upcoming.length === 0 ? (
        <EmptyState
          title="Nothing booked ahead"
          body="Book an appointment or reservation. A booking that clashes with another on the same resource is refused, so the same chair or person is never double-booked."
          action={canWrite ? <Button onClick={() => { setEditing(null); setFormOpen(true); }}>New booking</Button> : undefined}
        />
      ) : (
        <div className="space-y-2 mb-5">
          {upcoming.map((b) => (
            <Card key={b.id} className="!p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {b.date} · {b.startTime} · {b.customerName}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {b.service} · {b.durationMin} min{b.resource ? ` · with ${b.resource}` : ""}
                    {b.depositAmount ? ` · deposit ${formatMoney(b.depositAmount, currency)}` : ""}{b.partySize ? ` · ${b.partySize} ${b.partySize === 1 ? "person" : "people"}` : ""}{b.membershipId ? " · covered by membership" : ""}
                  </div>
                  {b.notes && <div className="text-xs text-muted mt-1 whitespace-pre-wrap">{b.notes}</div>}
                </div>
                {canWrite && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" onClick={() => setStatus(b, "done")}>Done</Button>
                    <Button variant="ghost" onClick={() => setStatus(b, "no_show")}>No-show</Button>
                    <Button variant="ghost" onClick={() => setStatus(b, "cancelled")}>Cancel</Button>
                    <Button variant="ghost" onClick={() => { setEditing(b); setFormOpen(true); }}>Edit</Button>
                    {canDelete && <Button variant="ghost" onClick={() => remove(b)}>Delete</Button>}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {canWrite && canSell && (
        <Card className="mb-5">
          <div className="text-sm font-medium mb-1">Done, not yet a sale</div>
          <div className="text-xs text-muted mb-3">
            Record a finished booking as one sale at the price charged. Nothing is posted until you record it. The most recent {MAX_BOOKING_SALE_LIST} are listed.
          </div>
          {toRecord.length === 0 ? (
            <div className="text-xs text-muted">Every finished booking has its sale recorded.</div>
          ) : (
            <div className="space-y-2">
              {toRecord.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm min-w-0">
                    {b.date} · {b.customerName} · <span className="text-muted">{b.service}</span>
                  </div>
                  <Button variant="ghost" onClick={() => openSale(b)}>Record as sale</Button>
                </div>
              ))}
            </div>
          )}
          <div className="text-[11px] text-muted mt-3">
            Limits: one sale per booking. Services only, so no stock moves. Credit sales are made on the Sales page. A deposit is not posted separately, so the sale records the full price.
          </div>
        </Card>
      )}

      {ready ? (
        <Card className="mb-5">
          <div className="text-sm font-medium mb-1">Seasonal demand</div>
          <div className="text-xs text-muted mb-3">Bookings by month and by weekday across all your history (cancelled ones left out).</div>
          <SeasonalBars labels={MONTHS} values={demandByMonth(bookings)} />
          <div className="h-3" />
          <SeasonalBars labels={WEEKDAYS} values={demandByWeekday(bookings)} />
        </Card>
      ) : (
        <div className="text-xs text-muted mb-5">The seasonal view appears once you have a full year of bookings, so one busy month never looks like a pattern.</div>
      )}

      <Modal open={saleFor !== null} onClose={() => setSaleFor(null)} title="Record as sale">
        {saleFor && (
          <div className="space-y-4">
            <div className="text-sm">
              {saleFor.customerName} · {saleFor.date} {saleFor.startTime}
              {saleFor.depositAmount ? <span className="text-muted"> · deposit {formatMoney(saleFor.depositAmount, currency)}</span> : null}
            </div>
            {offerings.length === 0 ? (
              <div className="text-sm text-muted">There is no active service to record this against. Add the service in the catalogue first, then come back.</div>
            ) : (
              <>
                <Field>
                  <Label>Service given</Label>
                  <Select value={saleProduct} onChange={(e) => pickSaleProduct(e.target.value)}>
                    {offerings.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>Price charged ({currency})</Label>
                  <Input inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
                  {(() => {
                    const hint = suggestBookingPrice(offerings.find((o) => o.id === saleProduct), saleFor.durationMin, { minMinutes: settings.bookingMinMinutes, blockMinutes: settings.bookingBlockMinutes, perPerson: settings.bookingPerPerson }, saleFor.partySize);
                    return hint ? (
                      <div className="text-xs text-muted mt-1.5">
                        Suggested from the booking length: {hint.basis} = {formatMoney(hint.amount, currency)}. Change it if this booking had a different rate.
                      </div>
                    ) : null;
                  })()}
                </Field>
                <Field>
                  <Label>Paid by</Label>
                  <Select value={salePay} onChange={(e) => setSalePay(e.target.value as typeof salePay)}>
                    {BOOKING_SALE_PAYMENTS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>How they came in (optional)</Label>
                  <Input list="booking-sale-channels" maxLength={40} value={saleChannel} onChange={(e) => setSaleChannel(e.target.value)} placeholder="Walk-in, Online, Referral…" />
                  <datalist id="booking-sale-channels">
                    {SALE_CHANNEL_PRESETS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
                <div className="text-xs text-muted">
                  This records one sale for the full price, paid in full. A deposit is not posted separately, so it is included here. Credit is recorded on the Sales page. The booking then stays Done and cannot be changed to another status.
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setSaleFor(null)}>Cancel</Button>
                  <Button onClick={recordSale} disabled={busy}>{busy ? "Recording…" : "Record sale"}</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} title={editing ? "Edit booking" : "New booking"}>
        <BookingForm
          key={editing?.id ?? "new"}
          initial={editing ? toInput(editing) : undefined}
          memberships={memberships}
          bookings={bookings}
          today={today}
          currency={currency}
          busy={busy}
          onSave={save}
          onCancel={() => { setFormOpen(false); setEditing(null); }}
        />
      </Modal>
    </>
  );
}

function SeasonalBars({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
      {labels.map((l, i) => (
        <div key={l} className="text-center">
          <div className="h-16 flex items-end justify-center">
            <div className="w-full rounded-t bg-amber/60" style={{ height: `${Math.round((values[i] / max) * 100)}%`, minHeight: values[i] > 0 ? 2 : 0 }} title={`${values[i]}`} />
          </div>
          <div className="text-[10px] text-muted mt-1">{l}</div>
          <div className="num text-[11px]">{values[i]}</div>
        </div>
      ))}
    </div>
  );
}

function BookingForm({
  initial,
  memberships,
  bookings,
  today,
  currency,
  busy,
  onSave,
  onCancel,
}: {
  initial?: BookingInput;
  memberships: Membership[];
  bookings: Booking[];
  today: string;
  currency: string;
  busy: boolean;
  onSave: (i: BookingInput) => void;
  onCancel: () => void;
}) {
  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [service, setService] = useState(initial?.service ?? "");
  const [resource, setResource] = useState(initial?.resource ?? "");
  const [date, setDate] = useState(initial?.date ?? today);
  const [startTime, setStartTime] = useState(initial?.startTime ?? "09:00");
  const [durationMin, setDurationMin] = useState(String(initial?.durationMin ?? 60));
  const [status, setStatus] = useState<BookingStatus>(initial?.status ?? "booked");
  const [deposit, setDeposit] = useState(initial?.depositAmount ? String(initial.depositAmount) : "");
  const [partySize, setPartySize] = useState(initial?.partySize ? String(initial.partySize) : "");
  const [membershipId, setMembershipId] = useState(initial?.membershipId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    const dep = deposit.trim() === "" ? undefined : Number(deposit);
    onSave({
      customerName,
      contact,
      service,
      resource,
      date,
      startTime,
      durationMin: Number(durationMin),
      status,
      depositAmount: dep,
      partySize: partySize.trim() === "" ? undefined : Number(partySize),
      membershipId: membershipId || undefined,
      notes,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Customer</Label>
          <Input required maxLength={MAX_BOOKING_NAME} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </Field>
        <Field>
          <Label>Contact (optional)</Label>
          <Input maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        <Field>
          <Label>What is booked</Label>
          <Input required maxLength={MAX_BOOKING_SERVICE} value={service} onChange={(e) => setService(e.target.value)} />
        </Field>
        <Field>
          <Label>With (person, room or chair; blank = the default lane)</Label>
          <Input maxLength={MAX_BOOKING_RESOURCE} value={resource} onChange={(e) => setResource(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field>
          <Label>Day</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Start</Label>
          <Input required type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field>
          <Label>Length</Label>
          <Select value={durationMin} onChange={(e) => setDurationMin(e.target.value)}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>{d} min</option>
            ))}
            {!DURATIONS.includes(Number(durationMin)) && <option value={durationMin}>{durationMin} min</option>}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as BookingStatus)}>
            {BOOKING_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Deposit paid in advance ({currency}, optional)</Label>
          <Input type="number" inputMode="decimal" min="0" step="0.01" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          <div className="text-[11px] text-muted mt-1">Recorded to see what is held. It is not posted to your books; take the money in Sales or Money owed as usual.</div>
        </Field>
        <Field>
          <Label>People (optional)</Label>
          <Input inputMode="numeric" maxLength={3} value={partySize} onChange={(e) => setPartySize(e.target.value)} />
        </Field>
        {memberships.length > 0 && (() => {
          const options = membershipsFor(memberships, customerName, bookings, today);
          const current = memberships.find((m) => m.id === membershipId);
          const list = current && !options.some((o) => o.id === current.id) ? [current, ...options] : options;
          return (
            <Field>
              <Label>Covered by membership (optional)</Label>
              <Select value={membershipId} onChange={(e) => setMembershipId(e.target.value)}>
                <option value="">Not covered: record a sale as usual</option>
                {list.map((m) => (
                  <option key={m.id} value={m.id}>{m.plan}: {membershipBalance(m, bookings, today).left} h left, to {m.endDate}</option>
                ))}
              </Select>
              <div className="text-xs text-muted mt-1.5">Uses the booking&apos;s hours from the membership. No sale is recorded for a covered booking.</div>
            </Field>
          );
        })()}
      </div>
      <Field>
        <Label>Notes (optional)</Label>
        <Textarea rows={2} maxLength={MAX_BOOKING_NOTES} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
