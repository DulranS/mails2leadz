"use client";

// Procedures the team must read. An Owner or Manager writes them; each operating member confirms they have read the current
// version. Editing the steps makes a new version, so everyone is asked again. Nothing here is sent or enforced beyond that record.
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, Textarea } from "@/components/ui";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/format";
import { MAX_BODY, pendingAcks, procedureReviewDue, validateProcedure, type ProcedureInput } from "@/lib/operations";
import type { StaffProcedure } from "@/lib/types";

import ProcessFlow from "@/components/ops/ProcessFlow";

export default function ProceduresPanel() {
  const { procedures, members, updateProcedureAck, deleteProcedure } = useData();
  const { role, user } = useAuth();
  const toast = useToast();
  const canWrite = can(role, "manage:procedures");
  const canAck = can(role, "ack:procedure");
  const [formOpen, setFormOpen] = useState<StaffProcedure | "new" | null>(null);
  const [viewing, setViewing] = useState<StaffProcedure | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayIso();
  const team = members.map((m) => ({ uid: m.id, name: m.name, role: m.role, active: m.active }));

  async function acknowledge(p: StaffProcedure) {
    setBusy(true);
    try {
      await updateProcedureAck(p.id);
      toast.success("Recorded", `You have read ${p.title}, version ${p.version}`);
      setViewing(null);
    } catch (err) {
      toast.error("Couldn't record that", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: StaffProcedure) {
    if (!confirm(`Delete the procedure "${p.title}"? Everyone's read records for it go with it.`)) return;
    try {
      await deleteProcedure(p.id);
      toast.success("Procedure deleted");
    } catch (err) {
      toast.error("Couldn't delete it", toastableErrorMessage(err));
    }
  }

  if (procedures.length === 0) {
    return (
      <>
        <EmptyState
          title="No procedures yet"
          body="Write down how the important jobs are done, step by step, so anyone can follow them. Each person confirms they have read it, and it is asked again whenever the steps change."
          action={canWrite ? <Button onClick={() => setFormOpen("new")}>+ New procedure</Button> : undefined}
        />
        <ProcedureForm open={formOpen !== null} initial={formOpen && formOpen !== "new" ? formOpen : null} onClose={() => setFormOpen(null)} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted">
          {procedures.length} procedure{procedures.length === 1 ? "" : "s"}
          {canWrite && " · the team is asked to read each new version"}
        </div>
        {canWrite && <Button onClick={() => setFormOpen("new")}>+ New procedure</Button>}
      </div>

      {procedures.map((p) => {
        const createdDay = new Date(p.createdAt).toISOString().slice(0, 10);
        const review = procedureReviewDue({ reviewEveryDays: p.reviewEveryDays, lastReviewed: p.lastReviewed, createdDay }, today);
        const mine = p.acks?.[user?.uid ?? ""]?.version === p.version;
        const waiting = pendingAcks(p as StaffProcedure & { id: string }, team);
        return (
          <Card key={p.id} className="p-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{p.title}</span>
              <Badge>v{p.version}</Badge>
              {review.due && <Badge tone="amber">Due for review</Badge>}
            </div>
            <div className="text-xs text-muted mt-1">
              {canAck && (mine ? "You have read this version." : "You still need to read this version.")}
              {canWrite && (
                <>
                  {canAck && " · "}
                  {waiting.length === 0
                    ? "Everyone has read this version."
                    : `${waiting.length} still to read it: ${waiting.map((w) => w.name).join(", ")}`}
                </>
              )}
              {review.dueOn && !review.due && <> · review by {review.dueOn}</>}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
              <button onClick={() => setViewing(p)} className="text-xs text-amber-soft hover:underline min-h-[32px]">
                Read it
              </button>
              {canWrite && (
                <button onClick={() => setFormOpen(p)} className="text-xs text-muted hover:text-fg min-h-[32px]">
                  Edit
                </button>
              )}
              {role === "owner" && (
                <button onClick={() => remove(p)} className="text-xs text-muted hover:text-fg min-h-[32px]">
                  Delete
                </button>
              )}
            </div>
          </Card>
        );
      })}

      <Modal open={viewing !== null} onClose={() => setViewing(null)} title={viewing?.title ?? "Procedure"}>
        {viewing && (
          <div className="space-y-4">
            <div className="text-xs text-muted">Version {viewing.version}</div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{viewing.body}</div>
            {viewing.videoUrl ? <a href={viewing.videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">Watch the recorded video</a> : null}
            <ProcessFlow title={viewing.title} body={viewing.body} />
            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              {canAck && viewing.acks?.[user?.uid ?? ""]?.version !== viewing.version && (
                <Button onClick={() => acknowledge(viewing)} disabled={busy}>
                  {busy ? "Recording…" : `I have read version ${viewing.version}`}
                </Button>
              )}
              {canAck && viewing.acks?.[user?.uid ?? ""]?.version === viewing.version && <span className="text-xs text-muted self-center">You have read this version.</span>}
            </div>
          </div>
        )}
      </Modal>

      <ProcedureForm open={formOpen !== null} initial={formOpen && formOpen !== "new" ? formOpen : null} onClose={() => setFormOpen(null)} />
    </div>
  );
}

function ProcedureForm({ open, initial, onClose }: { open: boolean; initial: StaffProcedure | null; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit procedure" : "New procedure"}>
      {open && <ProcedureFormBody key={initial?.id ?? "new"} initial={initial} onDone={onClose} />}
    </Modal>
  );
}

function ProcedureFormBody({ initial, onDone }: { initial: StaffProcedure | null; onDone: () => void }) {
  const { addProcedure, updateProcedure } = useData();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [every, setEvery] = useState(initial?.reviewEveryDays?.toString() ?? "");
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? "");
  const [markReviewed, setMarkReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const changed = !!initial && (title.trim() !== initial.title || body.trim() !== initial.body.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: ProcedureInput = {
      title,
      body,
      reviewEveryDays: every.trim() === "" ? undefined : Number(every),
      videoUrl: videoUrl.trim() || undefined,
      markReviewed: initial ? markReviewed : false,
    };
    const problem = validateProcedure(input);
    if (problem) {
      toast.error("Check the procedure", problem);
      return;
    }
    setBusy(true);
    try {
      if (initial) await updateProcedure(initial.id, input);
      else await addProcedure(input);
      toast.success(initial ? "Procedure saved" : "Procedure added", changed ? "The team will be asked to read the new version" : undefined);
      onDone();
    } catch (err) {
      toast.error("Couldn't save the procedure", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field>
        <Label>Title</Label>
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="e.g. Opening the shop" />
      </Field>
      <Field>
        <Label>Steps</Label>
        <Textarea required rows={12} value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX_BODY} placeholder={"1. Unlock the front door\n2. Switch on the fridges and check the temperature\n3. Count the till float"} />
        {changed && <p className="text-xs text-amber-soft mt-1">Changing the steps or title makes a new version. Everyone will be asked to read it again.</p>}
      </Field>
      <Field>
        <Label>Recorded video link (optional)</Label>
        <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} maxLength={500} placeholder="https://…" />
        <div className="text-xs text-muted mt-1">A link to a video of the job (Drive, YouTube, Loom or similar). It must start with https://. Changing only the link does not ask people to read it again.</div>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Review every (days, optional)</Label>
          <Input type="number" min="1" max="3650" step="1" value={every} onChange={(e) => setEvery(e.target.value)} placeholder="e.g. 90" />
        </Field>
        {initial && initial.reviewEveryDays && (
          <label className="flex items-start gap-2 text-sm self-end pb-2">
            <input type="checkbox" className="mt-1" checked={markReviewed} onChange={(e) => setMarkReviewed(e.target.checked)} />
            <span>I have checked it today and it is still right</span>
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
