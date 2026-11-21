"use client";

// The handover for someone leaving: the steps that close their access and equipment, and everything they still own, to be given to
// someone else on purpose. It reassigns nothing by itself. Owner and manager only (the tab).
import { useMemo, useState } from "react";
import { Card, Field, Label, Select } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { LEAVER_STEPS, ownedItemsFor } from "@/lib/leaverHandover";

export default function LeaverPanel() {
  const { employees, kpis, businessLog } = useData();
  const [name, setName] = useState("");
  const owned = useMemo(
    () =>
      ownedItemsFor(name, {
        kpis,
        decisions: businessLog.filter((e) => e.kind === "decision"),
        responsibilities: businessLog.filter((e) => e.kind === "responsibility"),
      }),
    [name, kpis, businessLog],
  );
  return (
    <div className="space-y-4">
      <Field className="max-w-sm">
        <Label>Who is leaving</Label>
        <Select value={name} onChange={(e) => setName(e.target.value)}>
          <option value="">Choose a person</option>
          {employees.map((e) => (
            <option key={e.id} value={e.name}>{e.name}</option>
          ))}
        </Select>
      </Field>
      {name && (
        <>
          <Card className="p-4">
            <div className="text-sm font-medium">Steps to close</div>
            <ol className="mt-2 space-y-1.5 text-sm list-decimal pl-5">
              {LEAVER_STEPS.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-medium">Still owned by {name}</div>
            {owned.length === 0 ? (
              <div className="text-xs text-muted mt-2">Nothing is recorded against this person. Their own work may still need handing over; check the rota and the procedures they wrote.</div>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {owned.map((o, i) => (
                  <li key={i} className="pl-3 border-l border-line">
                    <span className="text-muted">{o.area}:</span> {o.title}
                  </li>
                ))}
              </ul>
            )}
            <div className="text-xs text-muted mt-3">To hand one over, edit it and change the owner. Nothing changes until you do.</div>
          </Card>
        </>
      )}
    </div>
  );
}
