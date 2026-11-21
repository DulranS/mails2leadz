"use client";

// Delegation: work handed to team members, or to freelancers and contractors with no login. Shows who is carrying what, what is
// overdue, and what got done. It records and reads only: nothing is sent to the person (the owner or manager tells them), and no
// figure in the books changes. Owner and Manager write; the accountant can read.
import { useMemo, useState, type FormEvent } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/format";
import { MAX_ASSIGNEE_NAME, MAX_SUBTASK_TITLE, MAX_SUBTASKS, MAX_TASK_DETAIL, MAX_TASK_TITLE, byAssignee, cleanTaskInput, isDueToday, isOverdue, sortTasks, subtaskProgress, summarizeTasks, toggleSubtask, validateTaskInput, type TaskInput } from "@/lib/tasks";
import type { BusinessSubtask, BusinessTask } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, Stat, Tabs, TableCardSkeleton, Textarea } from "@/components/ui";

const MEMBER_PICK = "__member__";
const OUTSIDE_PICK = "__outside__";

function toInput(t: BusinessTask): TaskInput {
  return {
    title: t.title,
    details: t.details,
    assigneeName: t.assigneeName,
    assigneeKind: t.assigneeKind,
    assigneeUid: t.assigneeUid,
    dueDate: t.dueDate,
    priority: t.priority,
    subtasks: t.subtasks,
  };
}

export default function TasksPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const { tasks, members, loading, addBusinessTask, updateBusinessTask, setBusinessTaskDone, deleteBusinessTask } = useData();
  const toast = useToast();
  const canWrite = can(role, "manage:tasks");
  const canDelete = can(role, "delete:records");
  const today = todayIso();

  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessTask | null>(null);
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => summarizeTasks(tasks, today), [tasks, today]);
  const people = useMemo(() => byAssignee(tasks, today), [tasks, today]);
  const shown = useMemo(() => sortTasks(tasks.filter((t) => filter === "all" || t.status === filter), today), [tasks, filter, today]);

  if (guardLoading || !allowed) return null;
  if (loading) {
    return (
      <>
        <PageHeader title="Delegation" />
        <TableCardSkeleton rows={4} cols={3} />
      </>
    );
  }

  async function save(input: TaskInput) {
    const clean = cleanTaskInput(input);
    const problem = validateTaskInput(clean);
    if (problem) {
      toast.error("Can't save yet", problem);
      return;
    }
    setBusy(true);
    try {
      if (editing) await updateBusinessTask(editing.id, clean);
      else await addBusinessTask(clean);
      toast.success(editing ? "Saved" : "Task handed over", clean.assigneeName);
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      toast.error("Couldn't save", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(t: BusinessTask) {
    try {
      await setBusinessTaskDone(t.id, t.status !== "done", today);
    } catch (err) {
      toast.error("Couldn't update", toastableErrorMessage(err));
    }
  }

  // Ticks a checklist step. Saved as a whole task edit, so the other fields are kept exactly as they were.
  async function tickStep(t: BusinessTask, stepId: string) {
    try {
      await updateBusinessTask(t.id, { ...toInput(t), subtasks: toggleSubtask(t.subtasks ?? [], stepId) });
    } catch (err) {
      toast.error("Couldn't update", toastableErrorMessage(err));
    }
  }

  async function remove(t: BusinessTask) {
    if (!window.confirm(`Delete "${t.title}"? This can't be undone.`)) return;
    try {
      await deleteBusinessTask(t.id);
      toast.success("Task deleted");
    } catch (err) {
      toast.error("Couldn't delete", toastableErrorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Delegation"
        action={canWrite ? <Button onClick={() => { setEditing(null); setFormOpen(true); }}>Hand over a task</Button> : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Stat label="Open" value={String(summary.open)} />
        <Stat label="Overdue" value={String(summary.overdue)} tone={summary.overdue > 0 ? "bad" : "default"} />
        <Stat label="Due today" value={String(summary.dueToday)} />
        <Stat label="Urgent, open" value={String(summary.urgentOpen)} tone={summary.urgentOpen > 0 ? "bad" : "default"} />
        <Stat label="Done in 7 days" value={String(summary.doneLast7)} />
      </div>

      <Card className="mb-5">
        <div className="text-sm font-medium mb-2">Who has what</div>
        {people.length === 0 ? (
          <div className="text-sm text-muted">Nobody has been handed anything yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Person</th>
                  <th className="py-2 pr-3 font-medium">Open</th>
                  <th className="py-2 pr-3 font-medium">Overdue</th>
                  <th className="py-2 pr-3 font-medium">Done in 30 days</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.key} className="border-t border-line">
                    <td className="py-2 pr-3">
                      {p.name} {p.kind === "outside" && <span className="text-xs text-muted">(outside)</span>}
                    </td>
                    <td className="py-2 pr-3 num">{p.open}</td>
                    <td className={`py-2 pr-3 num ${p.overdue > 0 ? "text-bad" : ""}`}>{p.overdue}</td>
                    <td className="py-2 pr-3 num">{p.doneLast30}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mb-3">
        <Tabs
          tabs={[
            { key: "open", label: "Open" },
            { key: "done", label: "Done" },
            { key: "all", label: "All" },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={filter === "done" ? "Nothing marked done yet" : "Nothing handed over yet"}
          body="Hand a task to a team member or a freelancer with a due date. Overdue work rises to the top, and the Who has what table shows who is carrying the most."
          action={canWrite ? <Button onClick={() => { setEditing(null); setFormOpen(true); }}>Hand over a task</Button> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {shown.map((t) => {
            const overdue = isOverdue(t, today);
            const dueToday = isDueToday(t, today);
            return (
              <Card key={t.id} className="!p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${t.status === "done" ? "line-through text-muted" : ""}`}>{t.title}</div>
                    <div className="text-xs text-muted mt-0.5">
                      For {t.assigneeName}
                      {t.assigneeKind === "outside" ? " (outside)" : ""}
                      {t.dueDate ? ` · due ${t.dueDate}` : " · no due date"}
                      {t.status === "done" && t.doneOn ? ` · done ${t.doneOn}` : ""}
                    </div>
                    {t.details && <div className="text-xs text-muted mt-1 whitespace-pre-wrap">{t.details}</div>}
                    {(t.subtasks ?? []).length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-xs text-muted num">{subtaskProgress(t).done} of {subtaskProgress(t).total} steps done</div>
                        {(t.subtasks ?? []).map((s) => (
                          <label key={s.id} className="flex items-center gap-2 text-xs min-h-[32px]">
                            <input
                              type="checkbox"
                              checked={s.done}
                              disabled={!canWrite}
                              onChange={() => tickStep(t, s.id)}
                              className="w-4 h-4 accent-amber"
                            />
                            <span className={s.done ? "line-through text-muted" : ""}>{s.title}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {overdue && <Badge tone="bad">Overdue</Badge>}
                    {dueToday && <Badge tone="amber">Due today</Badge>}
                    {t.priority === "urgent" && t.status === "open" && <Badge tone="bad">Urgent</Badge>}
                    {canWrite && (
                      <>
                        <Button variant="ghost" onClick={() => toggle(t)}>{t.status === "done" ? "Reopen" : "Mark done"}</Button>
                        <Button variant="ghost" onClick={() => { setEditing(t); setFormOpen(true); }}>Edit</Button>
                      </>
                    )}
                    {canDelete && <Button variant="ghost" onClick={() => remove(t)}>Delete</Button>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} title={editing ? "Edit task" : "Hand over a task"}>
        <TaskForm
          key={editing?.id ?? "new"}
          initial={editing ? toInput(editing) : undefined}
          members={members.filter((m) => m.active)}
          busy={busy}
          onSave={save}
          onCancel={() => { setFormOpen(false); setEditing(null); }}
        />
      </Modal>
    </>
  );
}

function TaskForm({
  initial,
  members,
  busy,
  onSave,
  onCancel,
}: {
  initial?: TaskInput;
  members: { id: string; name: string }[];
  busy: boolean;
  onSave: (i: TaskInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [details, setDetails] = useState(initial?.details ?? "");
  const [kind, setKind] = useState<"member" | "outside">(initial?.assigneeKind ?? "member");
  const [memberId, setMemberId] = useState(initial?.assigneeUid ?? "");
  const [outsideName, setOutsideName] = useState(kind === "outside" ? initial?.assigneeName ?? "" : "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [priority, setPriority] = useState<"normal" | "urgent">(initial?.priority ?? "normal");
  const [steps, setSteps] = useState<BusinessSubtask[]>(initial?.subtasks ?? []);
  const [stepDraft, setStepDraft] = useState("");

  function addStep() {
    const text = stepDraft.trim();
    if (!text || steps.length >= MAX_SUBTASKS) return;
    setSteps([...steps, { id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), title: text.slice(0, MAX_SUBTASK_TITLE), done: false }]);
    setStepDraft("");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const picked = members.find((m) => m.id === memberId);
    onSave({
      title,
      details,
      assigneeKind: kind,
      assigneeName: kind === "member" ? picked?.name ?? "" : outsideName,
      assigneeUid: kind === "member" ? memberId || undefined : undefined,
      dueDate: dueDate || undefined,
      priority,
      subtasks: steps,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field>
        <Label>What needs doing</Label>
        <Input required maxLength={MAX_TASK_TITLE} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field>
        <Label>Details (optional)</Label>
        <Textarea rows={3} maxLength={MAX_TASK_DETAIL} value={details} onChange={(e) => setDetails(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Who is it for</Label>
          <Select
            value={kind === "member" ? MEMBER_PICK : OUTSIDE_PICK}
            onChange={(e) => setKind(e.target.value === OUTSIDE_PICK ? "outside" : "member")}
          >
            <option value={MEMBER_PICK}>A team member</option>
            <option value={OUTSIDE_PICK}>A freelancer or contractor (no login)</option>
          </Select>
        </Field>
        {kind === "member" ? (
          <Field>
            <Label>Team member</Label>
            <Select required value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">Select…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field>
            <Label>Their name</Label>
            <Input required maxLength={MAX_ASSIGNEE_NAME} value={outsideName} onChange={(e) => setOutsideName(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Due date (optional)</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Priority</Label>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as "normal" | "urgent")}>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </Select>
        </Field>
      </div>
      <Field>
        <Label>Checklist (optional, {steps.length} of {MAX_SUBTASKS})</Label>
        {steps.length > 0 && (
          <div className="space-y-1 mb-2">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 break-words">{i + 1}. {s.title}</span>
                <Button type="button" variant="ghost" className="text-xs" onClick={() => setSteps(steps.filter((x) => x.id !== s.id))}>Remove</Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={stepDraft}
            maxLength={MAX_SUBTASK_TITLE}
            placeholder="Add a step, then press Add"
            onChange={(e) => setStepDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStep();
              }
            }}
          />
          <Button type="button" variant="ghost" onClick={addStep} disabled={!stepDraft.trim() || steps.length >= MAX_SUBTASKS}>Add</Button>
        </div>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
