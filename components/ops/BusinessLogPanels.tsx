"use client";

// The business log, one panel for each kind (competitors, objectives, correspondence, inspections). The four share one form and one
// list; what each shows depends on its kind. Nothing here sends a message, posts to the books or moves stock.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { discountCheck } from "@/lib/initiativeMath";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, Select, Textarea } from "@/components/ui";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/format";
import { dayDiff } from "@/lib/operations";
import {
  COMPETITOR_THREATS, CORRESPONDENCE_CHANNELS, CORRESPONDENCE_DIRECTIONS, OBJECTIVE_STATUSES, decisionOverdue, inspectionDue, objectiveState,
  validateLogEntry, type BusinessLogInput,
} from "@/lib/businessLog";
import type { BusinessLogEntry } from "@/lib/types";

type Kind = BusinessLogInput["kind"];

const COPY: Record<Kind, { empty: string; add: string; title: string }> = {
  competitor: {
    empty: "Note what competitors are offering and at what price, when you see it. Over a few months the pattern shows what the market is doing.",
    add: "+ Add a competitor",
    title: "Competitor",
  },
  objective: {
    empty: "Write down the few goals that matter this year, each with the day it should be done by and how far along it is.",
    add: "+ Add an objective",
    title: "Objective",
  },
  correspondence: {
    empty: "Log letters, emails, calls and messages to or from customers, suppliers and others, so the history is in one place.",
    add: "+ Log correspondence",
    title: "Correspondence",
  },
  inspection: {
    empty: "Write out how a product, site or vehicle is inspected, and how often. Inspections that fall due show on the Agenda.",
    add: "+ Add an inspection",
    title: "Inspection",
  },
  responsibility: {
    empty: "Write down who is responsible for each area of work, who answers for it, who is consulted first and who is told after. The business should not depend on one person for any area.",
    add: "+ Add an area",
    title: "Responsibility",
  },
  decision: {
    empty: "Write down each management decision with who owns it, the day it should be done by, and whether it was done. Open decisions past their day show on the Agenda.",
    add: "+ Record a decision",
    title: "Decision",
  },
  handover: {
    empty: "At the end of a shift, write what the next shift needs to know: stock, customers, equipment, anything unfinished.",
    add: "+ Write a handover",
    title: "Handover",
  },
  waitlist: {
    empty: "Record who wants a slot, table or event that is full, and when. Move them on as you offer or book it, so no one is forgotten.",
    add: "+ Add to the waitlist",
    title: "Waitlist",
  },
  backorder: {
    empty: "When a customer orders something you have run out of, record it here. Mark it fulfilled when it arrives and the customer is served.",
    add: "+ Log a backorder",
    title: "Backorder",
  },
  partner: {
    empty: "Keep a list of the distributors, resellers, affiliates, agents and investors you work with, and whether each relationship is active.",
    add: "+ Add a partner",
    title: "Partner",
  },
};

const STATUS_LABEL: Record<string, string> = { not_started: "Not started", on_track: "On track", at_risk: "At risk", done: "Done", overdue: "Overdue" };
const label = (_list: readonly string[], v: string | undefined) => (v ? v.replace("_", " ") : "");

export default function BusinessLogPanel({ kind }: { kind: Kind }) {
  const { businessLog, deleteLogEntry, recordInspectionDone, updateLogStatus } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const canManage = can(role, "manage:operations");
  const canLogCorrespondence = can(role, "log:correspondence");
  const canRecordInspection = can(role, "log:quality");
  const [formOpen, setFormOpen] = useState<BusinessLogEntry | "new" | null>(null);
  const today = todayIso();
  const items = useMemo(() => {
    const mine = businessLog.filter((e) => e.kind === kind);
    if (kind === "objective") return mine.sort((a, b) => (a.targetDate ?? "").localeCompare(b.targetDate ?? ""));
    if (kind === "inspection") return mine.sort((a, b) => inspectionDue(a, today).dueOn.localeCompare(inspectionDue(b, today).dueOn));
    return mine.sort((a, b) => (b.date ?? b.createdAt.toString()).localeCompare(a.date ?? a.createdAt.toString()));
  }, [businessLog, kind, today]);
  const canDemand = can(role, "log:demand");
  const canAdd = kind === "correspondence" ? canLogCorrespondence : kind === "waitlist" || kind === "backorder" ? canDemand : kind === "handover" ? can(role, "log:handover") : canManage;

  async function remove(e: BusinessLogEntry) {
    if (!confirm(`Delete "${e.title}"?`)) return;
    try {
      await deleteLogEntry(e.id);
      toast.success("Deleted");
    } catch (err) {
      toast.error("Couldn't delete it", toastableErrorMessage(err));
    }
  }

  async function setStatusTo(e: BusinessLogEntry, status: string) {
    try {
      await updateLogStatus(e.id, status);
      toast.success(`Marked ${status}`);
    } catch (err) {
      toast.error("Couldn't update it", toastableErrorMessage(err));
    }
  }

  async function done(e: BusinessLogEntry) {
    try {
      await recordInspectionDone(e.id, today);
      toast.success("Recorded", `${e.title} done today`);
    } catch (err) {
      toast.error("Couldn't record it", toastableErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted">{summaryLine(kind, items, today)}</div>
        {canAdd && <Button onClick={() => setFormOpen("new")}>{COPY[kind].add}</Button>}
      </div>
      {kind === "decision" && <DiscountCalculator />}
      {items.length === 0 ? (
        <EmptyState title={`No ${COPY[kind].title.toLowerCase()} records yet`} body={COPY[kind].empty} action={canAdd ? <Button onClick={() => setFormOpen("new")}>{COPY[kind].add}</Button> : undefined} />
      ) : (
        items.map((e) => (
          <Card key={e.id} className="p-3.5">
            <Row entry={e} today={today} />
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
              {(kind === "waitlist" || kind === "backorder") && canDemand && (kind === "waitlist" ? ["offered", "booked", "removed"] : ["fulfilled", "cancelled"]).map((st) => (
                <button key={st} onClick={() => setStatusTo(e, st)} className="text-xs text-amber-soft hover:underline min-h-[32px]">
                  Mark {st}
                </button>
              ))}
              {kind === "inspection" && canRecordInspection && (
                <button onClick={() => done(e)} className="text-xs text-amber-soft hover:underline min-h-[32px]">Done today</button>
              )}
              {canManage && (
                <button onClick={() => setFormOpen(e)} className="text-xs text-muted hover:text-fg min-h-[32px]">Edit</button>
              )}
              {role === "owner" && <button onClick={() => remove(e)} className="text-xs text-muted hover:text-fg min-h-[32px]">Delete</button>}
            </div>
          </Card>
        ))
      )}
      <Modal open={formOpen !== null} onClose={() => setFormOpen(null)} title={formOpen && formOpen !== "new" ? `Edit ${COPY[kind].title.toLowerCase()}` : COPY[kind].add.replace("+ ", "")}>
        {formOpen !== null && (
          <LogForm key={formOpen === "new" ? `new-${kind}` : formOpen.id} kind={kind} initial={formOpen === "new" ? null : formOpen} onDone={() => setFormOpen(null)} />
        )}
      </Modal>
    </div>
  );
}

function summaryLine(kind: Kind, items: BusinessLogEntry[], today: string): string {
  if (kind === "objective") {
    const states = items.map((o) => objectiveState(o, today));
    const overdue = states.filter((s) => s === "overdue").length;
    const atRisk = states.filter((s) => s === "at_risk").length;
    return `${items.length} objective${items.length === 1 ? "" : "s"}${overdue ? ` · ${overdue} overdue` : ""}${atRisk ? ` · ${atRisk} at risk` : ""}`;
  }
  if (kind === "responsibility") {
    const areas = items.length;
    const unowned = items.filter((r) => !r.ownerName).length;
    return `${areas} area${areas === 1 ? "" : "s"}${unowned ? ` · ${unowned} with no one responsible` : ""}`;
  }
  if (kind === "decision") {
    const open = items.filter((d) => (d.status ?? "open") === "open");
    const overdue = open.filter((d) => decisionOverdue(d, today)).length;
    return `${open.length} open${overdue ? ` · ${overdue} past their day` : ""}`;
  }
  if (kind === "handover") {
    const recent = items.filter((h) => !!h.date && dayDiff(h.date, today) >= 0 && dayDiff(h.date, today) <= 7).length;
    return `${recent} in the last 7 days`;
  }
  if (kind === "waitlist") {
    const waiting = items.filter((w) => (w.status ?? "waiting") === "waiting").length;
    return `${items.length} on the list · ${waiting} waiting`;
  }
  if (kind === "backorder") {
    const open = items.filter((b) => (b.status ?? "open") === "open");
    const units = open.reduce((t, b) => t + (b.qty ?? 0), 0);
    return `${open.length} open · ${units} unit${units === 1 ? "" : "s"} short`;
  }
  if (kind === "partner") {
    const active = items.filter((p) => (p.status ?? "active") === "active").length;
    return `${items.length} partner${items.length === 1 ? "" : "s"} · ${active} active`;
  }
  if (kind === "inspection") {
    const due = items.filter((i) => inspectionDue(i, today).due).length;
    return `${items.length} inspection${items.length === 1 ? "" : "s"}${due ? ` · ${due} due now` : ""}`;
  }
  return `${items.length} record${items.length === 1 ? "" : "s"}`;
}

function Row({ entry: e, today }: { entry: BusinessLogEntry; today: string }) {
  if (e.kind === "competitor") {
    return (
      <>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{e.title}</span>
          {e.threat && <Badge tone={e.threat === "high" ? "bad" : e.threat === "medium" ? "amber" : "default"}>{e.threat} threat</Badge>}
        </div>
        <div className="text-xs text-muted mt-1">{[e.where, e.date, e.priceSeen && `price ${e.priceSeen}`].filter(Boolean).join(" · ")}</div>
        {e.offer && <div className="text-sm mt-2 whitespace-pre-wrap">{e.offer}</div>}
        {e.notes && <div className="text-xs text-muted mt-1 whitespace-pre-wrap">{e.notes}</div>}
      </>
    );
  }
  if (e.kind === "objective") {
    const s = objectiveState(e, today);
    return (
      <>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{e.title}</span>
          <Badge tone={s === "done" ? "good" : s === "overdue" || s === "at_risk" ? "bad" : "default"}>{STATUS_LABEL[s]}</Badge>
          {e.linkedKpiName && <Badge>measured by {e.linkedKpiName}</Badge>}
        </div>
        <div className="text-xs text-muted mt-1">
          by {e.targetDate}{e.ownerName ? ` · ${e.ownerName}` : ""} · {e.progressPct ?? 0}% done
        </div>
        <div className="h-1.5 rounded bg-line mt-2 overflow-hidden"><div className="h-full bg-amber-soft" style={{ width: `${e.progressPct ?? 0}%` }} /></div>
        {e.notes && <div className="text-xs text-muted mt-2 whitespace-pre-wrap">{e.notes}</div>}
      </>
    );
  }
  if (e.kind === "responsibility") {
    return (
      <>
        <div className="text-sm font-medium">{e.title}</div>
        <div className="text-xs mt-1 space-y-0.5">
          <div><span className="text-muted">Responsible:</span> {e.ownerName ?? "—"}</div>
          {e.accountable && <div><span className="text-muted">Accountable:</span> {e.accountable}</div>}
          {e.consulted && <div><span className="text-muted">Consulted first:</span> {e.consulted}</div>}
          {e.informed && <div><span className="text-muted">Informed after:</span> {e.informed}</div>}
        </div>
      </>
    );
  }
  if (e.kind === "decision") {
    const overdue = decisionOverdue(e, today);
    const st = e.status ?? "open";
    return (
      <>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{e.title}</span>
          <Badge tone={st === "done" ? "good" : st === "dropped" ? "default" : overdue ? "bad" : "amber"}>{overdue ? "past its day" : st}</Badge>
        </div>
        <div className="text-xs text-muted mt-1">
          decided {e.date}{e.targetDate ? ` · by ${e.targetDate}` : ""}{e.ownerName ? ` · owner ${e.ownerName}` : ""}
        </div>
        {e.notes && <div className="text-xs text-muted mt-2 whitespace-pre-wrap">{e.notes}</div>}
      </>
    );
  }
  if (e.kind === "handover") {
    return (
      <>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{e.party} shift</span>
          <Badge>{e.date}</Badge>
        </div>
        {e.summary && <div className="text-sm mt-2 whitespace-pre-wrap">{e.summary}</div>}
        {e.createdByName && <div className="text-xs text-muted mt-1">from {e.createdByName}</div>}
      </>
    );
  }
  if (e.kind === "waitlist") {
    return (
      <>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{e.party}</span>
          <Badge tone={e.status === "booked" ? "good" : e.status === "removed" ? "default" : "amber"}>{e.status ?? "waiting"}</Badge>
        </div>
        <div className="text-xs text-muted mt-1">{[e.date && `wants ${e.date}`, e.createdByName && `added by ${e.createdByName}`].filter(Boolean).join(" · ")}</div>
        {e.summary && <div className="text-sm mt-2 whitespace-pre-wrap">{e.summary}</div>}
      </>
    );
  }
  if (e.kind === "backorder") {
    return (
      <>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{e.title}</span>
          <Badge tone={e.status === "fulfilled" ? "good" : e.status === "cancelled" ? "default" : "amber"}>{e.status ?? "open"}</Badge>
          <Badge>{e.qty ?? 0} short</Badge>
        </div>
        <div className="text-xs text-muted mt-1">{[e.party, e.date && `ordered ${e.date}`, e.createdByName && `logged by ${e.createdByName}`].filter(Boolean).join(" · ")}</div>
        {e.notes && <div className="text-xs text-muted mt-2 whitespace-pre-wrap">{e.notes}</div>}
      </>
    );
  }
  if (e.kind === "partner") {
    return (
      <>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{e.title}</span>
          {e.where && <Badge>{e.where}</Badge>}
          <Badge tone={e.status === "active" ? "good" : e.status === "ended" ? "bad" : "amber"}>{e.status ?? "active"}</Badge>
        </div>
        <div className="text-xs text-muted mt-1">{[e.date && `since ${e.date}`, e.ownerName && `looked after by ${e.ownerName}`].filter(Boolean).join(" · ")}</div>
        {e.notes && <div className="text-xs text-muted mt-2 whitespace-pre-wrap">{e.notes}</div>}
      </>
    );
  }
  if (e.kind === "correspondence") {
    return (
      <>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{e.title}</span>
          <Badge>{e.direction === "sent" ? "sent" : "received"} · {label(CORRESPONDENCE_CHANNELS, e.channel)}</Badge>
        </div>
        <div className="text-xs text-muted mt-1">{e.date} · {e.party}{e.createdByName ? ` · logged by ${e.createdByName}` : ""}</div>
        {e.summary && <div className="text-sm mt-2 whitespace-pre-wrap">{e.summary}</div>}
      </>
    );
  }
  const d = inspectionDue(e, today);
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium truncate">{e.title}</span>
        <Badge tone={d.due ? "bad" : "default"}>{d.due ? (d.daysLeft < 0 ? `overdue ${-d.daysLeft} day${d.daysLeft === -1 ? "" : "s"}` : "due now") : `due ${d.dueOn}`}</Badge>
        <Badge>every {e.frequencyDays} days</Badge>
      </div>
      <div className="text-xs text-muted mt-1">{e.lastDoneOn ? `last done ${e.lastDoneOn}` : "never recorded"}</div>
      <div className="text-sm mt-2 whitespace-pre-wrap">{e.steps}</div>
    </>
  );
}

function LogForm({ kind, initial, onDone }: { kind: Kind; initial: BusinessLogEntry | null; onDone: () => void }) {
  const { addLogEntry, updateLogEntry } = useData();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [where, setWhere] = useState(initial?.where ?? "");
  const [offer, setOffer] = useState(initial?.offer ?? "");
  const [priceSeen, setPriceSeen] = useState(initial?.priceSeen ?? "");
  const [threat, setThreat] = useState(initial?.threat ?? "medium");
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");
  const [progressPct, setProgressPct] = useState(String(initial?.progressPct ?? 0));
  const [status, setStatus] = useState(initial?.status ?? "not_started");
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? "");
  const [linkedKpiName, setLinkedKpiName] = useState(initial?.linkedKpiName ?? "");
  const [direction, setDirection] = useState(initial?.direction ?? "received");
  const [channel, setChannel] = useState(initial?.channel ?? "email");
  const [party, setParty] = useState(initial?.party ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [steps, setSteps] = useState(initial?.steps ?? "");
  const [frequencyDays, setFrequencyDays] = useState(String(initial?.frequencyDays ?? 30));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [partnerRole, setPartnerRole] = useState(initial?.where ?? "distributor");
  const [partnerStatus, setPartnerStatus] = useState(initial?.status ?? "active");
  const [partnerSince, setPartnerSince] = useState(initial?.date ?? "");
  const [partnerOwner, setPartnerOwner] = useState(initial?.ownerName ?? "");
  const [qty, setQty] = useState(String(initial?.qty ?? 1));
  const [alternative, setAlternative] = useState(initial?.alternative ?? "");
  const [accountable, setAccountable] = useState(initial?.accountable ?? "");
  const [consulted, setConsulted] = useState(initial?.consulted ?? "");
  const [informed, setInformed] = useState(initial?.informed ?? "");
  const [decisionStatus, setDecisionStatus] = useState(["open", "done", "dropped"].includes(initial?.status ?? "") ? (initial?.status as string) : "open");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: BusinessLogInput = {
      kind,
      title,
      date: kind === "competitor" || kind === "correspondence" ? date || undefined : undefined,
      where: kind === "competitor" ? where : undefined,
      offer: kind === "competitor" ? offer : undefined,
      priceSeen: kind === "competitor" ? priceSeen : undefined,
      threat: kind === "competitor" ? threat : undefined,
      targetDate: kind === "objective" ? targetDate : undefined,
      progressPct: kind === "objective" ? Number(progressPct) : undefined,
      status: kind === "objective" ? status : undefined,
      ownerName: kind === "objective" ? ownerName : undefined,
      linkedKpiName: kind === "objective" ? linkedKpiName : undefined,
      direction: kind === "correspondence" ? direction : undefined,
      channel: kind === "correspondence" ? channel : undefined,
      party: kind === "correspondence" ? party : undefined,
      summary: kind === "correspondence" ? summary : undefined,
      steps: kind === "inspection" ? steps : undefined,
      frequencyDays: kind === "inspection" ? Number(frequencyDays) : undefined,
      lastDoneOn: kind === "inspection" ? initial?.lastDoneOn : undefined,
      notes,
    };
    if (kind === "partner") {
      input.where = partnerRole;
      input.status = partnerStatus;
      input.date = partnerSince || undefined;
      input.ownerName = partnerOwner;
    }
    if (kind === "decision") {
      input.date = date || todayIso();
      input.targetDate = targetDate || undefined;
      input.ownerName = ownerName;
      input.status = decisionStatus;
      input.notes = notes;
    }
    if (kind === "handover") {
      input.date = date || todayIso();
      input.party = party;
      input.summary = summary;
    }
    if (kind === "decision") {
      input.alternative = alternative || undefined;
    }
    if (kind === "responsibility") {
      input.ownerName = ownerName;
      input.accountable = accountable || undefined;
      input.consulted = consulted || undefined;
      input.informed = informed || undefined;
    }
    if (kind === "waitlist" || kind === "backorder") {
      input.party = party;
      input.date = date || undefined;
      input.summary = kind === "waitlist" ? summary : undefined;
      input.qty = kind === "backorder" ? Number(qty) : undefined;
      input.status = initial?.status ?? (kind === "waitlist" ? "waiting" : "open");
    }
    if (kind === "correspondence" && !date) input.date = todayIso();
    const problem = validateLogEntry(input, todayIso());
    if (problem) return toast.error("Check the entry", problem);
    setBusy(true);
    try {
      if (initial) await updateLogEntry(initial.id, input);
      else await addLogEntry(input);
      toast.success(initial ? "Saved" : "Added");
      onDone();
    } catch (err) {
      toast.error("Couldn't save it", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field>
        <Label>{kind === "competitor" ? "Who" : kind === "objective" ? "The objective" : kind === "correspondence" ? "What it was about" : kind === "waitlist" ? "Name" : kind === "backorder" ? "The item" : kind === "decision" ? "The decision" : kind === "responsibility" ? "The area of work" : kind === "handover" ? "Summary of the shift" : "What is inspected"}</Label>
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
      </Field>

      {kind === "competitor" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Where you saw them (optional)</Label><Input value={where} onChange={(e) => setWhere(e.target.value)} maxLength={120} /></Field>
          <Field><Label>Date seen</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field><Label>Price seen (optional)</Label><Input value={priceSeen} onChange={(e) => setPriceSeen(e.target.value)} maxLength={60} /></Field>
          <Field>
            <Label>How much of a threat</Label>
            <Select value={threat} onChange={(e) => setThreat(e.target.value)}>
              {COMPETITOR_THREATS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2"><Field><Label>What they offer (optional)</Label><Textarea rows={2} value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={2000} /></Field></div>
        </div>
      )}

      {kind === "objective" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Done by</Label><Input type="date" required value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
          <Field><Label>How far along (0 to 100%)</Label><Input type="number" min="0" max="100" step="1" value={progressPct} onChange={(e) => setProgressPct(e.target.value)} /></Field>
          <Field>
            <Label>Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {OBJECTIVE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          </Field>
          <Field><Label>Who owns it (optional)</Label><Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={120} /></Field>
          <div className="sm:col-span-2"><Field><Label>Measured by a KPI (optional, its name)</Label><Input value={linkedKpiName} onChange={(e) => setLinkedKpiName(e.target.value)} maxLength={120} placeholder="e.g. Orders delivered on time" /></Field></div>
        </div>
      )}

      {kind === "correspondence" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field>
            <Label>Sent or received</Label>
            <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
              {CORRESPONDENCE_DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Field>
            <Label>How</Label>
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CORRESPONDENCE_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field><Label>With whom</Label><Input required value={party} onChange={(e) => setParty(e.target.value)} maxLength={120} /></Field>
          <div className="sm:col-span-2"><Field><Label>Summary (optional)</Label><Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} /></Field></div>
        </div>
      )}

      {kind === "decision" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Decided on</Label><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field><Label>Should be done by (optional)</Label><Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
          <Field><Label>Owner of the decision (optional)</Label><Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={120} /></Field>
          <Field>
            <Label>Status</Label>
            <Select value={decisionStatus} onChange={(e) => setDecisionStatus(e.target.value)}>
              {["open", "done", "dropped"].map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
        </div>
      )}
      {kind === "decision" && (
        <Field>
          <Label>What else was considered (the next best option, given up for this one)</Label>
          <Textarea rows={2} value={alternative} onChange={(e) => setAlternative(e.target.value)} maxLength={2000} placeholder="Spending this on X means not doing Y. Y is what we gave up." />
        </Field>
      )}
      {kind === "responsibility" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Responsible (does it)</Label><Input required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={120} /></Field>
          <Field><Label>Accountable (answers for it)</Label><Input value={accountable} onChange={(e) => setAccountable(e.target.value)} maxLength={120} /></Field>
          <Field><Label>Consulted first</Label><Input value={consulted} onChange={(e) => setConsulted(e.target.value)} maxLength={120} /></Field>
          <Field><Label>Informed after</Label><Input value={informed} onChange={(e) => setInformed(e.target.value)} maxLength={120} /></Field>
        </div>
      )}
      {kind === "handover" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Day of the shift</Label><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field><Label>Which shift (for example Morning or Night)</Label><Input required value={party} onChange={(e) => setParty(e.target.value)} maxLength={60} /></Field>
        </div>
      )}
      {(kind === "waitlist" || kind === "backorder") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>{kind === "waitlist" ? "Name" : "Customer"}</Label><Input required value={party} onChange={(e) => setParty(e.target.value)} maxLength={120} /></Field>
          <Field><Label>{kind === "waitlist" ? "The day they want (optional)" : "Ordered on"}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          {kind === "backorder" && (
            <Field><Label>How many were short</Label><Input type="number" min="1" step="1" required value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          )}
          <div className="sm:col-span-2"><Field><Label>{kind === "waitlist" ? "What they want (optional)" : "Notes (optional)"}</Label><Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} /></Field></div>
        </div>
      )}

      {kind === "partner" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <Label>What they are to you</Label>
            <Select value={partnerRole} onChange={(e) => setPartnerRole(e.target.value)}>
              {["distributor", "reseller", "affiliate", "agent", "investor", "other"].map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field>
            <Label>Status</Label>
            <Select value={partnerStatus} onChange={(e) => setPartnerStatus(e.target.value)}>
              {["active", "paused", "ended"].map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field><Label>Working together since (optional)</Label><Input type="date" value={partnerSince} onChange={(e) => setPartnerSince(e.target.value)} /></Field>
          <Field><Label>Who looks after it (optional)</Label><Input value={partnerOwner} onChange={(e) => setPartnerOwner(e.target.value)} maxLength={120} /></Field>
        </div>
      )}

      {kind === "inspection" && (
        <div className="space-y-3">
          <Field><Label>The steps</Label><Textarea required rows={6} value={steps} onChange={(e) => setSteps(e.target.value)} maxLength={5000} placeholder={"1. Check the seal is intact\n2. Weigh 5 units against the label\n3. Record the reading"} /></Field>
          <Field><Label>Done every (days)</Label><Input type="number" min="1" max="3650" step="1" required value={frequencyDays} onChange={(e) => setFrequencyDays(e.target.value)} /></Field>
          {initial?.lastDoneOn && <p className="text-xs text-muted">Last done {initial.lastDoneOn}. Record each new inspection with Done today on the list.</p>}
        </div>
      )}

      <Field><Label>Notes (optional)</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

// Before a discount or a campaign: what it does to the money, and how much extra volume it needs to pay for itself. It saves nothing;
// the result is for the decision that follows.
function DiscountCalculator() {
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [discount, setDiscount] = useState("");
  const [units, setUnits] = useState("");
  const n = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const ready = [price, cost, discount, units].every((v) => v.trim() !== "" && Number.isFinite(Number(v)));
  const r = ready ? discountCheck({ price: n(price), unitCost: n(cost), discountPct: n(discount), unitsNow: n(units) }) : null;
  return (
    <Card className="p-4">
      <div className="text-sm font-medium">Test a discount before deciding</div>
      <div className="text-xs text-muted mt-1">Enter what it costs and what it earns now. Nothing is saved; use the result to write the decision above.</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        <Field><Label>Price per unit</Label><Input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field><Label>Cost per unit</Label><Input type="number" min="0" step="any" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
        <Field><Label>Discount %</Label><Input type="number" min="0" max="100" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
        <Field><Label>Units a period now</Label><Input type="number" min="0" step="any" value={units} onChange={(e) => setUnits(e.target.value)} /></Field>
      </div>
      {r && (
        <div className="text-xs mt-3 space-y-1">
          <div>Margin per unit: <span className="num">{r.marginNow}</span> now, <span className="num">{r.marginAfter}</span> after the discount.</div>
          <div>Contribution per period: <span className="num">{r.contributionNow}</span> now, <span className="num">{r.contributionAfter}</span> after, at today&apos;s volume.</div>
          {r.breakevenIncreasePct !== null ? (
            <div>To earn the same, volume must rise by <span className="num">{r.breakevenIncreasePct}%</span> (to <span className="num">{r.breakevenUnits}</span> units).</div>
          ) : (
            <div className="text-bad">After this discount each unit loses money, so no volume makes it pay.</div>
          )}
          <div className={r.verdict === "pays" ? "text-good" : "text-amber-soft"}>{r.verdict === "pays" ? "At today\'s volume it pays." : r.verdict === "needs more volume" ? "At today\'s volume it does not pay; it needs more sales." : "It loses money."}</div>
        </div>
      )}
    </Card>
  );
}
