"use client";

// Sustainability and community log: what was measured, by month, with monthly totals and the recycling rate, judged against targets you set. Figures are
// entered as measured; nothing is estimated here. Owner and manager only (the tab).
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Select } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { todayIso } from "@/lib/format";
import { lastTwelveMonths } from "@/lib/consolidation";
import { SUSTAINABILITY_CATEGORIES, monthTotals, recyclingRatePct, targetStatus, validateEntry, type SustainabilityKey } from "@/lib/sustainability";

export default function SustainabilityPanel() {
  const { sustainabilityEntries, addSustainabilityEntry, deleteSustainabilityEntry, settings, updateSettings } = useData();
  const toast = useToast();
  const today = todayIso();
  const months = useMemo(() => lastTwelveMonths(today), [today]);
  const [category, setCategory] = useState<SustainabilityKey>("energy_kwh");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const targets = (settings.sustainabilityTargets ?? {}) as Record<string, number>;
  const problem = amount ? validateEntry({ date, category, amount: Number(amount) }) : null;
  const current = monthTotals(sustainabilityEntries, today.slice(0, 7));
  const rate = recyclingRatePct(current);

  async function add() {
    try {
      await addSustainabilityEntry({ date, category, amount: Number(amount), notes: notes.trim() || undefined });
      setAmount(""); setNotes("");
      toast.success("Recorded", SUSTAINABILITY_CATEGORIES.find((c) => c.key === category)?.label ?? "");
    } catch (err) {
      toast.error("Couldn't record it", toastableErrorMessage(err));
    }
  }
  async function setTarget(key: string, value: string) {
    const next = { ...targets };
    if (value.trim() === "") delete next[key]; else next[key] = Number(value);
    try {
      await updateSettings({ sustainabilityTargets: next });
    } catch (err) {
      toast.error("Couldn't save the target", toastableErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Record a measurement</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>What you measured</Label>
            <Select value={category} onChange={(e) => setCategory(e.target.value as SustainabilityKey)}>
              {SUSTAINABILITY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.unit})</option>)}
            </Select>
          </Field>
          <Field><Label>Day it was measured</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field><Label>Amount</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field><Label>Notes (optional, e.g. meter reading, supplier)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} /></Field>
        </div>
        {problem && <div className="text-xs text-bad">{problem}</div>}
        <Button onClick={add} disabled={!!problem || !amount}>Record it</Button>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">This month</div>
        <div className="text-xs text-muted">Recycling rate: {rate === null ? "no waste or recycling recorded yet" : `${rate}% of waste was recycled`}</div>
        <div className="space-y-2">
          {SUSTAINABILITY_CATEGORIES.map((c) => {
            const t = current[c.key];
            const status = targetStatus(c.key, t, targets[c.key]);
            return (
              <div key={c.key} className="flex items-center gap-3 flex-wrap text-sm">
                <span className="min-w-[14rem]">{c.label}</span>
                <span className="num">{t} {c.unit === "currency" ? "" : c.unit}</span>
                {status !== "no_target" && <Badge tone={status === "on_track" ? "good" : "bad"}>{status === "on_track" ? "on target" : "off target"}</Badge>}
                <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                  Target
                  <input className="w-24 bg-transparent border-b border-line px-1" inputMode="decimal" defaultValue={targets[c.key] ?? ""} onBlur={(e) => setTarget(c.key, e.target.value)} placeholder="none" />
                </span>
              </div>
            );
          })}
        </div>
        <div className="text-[11px] text-muted">{SUSTAINABILITY_CATEGORIES.some((c) => c.lowerIsBetter) ? "For energy, water, fuel, waste and emissions, the target is a ceiling; for recycling, local spend, donations and volunteering, it is the amount to reach." : ""}</div>
      </Card>

      {sustainabilityEntries.length === 0 ? (
        <EmptyState title="Nothing recorded yet" body="Record what you measure each month: electricity, water, fuel, waste and recycling, emissions from your supplier or meter, local spend, donations and volunteer hours." />
      ) : (
        <Card className="p-4 space-y-2">
          <div className="text-sm font-medium">Last twelve months</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted"><th className="py-1">Measure</th>{months.map((m) => <th key={m} className="py-1 text-right">{m.slice(5)}</th>)}</tr></thead>
              <tbody>
                {SUSTAINABILITY_CATEGORIES.map((c) => (
                  <tr key={c.key} className="border-t border-line">
                    <td className="py-1.5">{c.label}</td>
                    {months.map((m) => <td key={m} className="py-1.5 text-right num">{monthTotals(sustainabilityEntries, m)[c.key] || "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pt-2 space-y-1">
            {sustainabilityEntries.slice(0, 10).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 text-xs">
                <span>{e.date} · {SUSTAINABILITY_CATEGORIES.find((c) => c.key === e.category)?.label}: <span className="num">{e.amount}</span>{e.notes && <> · {e.notes}</>}</span>
                <button onClick={() => { if (window.confirm("Remove this measurement?")) deleteSustainabilityEntry(e.id).catch((err) => toast.error("Couldn't remove it", toastableErrorMessage(err))); }} className="text-muted hover:text-fg min-h-[32px]">Remove</button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
