"use client";

// The risk register (owner and manager) and the quality log (everyone who works in the business), both on the Operations page.
// Nothing here posts to the books, moves stock or contacts anyone. Scores and pass rates are computed from the records (lib/riskQuality.ts).
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, Select, Textarea } from "@/components/ui";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/format";
import {
  QUALITY_AREAS, QUALITY_RESULTS, RISK_CATEGORIES, RISK_STATUSES, correctiveActionOpen, qualitySummary, riskBand,
  riskReviewDue, riskScore, riskSummary, validateQualityCheck, validateRisk, type QualityInput, type RiskInput,
} from "@/lib/riskQuality";
import type { QualityCheck, Risk } from "@/lib/types";

const label = (list: { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;
const BAND_TONE = { high: "bad", medium: "amber", low: "good" } as const;

// ---------- risk register ----------

export function RisksPanel() {
  const { risks, deleteRisk } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const canManage = can(role, "manage:operations");
  const [formOpen, setFormOpen] = useState<Risk | "new" | null>(null);
  const today = todayIso();
  const summary = riskSummary(risks, today);
  const sorted = [...risks].sort((a, b) => riskScore(b.likelihood, b.impact) - riskScore(a.likelihood, a.impact));

  async function remove(r: Risk) {
    if (!confirm(`Delete the risk "${r.title}"?`)) return;
    try {
      await deleteRisk(r.id);
      toast.success("Deleted");
    } catch (err) {
      toast.error("Couldn't delete it", toastableErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted">
          {summary.open} open{summary.high > 0 && <> · <span className="text-bad">{summary.high} high</span></>}
          {summary.reviewDue > 0 && <> · <span className="text-amber-soft">{summary.reviewDue} due for review</span></>}
          {" "}· scored likelihood × impact, 1 to 25 (15 and above is high). Keep a continuity entry for what to do if the usual way fails.
        </div>
        {canManage && <Button onClick={() => setFormOpen("new")}>+ Add risk</Button>}
      </div>
      {sorted.length === 0 ? (
        <EmptyState
          title="No risks recorded"
          body="Write down what could stop the business or cost it heavily, how likely and how serious, and what you are doing about it. Add a continuity entry too: who covers what if the main person, supplier or system is unavailable."
          action={canManage ? <Button onClick={() => setFormOpen("new")}>+ Add risk</Button> : undefined}
        />
      ) : (
        sorted.map((r) => {
          const score = riskScore(r.likelihood, r.impact);
          const band = riskBand(score);
          const due = riskReviewDue(r, today);
          return (
            <Card key={r.id} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{r.title}</span>
                <Badge tone={BAND_TONE[band]}>score {score} · {band}</Badge>
                <Badge>{label(RISK_CATEGORIES, r.category)}</Badge>
                <Badge tone={r.status === "open" ? "amber" : "default"}>{label(RISK_STATUSES, r.status)}</Badge>
                {due && <Badge tone="amber">review due</Badge>}
              </div>
              <div className="text-xs text-muted mt-1">
                Likelihood {r.likelihood}/5 · impact {r.impact}/5
                {r.ownerName && <> · owner {r.ownerName}</>}
                {r.reviewOn && <> · review by {r.reviewOn}</>}
              </div>
              {r.description && <div className="text-sm mt-2 whitespace-pre-wrap">{r.description}</div>}
              {r.mitigation && <div className="text-xs mt-2 whitespace-pre-wrap"><span className="text-muted">What is done: </span>{r.mitigation}</div>}
              {canManage && (
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                  <button onClick={() => setFormOpen(r)} className="text-xs text-muted hover:text-fg min-h-[32px]">Edit</button>
                  {role === "owner" && <button onClick={() => remove(r)} className="text-xs text-muted hover:text-fg min-h-[32px]">Delete</button>}
                </div>
              )}
            </Card>
          );
        })
      )}
      <Modal open={formOpen !== null} onClose={() => setFormOpen(null)} title={formOpen && formOpen !== "new" ? "Edit risk" : "New risk"}>
        {formOpen !== null && <RiskForm key={formOpen === "new" ? "new" : formOpen.id} initial={formOpen === "new" ? null : formOpen} onDone={() => setFormOpen(null)} />}
      </Modal>
    </div>
  );
}

function RiskForm({ initial, onDone }: { initial: Risk | null; onDone: () => void }) {
  const { addRisk, updateRisk } = useData();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? "operational");
  const [likelihood, setLikelihood] = useState(initial?.likelihood ?? 3);
  const [impact, setImpact] = useState(initial?.impact ?? 3);
  const [status, setStatus] = useState(initial?.status ?? "open");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [mitigation, setMitigation] = useState(initial?.mitigation ?? "");
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? "");
  const [reviewOn, setReviewOn] = useState(initial?.reviewOn ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: RiskInput = { title, category, likelihood: Number(likelihood), impact: Number(impact), status, description, mitigation, ownerName, reviewOn: reviewOn || undefined };
    const problem = validateRisk(input);
    if (problem) return toast.error("Check the risk", problem);
    setBusy(true);
    try {
      if (initial) await updateRisk(initial.id, input);
      else await addRisk(input);
      toast.success(initial ? "Saved" : "Risk added");
      onDone();
    } catch (err) {
      toast.error("Couldn't save it", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const scale = [1, 2, 3, 4, 5];
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field>
        <Label>What could happen</Label>
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="e.g. Main supplier stops delivering" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Kind</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {RISK_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <Field>
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as Risk["status"])}>
            {RISK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>
        <Field>
          <Label>Likelihood (1 rare to 5 almost certain)</Label>
          <Select value={likelihood} onChange={(e) => setLikelihood(Number(e.target.value))}>
            {scale.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Field>
          <Label>Impact (1 minor to 5 severe)</Label>
          <Select value={impact} onChange={(e) => setImpact(Number(e.target.value))}>
            {scale.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
        <Field>
          <Label>Who keeps an eye on it (optional)</Label>
          <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={120} />
        </Field>
        <Field>
          <Label>Look at it again on (optional)</Label>
          <Input type="date" value={reviewOn} onChange={(e) => setReviewOn(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>Description (optional)</Label>
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
      </Field>
      <Field>
        <Label>What is done about it, or what to do if it happens (optional)</Label>
        <Textarea rows={3} value={mitigation} onChange={(e) => setMitigation(e.target.value)} maxLength={1000} placeholder="e.g. Second supplier on file; keep 3 weeks of the top 10 lines; who covers the Monday run if the driver is ill" />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

// ---------- quality log ----------

export function QualityPanel() {
  const { qualityChecks, deleteQualityCheck } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const canManage = can(role, "manage:operations");
  const canLog = can(role, "log:quality");
  const [formOpen, setFormOpen] = useState<QualityCheck | "new" | null>(null);
  const today = todayIso();
  const summary = qualitySummary(qualityChecks, today);
  const list = [...qualityChecks].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);

  async function remove(q: QualityCheck) {
    if (!confirm(`Delete the quality check "${q.title}"?`)) return;
    try {
      await deleteQualityCheck(q.id);
      toast.success("Deleted");
    } catch (err) {
      toast.error("Couldn't delete it", toastableErrorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted">
          {summary.passRate !== null
            ? <>Last {summary.days} days: {summary.checks} check{summary.checks === 1 ? "" : "s"}, <span className="num">{summary.passRate}%</span> passed.</>
            : <>No checks in the last {summary.days} days.</>}
          {summary.openActions > 0 && <> · <span className="text-amber-soft">{summary.openActions} corrective action{summary.openActions === 1 ? "" : "s"} still open</span></>}
        </div>
        {canLog && <Button onClick={() => setFormOpen("new")}>+ Log a check</Button>}
      </div>
      {list.length === 0 ? (
        <EmptyState
          title="No quality checks logged"
          body="Log a check when you inspect a product, a service, a production batch, a delivery or a complaint. A failed check or a complaint can have a corrective action, which stays open until it is marked done."
          action={canLog ? <Button onClick={() => setFormOpen("new")}>+ Log a check</Button> : undefined}
        />
      ) : (
        list.map((q) => {
          const open = correctiveActionOpen(q);
          return (
            <Card key={q.id} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{q.title}</span>
                <Badge tone={q.result === "fail" ? "bad" : q.result === "conditional" ? "amber" : "good"}>{label(QUALITY_RESULTS, q.result)}</Badge>
                <Badge>{label(QUALITY_AREAS, q.area)}</Badge>
                {open && <Badge tone="amber">action open</Badge>}
              </div>
              <div className="text-xs text-muted mt-1">
                {q.date}
                {typeof q.defectsFound === "number" && <> · {q.defectsFound} defect{q.defectsFound === 1 ? "" : "s"}</>}
                {q.createdByName && <> · checked by {q.createdByName}</>}
                {q.actionDueOn && <> · action due {q.actionDueOn}</>}
              </div>
              {q.defectNote && <div className="text-xs mt-2 whitespace-pre-wrap"><span className="text-muted">What was wrong: </span>{q.defectNote}</div>}
              {q.correctiveAction && (
                <div className="text-xs mt-2 whitespace-pre-wrap">
                  <span className="text-muted">Corrective action{q.actionOwner ? ` (${q.actionOwner})` : ""}: </span>
                  {q.correctiveAction}
                  {q.actionDoneOn && <span className="text-good"> · done {q.actionDoneOn}</span>}
                </div>
              )}
              {canManage && (
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                  <button onClick={() => setFormOpen(q)} className="text-xs text-muted hover:text-fg min-h-[32px]">
                    {open ? "Edit or mark action done" : "Edit"}
                  </button>
                  {role === "owner" && <button onClick={() => remove(q)} className="text-xs text-muted hover:text-fg min-h-[32px]">Delete</button>}
                </div>
              )}
            </Card>
          );
        })
      )}
      <Modal open={formOpen !== null} onClose={() => setFormOpen(null)} title={formOpen && formOpen !== "new" ? "Quality check" : "Log a quality check"}>
        {formOpen !== null && <QualityForm key={formOpen === "new" ? "new" : formOpen.id} initial={formOpen === "new" ? null : formOpen} canManage={canManage} onDone={() => setFormOpen(null)} />}
      </Modal>
    </div>
  );
}

function QualityForm({ initial, canManage, onDone }: { initial: QualityCheck | null; canManage: boolean; onDone: () => void }) {
  const { addQualityCheck, updateQualityCheck } = useData();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [area, setArea] = useState(initial?.area ?? "product");
  const [result, setResult] = useState(initial?.result ?? "pass");
  const [defects, setDefects] = useState(initial?.defectsFound?.toString() ?? "");
  const [defectNote, setDefectNote] = useState(initial?.defectNote ?? "");
  const [correctiveAction, setCorrectiveAction] = useState(initial?.correctiveAction ?? "");
  const [actionOwner, setActionOwner] = useState(initial?.actionOwner ?? "");
  const [actionDueOn, setActionDueOn] = useState(initial?.actionDueOn ?? "");
  const [actionDoneOn, setActionDoneOn] = useState(initial?.actionDoneOn ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: QualityInput & { actionDoneOn?: string | null } = {
      title,
      date,
      area,
      result,
      defectsFound: defects.trim() === "" ? undefined : Number(defects),
      defectNote,
      correctiveAction,
      actionOwner,
      actionDueOn: actionDueOn || undefined,
      ...(initial && canManage ? { actionDoneOn: actionDoneOn || null } : {}),
    };
    const problem = validateQualityCheck(input);
    if (problem) return toast.error("Check the entry", problem);
    setBusy(true);
    try {
      if (initial) await updateQualityCheck(initial.id, input);
      else await addQualityCheck(input);
      toast.success(initial ? "Saved" : "Check logged");
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
        <Label>What was checked</Label>
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="e.g. Batch 14 of the sauce, Table 6's order, the Tuesday delivery" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Date</Label>
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Kind of check</Label>
          <Select value={area} onChange={(e) => setArea(e.target.value)}>
            {QUALITY_AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </Select>
        </Field>
        <Field>
          <Label>Result</Label>
          <Select value={result} onChange={(e) => setResult(e.target.value as QualityCheck["result"])}>
            {QUALITY_RESULTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </Field>
        <Field>
          <Label>Defects found (optional)</Label>
          <Input type="number" min="0" step="1" value={defects} onChange={(e) => setDefects(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>What was wrong {result === "fail" ? "(needed for a failed check)" : "(optional)"}</Label>
        <Textarea rows={2} value={defectNote} onChange={(e) => setDefectNote(e.target.value)} maxLength={1000} />
      </Field>
      <Field>
        <Label>Corrective action (optional)</Label>
        <Textarea rows={2} value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} maxLength={1000} placeholder="What will stop it happening again" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field>
          <Label>Who does it</Label>
          <Input value={actionOwner} onChange={(e) => setActionOwner(e.target.value)} maxLength={120} />
        </Field>
        <Field>
          <Label>Due by</Label>
          <Input type="date" value={actionDueOn} onChange={(e) => setActionDueOn(e.target.value)} />
        </Field>
        {initial && canManage && (
          <Field>
            <Label>Done on</Label>
            <Input type="date" value={actionDoneOn} onChange={(e) => setActionDoneOn(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
