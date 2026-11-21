"use client";

// Group view: the businesses this login runs, added together by month, with transfers between them taken out. Each business's figures come from the
// summary it publishes while it is open; a business that has never been opened shows as not yet published. Owner only (the tab).
import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, setDoc } from "firebase/firestore";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Select } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { getFirebase } from "@/lib/firebase";
import { listBusinesses } from "@/lib/activeBusiness";
import { todayIso, formatMoney } from "@/lib/format";
import { consolidate, validateGroup, lastTwelveMonths, type BusinessSummary, type Transfer, type ReportingOptions } from "@/lib/consolidation";

interface Found { businessId: string; name: string; summary: BusinessSummary | null }

export default function GroupPanel() {
  const { user, businessId } = useAuth();
  const { settings } = useData();
  const toast = useToast();
  const cur = settings.currency;
  const today = todayIso();
  const [found, setFound] = useState<Found[]>([]);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [tMonth, setTMonth] = useState(today.slice(0, 7));
  const [tAmount, setTAmount] = useState("");
  const [tFrom, setTFrom] = useState("");
  const [tTo, setTTo] = useState("");
  const [tNote, setTNote] = useState("");
  const [group, setGroup] = useState<{ members?: string[]; reportingCurrency?: string; rates?: Record<string, number>; ratesAsOf?: string } | null>(null);
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user || !businessId) return;
    const { db } = getFirebase();
    (async () => {
      const pointer = await getDoc(doc(db, "memberships", user.uid));
      const linked = await getDocs(collection(db, "memberships", user.uid, "linked"));
      const list = listBusinesses(pointer.exists() ? ((pointer.data() as { businessId?: string }).businessId ?? null) : null, linked.docs.map((d) => d.id));
      const rows = await Promise.all(list.map(async (b, i) => {
        let name = `Business ${i + 1}`;
        let summary: BusinessSummary | null = null;
        try {
          const s = await getDoc(doc(db, "users", b.businessId, "meta", "settings"));
          const n = ((s.data() as { businessName?: string } | undefined)?.businessName ?? "").trim();
          if (n) name = n;
          const snap = await getDoc(doc(db, "users", b.businessId, "groupSnapshots", "summary"));
          if (snap.exists()) {
            const d = snap.data() as { currency: string; months: BusinessSummary["months"]; businessName: string };
            summary = { businessId: b.businessId, name: d.businessName || name, currency: d.currency, months: d.months };
          }
        } catch { /* not readable: shown as not yet published */ }
        return { businessId: b.businessId, name, summary };
      }));
      setFound(rows.filter((r) => r.businessId));
    })().catch(() => setFound([]));
  }, [user, businessId]);

  useEffect(() => {
    if (!businessId) return;
    const { db } = getFirebase();
    const unsubGroup = onSnapshot(doc(db, "users", businessId, "groups", "main"), (snap) => {
      const g = (snap.data() ?? undefined) as { members?: string[]; reportingCurrency?: string; rates?: Record<string, number>; ratesAsOf?: string } | undefined;
      setGroup(g ?? null);
      setChosen(Array.isArray(g?.members) ? (g!.members as string[]) : null);
    });
    const unsubT = onSnapshot(collection(db, "users", businessId, "intercompany"), (snap) => {
      setTransfers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transfer)));
    });
    return () => { unsubGroup(); unsubT(); };
  }, [businessId]);

  const members = useMemo(() => found.filter((f) => (chosen ?? found.map((x) => x.businessId)).includes(f.businessId)), [found, chosen]);
  const withSummary = members.filter((m) => m.summary).map((m) => m.summary as BusinessSummary);
  const memberIds = new Set(members.map((m) => m.businessId));
  const groupTransfers = transfers.filter((t) => memberIds.has(t.fromBusinessId) && memberIds.has(t.toBusinessId));
  const currencies = [...new Set(members.map((m) => m.summary?.currency).filter((c): c is string => !!c))];
  const reporting = group?.reportingCurrency && currencies.includes(group.reportingCurrency) ? group.reportingCurrency : currencies[0] ?? cur;
  const opts: ReportingOptions = { reportingCurrency: reporting, rates: group?.rates ?? {} };
  const problem = members.length >= 2 && withSummary.length === members.length ? validateGroup(withSummary, groupTransfers, currencies.length > 1 ? opts : undefined) : null;
  const months = useMemo(() => lastTwelveMonths(today), [today]);
  const rows = problem ? [] : consolidate(withSummary, groupTransfers, currencies.length > 1 ? opts : undefined).filter((r) => months.includes(r.month));

  async function saveMembers(next: string[]) {
    if (!businessId) return;
    try {
      const { db } = getFirebase();
      await setDoc(doc(db, "users", businessId, "groups", "main"), { members: next, updatedAt: Date.now() }, { merge: true });
    } catch (err) {
      toast.error("Couldn't save the group", toastableErrorMessage(err));
    }
  }
  async function saveRates() {
    if (!businessId) return;
    const rates: Record<string, number> = {};
    for (const c of currencies) {
      if (c === reporting) continue;
      const v = Number(rateDraft[c]);
      if (!(v > 0)) return toast.error("Enter the rate", `Enter how many ${reporting} one ${c} is worth.`);
      rates[c] = v;
    }
    try {
      const { db } = getFirebase();
      await setDoc(doc(db, "users", businessId, "groups", "main"), { reportingCurrency: reporting, rates, ratesAsOf: today, updatedAt: Date.now() }, { merge: true });
      toast.success("Rates saved", `Dated ${today}. Totals are in ${reporting}.`);
    } catch (err) {
      toast.error("Couldn't save the rates", toastableErrorMessage(err));
    }
  }
  async function addTransfer() {
    if (!businessId) return;
    const amount = Number(tAmount.replace(/,/g, ""));
    const t = { month: tMonth, amount, fromBusinessId: tFrom, toBusinessId: tTo, note: tNote.trim() || undefined };
    const err = validateGroup(members.map((m) => m.summary ?? { businessId: m.businessId, name: m.name, currency: cur, months: [] }), [{ id: "new", ...t }], currencies.length > 1 ? opts : undefined);
    if (err) return toast.error("Check the transfer", err);
    try {
      const { db } = getFirebase();
      await addDoc(collection(db, "users", businessId, "intercompany"), { ...t, createdAt: Date.now() });
      setTAmount(""); setTNote("");
      toast.success("Transfer recorded", "It is taken out of the group totals");
    } catch (e) {
      toast.error("Couldn't record it", toastableErrorMessage(e));
    }
  }
  async function removeTransfer(id: string) {
    if (!businessId || !window.confirm("Remove this transfer from the group totals?")) return;
    try {
      const { db } = getFirebase();
      await deleteDoc(doc(db, "users", businessId, "intercompany", id));
    } catch (err) {
      toast.error("Couldn't remove it", toastableErrorMessage(err));
    }
  }

  if (found.length < 2) {
    return <EmptyState title="Only one business on this login" body="A group brings together the businesses this login runs. Add or link another business to this login, then it can be grouped here." />;
  }
  const nameOf = (id: string) => found.find((f) => f.businessId === id)?.name ?? "Business";
  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Businesses in the group</div>
        <div className="text-xs text-muted">Each business publishes its figures for the group while it is open. A business shown as not yet published has not been opened since it was set up.</div>
        {found.map((f) => {
          const included = (chosen ?? found.map((x) => x.businessId)).includes(f.businessId);
          return (
            <label key={f.businessId} className="flex items-center gap-2 text-sm min-h-[44px]">
              <input type="checkbox" checked={included} onChange={(e) => {
                const current = chosen ?? found.map((x) => x.businessId);
                saveMembers(e.target.checked ? [...current.filter((x) => x !== f.businessId), f.businessId] : current.filter((x) => x !== f.businessId));
              }} />
              <span>{f.name}</span>
              {f.summary ? <Badge tone="good">published</Badge> : <Badge tone="amber">not yet published</Badge>}
            </label>
          );
        })}
      </Card>

      {problem && <Card className="p-4 text-sm text-bad">{problem}</Card>}

      {currencies.length > 1 && (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-medium">Currencies</div>
          <div className="text-xs text-muted">The businesses use {currencies.join(", ")}. Totals are added up in one reporting currency. Enter how many {reporting} one unit of each other currency is worth; the rates are dated when you save them.</div>
          <Field className="max-w-xs"><Label>Reporting currency</Label>
            <Select value={reporting} onChange={(e) => setGroup({ ...(group ?? {}), reportingCurrency: e.target.value })}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currencies.filter((c) => c !== reporting).map((c) => (
              <Field key={c}><Label>1 {c} = how many {reporting}</Label>
                <Input inputMode="decimal" value={rateDraft[c] ?? String(group?.rates?.[c] ?? "")} onChange={(e) => setRateDraft({ ...rateDraft, [c]: e.target.value })} />
              </Field>
            ))}
          </div>
          {group?.ratesAsOf && <div className="text-xs text-muted">Rates dated {group.ratesAsOf}.</div>}
          <Button variant="ghost" onClick={saveRates}>Save the rates</Button>
        </Card>
      )}

      {!problem && rows.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-medium">Group in {reporting}, last twelve months</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted"><th className="py-1">Month</th><th className="py-1 text-right">Revenue</th><th className="py-1 text-right">Cost of sales</th><th className="py-1 text-right">Costs and tax</th><th className="py-1 text-right">Net profit</th><th className="py-1 text-right">Transfers taken out</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month} className="border-t border-line">
                    <td className="py-1.5">{r.month}</td>
                    <td className="py-1.5 text-right num">{formatMoney(r.revenue, reporting)}</td>
                    <td className="py-1.5 text-right num">{formatMoney(r.costOfSales, reporting)}</td>
                    <td className="py-1.5 text-right num">{formatMoney(r.costsAndTax, reporting)}</td>
                    <td className="py-1.5 text-right num">{formatMoney(r.netProfit, reporting)}</td>
                    <td className="py-1.5 text-right num">{r.eliminated ? formatMoney(r.eliminated, reporting) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Money moved between your businesses</div>
        <div className="text-xs text-muted">Record a sale or a supply from one business to another. It is counted once, on both sides, and taken out of the group totals, so it is not counted as income or cost twice.</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Month</Label><Input type="month" value={tMonth} onChange={(e) => setTMonth(e.target.value)} /></Field>
          <Field><Label>Amount ({reporting})</Label><Input inputMode="decimal" value={tAmount} onChange={(e) => setTAmount(e.target.value)} /></Field>
          <Field><Label>From</Label>
            <Select value={tFrom} onChange={(e) => setTFrom(e.target.value)}>
              <option value="">Choose</option>
              {members.map((m) => <option key={m.businessId} value={m.businessId}>{m.name}</option>)}
            </Select>
          </Field>
          <Field><Label>To</Label>
            <Select value={tTo} onChange={(e) => setTTo(e.target.value)}>
              <option value="">Choose</option>
              {members.map((m) => <option key={m.businessId} value={m.businessId}>{m.name}</option>)}
            </Select>
          </Field>
          <Field className="sm:col-span-2"><Label>What it was for (optional)</Label><Input value={tNote} onChange={(e) => setTNote(e.target.value)} maxLength={200} /></Field>
        </div>
        <Button onClick={addTransfer} disabled={!tFrom || !tTo || !tAmount.trim()}>Record the transfer</Button>
        {groupTransfers.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-line">
            {groupTransfers.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 text-xs flex-wrap">
                <span>{t.month} · {nameOf(t.fromBusinessId)} → {nameOf(t.toBusinessId)} · <span className="num">{formatMoney(t.amount, reporting)}</span>{t.note && <> · {t.note}</>}</span>
                <button onClick={() => removeTransfer(t.id)} className="text-muted hover:text-fg min-h-[32px]">Remove</button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
