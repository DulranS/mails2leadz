"use client";

// Spend requests, expense claims and shift changes. Anyone who works in the business can ask; an Owner or Manager decides.
// Approving records nothing in the books: a spend is still recorded on Expenses when it is paid, and a claim is paid back there.
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, Select, Textarea } from "@/components/ui";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import { REQUEST_KINDS, summarizeRequests, validateRequestInput, type RequestInput } from "@/lib/operations";
import { validatePoThreshold } from "@/lib/poApproval";
import { addIsoDays as addDaysIso } from "@/lib/operations";
import type { BusinessRequest } from "@/lib/types";

const STATUS_TONE: Record<BusinessRequest["status"], "default" | "good" | "bad" | "amber"> = {
  pending: "amber",
  approved: "good",
  declined: "bad",
  cancelled: "default",
};
const KIND_LABEL: Record<string, string> = { ...Object.fromEntries(REQUEST_KINDS.map((k) => [k.value, k.label])), payment: "Supplier payment" };

export default function RequestsPanel() {
  const { requests, settings, updateSettings, updateRequestStatus, updateRequestReimbursed } = useData();
  const { role, user } = useAuth();
  const toast = useToast();
  const currency = settings.currency;
  const canCreate = can(role, "create:request");
  const canDecide = can(role, "manage:requests");
  const isOwner = role === "owner";
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [limitDraft, setLimitDraft] = useState(settings.managerApprovalLimit?.toString() ?? "");
  const [limitBusy, setLimitBusy] = useState(false);
  const today = todayIso();
  const summary = summarizeRequests(requests, today);

  async function act(id: string, done: string, fn: () => Promise<void>) {
    setBusyId(id);
    try {
      await fn();
      toast.success(done);
    } catch (err) {
      toast.error("Couldn't update that request", toastableErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function saveLimit() {
    setLimitBusy(true);
    try {
      // An empty box means Managers can approve nothing: the owner decides every request.
      const n = limitDraft.trim() === "" ? 0 : Number(limitDraft);
      if (!Number.isFinite(n) || n < 0) throw new Error("The limit must be zero or more.");
      await updateSettings({ managerApprovalLimit: n });
      toast.success("Approval limit saved", n === 0 ? "Managers cannot approve spend or claims" : `Managers can approve up to ${formatMoney(n, currency)}`);
    } catch (err) {
      toast.error("Couldn't save the limit", toastableErrorMessage(err));
    } finally {
      setLimitBusy(false);
    }
  }

  function renderRow(r: BusinessRequest) {
    const mine = r.createdByUid === user?.uid;
    const busy = busyId === r.id;
    return (
      <Card key={r.id} className="p-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{r.title}</span>
            <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
            <Badge>{KIND_LABEL[r.kind] ?? r.kind}</Badge>
          </div>
          <div className="text-xs text-muted mt-1">
            {r.date} · {r.createdByName ?? "Unknown"}
            {typeof r.amount === "number" && (
              <>
                {" "}· <span className="num">{formatMoney(r.amount, currency)}</span>
              </>
            )}
            {r.decidedByName && r.status !== "pending" && r.status !== "cancelled" && <> · {r.status} by {r.decidedByName}</>}
            {r.reimbursedAt && <> · paid back {new Date(r.reimbursedAt).toISOString().slice(0, 10)}</>}
          </div>
          {r.details && <div className="text-xs text-muted mt-1 whitespace-pre-wrap">{r.details}</div>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
          {r.status === "pending" && canDecide && (
            <>
              <button disabled={busy} onClick={() => act(r.id, "Approved", () => updateRequestStatus(r.id, "approved"))} className="text-xs text-good hover:underline min-h-[32px] disabled:opacity-50">
                Approve
              </button>
              <button disabled={busy} onClick={() => act(r.id, "Declined", () => updateRequestStatus(r.id, "declined"))} className="text-xs text-bad hover:underline min-h-[32px] disabled:opacity-50">
                Decline
              </button>
            </>
          )}
          {r.status === "pending" && mine && (
            <button disabled={busy} onClick={() => act(r.id, "Withdrawn", () => updateRequestStatus(r.id, "cancelled"))} className="text-xs text-muted hover:text-fg min-h-[32px] disabled:opacity-50">
              Withdraw
            </button>
          )}
          {r.kind === "claim" && r.status === "approved" && !r.reimbursedAt && canDecide && (
            <button disabled={busy} onClick={() => act(r.id, "Marked as paid back", () => updateRequestReimbursed(r.id))} className="text-xs text-amber-soft hover:underline min-h-[32px] disabled:opacity-50">
              Mark paid back
            </button>
          )}
        </div>
      </Card>
    );
  }

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending").slice(0, 30);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted">
          {summary.pending} waiting
          {summary.pendingValue > 0 && (
            <>
              {" "}· <span className="num">{formatMoney(summary.pendingValue, currency)}</span> in spend and claims
            </>
          )}
          {summary.oldestPendingDays !== null && summary.pending > 0 && <> · oldest {summary.oldestPendingDays} day{summary.oldestPendingDays === 1 ? "" : "s"}</>}
          {canDecide && summary.claimsToReimburse > 0 && <> · {summary.claimsToReimburse} claim{summary.claimsToReimburse === 1 ? "" : "s"} to pay back</>}
        </div>
        {canCreate && <Button onClick={() => setFormOpen(true)}>+ New request</Button>}
      </div>

      {isOwner && (
        <Card className="p-4">
          <div className="text-sm font-medium">Manager approval limit</div>
          <div className="text-xs text-muted mt-1">
            Managers can approve spend requests and expense claims up to this amount. Above it, only you can decide. Leave empty or 0 to decide everything yourself.
            Shift changes have no amount and any manager can decide them.
          </div>
          <div className="flex items-end gap-2 mt-3">
            <Field className="flex-1 max-w-[220px]">
              <Label>Limit ({currency})</Label>
              <Input type="number" min="0" step="0.01" value={limitDraft} onChange={(e) => setLimitDraft(e.target.value)} placeholder="0" />
            </Field>
            <Button variant="ghost" onClick={saveLimit} disabled={limitBusy}>
              {limitBusy ? "Saving…" : "Save limit"}
            </Button>
          </div>
        </Card>
      )}

      {isOwner && <PoApprovalCard />}

      {requests.length === 0 ? (
        <EmptyState
          title="No requests yet"
          body="Ask before you spend, claim money you paid yourself, or request a shift change. Owners and managers approve or decline each one here."
          action={canCreate ? <Button onClick={() => setFormOpen(true)}>+ New request</Button> : undefined}
        />
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted">Waiting for a decision ({pending.length})</div>
              {pending.map(renderRow)}
            </div>
          )}
          {decided.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted">Decided</div>
              {decided.map(renderRow)}
            </div>
          )}
        </>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New request">
        {formOpen && <RequestForm onDone={() => setFormOpen(false)} />}
      </Modal>
    </div>
  );
}

function RequestForm({ onDone }: { onDone: () => void }) {
  const { addRequest, shifts, employees } = useData();
  const todayStr = todayIso();
  const upcoming = shifts.filter((s) => s.date >= todayStr && s.date <= addDaysIso(todayStr, 30)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const toast = useToast();
  const [kind, setKind] = useState<RequestInput["kind"]>("spend");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [coverId, setCoverId] = useState("");
  const [busy, setBusy] = useState(false);
  const hint = REQUEST_KINDS.find((k) => k.value === kind)?.hint;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: RequestInput = {
      kind,
      title,
      date,
      amount: kind === "shift" || amount === "" ? undefined : Number(amount),
      details: details.trim() || undefined,
      shiftId: kind === "shift" && shiftId ? shiftId : undefined,
      coverEmployeeId: kind === "shift" && coverId ? coverId : undefined,
      coverEmployeeName: kind === "shift" && coverId ? employees.find((e) => e.id === coverId)?.name : undefined,
    };
    const problem = validateRequestInput(input);
    if (problem) {
      toast.error("Check the request", problem);
      return;
    }
    setBusy(true);
    try {
      await addRequest(input);
      toast.success("Request sent", "An owner or manager will decide it");
      onDone();
    } catch (err) {
      toast.error("Couldn't send the request", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field>
        <Label>What is it?</Label>
        <Select value={kind} onChange={(e) => setKind(e.target.value as RequestInput["kind"])}>
          {REQUEST_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
      </Field>
      {kind === "shift" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <Label>Which shift (next 30 days)</Label>
            <Select value={shiftId} onChange={(e) => { setShiftId(e.target.value); const s = upcoming.find((x) => x.id === e.target.value); if (s) setDate(s.date); }}>
              <option value="">Choose a shift</option>
              {upcoming.map((s) => <option key={s.id} value={s.id}>{s.date} {s.start}–{s.end} · {s.employeeName}</option>)}
            </Select>
          </Field>
          <Field>
            <Label>Who takes it (optional)</Label>
            <Select value={coverId} onChange={(e) => setCoverId(e.target.value)}>
              <option value="">Not decided yet</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          </Field>
          <p className="sm:col-span-2 text-xs text-muted">When an owner or manager approves this, the shift moves to the person who takes it, on the rota.</p>
        </div>
      )}
      <Field>
        <Label>Short title</Label>
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "shift" ? "e.g. Swap Friday evening with Nimal" : "e.g. Cement, 20 bags"} maxLength={150} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>{kind === "shift" ? "Shift date" : "Date"}</Label>
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {kind !== "shift" && (
          <Field>
            <Label>Amount</Label>
            <Input type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        )}
      </div>
      <Field>
        <Label>Details (optional)</Label>
        <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} placeholder="Where it is from, why it is needed, or the receipt number" />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </Button>
      </div>
    </form>
  );
}

// Purchase orders above this amount wait for an owner or manager to approve them (Purchase orders page).
function PoApprovalCard() {
  const { settings, updateSettings } = useData();
  const toast = useToast();
  const [draft, setDraft] = useState(settings.poApprovalAbove?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  async function save() {
    const n = draft.trim() === "" ? 0 : Number(draft);
    const problem = validatePoThreshold(n);
    if (problem) return toast.error("Check the amount", problem);
    setBusy(true);
    try {
      await updateSettings({ poApprovalAbove: n });
      toast.success("Purchase approval saved", n === 0 ? "Purchase orders are not held for approval" : `Orders above ${n} wait for approval`);
    } catch (err) {
      toast.error("Couldn't save it", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-4">
      <div className="text-sm font-medium">Purchase order approval</div>
      <div className="text-xs text-muted mt-1">
        A purchase order whose total is above this amount waits on the Purchase orders page until an owner or manager approves it. Leave empty or 0 to approve nothing.
      </div>
      <div className="flex items-end gap-2 mt-3">
        <Field className="flex-1 max-w-[220px]">
          <Label>Orders above</Label>
          <Input type="number" min="0" step="0.01" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0" />
        </Field>
        <Button variant="ghost" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </Card>
  );
}
