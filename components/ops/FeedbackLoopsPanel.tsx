"use client";

// Feedback loops. (1) Improvements: a complaint or suggestion becomes a change with one owner and one day; overdue ones are flagged, and the
// customer loop shows how many customer ideas were actually done. (2) Suppliers: each product bought from one supplier is listed with its
// alternatives, each quote compared on price with what is paid now. Owner and manager only (the tab).
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Select } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { todayIso, formatMoney } from "@/lib/format";
import { sourcingRisk } from "@/lib/sourcingRisk";
import { improvementSummary, compareQuote, uncoveredSingleSource, ALTERNATIVE_STATUSES } from "@/lib/feedbackLoops";

export default function FeedbackLoopsPanel() {
  const { improvements, addImprovement, setImprovementStatus, supplierAlternatives, addAlternative, setAlternativeStatus, purchases, products, settings } = useData();
  const toast = useToast();
  const today = todayIso();
  const cur = settings.currency;
  const summary = useMemo(() => improvementSummary(improvements, today), [improvements, today]);
  const risk = useMemo(() => sourcingRisk(purchases, today), [purchases, today]);
  const singleIds = useMemo(() => risk.products.filter((p) => p.singleSource).map((p) => p.productId), [risk]);
  const uncovered = useMemo(() => uncoveredSingleSource(singleIds, supplierAlternatives), [singleIds, supplierAlternatives]);
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? "Item";
  const currentUnitCost = (productId: string) => {
    const lines = purchases.filter((p) => p.productId === productId && p.qty > 0 && p.date >= new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10));
    const qty = lines.reduce((t, p) => t + p.qty, 0);
    return qty > 0 ? lines.reduce((t, p) => t + p.qty * p.unitCost, 0) / qty : 0;
  };

  const [title, setTitle] = useState("");
  const [source, setSource] = useState<"customer" | "team" | "supplier" | "other">("customer");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [draft, setDraft] = useState<Record<string, { alternative: string; quote: string }>>({});

  async function addIdea() {
    try {
      await addImprovement({ title, source, owner, dueDate });
      setTitle(""); setOwner("");
      toast.success("Improvement added", `${owner} by ${dueDate}`);
    } catch (err) { toast.error("Couldn't add it", toastableErrorMessage(err)); }
  }
  async function addAlt(productId: string) {
    const d = draft[productId] ?? { alternative: "", quote: "" };
    try {
      await addAlternative({ productId, currentSupplier: "", alternative: d.alternative, quoteUnitCost: Number(d.quote.replace(/,/g, "")) });
      setDraft({ ...draft, [productId]: { alternative: "", quote: "" } });
      toast.success("Alternative recorded", d.alternative);
    } catch (err) { toast.error("Couldn't record it", toastableErrorMessage(err)); }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Changes from customers and the team</div>
        <div className="text-xs text-muted">
          {summary.open} open{summary.overdue.length > 0 && <span className="text-bad"> · {summary.overdue.length} overdue</span>}
          {summary.fromCustomers > 0 && <> · customer ideas done: {summary.doneFromCustomers} of {summary.fromCustomers}</>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>What should change</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Stop the lid leaking in transit" /></Field>
          <Field><Label>Where it came from</Label>
            <Select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              <option value="customer">A customer</option><option value="team">The team</option><option value="supplier">A supplier</option><option value="other">Other</option>
            </Select>
          </Field>
          <Field><Label>Who will make the change</Label><Input value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={120} /></Field>
          <Field><Label>Done by</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>
        <Button onClick={addIdea} disabled={!title.trim() || !owner.trim() || !dueDate}>Add the change</Button>
        <div className="space-y-2">
          {improvements.filter((i) => i.status === "open").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((i) => (
            <div key={i.id} className="flex items-center gap-2 flex-wrap text-sm">
              <span className="font-medium">{i.title}</span>
              <Badge>{i.owner}</Badge>
              {i.dueDate < today ? <Badge tone="bad">overdue since {i.dueDate}</Badge> : <span className="text-xs text-muted">by {i.dueDate}</span>}
              <button onClick={() => setImprovementStatus(i.id, "done").then(() => toast.success("Done", i.title)).catch((err) => toast.error("Couldn't record it", toastableErrorMessage(err)))} className="text-xs text-amber-soft hover:underline min-h-[32px]">Done</button>
              <button onClick={() => setImprovementStatus(i.id, "dropped").catch((err) => toast.error("Couldn't record it", toastableErrorMessage(err)))} className="text-xs text-muted hover:text-fg min-h-[32px]">Drop</button>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        <div className="text-sm font-medium">Products bought from one supplier</div>
        {singleIds.length === 0 && <EmptyState title="Nothing depends on one supplier" body="When a product is bought from one supplier only, it appears here, so an alternative can be found before it is needed." />}
        {singleIds.map((pid) => {
          const alts = supplierAlternatives.filter((a) => a.productId === pid);
          const cost = currentUnitCost(pid);
          const d = draft[pid] ?? { alternative: "", quote: "" };
          return (
            <Card key={pid} className="p-3.5 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{name(pid)}</span>
                {uncovered.includes(pid) ? <Badge tone="bad">no alternative yet</Badge> : <Badge tone="good">alternative in hand</Badge>}
                <span className="text-xs text-muted">paid now: {cost > 0 ? formatMoney(cost, cur) : "no purchase price yet"} per unit</span>
              </div>
              {alts.map((a) => {
                const cmp = compareQuote(cost, a.quoteUnitCost);
                return (
                  <div key={a.id} className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-medium">{a.alternative}</span>
                    <span className="text-muted">quoted {formatMoney(a.quoteUnitCost, cur)}{cmp && <> ({cmp.differencePct > 0 ? "+" : ""}{cmp.differencePct}% · {cmp.cheaper ? "cheaper" : "dearer"})</>}</span>
                    <Select value={a.status} onChange={(e) => setAlternativeStatus(a.id, e.target.value as (typeof ALTERNATIVE_STATUSES)[number])}>
                      {ALTERNATIVE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </div>
                );
              })}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2 items-end">
                <Field><Label>Another supplier that could supply it</Label><Input value={d.alternative} onChange={(e) => setDraft({ ...draft, [pid]: { ...d, alternative: e.target.value } })} maxLength={150} /></Field>
                <Field><Label>Their price per unit</Label><Input inputMode="decimal" value={d.quote} onChange={(e) => setDraft({ ...draft, [pid]: { ...d, quote: e.target.value } })} /></Field>
                <Button onClick={() => addAlt(pid)} disabled={!d.alternative.trim() || !d.quote.trim()}>Record</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
