"use client";

// The record-keeping panels on the Operations page. Each one reads and writes through DataContext, which applies the same rules
// as lib/operations.ts. None of them posts to the books, moves stock or sends a message.
import { useMemo, useState } from "react";
import { focusCheck, FOCUS_MIN, FOCUS_MAX } from "@/lib/kpiFocus";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, Select, Textarea } from "@/components/ui";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/format";
import {
  COMPLIANCE_CATEGORIES, COMPLIANCE_REMINDER_DAYS, INCIDENT_KINDS, INCIDENT_SEVERITIES, KPI_DIRECTIONS, complianceState,
  complianceSummary, incidentSummary, kpiStatus, maintenanceState, reviewsDue, validateCompliance, validateIncident,
  validateKpi, validateMaintenance, validateReview, type ComplianceInput, type IncidentInput, type KpiInput, type MaintenanceInput,
  type ReviewInput, MAX_TEXT,
} from "@/lib/operations";
import type { ComplianceItem, Incident, KpiMeasure, MaintenanceItem, PerformanceReview } from "@/lib/types";
import { kpiRag } from "@/lib/kpiRag";
import { SALES_MEASURES, computeSalesMeasures, kpiWithLive } from "@/lib/salesMeasures";
import { OPS_MEASURES, computeOpsMeasures } from "@/lib/opsMeasures";

const RAG_TONE = { green: "good", amber: "amber", red: "bad", none: "default" } as const;
const RAG_LABEL = { green: "green", amber: "amber", red: "red", none: "no reading" } as const;

const label = (list: { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------- compliance register ----------

export function CompliancePanel() {
  const { complianceItems, addCompliance, updateCompliance, deleteCompliance } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const canManage = can(role, "manage:operations");
  const [formOpen, setFormOpen] = useState<ComplianceItem | "new" | null>(null);
  const today = todayIso();
  const summary = complianceSummary(complianceItems, today);
  const rows = useMemo(
    () => [...complianceItems].sort((a, b) => complianceState(a, today).daysLeft - complianceState(b, today).daysLeft),
    [complianceItems, today],
  );

  async function remove(i: ComplianceItem) {
    if (!confirm(`Delete "${i.name}" from the register?`)) return;
    try {
      await deleteCompliance(i.id);
      toast.success("Deleted");
    } catch (err) {
      toast.error("Couldn't delete it", toastableErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted">
          {summary.expired > 0 && <><span className="text-bad">{plural(summary.expired, "expired item")}</span> · </>}
          {summary.dueSoon > 0 && <><span className="text-amber-soft">{plural(summary.dueSoon, "item")} due soon</span> · </>}
          {plural(summary.total, "item")} in the register. Reminders start {COMPLIANCE_REMINDER_DAYS} days before expiry unless you set another.
        </div>
        {canManage && <Button onClick={() => setFormOpen("new")}>+ Add item</Button>}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing in the register yet"
          body="Keep the licences, permits, insurance, certificates, staff training, lease and contracts with their expiry dates here. Items coming up for renewal show on the Agenda."
          action={canManage ? <Button onClick={() => setFormOpen("new")}>+ Add item</Button> : undefined}
        />
      ) : (
        rows.map((i) => {
          const s = complianceState(i, today);
          const tone = s.state === "expired" ? "bad" : s.state === "due_soon" ? "amber" : "default";
          const when = s.state === "expired" ? `expired ${-s.daysLeft} day${s.daysLeft === -1 ? "" : "s"} ago` : s.daysLeft === 0 ? "expires today" : `${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left`;
          return (
            <Card key={i.id} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{i.name}</span>
                <Badge>{label(COMPLIANCE_CATEGORIES, i.category)}</Badge>
                <Badge tone={tone}>{when}</Badge>
              </div>
              <div className="text-xs text-muted mt-1">
                {i.holder ? `${i.holder} · ` : ""}expires {i.expiresOn}
                {i.issuedOn ? ` · issued ${i.issuedOn}` : ""}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                {i.documentUrl && (
                  <a href={i.documentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-soft hover:underline min-h-[32px] flex items-center">
                    Open document
                  </a>
                )}
                {canManage && (
                  <>
                    <button onClick={() => setFormOpen(i)} className="text-xs text-muted hover:text-fg min-h-[32px]">Edit</button>
                    {role === "owner" && (
                      <button onClick={() => remove(i)} className="text-xs text-muted hover:text-fg min-h-[32px]">Delete</button>
                    )}
                  </>
                )}
              </div>
            </Card>
          );
        })
      )}

      <Modal open={formOpen !== null} onClose={() => setFormOpen(null)} title={formOpen && formOpen !== "new" ? "Edit item" : "New item"}>
        {formOpen !== null && (
          <ComplianceForm
            key={formOpen === "new" ? "new" : formOpen.id}
            initial={formOpen === "new" ? null : formOpen}
            onDone={() => setFormOpen(null)}
            save={async (input) => {
              if (formOpen === "new") await addCompliance(input);
              else await updateCompliance(formOpen.id, input);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function ComplianceForm({ initial, onDone, save }: { initial: ComplianceItem | null; onDone: () => void; save: (i: ComplianceInput) => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "licence");
  const [holder, setHolder] = useState(initial?.holder ?? "");
  const [issuedOn, setIssuedOn] = useState(initial?.issuedOn ?? "");
  const [expiresOn, setExpiresOn] = useState(initial?.expiresOn ?? "");
  const [reminderDays, setReminderDays] = useState(initial?.reminderDays?.toString() ?? "");
  const [documentUrl, setDocumentUrl] = useState(initial?.documentUrl ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: ComplianceInput = {
      name,
      category,
      holder: holder.trim() || undefined,
      issuedOn: issuedOn || undefined,
      expiresOn,
      reminderDays: reminderDays.trim() === "" ? undefined : Number(reminderDays),
      documentUrl: documentUrl.trim() || undefined,
    };
    const problem = validateCompliance(input);
    if (problem) return toast.error("Check the item", problem);
    setBusy(true);
    try {
      await save(input);
      toast.success(initial ? "Saved" : "Added to the register");
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
        <Label>Name</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="e.g. Trade licence, Public liability insurance" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Kind</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {COMPLIANCE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Held by (optional)</Label>
          <Input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={120} placeholder="The business, or a person's name" />
        </Field>
        <Field>
          <Label>Issued (optional)</Label>
          <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </Field>
        <Field>
          <Label>Expires or ends</Label>
          <Input type="date" required value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </Field>
        <Field>
          <Label>Remind me (days before, optional)</Label>
          <Input type="number" min="0" max="365" step="1" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} placeholder={`${COMPLIANCE_REMINDER_DAYS} by default`} />
        </Field>
        <Field>
          <Label>Link to the document (optional)</Label>
          <Input value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} placeholder="https://…" maxLength={500} />
        </Field>
      </div>
      <p className="text-xs text-muted">Balancr keeps a link to the document, not the file. Put the file in Drive, Dropbox or wherever you keep papers, and paste its link here.</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

// ---------- incidents and near misses ----------

export function IncidentsPanel() {
  const { incidents, updateIncident, deleteIncident } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const canManage = can(role, "manage:operations");
  const canReport = can(role, "create:incident");
  const [formOpen, setFormOpen] = useState<Incident | "new" | null>(null);
  const today = todayIso();
  const summary = incidentSummary(incidents, today);
  const openList = incidents.filter((i) => i.status === "open");
  const closedList = incidents.filter((i) => i.status === "closed").slice(0, 30);

  async function toggle(i: Incident) {
    try {
      await updateIncident(i.id, {
        kind: i.kind,
        date: i.date,
        place: i.place,
        description: i.description,
        severity: i.severity,
        actionTaken: i.actionTaken,
        status: i.status === "open" ? "closed" : "open",
      });
      toast.success(i.status === "open" ? "Closed" : "Reopened");
    } catch (err) {
      toast.error("Couldn't update it", toastableErrorMessage(err));
    }
  }

  async function remove(i: Incident) {
    if (!confirm("Delete this incident? It cannot be recovered.")) return;
    try {
      await deleteIncident(i.id);
      toast.success("Deleted");
    } catch (err) {
      toast.error("Couldn't delete it", toastableErrorMessage(err));
    }
  }

  function row(i: Incident) {
    return (
      <Card key={i.id} className="p-3.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{label(INCIDENT_KINDS, i.kind)}</span>
          <Badge tone={i.severity === "high" ? "bad" : i.severity === "medium" ? "amber" : "default"}>{label(INCIDENT_SEVERITIES, i.severity)}</Badge>
          <Badge tone={i.status === "open" ? "amber" : "good"}>{i.status}</Badge>
        </div>
        <div className="text-xs text-muted mt-1">
          {i.date}{i.place ? ` · ${i.place}` : ""} · reported by {i.reportedByName ?? "Unknown"}
          {i.status === "open" && dayOld(i.date, today) > 14 && <span className="text-bad"> · open {dayOld(i.date, today)} days</span>}
        </div>
        <div className="text-sm mt-2 whitespace-pre-wrap">{i.description}</div>
        {i.actionTaken && <div className="text-xs text-muted mt-2 whitespace-pre-wrap">Action taken: {i.actionTaken}</div>}
        {canManage && (
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
            <button onClick={() => toggle(i)} className="text-xs text-amber-soft hover:underline min-h-[32px]">
              {i.status === "open" ? "Mark closed" : "Reopen"}
            </button>
            <button onClick={() => setFormOpen(i)} className="text-xs text-muted hover:text-fg min-h-[32px]">Edit</button>
            {role === "owner" && <button onClick={() => remove(i)} className="text-xs text-muted hover:text-fg min-h-[32px]">Delete</button>}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted">
          {plural(summary.openCount, "open incident")}
          {summary.stale > 0 && <> · <span className="text-bad">{summary.stale} open for over 14 days</span></>}
          {` · ${summary.nearMisses} near miss${summary.nearMisses === 1 ? "" : "es"} in the last ${summary.recentDays} days`}
        </div>
        {canReport && <Button onClick={() => setFormOpen("new")}>+ Report</Button>}
      </div>
      {incidents.length === 0 ? (
        <EmptyState
          title="No incidents recorded"
          body="Report near misses as well as accidents. A near miss that is written down is how the next accident is prevented."
          action={canReport ? <Button onClick={() => setFormOpen("new")}>+ Report</Button> : undefined}
        />
      ) : (
        <>
          {openList.length > 0 && <div className="space-y-2"><div className="text-xs font-medium text-muted">Open</div>{openList.map(row)}</div>}
          {closedList.length > 0 && <div className="space-y-2"><div className="text-xs font-medium text-muted">Closed</div>{closedList.map(row)}</div>}
        </>
      )}
      <Modal open={formOpen !== null} onClose={() => setFormOpen(null)} title={formOpen && formOpen !== "new" ? "Edit incident" : "Report an incident"}>
        {formOpen !== null && (
          <IncidentForm key={formOpen === "new" ? "new" : formOpen.id} initial={formOpen === "new" ? null : formOpen} canManage={canManage} onDone={() => setFormOpen(null)} />
        )}
      </Modal>
    </div>
  );
}

function dayOld(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function IncidentForm({ initial, canManage, onDone }: { initial: Incident | null; canManage: boolean; onDone: () => void }) {
  const { addIncident, updateIncident } = useData();
  const toast = useToast();
  const [kind, setKind] = useState(initial?.kind ?? "near_miss");
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [place, setPlace] = useState(initial?.place ?? "");
  const [severity, setSeverity] = useState(initial?.severity ?? "low");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [actionTaken, setActionTaken] = useState(initial?.actionTaken ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: IncidentInput = { kind, date, place: place.trim() || undefined, severity, description, actionTaken: actionTaken.trim() || undefined };
    const problem = validateIncident(input);
    if (problem) return toast.error("Check the report", problem);
    setBusy(true);
    try {
      if (initial) await updateIncident(initial.id, { ...input, status: initial.status });
      else await addIncident(input);
      toast.success(initial ? "Saved" : "Reported", "Thank you. Your owner or manager has it now.");
      onDone();
    } catch (err) {
      toast.error("Couldn't save the report", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>What happened?</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {INCIDENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        </Field>
        <Field>
          <Label>Date</Label>
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Where (optional)</Label>
          <Input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} placeholder="e.g. Loading bay, pond 3" />
        </Field>
        <Field>
          <Label>How serious</Label>
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {INCIDENT_SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field>
        <Label>Describe it</Label>
        <Textarea required rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={MAX_TEXT} placeholder="What happened, who was involved, and what could have made it worse" />
      </Field>
      {canManage && (
        <Field>
          <Label>What was done about it (optional)</Label>
          <Textarea rows={3} value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} maxLength={MAX_TEXT} />
        </Field>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

// ---------- equipment and vehicle maintenance ----------

const STATE_LABEL = { never: "Never serviced", ok: "On schedule", due_soon: "Due soon", overdue: "Overdue" } as const;
const STATE_TONE = { never: "amber", ok: "good", due_soon: "amber", overdue: "bad" } as const;

export function EquipmentPanel() {
  const { maintenanceItems, deleteMaintenance } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const canManage = can(role, "manage:operations");
  const canLog = can(role, "log:maintenance");
  const [formOpen, setFormOpen] = useState<MaintenanceItem | "new" | null>(null);
  const [logFor, setLogFor] = useState<MaintenanceItem | null>(null);
  const today = todayIso();
  const rows = useMemo(() => {
    const rank = { overdue: 0, due_soon: 1, never: 2, ok: 3 } as const;
    return [...maintenanceItems].sort((a, b) => rank[maintenanceState(a, today).state] - rank[maintenanceState(b, today).state] || a.name.localeCompare(b.name));
  }, [maintenanceItems, today]);

  async function remove(m: MaintenanceItem) {
    if (!confirm(`Delete "${m.name}" and its service log?`)) return;
    try {
      await deleteMaintenance(m.id);
      toast.success("Deleted");
    } catch (err) {
      toast.error("Couldn't delete it", toastableErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted">
          Services are due by date, by distance, or both. A service logged here records the date, reading and cost for your own records; it posts no expense.
        </div>
        {canManage && <Button onClick={() => setFormOpen("new")}>+ Add equipment</Button>}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="No equipment or vehicles yet"
          body="Add a vehicle or machine and how often it needs servicing. The next service date (or distance) then shows here and on the Agenda."
          action={canManage ? <Button onClick={() => setFormOpen("new")}>+ Add equipment</Button> : undefined}
        />
      ) : (
        rows.map((m) => {
          const s = maintenanceState(m, today);
          const due: string[] = [];
          if (s.dueDate) due.push(`by ${s.dueDate}${s.daysLeft !== undefined ? ` (${s.daysLeft < 0 ? `${-s.daysLeft} days late` : `${s.daysLeft} days`})` : ""}`);
          if (s.dueKm !== undefined) due.push(`at ${s.dueKm.toLocaleString()} km${s.kmLeft !== undefined ? ` (${s.kmLeft < 0 ? `${-s.kmLeft} km over` : `${s.kmLeft.toLocaleString()} km to go`})` : ""}`);
          const intervals = [m.intervalDays ? `every ${m.intervalDays} days` : null, m.intervalKm ? `every ${m.intervalKm.toLocaleString()} km` : null].filter(Boolean).join(" or ");
          const recent = (m.log ?? []).slice(-3).reverse();
          return (
            <Card key={m.id} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{m.name}</span>
                <Badge tone={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</Badge>
              </div>
              <div className="text-xs text-muted mt-1">
                Service {intervals}
                {m.lastDoneDate && <> · last done {m.lastDoneDate}</>}
                {m.currentKm !== undefined && <> · reading {m.currentKm.toLocaleString()} km</>}
              </div>
              {due.length > 0 && <div className="text-xs mt-1">Next due {due.join(", ")}</div>}
              {recent.length > 0 && (
                <div className="text-xs text-muted mt-2 space-y-0.5">
                  {recent.map((e) => (
                    <div key={e.id}>
                      {e.date}{e.km !== undefined ? ` · ${e.km.toLocaleString()} km` : ""}{e.note ? ` · ${e.note}` : ""}{e.cost !== undefined ? ` · cost ${e.cost}` : ""}{e.byName ? ` · ${e.byName}` : ""}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                {canLog && (
                  <button onClick={() => setLogFor(m)} className="text-xs text-amber-soft hover:underline min-h-[32px]">Log a service done</button>
                )}
                {canManage && <button onClick={() => setFormOpen(m)} className="text-xs text-muted hover:text-fg min-h-[32px]">Edit</button>}
                {role === "owner" && <button onClick={() => remove(m)} className="text-xs text-muted hover:text-fg min-h-[32px]">Delete</button>}
              </div>
            </Card>
          );
        })
      )}

      <Modal open={formOpen !== null} onClose={() => setFormOpen(null)} title={formOpen && formOpen !== "new" ? "Edit equipment" : "Add equipment"}>
        {formOpen !== null && (
          <EquipmentForm key={formOpen === "new" ? "new" : formOpen.id} initial={formOpen === "new" ? null : formOpen} onDone={() => setFormOpen(null)} />
        )}
      </Modal>
      <Modal open={logFor !== null} onClose={() => setLogFor(null)} title={logFor ? `Service: ${logFor.name}` : "Service"}>
        {logFor && <ServiceForm item={logFor} onDone={() => setLogFor(null)} />}
      </Modal>
    </div>
  );
}

function EquipmentForm({ initial, onDone }: { initial: MaintenanceItem | null; onDone: () => void }) {
  const { addMaintenance, updateMaintenance } = useData();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [intervalDays, setIntervalDays] = useState(initial?.intervalDays?.toString() ?? "");
  const [intervalKm, setIntervalKm] = useState(initial?.intervalKm?.toString() ?? "");
  const [currentKm, setCurrentKm] = useState(initial?.currentKm?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: MaintenanceInput = {
      name,
      intervalDays: intervalDays.trim() === "" ? undefined : Number(intervalDays),
      intervalKm: intervalKm.trim() === "" ? undefined : Number(intervalKm),
      currentKm: currentKm.trim() === "" ? undefined : Number(currentKm),
    };
    const problem = validateMaintenance(input);
    if (problem) return toast.error("Check the item", problem);
    setBusy(true);
    try {
      if (initial) await updateMaintenance(initial.id, input);
      else await addMaintenance(input);
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
        <Label>Name</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="e.g. Delivery van, Air compressor" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Service every (days)</Label>
          <Input type="number" min="1" max="3650" step="1" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} placeholder="e.g. 90" />
        </Field>
        <Field>
          <Label>Service every (km)</Label>
          <Input type="number" min="1" step="1" value={intervalKm} onChange={(e) => setIntervalKm(e.target.value)} placeholder="e.g. 10000" />
        </Field>
        <Field>
          <Label>Current reading (km, optional)</Label>
          <Input type="number" min="0" step="1" value={currentKm} onChange={(e) => setCurrentKm(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-muted">Set days, km, or both. The reading is needed before a distance service can be judged.</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

function ServiceForm({ item, onDone }: { item: MaintenanceItem; onDone: () => void }) {
  const { logMaintenanceDone, settings } = useData();
  const toast = useToast();
  const [date, setDate] = useState(todayIso());
  const [km, setKm] = useState(item.currentKm?.toString() ?? "");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await logMaintenanceDone(item.id, {
        date,
        km: item.intervalKm && km.trim() !== "" ? Number(km) : undefined,
        cost: cost.trim() === "" ? undefined : Number(cost),
        note: note.trim() || undefined,
      });
      toast.success("Service logged", `${item.name} on ${date}`);
      onDone();
    } catch (err) {
      toast.error("Couldn't log the service", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Date it was done</Label>
          <Input type="date" required max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {item.intervalKm !== undefined && (
          <Field>
            <Label>Reading now (km)</Label>
            <Input type="number" min="0" step="1" value={km} onChange={(e) => setKm(e.target.value)} />
          </Field>
        )}
        <Field>
          <Label>Cost, for your records (optional, {settings.currency})</Label>
          <Input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>What was done (optional)</Label>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_TEXT} placeholder="e.g. Oil and filter, new brake pads" />
      </Field>
      <p className="text-xs text-muted">The cost is a note here. If you paid for it, record the bill on the Expenses page as well.</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Log service"}</Button>
      </div>
    </form>
  );
}

// ---------- KPIs with targets ----------

export function KpisPanel() {
  const { kpis, deleteKpi, sales, leads, addKpi } = useData();
  const focus = useMemo(() => focusCheck(kpis), [kpis]);
  const today = todayIso();
  const { webOrders, purchaseOrders, employees, obligations, improvements, candidates } = useData();
  const live = useMemo(() => ({
    ...computeSalesMeasures(sales, leads, today, Date.now()),
    ...computeOpsMeasures({ webOrders, purchaseOrders, employees, obligations, improvements, candidates, todayIso: today }),
  }), [sales, leads, today, webOrders, purchaseOrders, employees, obligations, improvements, candidates]);
  const { role } = useAuth();
  const toast = useToast();
  const canManage = can(role, "manage:operations");
  const [formOpen, setFormOpen] = useState<KpiMeasure | "new" | null>(null);
  const [recordFor, setRecordFor] = useState<KpiMeasure | null>(null);

  async function remove(k: KpiMeasure) {
    if (!confirm(`Delete the measure "${k.name}" and all its figures?`)) return;
    try {
      await deleteKpi(k.id);
      toast.success("Deleted");
    } catch (err) {
      toast.error("Couldn't delete it", toastableErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted">
          Track a few numbers that show whether the business is on course, each against a target. Record a figure each week or month.
          The newest 260 figures are kept for each measure.
        </div>
        {canManage && <Button onClick={() => setFormOpen("new")}>+ Add measure</Button>}
      </div>
      <Card className="p-4">
        <div className="text-sm font-medium">Management dashboard: {focus.count} measure{focus.count === 1 ? "" : "s"} (aim for {FOCUS_MIN} to {FOCUS_MAX})</div>
        <div className="text-xs text-muted mt-1">{focus.leading} leading · {focus.lagging} lagging{focus.unclassified > 0 && <> · {focus.unclassified} not labelled</>}</div>
        {focus.messages.map((m) => <div key={m} className="text-xs mt-1">{m}</div>)}
      </Card>
      {canManage && (
        <Card className="p-4">
          <div className="text-sm font-medium">Standard sales measures, worked out for you</div>
          <div className="text-xs text-muted mt-1">These are calculated from the sales and leads already recorded. Track one and its figure updates itself; nothing is typed in.</div>
          <div className="mt-3 space-y-2">
            {SALES_MEASURES.map((m) => {
              const v = live[m.key];
              const tracked = kpis.some((k) => k.source === m.key);
              return (
                <div key={m.key} className="flex items-center justify-between gap-3 flex-wrap text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{m.label}</div>
                    <div className="text-xs text-muted">{m.blurb} Now: <span className="num">{v === null ? "no data yet" : v}</span>{m.unit && v !== null ? m.unit : ""}</div>
                  </div>
                  {tracked ? (
                    <span className="text-xs text-good">Tracked</span>
                  ) : (
                    <Button variant="ghost" disabled={v === null} onClick={() => addKpi({ name: m.label, unit: m.unit, target: Math.round((v ?? 0) * 10) / 10, direction: "higher", period: "week", source: m.key }).then(() => toast.success("Tracking", "The target starts at today's figure; change it on the measure")).catch((err) => toast.error("Couldn't track it", toastableErrorMessage(err)))}>Track it</Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {kpis.length === 0 ? (
        <EmptyState
          title="No measures yet"
          body="Pick the numbers that matter most, for example orders delivered on time, days with stock-outs, or table turns per evening, and the target for each."
          action={canManage ? <Button onClick={() => setFormOpen("new")}>+ Add measure</Button> : undefined}
        />
      ) : (
        kpis.map((k) => {
          const shown = kpiWithLive(k, live, today);
          const s = kpiStatus(shown);
          const arrow = s.trend === "up" ? "▲" : s.trend === "down" ? "▼" : s.trend === "flat" ? "■" : "";
          const history = [...(k.readings ?? [])].sort((a, b) => a.period.localeCompare(b.period)).slice(-6);
          const dirText = k.direction === "higher" ? "higher is better" : "lower is better";
          return (
            <Card key={k.id} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{k.name}</span>
                {!k.decisionQuestion && <Badge tone="amber">no decision linked</Badge>}
                <Badge tone={RAG_TONE[kpiRag(shown).rag]}>{RAG_LABEL[kpiRag(shown).rag]}</Badge>
                <Badge tone={s.onTarget === null ? "default" : s.onTarget ? "good" : "bad"}>
                  {s.onTarget === null ? "No figure yet" : s.onTarget ? "On target" : "Off target"}
                </Badge>
              </div>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-2xl font-semibold num">{s.latest ? s.latest.value : "—"}</span>
                <span className="text-xs text-muted">{k.unit}{s.latest ? ` · ${k.period === "week" ? "week" : "month"} from ${s.latest.period}` : ""}</span>
                {arrow && (
                  <span className={`text-xs ${s.trend === "up" ? (k.direction === "higher" ? "text-good" : "text-bad") : s.trend === "down" ? (k.direction === "lower" ? "text-good" : "text-bad") : "text-muted"}`}>
                    {arrow} {s.change !== null && s.change !== 0 ? Math.abs(s.change) : "no change"}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted mt-1">
                Target {k.target} {k.unit} · {dirText}{k.ownerName ? ` · owned by ${k.ownerName}` : ""}
                {k.decisionQuestion && <div className="mt-1">Informs: {k.decisionQuestion}</div>}
                {history.length > 1 && <> · recent: {history.map((h) => h.value).join(", ")}</>}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                {canManage && <button onClick={() => setRecordFor(k)} className="text-xs text-amber-soft hover:underline min-h-[32px]">Record a figure</button>}
                {canManage && <button onClick={() => setFormOpen(k)} className="text-xs text-muted hover:text-fg min-h-[32px]">Edit</button>}
                {role === "owner" && <button onClick={() => remove(k)} className="text-xs text-muted hover:text-fg min-h-[32px]">Delete</button>}
              </div>
            </Card>
          );
        })
      )}

      <Modal open={formOpen !== null} onClose={() => setFormOpen(null)} title={formOpen && formOpen !== "new" ? "Edit measure" : "New measure"}>
        {formOpen !== null && <KpiForm key={formOpen === "new" ? "new" : formOpen.id} initial={formOpen === "new" ? null : formOpen} onDone={() => setFormOpen(null)} />}
      </Modal>
      <Modal open={recordFor !== null} onClose={() => setRecordFor(null)} title={recordFor ? `Figure for ${recordFor.name}` : "Figure"}>
        {recordFor && <KpiReadingForm kpi={recordFor} onDone={() => setRecordFor(null)} />}
      </Modal>
    </div>
  );
}

function KpiForm({ initial, onDone }: { initial: KpiMeasure | null; onDone: () => void }) {
  const { addKpi, updateKpi } = useData();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [target, setTarget] = useState(initial?.target?.toString() ?? "");
  const [direction, setDirection] = useState(initial?.direction ?? "higher");
  const [period, setPeriod] = useState(initial?.period ?? "week");
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? "");
  const [decisionQuestion, setDecisionQuestion] = useState(initial?.decisionQuestion ?? "");
  const [timing, setTiming] = useState(initial?.timing ?? "");
  const [amberPct, setAmberPct] = useState(initial?.amberPct?.toString() ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: KpiInput = { name, unit, target: Number(target), direction, period, ownerName, decisionQuestion, timing: timing || undefined, amberPct: amberPct.trim() === "" ? undefined : Number(amberPct), source: (source || undefined) as KpiInput["source"] };
    const problem = validateKpi(input);
    if (problem) return toast.error("Check the measure", problem);
    setBusy(true);
    try {
      if (initial) await updateKpi(initial.id, input);
      else await addKpi(input);
      toast.success(initial ? "Saved" : "Measure added");
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
        <Label>What is measured</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="e.g. Orders delivered on time" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Unit</Label>
          <Input required value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder="%, orders, days, kg" />
        </Field>
        <Field>
          <Label>Target</Label>
          <Input type="number" required step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field>
          <Label>Direction</Label>
          <Select value={direction} onChange={(e) => setDirection(e.target.value as "higher" | "lower")}>
            {KPI_DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Field>
        <Field>
          <Label>Recorded</Label>
          <Select value={period} onChange={(e) => setPeriod(e.target.value as "week" | "month")}>
            <option value="week">Every week</option>
            <option value="month">Every month</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field><Label>Who is accountable for this number (optional)</Label><Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={120} /></Field>
        <Field><Label>Leading (predicts a result) or lagging (records one)</Label>
          <Select value={timing} onChange={(e) => setTiming(e.target.value)}>
            <option value="">Not sure yet</option>
            <option value="leading">Leading (predicts a result)</option>
            <option value="lagging">Lagging (records a result)</option>
          </Select>
        </Field>
        <Field><Label>The decision it informs (recommended)</Label><Input value={decisionQuestion} onChange={(e) => setDecisionQuestion(e.target.value)} maxLength={200} placeholder="e.g. Do we add a second delivery driver?" /></Field>
        <Field><Label>Amber if within (% of target, default 10)</Label><Input type="number" min="0" max="100" step="any" value={amberPct} onChange={(e) => setAmberPct(e.target.value)} placeholder="10" /></Field>
        <Field>
          <Label>Where the figure comes from</Label>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Typed in by hand each period</option>
            {SALES_MEASURES.map((m) => <option key={m.key} value={m.key}>{m.label} (automatic)</option>)}
            {OPS_MEASURES.map((m) => <option key={m.key} value={m.key}>{m.label} (automatic)</option>)}
          </Select>
        </Field>
      </div>
      {initial && initial.period !== period && <p className="text-xs text-amber-soft">Changing how often it is recorded keeps the figures already entered, filed by the old period.</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

function KpiReadingForm({ kpi, onDone }: { kpi: KpiMeasure; onDone: () => void }) {
  const { recordKpiReading } = useData();
  const toast = useToast();
  const [day, setDay] = useState(todayIso());
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await recordKpiReading(kpi.id, { day, value: Number(value), note: note.trim() || undefined });
      toast.success("Figure recorded", `${kpi.name}: ${value} ${kpi.unit}`);
      onDone();
    } catch (err) {
      toast.error("Couldn't record it", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Any day in the {kpi.period}</Label>
          <Input type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field>
          <Label>Figure ({kpi.unit})</Label>
          <Input type="number" required step="any" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-muted">A figure already recorded for that {kpi.period} is replaced.</p>
      <Field>
        <Label>Note (optional)</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Record"}</Button>
      </div>
    </form>
  );
}

// ---------- performance reviews and goals (Owner and Manager only) ----------

const RATING_LABEL = ["", "Needs a lot of work", "Below expectations", "Meets expectations", "Above expectations", "Excellent"];

export function ReviewsPanel() {
  const { reviews, employees, deleteReview } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState<{ review: PerformanceReview | null; employeeId?: string } | null>(null);
  const today = todayIso();
  const due = reviewsDue(
    employees.map((e) => ({ id: e.id, name: e.name, active: true })),
    reviews.map((r) => ({ employeeId: r.employeeId, date: r.date, nextReviewOn: r.nextReviewOn })),
    today,
  );
  const never = due.filter((d) => d.state === "never").length;

  async function remove(r: PerformanceReview) {
    if (!confirm(`Delete the review of ${r.employeeName} from ${r.date}?`)) return;
    try {
      await deleteReview(r.id);
      toast.success("Deleted");
    } catch (err) {
      toast.error("Couldn't delete it", toastableErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted">
          Visible to the Owner and Manager only. A review is due for each person every six months, or on the date set in the last review.
          {due.length > 0 && <> · {due.length} due{never > 0 ? ` (${never} never reviewed)` : ""}</>}
        </div>
        <Button onClick={() => setFormOpen({ review: null })} disabled={employees.length === 0}>+ New review</Button>
      </div>

      {employees.length === 0 && (
        <EmptyState title="No team members on the payroll list yet" body="Reviews are kept against the people on the Team page's payroll list. Add them there first." />
      )}

      {due.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium">Due for a review</div>
          <div className="mt-2 space-y-2">
            {due.map((d) => (
              <div key={d.employeeId} className="flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 truncate">
                  <span className="text-fg">{d.name}</span>
                  <span className="text-muted"> · {d.state === "never" ? "never reviewed" : `last ${d.lastDate}, due ${d.dueOn}`}</span>
                </div>
                <button onClick={() => setFormOpen({ review: null, employeeId: d.employeeId })} className="text-amber-soft hover:underline shrink-0 min-h-[32px]">
                  Start review
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {reviews.map((r) => {
        const done = r.goals.filter((g) => g.done).length;
        return (
          <Card key={r.id} className="p-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{r.employeeName}</span>
              <Badge>{r.rating}/5 · {RATING_LABEL[r.rating]}</Badge>
            </div>
            <div className="text-xs text-muted mt-1">
              {r.date}
              {r.goals.length > 0 && <> · goals {done} of {r.goals.length} done</>}
              {r.nextReviewOn && <> · next review {r.nextReviewOn}</>}
              {r.createdByName && <> · by {r.createdByName}</>}
            </div>
            {r.strengths && <div className="text-xs mt-2 whitespace-pre-wrap"><span className="text-muted">Going well: </span>{r.strengths}</div>}
            {r.improvements && <div className="text-xs mt-1 whitespace-pre-wrap"><span className="text-muted">To improve: </span>{r.improvements}</div>}
            {r.goals.length > 0 && (
              <ul className="text-xs mt-2 space-y-0.5">
                {r.goals.map((g) => (
                  <li key={g.id} className={g.done ? "text-muted line-through" : ""}>
                    {g.done ? "✓ " : "○ "}{g.text}{g.dueDate ? ` (by ${g.dueDate})` : ""}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
              <button onClick={() => setFormOpen({ review: r })} className="text-xs text-muted hover:text-fg min-h-[32px]">Edit</button>
              {role === "owner" && <button onClick={() => remove(r)} className="text-xs text-muted hover:text-fg min-h-[32px]">Delete</button>}
            </div>
          </Card>
        );
      })}

      <Modal open={formOpen !== null} onClose={() => setFormOpen(null)} title={formOpen?.review ? "Edit review" : "New review"}>
        {formOpen !== null && (
          <ReviewForm
            key={formOpen.review?.id ?? formOpen.employeeId ?? "new"}
            initial={formOpen.review}
            presetEmployeeId={formOpen.employeeId}
            onDone={() => setFormOpen(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function ReviewForm({ initial, presetEmployeeId, onDone }: { initial: PerformanceReview | null; presetEmployeeId?: string; onDone: () => void }) {
  const { employees, addReview, updateReview } = useData();
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? presetEmployeeId ?? employees[0]?.id ?? "");
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [rating, setRating] = useState(initial?.rating ?? 3);
  const [strengths, setStrengths] = useState(initial?.strengths ?? "");
  const [improvements, setImprovements] = useState(initial?.improvements ?? "");
  const [nextReviewOn, setNextReviewOn] = useState(initial?.nextReviewOn ?? "");
  const [goals, setGoals] = useState<{ text: string; dueDate: string; done: boolean }[]>(
    initial?.goals.map((g) => ({ text: g.text, dueDate: g.dueDate ?? "", done: g.done })) ?? [],
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const emp = employees.find((x) => x.id === employeeId);
    if (!emp) return toast.error("Choose who the review is for");
    const input: ReviewInput & { employeeId: string } = {
      employeeId,
      employeeName: emp.name,
      date,
      rating,
      strengths: strengths.trim() || undefined,
      improvements: improvements.trim() || undefined,
      goals: goals.map((g) => ({ text: g.text, dueDate: g.dueDate || undefined, done: g.done })),
      nextReviewOn: nextReviewOn || undefined,
    };
    const problem = validateReview(input);
    if (problem) return toast.error("Check the review", problem);
    setBusy(true);
    try {
      if (initial) await updateReview(initial.id, input);
      else await addReview(input);
      toast.success(initial ? "Review saved" : "Review recorded");
      onDone();
    } catch (err) {
      toast.error("Couldn't save the review", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Who</Label>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={!!initial}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field>
          <Label>Date of the review</Label>
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Overall rating</Label>
          <Select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{r} · {RATING_LABEL[r]}</option>)}
          </Select>
        </Field>
        <Field>
          <Label>Next review (optional)</Label>
          <Input type="date" value={nextReviewOn} onChange={(e) => setNextReviewOn(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>What is going well</Label>
        <Textarea rows={2} value={strengths} onChange={(e) => setStrengths(e.target.value)} maxLength={MAX_TEXT} />
      </Field>
      <Field>
        <Label>What to improve</Label>
        <Textarea rows={2} value={improvements} onChange={(e) => setImprovements(e.target.value)} maxLength={MAX_TEXT} />
      </Field>
      <div className="space-y-2">
        <Label>Goals (up to 10)</Label>
        {goals.map((g, idx) => (
          <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
            <Input value={g.text} onChange={(e) => setGoals(goals.map((x, i) => (i === idx ? { ...x, text: e.target.value } : x)))} placeholder="e.g. Close the till within 5 minutes" maxLength={300} />
            <Input type="date" value={g.dueDate} onChange={(e) => setGoals(goals.map((x, i) => (i === idx ? { ...x, dueDate: e.target.value } : x)))} />
            <label className="text-xs flex items-center gap-1.5">
              <input type="checkbox" checked={g.done} onChange={(e) => setGoals(goals.map((x, i) => (i === idx ? { ...x, done: e.target.checked } : x)))} />
              Done
            </label>
            <button type="button" onClick={() => setGoals(goals.filter((_, i) => i !== idx))} className="text-xs text-muted hover:text-fg">Remove</button>
          </div>
        ))}
        {goals.length < 10 && (
          <button type="button" onClick={() => setGoals([...goals, { text: "", dueDate: "", done: false }])} className="text-xs text-amber-soft hover:underline">
            + Add a goal
          </button>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save review"}</Button>
      </div>
    </form>
  );
}
