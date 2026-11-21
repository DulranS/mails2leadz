"use client";

// Franchise royalties: a share of each location's sales, owed to head office. The rate per location is set here and saved; the month's
// royalty is worked out from the sales; recording it is a press, and a location already recorded for the month is skipped. Owner and
// manager only (the tab).
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Select } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { todayIso, formatMoney } from "@/lib/format";
import { royaltyStatement, royaltyExpenseEntries, validateRoyaltyRate, royaltyStatementRows } from "@/lib/royalty";
import { toCsvSafe, downloadCsv } from "@/lib/csv";

function recentPeriods(today: string, n: number): string[] {
  const d = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export default function RoyaltyPanel() {
  const { sales, locations, expenses, settings, updateSettings, addExpense } = useData();
  const { user, businessId } = useAuth();
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const today = todayIso();
  const periods = useMemo(() => recentPeriods(today, 12), [today]);
  const [period, setPeriod] = useState(periods[0]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const active = locations.filter((l) => l.active);
  const rows = useMemo(() => royaltyStatement(sales, locations, settings.royaltyRates, period), [sales, locations, settings.royaltyRates, period]);
  const recorded = useMemo(() => new Set(expenses.map((e) => e.name)), [expenses]);
  const pending = useMemo(() => royaltyExpenseEntries(rows, period, recorded), [rows, period, recorded]);

  async function saveRates() {
    const next: Record<string, number> = { ...(settings.royaltyRates ?? {}) };
    for (const [id, v] of Object.entries(drafts)) {
      const n = v.trim() === "" ? 0 : Number(v);
      const problem = validateRoyaltyRate(n);
      if (problem) return toast.error("Check the rates", problem);
      if (n > 0) next[id] = n;
      else delete next[id];
    }
    try {
      await updateSettings({ royaltyRates: next });
      setDrafts({});
      toast.success("Royalty rates saved", "They apply from the next month you record");
    } catch (err) {
      toast.error("Couldn't save the rates", toastableErrorMessage(err));
    }
  }

  async function record() {
    setBusy(true);
    let done = 0;
    try {
      for (const p of pending) {
        await addExpense({ name: p.name, amount: p.amount, category: p.category, kind: "expense", isRecurring: false, recurrence: "none", startDate: p.startDate, paymentStatus: "paid" });
        done++;
      }
      toast.success("Royalties recorded", `${done} location${done === 1 ? "" : "s"} for ${period}`);
    } catch (err) {
      toast.error(`Stopped after ${done} of ${pending.length}`, `${toastableErrorMessage(err)} Press again to record the rest; nothing is recorded twice.`);
    } finally {
      setBusy(false);
    }
  }

  async function sendToHeadOffice() {
    if (!user || !businessId || rows.length === 0) return;
    setSending(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/royalty/send", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, [BUSINESS_ID_HEADER]: businessId },
        body: JSON.stringify({ period, currency: settings.currency, rows: rows.map((r) => ({ location: r.name, sales: r.revenue, ratePct: r.ratePct, royalty: r.royalty })) }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!res.ok) throw new Error(payload.error ?? "Head office did not accept the statement.");
      toast.success(payload.status === "duplicate" ? "Already sent" : "Sent to head office", payload.status === "duplicate" ? `${period} was sent before; nothing was sent twice` : `Head office will confirm ${period}`);
    } catch (err) {
      toast.error("Couldn't send it", toastableErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (active.length === 0) {
    return <EmptyState title="No locations yet" body="Royalties are worked out per location. Add your locations first, then set a rate for each one that pays a royalty." />;
  }
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="text-sm font-medium">Royalty share of sales, per location</div>
        <div className="text-xs text-muted mt-1">Leave a rate empty for a location that pays no royalty. The rate is a percentage of that location&apos;s sales.</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          {active.map((l) => (
            <Field key={l.id}>
              <Label>{l.name} (current {settings.royaltyRates?.[l.id] ?? 0}%)</Label>
              <Input inputMode="decimal" placeholder={String(settings.royaltyRates?.[l.id] ?? "")} value={drafts[l.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [l.id]: e.target.value })} />
            </Field>
          ))}
        </div>
        <div className="mt-3"><Button onClick={saveRates} disabled={Object.keys(drafts).length === 0}>Save rates</Button></div>
      </Card>
      <div className="flex items-end gap-3 flex-wrap">
        <Field className="max-w-[200px]">
          <Label>Month</Label>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periods.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        {rows.length > 0 && <Button variant="ghost" onClick={() => downloadCsv(`royalty-statement-${period}.csv`, toCsvSafe(royaltyStatementRows(rows, period, settings.currency)))}>Download the statement (CSV)</Button>}
        {rows.length > 0 && <Button variant="ghost" onClick={sendToHeadOffice} disabled={sending}>{sending ? "Sending…" : "Send to head office"}</Button>}
        {pending.length > 0 && <Button onClick={record} disabled={busy}>{busy ? "Recording…" : `Record ${pending.length} royalt${pending.length === 1 ? "y" : "ies"} as costs`}</Button>}
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted">No location has a royalty rate set, so there is nothing to work out for {period}.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.locationId} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{r.name}</span>
                <Badge>{r.ratePct}% royalty</Badge>
                {recorded.has(`Royalty: ${r.name} (${period})`) && <Badge tone="good">recorded</Badge>}
              </div>
              <div className="text-xs text-muted mt-1">
                Sales <span className="num">{formatMoney(r.revenue, settings.currency)}</span> · royalty <span className="num">{formatMoney(r.royalty, settings.currency)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
