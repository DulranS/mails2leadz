"use client";

// Choose the kind of business and add the starter KPIs, areas of responsibility and procedures for it. Only what is missing is added, so
// applying a set again is safe. Owner and manager only (the tab).
import { useMemo, useState } from "react";
import { Button, Card, Field, Label, Select } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { BUSINESS_KINDS, starterAdditions, starterSetFor, type BusinessKind } from "@/lib/starterSets";

export default function StarterSetPanel() {
  const { kpis, businessLog, procedures, settings, updateSettings, addKpi, addLogEntry, addProcedure } = useData();
  const toast = useToast();
  const [kind, setKind] = useState<BusinessKind>((settings.businessKind as BusinessKind) ?? "retail");
  const showAll = settings.showAllScreens === true;
  const [busy, setBusy] = useState(false);
  const adds = useMemo(
    () =>
      starterAdditions(kind, {
        kpis: kpis.map((k) => k.name),
        responsibilities: businessLog.filter((e) => e.kind === "responsibility").map((e) => e.title),
        procedures: procedures.map((p) => p.title),
      }),
    [kind, kpis, businessLog, procedures],
  );
  const total = adds.kpis.length + adds.responsibilities.length + adds.procedures.length;

  async function apply() {
    setBusy(true);
    let done = 0;
    try {
      for (const k of adds.kpis) {
        await addKpi({ name: k.name, unit: k.unit, target: k.target, direction: k.direction, period: k.period, decisionQuestion: k.decisionQuestion, ownerName: "Owner" });
        done++;
      }
      for (const r of adds.responsibilities) {
        await addLogEntry({ kind: "responsibility", title: r, ownerName: "Owner" });
        done++;
      }
      for (const p of adds.procedures) {
        await addProcedure({ title: p.title, body: p.body, reviewEveryDays: 180 });
        done++;
      }
      await updateSettings({ businessKind: kind });
      toast.success("Starter set added", `${done} item${done === 1 ? "" : "s"} added. Change the owners and targets to suit the business.`);
    } catch (err) {
      toast.error(`Stopped after ${done} item${done === 1 ? "" : "s"}`, `${toastableErrorMessage(err)} Apply it again to add the rest; nothing is added twice.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="text-sm font-medium">What kind of business is this?</div>
        <div className="text-xs text-muted mt-1">Pick the closest. It sets the starting KPIs, areas of responsibility and procedures. Each is a starting point you can change.</div>
        <Field className="max-w-sm mt-3">
          <Label>Kind of business</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as BusinessKind)}>
            {BUSINESS_KINDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </Select>
        </Field>
        <label className="mt-3 flex items-center gap-2 text-xs min-h-[44px]">
          <input type="checkbox" checked={showAll} onChange={async (e) => { try { await updateSettings({ showAllScreens: e.target.checked }); } catch (err) { toast.error("Couldn't save it", toastableErrorMessage(err)); } }} />
          Show every operations screen, whatever the kind of business (screens that do not fit this type are hidden otherwise)
        </label>
      </Card>
      <Card className="p-4">
        <div className="text-sm font-medium">To be added ({total})</div>
        {total === 0 ? (
          <div className="text-xs text-muted mt-2">Everything in this set is already here.</div>
        ) : (
          <div className="mt-2 space-y-3 text-sm">
            {adds.kpis.length > 0 && (
              <div>
                <div className="text-xs text-muted">Measures</div>
                <ul className="mt-1 space-y-1">{adds.kpis.map((k) => <li key={k.name}>{k.name}: target {k.target}{k.unit === "%" ? "%" : ` ${k.unit}`}, {k.period}ly · <span className="text-muted">{k.decisionQuestion}</span></li>)}</ul>
              </div>
            )}
            {adds.responsibilities.length > 0 && (
              <div>
                <div className="text-xs text-muted">Areas of responsibility (the owner is named until you assign each)</div>
                <ul className="mt-1 space-y-1">{adds.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}
            {adds.procedures.length > 0 && (
              <div>
                <div className="text-xs text-muted">Procedures (each re-read every 180 days)</div>
                <ul className="mt-1 space-y-1">{adds.procedures.map((p) => <li key={p.title}>{p.title}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        <div className="mt-4">
          <Button onClick={apply} disabled={busy || total === 0}>{busy ? "Adding…" : "Add this starter set"}</Button>
        </div>
      </Card>
    </div>
  );
}
