"use client";

// The sales team scorecard: each salesperson's last 30 days against the monthly revenue target set for them. Owner and manager only (the
// tab). Targets are entered once here and read by the review agenda.
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Label } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { todayIso } from "@/lib/format";
import { salesTeamFor, BEHIND_TARGET_BELOW_PCT } from "@/lib/salesTeam";

export default function SalesTeamPanel() {
  const { sales, leads, members, settings, updateSettings } = useData();
  const toast = useToast();
  const today = todayIso();
  const rows = useMemo(() => salesTeamFor(sales, leads, settings.salesTargets, today, Date.now()), [sales, leads, settings.salesTargets, today]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const people = members.filter((m) => m.active && m.role !== "accountant");

  async function saveTargets() {
    const next: Record<string, number> = { ...(settings.salesTargets ?? {}) };
    for (const [uid, v] of Object.entries(drafts)) {
      const n = Number(v);
      if (v.trim() === "") delete next[uid];
      else if (Number.isFinite(n) && n > 0) next[uid] = n;
      else return toast.error("Check the targets", "A target is a positive monthly amount, or empty for none.");
    }
    try {
      await updateSettings({ salesTargets: next });
      setDrafts({});
      toast.success("Targets saved", "The review agenda uses them from now on");
    } catch (err) {
      toast.error("Couldn't save the targets", toastableErrorMessage(err));
    }
  }

  if (rows.length === 0) {
    return <EmptyState title="No sales or leads in the last 30 days" body="Once sales are recorded against a person, or leads are owned, this shows each person's revenue, order value and conversion against their target." />;
  }
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted">Last 30 days. A person under {BEHIND_TARGET_BELOW_PCT}% of their monthly target is flagged, and the review agenda raises them.</div>
      {rows.map((r) => (
        <Card key={r.key} className="p-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{r.name}</span>
            {r.behind && <Badge tone="bad">behind target</Badge>}
            {r.target !== null && <Badge tone={r.behind ? "bad" : "good"}>{r.attainmentPct}% of target</Badge>}
          </div>
          <div className="text-xs text-muted mt-1">
            Revenue <span className="num">{r.revenue30}</span> from <span className="num">{r.orders30}</span> orders
            {r.averageOrder !== null && <> · average order <span className="num">{r.averageOrder}</span></>}
            {r.leads30 > 0 && <> · leads <span className="num">{r.leads30}</span>, won <span className="num">{r.won30}</span>{r.conversionPct !== null && <> ({r.conversionPct}%)</>}</>}
          </div>
        </Card>
      ))}
      {people.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium">Monthly revenue targets</div>
          <div className="text-xs text-muted mt-1">Leave a target empty to set none for that person.</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {people.map((m) => (
              <Field key={m.id}>
                <Label>{m.name}</Label>
                <Input inputMode="decimal" placeholder={settings.salesTargets?.[m.id]?.toString() ?? "No target"} value={drafts[m.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [m.id]: e.target.value })} />
              </Field>
            ))}
          </div>
          <div className="mt-3"><Button onClick={saveTargets} disabled={Object.keys(drafts).length === 0}>Save targets</Button></div>
        </Card>
      )}
    </div>
  );
}
