"use client";

// Exit records: for each person who has left, the exit interview and any severance or final settlement. Owner only (the tab): these hold pay
// and personal notes. The severance amount is entered by the owner; the app does not calculate it, because the rules depend on the country.
import { useMemo, useState } from "react";
import { Button, Card, EmptyState, Field, Input, Label, Textarea } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney } from "@/lib/format";

export default function ExitRecordsPanel() {
  const { employees, updateEmployee, settings } = useData();
  const toast = useToast();
  const leavers = useMemo(() => employees.filter((e) => e.endDate).sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? "")), [employees]);
  const [drafts, setDrafts] = useState<Record<string, { exitInterviewOn: string; exitNotes: string; severanceAmount: string; severanceNote: string }>>({});
  if (leavers.length === 0) {
    return <EmptyState title="No leavers yet" body="When someone leaves and their end date is recorded, they appear here for their exit interview and any final settlement. Only the owner sees this." />;
  }
  const draftFor = (id: string, e: (typeof leavers)[number]) => drafts[id] ?? {
    exitInterviewOn: e.exitInterviewOn ?? "", exitNotes: e.exitNotes ?? "",
    severanceAmount: e.severanceAmount !== undefined ? String(e.severanceAmount) : "", severanceNote: e.severanceNote ?? "",
  };
  async function save(id: string, e: (typeof leavers)[number]) {
    const d = draftFor(id, e);
    const amount = d.severanceAmount.trim() === "" ? undefined : Number(d.severanceAmount.replace(/,/g, ""));
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) return toast.error("Check the amount", "Enter the settlement as a positive amount, or leave it empty.");
    try {
      await updateEmployee(id, {
        exitInterviewOn: d.exitInterviewOn || undefined,
        exitNotes: d.exitNotes.trim() || undefined,
        severanceAmount: amount,
        severanceNote: d.severanceNote.trim() || undefined,
      });
      toast.success("Saved", e.name);
    } catch (err) {
      toast.error("Couldn't save it", toastableErrorMessage(err));
    }
  }
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted">Owner only. Severance is entered as you agree it; the app does not calculate it.</div>
      {leavers.map((e) => {
        const d = draftFor(e.id, e);
        const set = (patch: Partial<typeof d>) => setDrafts({ ...drafts, [e.id]: { ...d, ...patch } });
        return (
          <Card key={e.id} className="p-4 space-y-3">
            <div className="text-sm font-medium">{e.name} <span className="text-muted font-normal">· left {e.endDate}</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field><Label>Exit interview held on</Label><Input type="date" value={d.exitInterviewOn} onChange={(ev) => set({ exitInterviewOn: ev.target.value })} /></Field>
              <Field><Label>Severance or final settlement ({settings.currency})</Label><Input inputMode="decimal" value={d.severanceAmount} onChange={(ev) => set({ severanceAmount: ev.target.value })} /></Field>
            </div>
            <Field><Label>What the exit interview covered</Label><Textarea rows={3} value={d.exitNotes} onChange={(ev) => set({ exitNotes: ev.target.value })} maxLength={2000} /></Field>
            <Field><Label>How the settlement was worked out</Label><Input value={d.severanceNote} onChange={(ev) => set({ severanceNote: ev.target.value })} maxLength={300} /></Field>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => save(e.id, e)}>Save</Button>
              {e.severanceAmount !== undefined && <span className="text-xs text-muted">Recorded: {formatMoney(e.severanceAmount, settings.currency)}</span>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
