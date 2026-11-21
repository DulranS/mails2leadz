"use client";

// Rota: who works which hours on which day, week by week. Owner and manager set shifts; everyone on the team can read it.
// Leave that overlaps a shift is flagged, not blocked. Nothing is paid from here: pay stays on the employee record.
import { useMemo, useState, type FormEvent } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/format";
import { MAX_ROTA_NOTE, copyWeekPlan, leaveClashes, leaveOn, mondayOf, shiftHours, validateShift, weekDates, weekHours, type ShiftInput } from "@/lib/rota";
import { weeklyOffClashes } from "@/lib/weeklyOff";
import type { ShiftEntry } from "@/lib/types";
import { Button, Card, Field, Input, Label, Modal, PageHeader, Select, Stat, TableCardSkeleton, Textarea } from "@/components/ui";

const dayHead = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
const weekLabel = (monday: string) => {
  const sun = weekDates(monday)[6];
  const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${fmt(monday)} to ${fmt(sun)}`;
};
const hours = (h: number) => `${Math.round(h * 100) / 100} h`;

type Editor = { mode: "new"; employeeId?: string; date?: string } | { mode: "edit"; shift: ShiftEntry } | null;

export default function RotaPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "staff"]);
  const { role } = useAuth();
  const { shifts, employees, leaveRecords, addShift, updateShift, deleteShift, addShiftsForWeek, loading } = useData();
  const toast = useToast();
  const canWrite = can(role, "manage:rota");
  const today = todayIso();

  const [monday, setMonday] = useState(() => mondayOf(today));
  const [editor, setEditor] = useState<Editor>(null);
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => weekDates(monday), [monday]);
  const weekShifts = useMemo(() => shifts.filter((s) => s.date >= monday && s.date <= days[6]), [shifts, monday, days]);
  const totals = useMemo(() => weekHours(shifts, monday), [shifts, monday]);
  const clashes = useMemo(() => leaveClashes(weekShifts, leaveRecords), [weekShifts, leaveRecords]);
  const offDayClashes = useMemo(() => weeklyOffClashes(weekShifts, employees), [weekShifts, employees]);

  // Rows: active employees, then anyone with a shift this week who is not in the list (so nobody disappears).
  const rows = useMemo(() => {
    const out = employees.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name }));
    const known = new Set(out.map((r) => r.id));
    for (const s of weekShifts) {
      if (!known.has(s.employeeId)) {
        known.add(s.employeeId);
        out.push({ id: s.employeeId, name: s.employeeName });
      }
    }
    return out;
  }, [employees, weekShifts]);

  if (guardLoading || !allowed) return null;
  if (loading) return <TableCardSkeleton />;

  async function copyLastWeek() {
    const prev = new Date(`${monday}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 7);
    const prevMonday = prev.toISOString().slice(0, 10);
    const { toAdd, skipped } = copyWeekPlan(shifts, prevMonday, monday, weekShifts);
    if (toAdd.length === 0) {
      toast.info(skipped > 0 ? "Already copied" : "Nothing to copy", skipped > 0 ? `${skipped} shifts are already in this week.` : "Last week has no shifts.");
      return;
    }
    if (!window.confirm(`Copy ${toAdd.length} shifts from last week into ${weekLabel(monday)}?`)) return;
    setBusy(true);
    try {
      await addShiftsForWeek(toAdd);
      toast.success(`${toAdd.length} shifts copied`, skipped > 0 ? `${skipped} were already here and were left alone.` : undefined);
    } catch (e) {
      toast.error("Couldn't copy the shifts", toastableErrorMessage(e));
    }
    setBusy(false);
  }

  async function save(input: ShiftInput) {
    const problem = validateShift(input);
    if (problem) {
      toast.error("Can't save yet", problem);
      return;
    }
    setBusy(true);
    try {
      if (editor?.mode === "edit") await updateShift(editor.shift.id, input);
      else await addShift(input);
      toast.success("Shift saved", `${input.employeeName}, ${input.date}`);
      setEditor(null);
    } catch (e) {
      toast.error("Couldn't save the shift", toastableErrorMessage(e));
    }
    setBusy(false);
  }

  async function remove(s: ShiftEntry) {
    if (!window.confirm(`Remove ${s.employeeName}'s shift on ${s.date}?`)) return;
    try {
      await deleteShift(s.id);
      setEditor(null);
      toast.success("Shift removed");
    } catch (e) {
      toast.error("Couldn't remove the shift", toastableErrorMessage(e));
    }
  }

  const totalHours = totals.reduce((s, t) => s + t.hours, 0);

  return (
    <>
      <PageHeader
        title="Rota"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setMonday(shiftWeek(monday, -7))}>Previous</Button>
            <Button variant="ghost" onClick={() => setMonday(mondayOf(today))}>This week</Button>
            <Button variant="ghost" onClick={() => setMonday(shiftWeek(monday, 7))}>Next</Button>
            {canWrite && <Button variant="ghost" onClick={copyLastWeek} disabled={busy}>Copy last week</Button>}
            {canWrite && <Button onClick={() => setEditor({ mode: "new" })}>Add shift</Button>}
          </div>
        }
      />
      <div className="text-sm text-muted mb-3">{weekLabel(monday)}</div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Hours this week" value={hours(totalHours)} />
        <Stat label="People working" value={String(totals.length)} />
        <Stat label="Shifts" value={String(weekShifts.length)} />
        <Stat label="On leave, shift set" value={String(clashes.length)} tone={clashes.length > 0 ? "bad" : "default"} />
      </div>

      {offDayClashes.length > 0 && (
        <Card className="mb-4">
          <div className="text-sm font-medium mb-1">Shifts on a regular day off</div>
          <div className="text-xs text-muted">{offDayClashes.map((c) => `${c.employeeName} on ${c.date}`).join(" · ")}. Check these with the person before the day.</div>
        </Card>
      )}

      {clashes.length > 0 && (
        <Card className="mb-4">
          <div className="text-sm font-medium mb-1">Shifts that fall on leave</div>
          <div className="text-xs text-muted">{clashes.map((c) => `${c.employeeName} on ${c.date}`).join(" · ")}. Check these before the day.</div>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <div className="text-sm text-muted">No one to roster yet. Add people on the Employees page, then add their shifts here.</div>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-2 px-3 font-medium sticky left-0 bg-panel">Person</th>
                  {days.map((d) => (
                    <th key={d} className="py-2 px-2 font-medium">{dayHead(d)}</th>
                  ))}
                  <th className="py-2 px-3 font-medium text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rowHours = totals.find((t) => t.employeeId === r.id)?.hours ?? 0;
                  return (
                    <tr key={r.id} className="border-t border-line align-top">
                      <td className="py-2 px-3 sticky left-0 bg-panel font-medium break-words max-w-[140px]">{r.name}</td>
                      {days.map((d) => {
                        const cell = weekShifts.filter((s) => s.employeeId === r.id && s.date === d).sort((a, b) => a.start.localeCompare(b.start));
                        const leave = leaveOn(r.id, d, leaveRecords);
                        return (
                          <td key={d} className={`py-1.5 px-1.5 min-w-[92px] ${leave ? "bg-panel2" : ""}`}>
                            <div className="space-y-1">
                              {leave && <div className="text-[10px] text-muted">On leave</div>}
                              {cell.map((s) => {
                                const onLeave = !!leaveOn(s.employeeId, s.date, leaveRecords);
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    disabled={!canWrite}
                                    onClick={() => setEditor({ mode: "edit", shift: s })}
                                    className={`w-full text-left rounded border px-1.5 py-1 num ${onLeave ? "border-bad/50 bg-bad/10" : "border-amber/40 bg-amber/10"} ${canWrite ? "hover:border-amber" : ""}`}
                                    title={[s.location, s.note].filter(Boolean).join(" · ") || undefined}
                                  >
                                    {s.start}–{s.end}
                                    {s.location ? <span className="block text-[10px] text-muted truncate">{s.location}</span> : null}
                                  </button>
                                );
                              })}
                              {canWrite && (
                                <button
                                  type="button"
                                  onClick={() => setEditor({ mode: "new", employeeId: r.id, date: d })}
                                  className="w-full text-[10px] text-muted hover:text-fg min-h-[28px]"
                                  aria-label={`Add a shift for ${r.name} on ${d}`}
                                >
                                  + add
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-right num">{rowHours > 0 ? hours(rowHours) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!canWrite && <div className="text-xs text-muted mt-3">You can see the rota. Owner and manager set the shifts.</div>}

      <Modal open={editor !== null} onClose={() => setEditor(null)} title={editor?.mode === "edit" ? "Edit shift" : "Add shift"}>
        {editor && (
          <ShiftForm
            key={editor.mode === "edit" ? editor.shift.id : `${editor.employeeId ?? "new"}-${editor.date ?? "new"}`}
            initial={editor.mode === "edit" ? editor.shift : undefined}
            defaults={editor.mode === "new" ? { employeeId: editor.employeeId, date: editor.date } : undefined}
            people={rows}
            busy={busy}
            canDelete={editor.mode === "edit" && canWrite}
            onSave={save}
            onDelete={() => editor.mode === "edit" && remove(editor.shift)}
            onCancel={() => setEditor(null)}
          />
        )}
      </Modal>
    </>
  );
}

function shiftWeek(monday: string, days: number) {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ShiftForm({
  initial,
  defaults,
  people,
  busy,
  canDelete,
  onSave,
  onDelete,
  onCancel,
}: {
  initial?: ShiftEntry;
  defaults?: { employeeId?: string; date?: string };
  people: { id: string; name: string }[];
  busy: boolean;
  canDelete: boolean;
  onSave: (i: ShiftInput) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? defaults?.employeeId ?? "");
  const [date, setDate] = useState(initial?.date ?? defaults?.date ?? todayIso());
  const [start, setStart] = useState(initial?.start ?? "09:00");
  const [end, setEnd] = useState(initial?.end ?? "17:00");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  const length = start && end && end > start ? shiftHours(start, end) : 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    const who = people.find((p) => p.id === employeeId);
    onSave({
      employeeId,
      employeeName: who?.name ?? initial?.employeeName ?? "",
      date,
      start,
      end,
      location: location.trim() || undefined,
      note: note.trim() || undefined,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field>
        <Label>Who</Label>
        <Select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">Select…</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field>
          <Label>Day</Label>
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Starts</Label>
          <Input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field>
          <Label>Ends</Label>
          <Input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div className="text-xs text-muted">{length > 0 ? `${Math.round(length * 100) / 100} hours` : "The shift must end after it starts, on the same day."}</div>
      <Field>
        <Label>Where (optional)</Label>
        <Input value={location} maxLength={60} onChange={(e) => setLocation(e.target.value)} placeholder="Front counter, Branch 2, Kitchen" />
      </Field>
      <Field>
        <Label>Note (optional)</Label>
        <Textarea rows={2} maxLength={MAX_ROTA_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex flex-wrap justify-between gap-2 pt-2">
        <div>{canDelete && <Button type="button" variant="danger" onClick={onDelete}>Remove shift</Button>}</div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </form>
  );
}
