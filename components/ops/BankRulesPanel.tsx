"use client";

// Bank rules on the reconciliation page: the rules you write once, and one button to apply them to the lines not yet decided. A rule only marks a line
// matched or ignored; it never posts to the books. Lines that could be more than one entry are left for you.
import { useMemo, useState } from "react";
import { Button, Card, Field, Input, Label, Select } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { applyRules, validateRule, type BankRule, type BankRuleAction } from "@/lib/bankRules";

export default function BankRulesPanel({ candidates }: { candidates: { id: string; date: string; label: string; amount: number }[] }) {
  const { bankStatementLines, updateBankStatementLine, settings, updateSettings } = useData();
  const toast = useToast();
  const rules: BankRule[] = settings.bankRules ?? [];
  const [contains, setContains] = useState("");
  const [direction, setDirection] = useState<"in" | "out" | "any">("any");
  const [kind, setKind] = useState<"ignore" | "match">("match");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ matched: number; ignored: number; review: number } | null>(null);

  const action: BankRuleAction = kind === "ignore" ? { kind: "ignore" } : { kind: "match", label: label.trim() };
  const problem = contains || label ? validateRule({ contains: contains.trim(), direction, action }) : null;
  const unmatchedCount = useMemo(() => bankStatementLines.filter((l) => l.status === "unmatched").length, [bankStatementLines]);

  async function addRule() {
    const rule: BankRule = { id: `r${Date.now().toString(36)}`, contains: contains.trim(), direction, action };
    try {
      await updateSettings({ bankRules: [...rules, rule] });
      setContains(""); setLabel("");
    } catch (err) {
      toast.error("Couldn't save the rule", toastableErrorMessage(err));
    }
  }
  async function removeRule(id: string) {
    try {
      await updateSettings({ bankRules: rules.filter((r) => r.id !== id) });
    } catch (err) {
      toast.error("Couldn't remove it", toastableErrorMessage(err));
    }
  }
  async function apply() {
    setBusy(true);
    try {
      const result = applyRules(
        bankStatementLines.map((l) => ({ id: l.id, date: l.date, description: l.description, amount: l.amount, status: l.status })),
        rules,
        candidates,
      );
      for (const id of result.toIgnore) await updateBankStatementLine(id, { status: "ignored" });
      for (const m of result.toMatch) await updateBankStatementLine(m.lineId, { status: "matched", matchNote: m.note });
      setLast({ matched: result.toMatch.length, ignored: result.toIgnore.length, review: result.review.length });
      toast.success("Rules applied", `${result.toMatch.length} matched, ${result.toIgnore.length} ignored`);
    } catch (err) {
      toast.error("Stopped part way", `${toastableErrorMessage(err)} Apply again to finish; nothing is marked twice.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-3 mb-6">
      <div className="text-sm font-medium">Bank rules</div>
      <div className="text-xs text-muted">Write a rule once for a line that keeps coming back. A rule marks lines matched or ignored; it never changes the books. A line that could be more than one entry stays for you.</div>
      {rules.length > 0 && (
        <div className="space-y-1">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 text-xs">
              <span>When the description has &quot;{r.contains}&quot; ({r.direction === "any" ? "in or out" : r.direction === "in" ? "money in" : "money out"}): {r.action.kind === "ignore" ? "ignore it" : `match to ${r.action.label}`}</span>
              <button onClick={() => removeRule(r.id)} className="text-muted hover:text-fg min-h-[32px]">Remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Field><Label>Description contains</Label><Input value={contains} onChange={(e) => setContains(e.target.value)} maxLength={80} placeholder="DD RENT" /></Field>
        <Field><Label>Money</Label>
          <Select value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out" | "any")}>
            <option value="any">In or out</option>
            <option value="in">Money in</option>
            <option value="out">Money out</option>
          </Select>
        </Field>
        <Field><Label>Then</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as "ignore" | "match")}>
            <option value="match">Match to an entry</option>
            <option value="ignore">Ignore it</option>
          </Select>
        </Field>
        {kind === "match" && <Field><Label>Entry it is (e.g. Rent, Sale)</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} /></Field>}
      </div>
      {problem && <div className="text-xs text-bad">{problem}</div>}
      <div className="flex gap-3 flex-wrap items-center">
        <Button variant="ghost" onClick={addRule} disabled={!!problem || !contains.trim()}>Add the rule</Button>
        <Button onClick={apply} disabled={busy || rules.length === 0 || unmatchedCount === 0}>{busy ? "Applying…" : `Apply the rules to ${unmatchedCount} undecided line${unmatchedCount === 1 ? "" : "s"}`}</Button>
        {last && <span className="text-xs text-muted">Last run: {last.matched} matched, {last.ignored} ignored, {last.review} left for you.</span>}
      </div>
      <div className="text-[11px] text-muted">An entry must match in amount to within one unit and in date to within three days.</div>
    </Card>
  );
}
