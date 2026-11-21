"use client";

// Mileage: a log of business trips by vehicle, with optional odometer readings. A memo beside the books: the cost shown is distance
// times a rate you type, an estimate of what the driving cost, and it is never posted as an expense.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import { odometerNotes, summarizeMonth, tripCost, tripKm, type TripInput } from "@/lib/mileage";
import type { Trip } from "@/lib/types";
import { Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Stat, Textarea } from "@/components/ui";

const BLANK = (today: string): TripInput => ({ date: today, vehicle: "", purpose: "", from: "", to: "", notes: "" });

export default function MileagePage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const { trips, settings, loading, addTrip, updateTrip, deleteTrip } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const canWrite = can(role, "manage:collections");
  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [form, setForm] = useState<TripInput>(BLANK(today));
  const [busy, setBusy] = useState(false);
  const money = (n: number) => formatMoney(n, currency);

  const summary = useMemo(() => summarizeMonth(trips, month), [trips, month]);
  const notes = useMemo(() => odometerNotes(trips), [trips]);
  const rows = useMemo(() => trips.filter((t) => t.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)), [trips, month]);
  const vehicles = useMemo(() => [...new Set(trips.map((t) => t.vehicle))].sort(), [trips]);
  const lastRate = useMemo(() => trips.find((t) => t.ratePerKm)?.ratePerKm, [trips]);

  function openNew() {
    setEditing(null);
    setForm({ ...BLANK(today), ratePerKm: lastRate });
    setFormOpen(true);
  }
  function openEdit(t: Trip) {
    setEditing(t);
    setForm({ date: t.date, vehicle: t.vehicle, purpose: t.purpose, from: t.from ?? "", to: t.to ?? "", startOdometer: t.startOdometer, endOdometer: t.endOdometer, km: t.startOdometer === undefined ? t.km : undefined, ratePerKm: t.ratePerKm, notes: t.notes ?? "" });
    setFormOpen(true);
  }
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const shownKm = tripKm(form);

  async function save() {
    setBusy(true);
    try {
      if (editing) await updateTrip(editing.id, form);
      else await addTrip(form);
      toast.success(editing ? "Trip saved" : "Trip logged");
      setFormOpen(false);
    } catch (err) {
      toast.error("Couldn't save the trip", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function remove(t: Trip) {
    if (!window.confirm(`Delete the ${t.date} trip in ${t.vehicle}? This cannot be undone.`)) return;
    try {
      await deleteTrip(t.id);
      toast.success("Trip deleted");
    } catch (err) {
      toast.error("Couldn't delete the trip", toastableErrorMessage(err));
    }
  }

  if (guardLoading || !allowed) return null;
  return (
    <>
      <PageHeader title="Mileage" action={canWrite ? <Button onClick={openNew}>+ Log a trip</Button> : undefined} />
      <div className="text-xs text-muted mb-4">
        A log of business trips by vehicle, with odometer readings if you keep them. The cost is distance times the rate you type, an estimate of what the driving cost.
        It is not posted as an expense, so it cannot double-count fuel or repairs you already recorded.
      </div>
      <div className="flex items-center gap-2 mb-3">
        <Label>Month</Label>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value || today.slice(0, 7))} className="max-w-[10rem]" />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Trips" value={String(summary.trips)} />
        <Stat label="Distance" value={`${summary.km.toLocaleString("en-US")} km`} />
        <Stat label="Estimated running cost" value={money(summary.cost)} />
      </div>
      {summary.byVehicle.length > 1 && (
        <Card className="mb-4 !p-3.5 text-sm space-y-1">
          {summary.byVehicle.map((v) => (
            <div key={v.vehicle} className="flex justify-between"><span>{v.vehicle}</span><span className="num text-xs">{v.trips} trip{v.trips === 1 ? "" : "s"} · {v.km} km · {money(v.cost)}</span></div>
          ))}
        </Card>
      )}
      {notes.length > 0 && (
        <Card className="mb-4 !p-3.5 text-sm">
          <div className="font-medium mb-1">Odometer readings to check</div>
          {notes.slice(0, 5).map((n) => <div key={n.tripId} className="text-xs text-bad">{n.vehicle}, {n.date}: {n.message}</div>)}
        </Card>
      )}
      {!loading && rows.length === 0 ? (
        <EmptyState title="No trips this month" body="Log each business trip with its purpose and distance. Odometer readings are optional." />
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <Card key={t.id} className="!p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{t.vehicle} <span className="text-muted num">· {t.date}</span></div>
                  <div className="text-xs text-muted">{t.purpose}{t.from || t.to ? ` · ${t.from ?? "?"} to ${t.to ?? "?"}` : ""}</div>
                  {t.startOdometer !== undefined && <div className="text-xs text-muted num">Odometer {t.startOdometer} to {t.endOdometer}</div>}
                </div>
                <div className="text-right num text-sm">{t.km} km{t.ratePerKm ? <div className="text-xs text-muted">{money(tripCost(t))}</div> : null}</div>
              </div>
              {canWrite && (
                <div className="mt-2 flex gap-3 text-xs">
                  <button className="text-muted hover:text-fg" onClick={() => openEdit(t)}>Edit</button>
                  <button className="text-bad" onClick={() => remove(t)}>Delete</button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit trip" : "Log a trip"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field>
              <Label>Vehicle</Label>
              <Input list="vehicles" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} maxLength={60} />
              <datalist id="vehicles">{vehicles.map((v) => <option key={v} value={v} />)}</datalist>
            </Field>
          </div>
          <Field><Label>Business purpose</Label><Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} maxLength={200} placeholder="e.g. deliver stock to Kandy customers" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field><Label>From (optional)</Label><Input value={form.from ?? ""} onChange={(e) => setForm({ ...form, from: e.target.value })} maxLength={120} /></Field>
            <Field><Label>To (optional)</Label><Input value={form.to ?? ""} onChange={(e) => setForm({ ...form, to: e.target.value })} maxLength={120} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field><Label>Odometer start</Label><Input inputMode="decimal" value={form.startOdometer ?? ""} onChange={(e) => setForm({ ...form, startOdometer: num(e.target.value) })} /></Field>
            <Field><Label>Odometer end</Label><Input inputMode="decimal" value={form.endOdometer ?? ""} onChange={(e) => setForm({ ...form, endOdometer: num(e.target.value) })} /></Field>
            <Field><Label>Distance (km)</Label><Input inputMode="decimal" value={form.startOdometer !== undefined && form.endOdometer !== undefined ? (shownKm ?? "") : (form.km ?? "")} disabled={form.startOdometer !== undefined && form.endOdometer !== undefined} onChange={(e) => setForm({ ...form, km: num(e.target.value) })} /></Field>
          </div>
          <Field><Label>Cost per km ({currency}, optional)</Label><Input inputMode="decimal" value={form.ratePerKm ?? ""} onChange={(e) => setForm({ ...form, ratePerKm: num(e.target.value) })} /></Field>
          <Field><Label>Notes (optional)</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={300} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save trip"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
