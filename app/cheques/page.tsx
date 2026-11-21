"use client";

// Cheques: a register of cheques received and issued, including post-dated ones. A post-dated cheque is a promise, not cash, so
// this page is a memo beside the books: it never records a payment. When a cheque clears, record the payment on Money owed or
// Bills as usual. What it shows is what to bank today, what is about to go stale, what came back, and what is due out.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import {
  chequeOutlook, chequeTiming, chequeTimingLabel, nextStatuses, staleDate, summarizeCheques, transitionProblem,
  type ChequeInput, type ChequeTiming,
} from "@/lib/cheques";
import type { Cheque, ChequeStatus } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, Stat, Textarea } from "@/components/ui";

const BLANK = (today: string): ChequeInput => ({
  direction: "received", number: "", party: "", bank: "", amount: 0, chequeDate: today, entryDate: today, status: "held", notes: "",
});

const TONE: Record<ChequeTiming, "default" | "good" | "bad" | "amber"> = {
  post_dated: "default", ready: "good", going_stale: "amber", stale: "bad", with_bank: "default", needs_action: "bad", done: "default",
};

const STATUS_VERB: Record<ChequeStatus, string> = {
  held: "Hold", deposited: "Mark banked", cleared: "Mark cleared", returned: "Mark returned", cancelled: "Cancel cheque",
};

export default function ChequesPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const { cheques, settings, loading, addCheque, updateCheque, setChequeStatus, deleteCheque } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const canWrite = can(role, "manage:collections");
  const today = todayIso();
  const money = (n: number) => formatMoney(n, currency);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Cheque | null>(null);
  const [form, setForm] = useState<ChequeInput>(BLANK(today));
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"open" | "received" | "issued" | "all">("open");
  const [moving, setMoving] = useState<{ cheque: Cheque; to: ChequeStatus } | null>(null);
  const [moveDate, setMoveDate] = useState(today);
  const [moveReason, setMoveReason] = useState("");
  const [moveCharge, setMoveCharge] = useState("");

  const summary = useMemo(() => summarizeCheques(cheques, today), [cheques, today]);
  const outlook = useMemo(() => chequeOutlook(cheques, today, 4), [cheques, today]);
  const rows = useMemo(() => {
    const list = cheques
      .map((c) => ({ c, t: chequeTiming(c, today) }))
      .filter(({ c, t }) => {
        if (filter === "received") return c.direction === "received";
        if (filter === "issued") return c.direction === "issued";
        if (filter === "open") return t !== "done";
        return true;
      });
    // Needs-attention first, then by the date on the cheque.
    const rank: Record<ChequeTiming, number> = { needs_action: 0, stale: 1, going_stale: 2, ready: 3, post_dated: 4, with_bank: 5, done: 6 };
    return list.sort((a, b) => rank[a.t] - rank[b.t] || a.c.chequeDate.localeCompare(b.c.chequeDate));
  }, [cheques, today, filter]);

  function openNew(direction: "received" | "issued") {
    setEditing(null);
    setForm({ ...BLANK(today), direction });
    setFormOpen(true);
  }
  function openEdit(c: Cheque) {
    setEditing(c);
    setForm({
      direction: c.direction, number: c.number, party: c.party, bank: c.bank ?? "", amount: c.amount, chequeDate: c.chequeDate,
      entryDate: c.entryDate, status: c.status, statusDate: c.statusDate, returnReason: c.returnReason, bankCharge: c.bankCharge,
      saleId: c.saleId, notes: c.notes ?? "",
    });
    setFormOpen(true);
  }

  async function save() {
    setBusy(true);
    try {
      if (editing) await updateCheque(editing.id, form);
      else await addCheque(form);
      toast.success(editing ? "Cheque saved" : "Cheque added");
      setFormOpen(false);
    } catch (err) {
      toast.error("Couldn't save the cheque", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function startMove(cheque: Cheque, to: ChequeStatus) {
    setMoving({ cheque, to });
    setMoveDate(today);
    setMoveReason("");
    setMoveCharge("");
  }
  const moveProblem = moving
    ? transitionProblem(moving.cheque, moving.to, moveDate) ?? (moving.to === "returned" && !moveReason.trim() ? "Enter the reason the bank gave." : null)
    : null;

  async function confirmMove() {
    if (!moving || moveProblem) return;
    setBusy(true);
    try {
      await setChequeStatus(moving.cheque.id, moving.to, {
        date: moveDate,
        returnReason: moveReason,
        bankCharge: moveCharge.trim() === "" ? undefined : Number(moveCharge),
      });
      toast.success(`Cheque ${moving.cheque.number} marked ${moving.to}`);
      setMoving(null);
    } catch (err) {
      toast.error("Couldn't change the cheque", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Cheque) {
    if (!window.confirm(`Delete cheque ${c.number}? This cannot be undone.`)) return;
    try {
      await deleteCheque(c.id);
      toast.success("Cheque deleted");
    } catch (err) {
      toast.error("Couldn't delete the cheque", toastableErrorMessage(err));
    }
  }

  if (guardLoading || !allowed) return null;

  return (
    <>
      <PageHeader
        title="Cheques"
        action={
          canWrite ? (
            <div className="flex gap-2">
              <Button onClick={() => openNew("received")}>+ Cheque received</Button>
              <Button variant="ghost" onClick={() => openNew("issued")}>+ Cheque issued</Button>
            </div>
          ) : undefined
        }
      />
      <div className="text-xs text-muted mb-4">
        A register of cheques you received and wrote, including post-dated ones. A post-dated cheque is a promise, not cash, so nothing here changes your books:
        when a cheque clears, record the payment on Money owed or Bills as usual. A bank will not pay a cheque more than six months after its date.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Ready to bank" value={money(summary.readyToBank.amount)} sub={`${summary.readyToBank.count} cheque${summary.readyToBank.count === 1 ? "" : "s"}`} />
        <Stat label="Post-dated, held" value={money(summary.postDated.amount)} sub={`${summary.postDated.count} cheque${summary.postDated.count === 1 ? "" : "s"}`} />
        <Stat label="Returned, to chase" value={money(summary.returned.amount)} sub={`${summary.returned.count} cheque${summary.returned.count === 1 ? "" : "s"}`} />
        <Stat label="Written out, not cleared" value={money(summary.issuedOutstanding.amount)} sub={`${summary.issuedOutstanding.count} cheque${summary.issuedOutstanding.count === 1 ? "" : "s"}`} />
      </div>
      {(summary.goingStale.count > 0 || summary.stale.count > 0) && (
        <Card className="mb-4 !p-3.5 text-sm">
          {summary.goingStale.count > 0 && <div>{summary.goingStale.count} cheque{summary.goingStale.count === 1 ? " is" : "s are"} within two weeks of six months old ({money(summary.goingStale.amount)}). Bank {summary.goingStale.count === 1 ? "it" : "them"} now.</div>}
          {summary.stale.count > 0 && <div className="text-bad">{summary.stale.count} cheque{summary.stale.count === 1 ? " is" : "s are"} more than six months old ({money(summary.stale.amount)}) and can no longer be presented. Ask for a new cheque or another payment.</div>}
        </Card>
      )}

      <Card className="mb-4 !p-3.5">
        <div className="text-sm font-medium mb-2">Next four weeks, from cheques alone</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {outlook.map((w) => (
            <div key={w.from}>
              <div className="text-xs text-muted num">{w.from} to {w.to}</div>
              <div className="num text-good">In {money(w.inflow)}</div>
              <div className="num text-bad">Out {money(w.outflow)}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-muted mt-2">Received cheques count on the day they can be banked; issued cheques on the date written. Returned and stale cheques are not counted.</div>
      </Card>

      <div className="flex gap-2 mb-3 text-xs">
        {(["open", "received", "issued", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded border ${filter === f ? "border-amber-soft text-amber-soft" : "border-line text-muted"}`}>
            {f === "open" ? "Open" : f === "received" ? "Received" : f === "issued" ? "Issued" : "All"}
          </button>
        ))}
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyState title="No cheques here" body="Add a cheque you received or wrote out. Post-dated cheques are held until their date." />
      ) : (
        <div className="space-y-3">
          {rows.map(({ c, t }) => (
            <Card key={c.id} className="!p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {c.direction === "received" ? "From" : "To"} {c.party} <span className="text-muted num">· no. {c.number}</span>
                  </div>
                  <div className="text-xs text-muted num">
                    {money(c.amount)} · dated {c.chequeDate}{c.bank ? ` · ${c.bank}` : ""} · {c.direction === "received" ? "received" : "written"} {c.entryDate}
                  </div>
                  {t !== "done" && t !== "with_bank" && <div className="text-xs text-muted num">Stale after {staleDate(c.chequeDate)}</div>}
                  {c.status === "returned" && c.returnReason && <div className="text-xs text-bad">Returned: {c.returnReason}{c.bankCharge ? ` · bank charge ${money(c.bankCharge)}` : ""}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={TONE[t]}>{t === "done" ? (c.status === "cleared" ? "Cleared" : "Cancelled") : chequeTimingLabel(t)}</Badge>
                </div>
              </div>
              {canWrite && (
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  {nextStatuses(c.status).map((to) => (
                    <button key={to} className={to === "cancelled" || to === "returned" ? "text-bad" : "text-amber-soft font-medium"} onClick={() => startMove(c, to)}>
                      {c.status === "returned" && to === "deposited" ? "Bank it again" : STATUS_VERB[to]}
                    </button>
                  ))}
                  <button className="text-muted hover:text-fg" onClick={() => openEdit(c)}>Edit</button>
                  {c.status !== "cleared" && <button className="text-bad" onClick={() => remove(c)}>Delete</button>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit cheque" : form.direction === "received" ? "Cheque received" : "Cheque issued"}>
        <div className="space-y-4">
          <Field>
            <Label>{form.direction === "received" ? "Given by" : "Written to"}</Label>
            <Input value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} maxLength={120} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Cheque number</Label>
              <Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} maxLength={30} />
            </Field>
            <Field>
              <Label>Amount ({currency})</Label>
              <Input inputMode="decimal" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label>Date on the cheque</Label>
              <Input type="date" value={form.chequeDate} onChange={(e) => setForm({ ...form, chequeDate: e.target.value })} />
            </Field>
            <Field>
              <Label>{form.direction === "received" ? "Date received" : "Date written"}</Label>
              <Input type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} />
            </Field>
          </div>
          <Field>
            <Label>Bank (optional)</Label>
            <Input value={form.bank ?? ""} onChange={(e) => setForm({ ...form, bank: e.target.value })} maxLength={80} />
          </Field>
          {editing && (
            <Field>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ChequeStatus })}>
                <option value="held">Held</option>
                <option value="deposited">With the bank</option>
                <option value="cleared">Cleared</option>
                <option value="returned">Returned</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </Field>
          )}
          {form.status === "returned" && (
            <>
              <Field>
                <Label>Reason the bank gave</Label>
                <Input value={form.returnReason ?? ""} onChange={(e) => setForm({ ...form, returnReason: e.target.value })} maxLength={200} placeholder="e.g. insufficient funds" />
              </Field>
              <Field>
                <Label>Bank charge for the return ({currency}, optional)</Label>
                <Input inputMode="decimal" value={form.bankCharge ?? ""} onChange={(e) => setForm({ ...form, bankCharge: e.target.value === "" ? undefined : Number(e.target.value) })} />
                <div className="text-xs text-muted mt-1.5">For your records only. Record the charge as an expense if you paid it.</div>
              </Field>
            </>
          )}
          <Field>
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save cheque"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={moving !== null} onClose={() => setMoving(null)} title={moving ? `${STATUS_VERB[moving.to]}: cheque ${moving.cheque.number}` : ""}>
        {moving && (
          <div className="space-y-4">
            <Field>
              <Label>Date</Label>
              <Input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
            </Field>
            {moving.to === "returned" && (
              <>
                <Field>
                  <Label>Reason the bank gave</Label>
                  <Input value={moveReason} onChange={(e) => setMoveReason(e.target.value)} maxLength={200} placeholder="e.g. insufficient funds" />
                </Field>
                <Field>
                  <Label>Bank charge ({currency}, optional)</Label>
                  <Input inputMode="decimal" value={moveCharge} onChange={(e) => setMoveCharge(e.target.value)} />
                </Field>
              </>
            )}
            {moving.to === "cleared" && (
              <div className="text-xs text-muted">Marking it cleared does not record a payment. Record the payment on {moving.cheque.direction === "received" ? "Money owed" : "Bills"} as usual.</div>
            )}
            {moveProblem && <div className="text-xs text-bad">{moveProblem}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setMoving(null)}>Back</Button>
              <Button onClick={confirmMove} disabled={busy || moveProblem !== null}>{busy ? "Saving…" : "Confirm"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
