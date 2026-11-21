"use client";

// Farm batches: a group of animals (or a crop) followed from stocking to harvest. Log feed, losses, weights, water readings and
// harvests; see what is alive, survival, biomass, feed conversion and cost per kg. A record beside the books: feed and stock are
// bought through Purchases and the harvest is sold through Sales as usual, and costs typed here are never posted.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import { batchStats, mortalityAlert, waterFlags, type BatchInput, type EntryInput } from "@/lib/farm";
import type { FarmBatch, FarmEntry, FarmEntryKind } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, Stat, Textarea } from "@/components/ui";

const KIND_LABEL: Record<FarmEntryKind, string> = {
  mortality: "Deaths", cull: "Culled or removed", transfer_in: "Added to the batch", feed: "Feed given", sample: "Weight sample",
  water: "Water reading", cost: "Cost", harvest: "Harvest",
};
const BLANK_BATCH = (today: string): BatchInput => ({ name: "", species: "", unitLabel: "", location: "", startDate: today, startCount: 0, startAvgWeightG: 0, status: "active", notes: "" });
const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

function describe(e: FarmEntry, currency: string, unit: string): string {
  switch (e.kind) {
    case "mortality": case "cull": return `${e.count} ${unit}`;
    case "transfer_in": return `${e.count} ${unit} at ${e.avgWeightG} g`;
    case "feed": return `${e.kg} kg`;
    case "sample": return `average ${e.avgWeightG} g`;
    case "harvest": return `${e.count} ${unit}, ${e.kg} kg`;
    case "cost": return `${e.label}: ${formatMoney(e.amount ?? 0, currency)}`;
    case "water": return [e.tempC !== undefined && `${e.tempC} C`, e.oxygenMgL !== undefined && `O2 ${e.oxygenMgL}`, e.ph !== undefined && `pH ${e.ph}`, e.salinityPpt !== undefined && `salinity ${e.salinityPpt}`, e.ammoniaMgL !== undefined && `NH3 ${e.ammoniaMgL}`].filter(Boolean).join(" · ");
  }
}

export default function FarmPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "staff"]);
  const { role } = useAuth();
  const { farmBatches, settings, loading, addFarmBatch, updateFarmBatch, deleteFarmBatch, addFarmEntry, deleteFarmEntry } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const today = todayIso();
  const canWrite = can(role, "manage:bookings");
  const canDelete = can(role, "delete:records");
  const [showClosed, setShowClosed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [batchForm, setBatchForm] = useState<{ editing: FarmBatch | null; input: BatchInput } | null>(null);
  const [entryFor, setEntryFor] = useState<FarmBatch | null>(null);
  const [entry, setEntry] = useState<EntryInput>({ date: today, kind: "feed" });
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => farmBatches.filter((b) => showClosed || b.status === "active").map((b) => ({ b, s: batchStats(b, today), alert: mortalityAlert(b, today) })),
    [farmBatches, today, showClosed]
  );

  async function saveBatch() {
    if (!batchForm) return;
    setBusy(true);
    try {
      if (batchForm.editing) await updateFarmBatch(batchForm.editing.id, batchForm.input);
      else await addFarmBatch(batchForm.input);
      toast.success(batchForm.editing ? "Batch saved" : "Batch started");
      setBatchForm(null);
    } catch (err) { toast.error("Couldn't save the batch", toastableErrorMessage(err)); } finally { setBusy(false); }
  }
  async function saveEntry() {
    if (!entryFor) return;
    setBusy(true);
    try {
      await addFarmEntry(entryFor.id, entry);
      toast.success("Entry added");
      setEntryFor(null);
    } catch (err) { toast.error("Couldn't add the entry", toastableErrorMessage(err)); } finally { setBusy(false); }
  }
  async function removeEntry(b: FarmBatch, e: FarmEntry) {
    if (!window.confirm("Remove this entry? This cannot be undone.")) return;
    try { await deleteFarmEntry(b.id, e.id); } catch (err) { toast.error("Couldn't remove it", toastableErrorMessage(err)); }
  }
  async function removeBatch(b: FarmBatch) {
    if (!window.confirm(`Delete the batch "${b.name}" and its whole log? This cannot be undone.`)) return;
    try { await deleteFarmBatch(b.id); toast.success("Batch deleted"); } catch (err) { toast.error("Couldn't delete it", toastableErrorMessage(err)); }
  }
  function editBatchInput(b: FarmBatch): BatchInput {
    return { name: b.name, species: b.species, unitLabel: b.unitLabel ?? "", location: b.location ?? "", startDate: b.startDate, startCount: b.startCount, startAvgWeightG: b.startAvgWeightG, status: b.status, tempMinC: b.tempMinC, tempMaxC: b.tempMaxC, oxygenMinMgL: b.oxygenMinMgL, phMin: b.phMin, phMax: b.phMax, ammoniaMaxMgL: b.ammoniaMaxMgL, notes: b.notes ?? "" };
  }

  if (guardLoading || !allowed) return null;
  const bi = batchForm?.input;
  const setB = (patch: Partial<BatchInput>) => batchForm && setBatchForm({ ...batchForm, input: { ...batchForm.input, ...patch } });
  const unitOf = (b: FarmBatch) => b.unitLabel?.trim() || "fish";

  return (
    <>
      <PageHeader title="Farm batches" action={canWrite ? <Button onClick={() => setBatchForm({ editing: null, input: BLANK_BATCH(today) })}>+ New batch</Button> : undefined} />
      <div className="text-xs text-muted mb-4">
        Follow a group of animals or a crop from stocking to harvest: feed, deaths, weights, water readings and harvests. The page works out what is alive, survival, biomass,
        feed conversion (feed given per kg grown) and cost per kg. Buy feed and stock through Purchases and sell the harvest through Sales as usual: the costs you type here are
        an estimate for cost per kg and are never posted.
      </div>
      <label className="flex items-center gap-2 text-xs mb-3"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />Show closed batches</label>

      {!loading && rows.length === 0 ? (
        <EmptyState title="No batches yet" body="Start a batch when you stock a cage, pond, house or plot. Log feed and losses as they happen." />
      ) : (
        <div className="space-y-4">
          {rows.map(({ b, s, alert }) => {
            const flags = waterFlags(b, s.latestWater);
            const unit = unitOf(b);
            return (
              <Card key={b.id} className="!p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{b.name} <span className="text-muted">· {b.species}{b.location ? ` · ${b.location}` : ""}</span></div>
                    <div className="text-xs text-muted num">Stocked {b.startDate} · day {s.daysIn}</div>
                  </div>
                  <Badge tone={b.status === "active" ? "good" : "default"}>{b.status === "active" ? "Active" : "Closed"}</Badge>
                </div>
                {alert && <div className="text-xs text-bad mt-2">{alert}</div>}
                {flags.map((f) => <div key={f.message} className="text-xs text-bad mt-1">{f.message}</div>)}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  <Stat label={`Alive (${unit})`} value={s.alive.toLocaleString("en-US")} sub={`${s.survivalPct}% survival`} />
                  <Stat label="Average weight" value={`${s.avgWeightG} g`} sub={`as at ${s.weightDate}`} />
                  <Stat label="Biomass" value={`${s.biomassKg.toLocaleString("en-US")} kg`} sub={`grown ${s.gainKg} kg`} />
                  <Stat label="Feed conversion" value={s.fcr === null ? "n/a" : String(s.fcr)} sub={`${s.feedKg.toLocaleString("en-US")} kg fed`} />
                </div>
                {(s.harvestKg > 0 || s.totalCost > 0) && (
                  <div className="text-xs text-muted num mt-2">
                    Harvested {s.harvestedCount} {unit}, {s.harvestKg} kg · costs typed {formatMoney(s.totalCost, currency)}
                    {s.costPerKgHarvested !== null ? ` · ${formatMoney(s.costPerKgHarvested, currency)} per kg harvested` : ""}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  {canWrite && b.status === "active" && <button className="text-amber-soft font-medium" onClick={() => { setEntry({ date: today, kind: "feed" }); setEntryFor(b); }}>+ Add entry</button>}
                  <button className="text-muted hover:text-fg" onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? "Hide log" : `Log (${b.entries.length})`}</button>
                  {canWrite && <button className="text-muted hover:text-fg" onClick={() => setBatchForm({ editing: b, input: editBatchInput(b) })}>Edit batch</button>}
                  {canDelete && <button className="text-bad" onClick={() => removeBatch(b)}>Delete</button>}
                </div>
                {open === b.id && (
                  <div className="mt-3 border-t border-line pt-2 space-y-1">
                    {b.entries.length === 0 && <div className="text-xs text-muted">Nothing logged yet.</div>}
                    {[...b.entries].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 200).map((e) => (
                      <div key={e.id} className="flex justify-between gap-3 text-xs">
                        <span><span className="num text-muted">{e.date}</span> · {KIND_LABEL[e.kind]}: {describe(e, currency, unit)}{e.note ? ` · ${e.note}` : ""}</span>
                        {canDelete && <button className="text-bad shrink-0" onClick={() => removeEntry(b, e)}>Remove</button>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={batchForm !== null} onClose={() => setBatchForm(null)} title={batchForm?.editing ? "Edit batch" : "New batch"}>
        {bi && (
          <div className="space-y-4">
            <Field><Label>Name</Label><Input value={bi.name} onChange={(e) => setB({ name: e.target.value })} maxLength={80} placeholder="e.g. Cage 3, spring intake" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field><Label>Species or crop</Label><Input value={bi.species} onChange={(e) => setB({ species: e.target.value })} maxLength={60} /></Field>
              <Field><Label>Counted as (optional)</Label><Input value={bi.unitLabel ?? ""} onChange={(e) => setB({ unitLabel: e.target.value })} maxLength={20} placeholder="fish, birds, plants" /></Field>
            </div>
            <Field><Label>Where (cage, pond, house, plot)</Label><Input value={bi.location ?? ""} onChange={(e) => setB({ location: e.target.value })} maxLength={80} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field><Label>Stocked on</Label><Input type="date" value={bi.startDate} onChange={(e) => setB({ startDate: e.target.value })} /></Field>
              <Field><Label>How many</Label><Input inputMode="numeric" value={bi.startCount || ""} onChange={(e) => setB({ startCount: Math.floor(Number(e.target.value)) })} /></Field>
              <Field><Label>Average weight (g)</Label><Input inputMode="decimal" value={bi.startAvgWeightG || ""} onChange={(e) => setB({ startAvgWeightG: Number(e.target.value) })} /></Field>
            </div>
            <div className="text-xs text-muted">Safe water ranges (optional). A reading outside a range is flagged; nothing is blocked.</div>
            <div className="grid grid-cols-3 gap-3">
              <Field><Label>Temp min (C)</Label><Input inputMode="decimal" value={bi.tempMinC ?? ""} onChange={(e) => setB({ tempMinC: num(e.target.value) })} /></Field>
              <Field><Label>Temp max (C)</Label><Input inputMode="decimal" value={bi.tempMaxC ?? ""} onChange={(e) => setB({ tempMaxC: num(e.target.value) })} /></Field>
              <Field><Label>Oxygen min (mg/L)</Label><Input inputMode="decimal" value={bi.oxygenMinMgL ?? ""} onChange={(e) => setB({ oxygenMinMgL: num(e.target.value) })} /></Field>
              <Field><Label>pH min</Label><Input inputMode="decimal" value={bi.phMin ?? ""} onChange={(e) => setB({ phMin: num(e.target.value) })} /></Field>
              <Field><Label>pH max</Label><Input inputMode="decimal" value={bi.phMax ?? ""} onChange={(e) => setB({ phMax: num(e.target.value) })} /></Field>
              <Field><Label>Ammonia max (mg/L)</Label><Input inputMode="decimal" value={bi.ammoniaMaxMgL ?? ""} onChange={(e) => setB({ ammoniaMaxMgL: num(e.target.value) })} /></Field>
            </div>
            {batchForm?.editing && (
              <Field><Label>Status</Label><Select value={bi.status} onChange={(e) => setB({ status: e.target.value as "active" | "closed" })}><option value="active">Active</option><option value="closed">Closed</option></Select></Field>
            )}
            <Field><Label>Notes (optional)</Label><Textarea rows={2} value={bi.notes ?? ""} onChange={(e) => setB({ notes: e.target.value })} maxLength={300} /></Field>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setBatchForm(null)}>Cancel</Button><Button onClick={saveBatch} disabled={busy}>{busy ? "Saving…" : "Save batch"}</Button></div>
          </div>
        )}
      </Modal>

      <Modal open={entryFor !== null} onClose={() => setEntryFor(null)} title={entryFor ? `Add entry: ${entryFor.name}` : ""}>
        {entryFor && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field><Label>What</Label>
                <Select value={entry.kind} onChange={(e) => setEntry({ date: entry.date, kind: e.target.value as FarmEntryKind })}>
                  {(Object.keys(KIND_LABEL) as FarmEntryKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </Select>
              </Field>
              <Field><Label>Date</Label><Input type="date" max={today} value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} /></Field>
            </div>
            {["mortality", "cull", "transfer_in", "harvest"].includes(entry.kind) && (
              <Field><Label>How many ({unitOf(entryFor)})</Label><Input inputMode="numeric" value={entry.count ?? ""} onChange={(e) => setEntry({ ...entry, count: num(e.target.value) })} /></Field>
            )}
            {["feed", "harvest"].includes(entry.kind) && (
              <Field><Label>{entry.kind === "feed" ? "Feed given (kg)" : "Weight harvested (kg)"}</Label><Input inputMode="decimal" value={entry.kg ?? ""} onChange={(e) => setEntry({ ...entry, kg: num(e.target.value) })} /></Field>
            )}
            {["sample", "transfer_in"].includes(entry.kind) && (
              <Field><Label>Average weight of one (g)</Label><Input inputMode="decimal" value={entry.avgWeightG ?? ""} onChange={(e) => setEntry({ ...entry, avgWeightG: num(e.target.value) })} /></Field>
            )}
            {entry.kind === "cost" && (
              <div className="grid grid-cols-2 gap-3">
                <Field><Label>What for</Label><Input value={entry.label ?? ""} onChange={(e) => setEntry({ ...entry, label: e.target.value })} maxLength={80} /></Field>
                <Field><Label>Amount ({currency})</Label><Input inputMode="decimal" value={entry.amount ?? ""} onChange={(e) => setEntry({ ...entry, amount: num(e.target.value) })} /></Field>
              </div>
            )}
            {entry.kind === "water" && (
              <div className="grid grid-cols-3 gap-3">
                <Field><Label>Temp (C)</Label><Input inputMode="decimal" value={entry.tempC ?? ""} onChange={(e) => setEntry({ ...entry, tempC: num(e.target.value) })} /></Field>
                <Field><Label>Oxygen (mg/L)</Label><Input inputMode="decimal" value={entry.oxygenMgL ?? ""} onChange={(e) => setEntry({ ...entry, oxygenMgL: num(e.target.value) })} /></Field>
                <Field><Label>pH</Label><Input inputMode="decimal" value={entry.ph ?? ""} onChange={(e) => setEntry({ ...entry, ph: num(e.target.value) })} /></Field>
                <Field><Label>Salinity (ppt)</Label><Input inputMode="decimal" value={entry.salinityPpt ?? ""} onChange={(e) => setEntry({ ...entry, salinityPpt: num(e.target.value) })} /></Field>
                <Field><Label>Ammonia (mg/L)</Label><Input inputMode="decimal" value={entry.ammoniaMgL ?? ""} onChange={(e) => setEntry({ ...entry, ammoniaMgL: num(e.target.value) })} /></Field>
              </div>
            )}
            <Field><Label>Note (optional)</Label><Input value={entry.note ?? ""} onChange={(e) => setEntry({ ...entry, note: e.target.value })} maxLength={200} /></Field>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEntryFor(null)}>Cancel</Button><Button onClick={saveEntry} disabled={busy}>{busy ? "Saving…" : "Add entry"}</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}
