"use client";

// Customer support log: complaints, questions, refund and warranty requests, and whether each got sorted out. Text and
// dates only: it changes nothing in the books (a refund or replacement is still recorded where the money or stock moves).
// Open cases come first, urgent and oldest at the top. See lib/support.ts for the exact rules.
import { useMemo, useState, type FormEvent } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/format";
import { REQUEST_KINDS, REQUEST_KIND_LABELS, REQUEST_STATE_LABELS, requestsNeedingAttention, sanitizeRequest, type DataRequest, type DataRequestKind } from "@/lib/dataRequests";
import type { SupportCase, SupportKind, SupportPriority } from "@/lib/types";
import {
  ageDays, cleanSupportInput, daysToResolve, MAX_SUPPORT_DETAIL, MAX_SUPPORT_RESOLUTION, MAX_SUPPORT_SUBJECT,
  needsAttention, sortSupport, summarizeSupport, SUPPORT_KINDS, validateSupportInput, type SupportInput,
} from "@/lib/support";
import MessageButton from "@/components/MessageButton";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, Stat, TableCardSkeleton, Textarea } from "@/components/ui";

const KIND_LABEL = new Map(SUPPORT_KINDS.map((k) => [k.value, k.label]));

function toInput(c: SupportCase): SupportInput {
  return {
    customerName: c.customerName, contact: c.contact, kind: c.kind, priority: c.priority, subject: c.subject, detail: c.detail,
    openedOn: c.openedOn, status: c.status, resolvedOn: c.resolvedOn, resolution: c.resolution, assignedTo: c.assignedTo, dueOn: c.dueOn,
  };
}

export default function SupportPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const { supportCases, customers, loading, addSupportCase, updateSupportCase, deleteSupportCase } = useData();
  const toast = useToast();
  const canWrite = can(role, "manage:support");
  const canDelete = can(role, "delete:records");
  const today = todayIso();

  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupportCase | null>(null);
  const [resolving, setResolving] = useState<SupportCase | null>(null);

  const summary = useMemo(() => summarizeSupport(supportCases, today), [supportCases, today]);
  const shown = useMemo(
    () => sortSupport(supportCases.filter((c) => filter === "all" || c.status === filter), today),
    [supportCases, filter, today]
  );

  if (guardLoading || !allowed) return null;
  if (loading) {
    return (
      <>
        <PageHeader title="Customer support" />
        <TableCardSkeleton rows={4} cols={3} />
      </>
    );
  }

  async function save(input: SupportInput, existing: SupportCase | null): Promise<boolean> {
    const clean = cleanSupportInput(input);
    const problem = validateSupportInput(clean);
    if (problem) {
      toast.error("Can't save yet", problem);
      return false;
    }
    try {
      if (existing) await updateSupportCase(existing.id, clean);
      else await addSupportCase(clean);
      toast.success(existing ? (clean.status === "resolved" && existing.status !== "resolved" ? "Marked resolved" : "Saved") : "Case opened", clean.customerName);
      setFormOpen(false);
      setEditing(null);
      setResolving(null);
      return true;
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
      return false;
    }
  }

  const newButton = canWrite ? (
    <Button
      onClick={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      + New case
    </Button>
  ) : undefined;

  return (
    <>
      <PageHeader title="Customer support" action={newButton} />
      <p className="text-sm text-muted -mt-3 mb-5 max-w-2xl">
        Keep every complaint, question, refund and warranty request until it is sorted out, so nobody is left waiting and a problem that keeps coming back shows up.
        Staff tell the owner or manager, who log it here. A refund or replacement is still recorded where the money or stock moves.
      </p>

      {supportCases.length === 0 ? (
        <EmptyState
          title="No cases yet"
          body="When a customer complains or asks for a refund, a repair or an answer, log it here with the date. Open cases stay at the top until you mark them resolved."
          action={canWrite ? <Button onClick={() => { setEditing(null); setFormOpen(true); }}>Log the first case</Button> : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
            <Stat label="Open" value={summary.open.toString()} sub={summary.oldestOpenDays !== null ? `oldest ${summary.oldestOpenDays} day${summary.oldestOpenDays === 1 ? "" : "s"}` : "all clear"} tone={summary.open > 0 ? "default" : "good"} />
            <Stat label="Urgent" value={summary.urgent.toString()} tone={summary.urgent > 0 ? "bad" : "good"} />
            <Stat label="Waiting over 7 days" value={summary.waiting.toString()} tone={summary.waiting > 0 ? "bad" : "good"} />
            <Stat
              label="Average time to resolve"
              value={summary.avgDaysToResolve === null ? "—" : `${summary.avgDaysToResolve} days`}
              sub={summary.resolvedRecently > 0 ? `${summary.resolvedRecently} resolved in the last 90 days` : "nothing resolved in the last 90 days"}
            />
          </div>

          {summary.repeatCustomers.length > 0 && (
            <Card className="!p-3.5 mb-5 border-amber/40">
              <div className="text-sm font-medium">Coming back more than once (last 90 days)</div>
              <div className="text-xs text-muted mt-1">
                {summary.repeatCustomers.slice(0, 5).map((r) => `${r.name} (${r.cases})`).join(", ")}. A customer with several cases is either badly served or about to leave: call them.
              </div>
            </Card>
          )}

          <div className="flex justify-end mb-3">
            <div className="w-44">
              <Select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as "open" | "resolved" | "all")}>
                <option value="open">Open cases</option>
                <option value="resolved">Resolved cases</option>
                <option value="all">All cases</option>
              </Select>
            </div>
          </div>

          {shown.length === 0 ? (
            <Card className="text-sm text-muted text-center py-8">{filter === "open" ? "No open cases. Everyone has been looked after." : "Nothing to show."}</Card>
          ) : (
            <div className="space-y-3">
              {shown.map((c) => {
                const attn = needsAttention(c, today);
                const age = ageDays(c, today);
                const took = daysToResolve(c);
                return (
                  <Card key={c.id} className={`!p-4 ${attn ? (c.priority === "urgent" ? "border-bad/40" : "border-amber/40") : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium min-w-0 break-words">{c.customerName}</div>
                      <Badge>{KIND_LABEL.get(c.kind) ?? c.kind}</Badge>
                      {c.priority === "urgent" && c.status === "open" && <Badge tone="bad">Urgent</Badge>}
                      {c.status === "open" ? (
                        <Badge tone={age > 7 ? "bad" : "amber"}>{age === 0 ? "Opened today" : `Open ${age} day${age === 1 ? "" : "s"}`}</Badge>
                      ) : (
                        <Badge tone="good">Resolved{took !== null ? ` in ${took} day${took === 1 ? "" : "s"}` : ""}</Badge>
                      )}
                    </div>
                    <div className="text-sm mt-1.5 break-words">{c.subject}</div>
                    <div className="text-xs text-muted mt-1">
                      Opened {c.openedOn}
                      {c.contact ? ` · ${c.contact}` : ""}
                      {c.assignedTo ? ` · With ${c.assignedTo}` : ""}
                      {c.status === "open" && c.dueOn ? ` · Sort by ${c.dueOn}` : ""}
                      {c.status === "open" && c.dueOn && c.dueOn < today ? " · past due" : ""}
                    </div>
                    {c.detail && <div className="text-sm text-muted mt-2 whitespace-pre-wrap break-words">{c.detail}</div>}
                    {c.status === "resolved" && c.resolution && (
                      <div className="text-sm mt-2 whitespace-pre-wrap break-words">
                        <span className="text-muted">Resolution: </span>
                        {c.resolution}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-0 mt-2">
                      {canWrite && c.status === "open" && (
                        <button onClick={() => setResolving(c)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                          Mark resolved
                        </button>
                      )}
                      {canWrite && c.status === "resolved" && (
                        <button
                          onClick={() => save({ ...toInput(c), status: "open", resolvedOn: undefined }, c)}
                          className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
                        >
                          Reopen
                        </button>
                      )}
                      {canWrite && (
                        <MessageButton audience="support" name={c.customerName} contact={c.contact} subject={c.subject} suggested={c.status === "resolved" ? "support_check" : "support_update"} />
                      )}
                      {canWrite && (
                        <button
                          onClick={() => {
                            setEditing(c);
                            setFormOpen(true);
                          }}
                          className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete this case for ${c.customerName}? This can't be undone.`)) return;
                            try {
                              await deleteSupportCase(c.id);
                              toast.success("Deleted", c.customerName);
                            } catch (err) {
                              toast.error("Couldn't delete", toastableErrorMessage(err));
                            }
                          }}
                          className="text-xs text-bad hover:underline min-h-[44px] sm:min-h-[32px]"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit case" : "New support case"}
      >
        {formOpen && (
          <CaseForm
            key={editing?.id ?? "new"}
            initial={editing}
            customerNames={customers.map((c) => c.name)}
            onSave={(i) => save(i, editing)}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
            }}
          />
        )}
      </Modal>

      <DataRequestsCard />

      <Modal open={!!resolving} onClose={() => setResolving(null)} title="Mark resolved">
        {resolving && <ResolveForm key={resolving.id} c={resolving} onSave={(i) => save(i, resolving)} onCancel={() => setResolving(null)} />}
      </Modal>
    </>
  );
}

function ResolveForm({ c, onSave, onCancel }: { c: SupportCase; onSave: (i: SupportInput) => Promise<boolean>; onCancel: () => void }) {
  const [resolvedOn, setResolvedOn] = useState(todayIso());
  const [resolution, setResolution] = useState(c.resolution ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({ ...toInput(c), status: "resolved", resolvedOn, resolution });
        setBusy(false);
      }}
    >
      <div className="text-sm text-muted">{c.customerName}: {c.subject}</div>
      <Field>
        <Label>Resolved on</Label>
        <Input required type="date" min={c.openedOn} value={resolvedOn} onChange={(e) => setResolvedOn(e.target.value)} />
      </Field>
      <Field>
        <Label>What was done (optional)</Label>
        <Textarea rows={3} maxLength={MAX_SUPPORT_RESOLUTION} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="e.g. Replaced the unit, refund of 2,500 recorded as a return" />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Mark resolved"}</Button>
      </div>
    </form>
  );
}

function CaseForm({
  initial,
  customerNames,
  onSave,
  onCancel,
}: {
  initial: SupportCase | null;
  customerNames: string[];
  onSave: (i: SupportInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [kind, setKind] = useState<SupportKind>(initial?.kind ?? "complaint");
  const [priority, setPriority] = useState<SupportPriority>(initial?.priority ?? "normal");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [openedOn, setOpenedOn] = useState(initial?.openedOn ?? todayIso());
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo ?? "");
  const [dueOn, setDueOn] = useState(initial?.dueOn ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          customerName, contact, kind, priority, subject, detail, openedOn, assignedTo, dueOn: dueOn || undefined,
          status: initial?.status ?? "open",
          resolvedOn: initial?.resolvedOn,
          resolution: initial?.resolution,
        });
        setBusy(false);
      }}
    >
      <Field>
        <Label>Customer</Label>
        <Input required list="support-customers" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={100} placeholder="Name" />
        <datalist id="support-customers">
          {customerNames.slice(0, 500).map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Field>
      <Field>
        <Label>Phone or email (optional)</Label>
        <Input value={contact} maxLength={100} onChange={(e) => setContact(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Kind</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as SupportKind)}>
            {SUPPORT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>How urgent</Label>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as SupportPriority)}>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </Select>
        </Field>
      </div>
      <Field>
        <Label>What is it about</Label>
        <Input required value={subject} maxLength={MAX_SUPPORT_SUBJECT} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Charger stopped working after 2 weeks" />
      </Field>
      <Field>
        <Label>Details (optional)</Label>
        <Textarea rows={3} maxLength={MAX_SUPPORT_DETAIL} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Opened on</Label>
          <Input required type="date" value={openedOn} onChange={(e) => setOpenedOn(e.target.value)} />
        </Field>
        <Field>
          <Label>Who has it (optional)</Label>
          <Input value={assignedTo} maxLength={80} onChange={(e) => setAssignedTo(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>Sort it by (optional)</Label>
        <Input type="date" min={openedOn} value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

// Personal data requests (v332): someone asks to see, correct, erase or withdraw consent for their data. Logged here against the deadline.
// Nothing is sent to the person. The owner or a manager decides and replies.
function DataRequestsCard() {
  const { dataRequests, addDataRequest, updateDataRequest, deleteDataRequest } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const canWrite = role === "owner" || role === "manager";
  const [kind, setKind] = useState<DataRequestKind>("access");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const today = todayIso();
  const list = requestsNeedingAttention<DataRequest>(dataRequests, today);
  const openCount = list.filter((r) => r.state !== "done").length;

  async function add(e: FormEvent) {
    e.preventDefault();
    const cleaned = sanitizeRequest({ kind, name, email, receivedOn, notes }, { today });
    if (!cleaned) {
      toast.error("Add a name and a date", "The name is needed so the request can be found again.");
      return;
    }
    setBusy(true);
    try {
      await addDataRequest(cleaned);
      setName("");
      setEmail("");
      setNotes("");
      toast.success("Request logged", `Answer by ${cleaned.dueOn}`);
    } catch (err) {
      toast.error("Couldn't log that request", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="text-sm font-medium mb-0.5">Personal data requests</div>
      <div className="text-xs text-muted mb-3">
        Log each request to see, correct, erase or withdraw consent for someone’s data. The answer is due at the earlier of 21 working
        days and one calendar month from the day it was received, so the date is never late under either rule. Nothing is sent to the
        person; the owner decides and replies. {openCount} open.
      </div>
      {list.length === 0 ? (
        <div className="text-xs text-muted mb-3">No requests logged.</div>
      ) : (
        <div className="space-y-1.5 mb-4">
          {list.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 text-xs border-b border-line/60 pb-1.5 last:border-0">
              <div className="min-w-0">
                <div>{r.name}{r.email ? ` · ${r.email}` : ""}</div>
                <div className="text-muted">{REQUEST_KIND_LABELS[r.kind]} · received {r.receivedOn} · answer by {r.dueOn}</div>
                {r.notes && <div className="text-muted">{r.notes}</div>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge tone={r.state === "overdue" ? "bad" : r.state === "due_soon" ? "amber" : r.state === "done" ? "good" : "default"}>
                  {REQUEST_STATE_LABELS[r.state]}
                </Badge>
                {canWrite && r.status !== "done" && (
                  <button
                    type="button"
                    className="text-muted hover:underline"
                    onClick={async () => {
                      try {
                        await updateDataRequest(r.id, { status: "done", doneOn: todayIso() });
                      } catch (err) {
                        toast.error("Couldn't update that request", toastableErrorMessage(err));
                      }
                    }}
                  >
                    Mark done
                  </button>
                )}
                {role === "owner" && (
                  <button type="button" className="text-muted hover:text-bad" onClick={() => deleteDataRequest(r.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {canWrite && (
        <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <Field>
            <Label>Request</Label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as DataRequestKind)}>
              {REQUEST_KINDS.map((k) => (
                <option key={k} value={k}>{REQUEST_KIND_LABELS[k]}</option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <Label>Email (optional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field>
            <Label>Received on</Label>
            <Input type="date" value={receivedOn} max={todayIso()} onChange={(e) => setReceivedOn(e.target.value)} />
          </Field>
          <Field className="sm:col-span-2">
            <Label>Note (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Log request"}</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
