"use client";

// Memberships: a prepaid bank of included hours that bookings draw down. The fee the member paid is an ordinary sale recorded on the
// Sales page; this page counts the hours left. A booking covered by a membership has no sale to record. Nothing here posts a figure.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/format";
import { RENEWAL_WINDOW_DAYS, membershipsEndingSoon, sortMemberships, type MembershipInput } from "@/lib/memberships";
import type { Membership } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Textarea } from "@/components/ui";

const BLANK = (today: string): MembershipInput => ({ customer: "", plan: "", hours: 10, startDate: today, endDate: today, notes: "" });
const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = m - 1 + n;
  const ny = y + Math.floor(t / 12), nm = t % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
};

export default function MembershipsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const { memberships, bookings, customers, loading, addMembership, updateMembership, deleteMembership } = useData();
  const toast = useToast();
  const canWrite = can(role, "manage:collections");
  const today = todayIso();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Membership | null>(null);
  const [form, setForm] = useState<MembershipInput>(BLANK(today));
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => sortMemberships(memberships, bookings, today), [memberships, bookings, today]);
  const ending = useMemo(() => membershipsEndingSoon(memberships, bookings, today), [memberships, bookings, today]);
  const names = useMemo(() => customers.map((c) => c.name).sort((a, b) => a.localeCompare(b)), [customers]);

  function openNew() { setEditing(null); setForm({ ...BLANK(today), endDate: addMonths(today, 1) }); setFormOpen(true); }
  function openEdit(m: Membership) { setEditing(m); setForm({ customer: m.customer, plan: m.plan, hours: m.hours, startDate: m.startDate, endDate: m.endDate, notes: m.notes ?? "" }); setFormOpen(true); }
  async function save() {
    setBusy(true);
    try {
      if (editing) await updateMembership(editing.id, form); else await addMembership(form);
      toast.success(editing ? "Membership saved" : "Membership added");
      setFormOpen(false);
    } catch (err) { toast.error("Couldn't save the membership", toastableErrorMessage(err)); } finally { setBusy(false); }
  }
  async function remove(m: Membership) {
    if (!window.confirm(`Delete ${m.customer}'s membership? This cannot be undone.`)) return;
    try { await deleteMembership(m.id); toast.success("Membership deleted"); } catch (err) { toast.error("Couldn't delete it", toastableErrorMessage(err)); }
  }

  if (guardLoading || !allowed) return null;
  return (
    <>
      <PageHeader title="Memberships" action={canWrite ? <Button onClick={openNew}>+ New membership</Button> : undefined} />
      <div className="text-xs text-muted mb-4">
        A prepaid bank of included hours. Record what the member paid as an ordinary sale on the Sales page; that is when the money reaches your books. Here you count the hours.
        On a booking, choose the membership to cover it: it uses the booking&apos;s hours and has no sale to record. Unused hours lapse after the last day.
      </div>
      {ending.length > 0 && (
        <Card className="mb-4 !p-3.5">
          <div className="text-sm font-medium">Ending within {RENEWAL_WINDOW_DAYS} days ({ending.length})</div>
          <div className="text-xs text-muted">Hours not used by the end date are lost. These are the customers to contact about renewing.</div>
          <div className="mt-2 space-y-1.5">
            {ending.map(({ m, bal }) => (
              <div key={m.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate">{m.customer} · {m.plan}</span>
                <span className="num shrink-0">{bal.left} h left · ends {m.endDate}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {!loading && rows.length === 0 ? (
        <EmptyState title="No memberships yet" body="Add one for a regular customer: the hours included and the dates they can be used." />
      ) : (
        <div className="space-y-3">
          {rows.map(({ m, bal }) => (
            <Card key={m.id} className="!p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{m.customer} <span className="text-muted">· {m.plan}</span></div>
                  <div className="text-xs text-muted num">{m.startDate} to {m.endDate}</div>
                  <div className="text-xs num mt-1">{bal.hours} h included · {bal.used} used{bal.reserved > 0 ? ` · ${bal.reserved} booked` : ""} · <span className={bal.left > 0 && !bal.expired ? "text-good" : "text-muted"}>{bal.left} left</span>{bal.expired && bal.lapsed > 0 ? ` · ${bal.lapsed} lapsed` : ""}</div>
                </div>
                <Badge tone={bal.state === "active" ? "good" : "default"}>{bal.state === "active" ? "Active" : bal.state === "upcoming" ? "Starts later" : "Expired"}</Badge>
              </div>
              {canWrite && (
                <div className="mt-2 flex gap-3 text-xs">
                  <button className="text-muted hover:text-fg" onClick={() => openEdit(m)}>Edit</button>
                  <button className="text-bad" onClick={() => remove(m)}>Delete</button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit membership" : "New membership"}>
        <div className="space-y-4">
          <Field>
            <Label>Member</Label>
            <Input list="member-names" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} maxLength={120} />
            <datalist id="member-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
            <div className="text-xs text-muted mt-1.5">Spell it as on their bookings: a booking is matched to a membership by this name.</div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field><Label>Plan</Label><Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} maxLength={80} placeholder="e.g. Monthly 10 hours" /></Field>
            <Field><Label>Hours included</Label><Input inputMode="decimal" value={form.hours || ""} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field><Label>First day</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field><Label>Last day</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          </div>
          <Field><Label>Notes (optional)</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={300} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
