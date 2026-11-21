"use client";

// Contract register: each signed contract, who it is with, when it ends or renews, and what it is worth a year. Those due for a decision are listed
// first. Owner and manager only (the tab). Signing and e-signature are not done here.
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Select, Textarea } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { todayIso, formatMoney, formatDate } from "@/lib/format";
import { CONTRACT_KINDS, contractSummary, validateContract, RENEW_WARNING_DAYS, type ContractKind } from "@/lib/contracts";

const TONE = { renew_soon: "amber", ended: "bad", active: "good", open_ended: "default" } as const;
const LABEL = { renew_soon: "decide before renewal", ended: "ended", active: "active", open_ended: "open-ended" } as const;

export default function ContractsPanel() {
  const { contracts, addContract, updateContract, deleteContract, settings } = useData();
  const toast = useToast();
  const today = todayIso();
  const cur = settings.currency;
  const summary = useMemo(() => contractSummary(contracts, today), [contracts, today]);
  const [title, setTitle] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [kind, setKind] = useState<ContractKind>("supplier");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [noticeDays, setNoticeDays] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const problem = title || counterparty ? validateContract({ title, counterparty, kind, startDate, endDate: endDate || undefined }) : null;

  async function add() {
    try {
      await addContract({
        title, counterparty, kind, startDate,
        endDate: endDate || undefined,
        noticeDays: noticeDays ? Number(noticeDays) : undefined,
        value: value ? Number(value.replace(/,/g, "")) : undefined,
        notes: notes.trim() || undefined,
      });
      setTitle(""); setCounterparty(""); setEndDate(""); setNoticeDays(""); setValue(""); setNotes("");
      toast.success("Contract added", counterparty);
    } catch (err) {
      toast.error("Couldn't add it", toastableErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Add a contract</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>What it is for</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="Shop lease, delivery service, cleaning" /></Field>
          <Field><Label>Other party</Label><Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} maxLength={150} /></Field>
          <Field><Label>Kind</Label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as ContractKind)}>
              {CONTRACT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </Select>
          </Field>
          <Field><Label>Started on</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field><Label>Ends on (leave empty if open-ended)</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
          <Field><Label>Notice needed to end or change (days)</Label><Input inputMode="numeric" value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} /></Field>
          <Field><Label>Worth per year ({cur}, optional)</Label><Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
          <Field className="sm:col-span-2"><Label>Notes (optional)</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></Field>
        </div>
        {problem && <div className="text-xs text-bad">{problem}</div>}
        <Button onClick={add} disabled={!!problem || !title || !counterparty}>Add to the register</Button>
      </Card>

      {contracts.length === 0 ? (
        <EmptyState title="No contracts recorded" body="Record each contract the business has signed, so none rolls over without a decision. Those due for renewal show first." />
      ) : (
        <>
          <div className="text-xs">
            {summary.renewSoon > 0 && <span className="text-amber-soft">{summary.renewSoon} to decide on (within {RENEW_WARNING_DAYS} days, after any notice). </span>}
            {summary.ended > 0 && <span className="text-bad">{summary.ended} ended. </span>}
            {summary.yearlyValue > 0 && <span className="text-muted">Worth about {formatMoney(summary.yearlyValue, cur)} a year in total.</span>}
          </div>
          <div className="space-y-2">
            {summary.rows.map(({ c, status }) => (
              <Card key={c.id} className="p-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{c.title}</span>
                  <Badge>{c.kind}</Badge>
                  <Badge tone={TONE[status]}>{LABEL[status]}</Badge>
                </div>
                <div className="text-xs text-muted mt-1">
                  {c.counterparty} · from {formatDate(c.startDate)}{c.endDate ? <> to {formatDate(c.endDate)}</> : <> · no end date</>}
                  {c.noticeDays ? <> · {c.noticeDays} days&apos; notice</> : null}
                  {c.value ? <> · <span className="num">{formatMoney(c.value, cur)}</span> a year</> : null}
                </div>
                {c.notes && <div className="text-xs mt-1">{c.notes}</div>}
                <div className="flex gap-3 mt-2">
                  {c.endDate && status !== "ended" && (
                    <button onClick={() => updateContract(c.id, { endDate: undefined }).catch((err) => toast.error("Couldn't change it", toastableErrorMessage(err)))} className="text-xs text-muted hover:text-fg min-h-[32px]">Make it open-ended</button>
                  )}
                  <button onClick={() => { if (window.confirm(`Remove ${c.title} from the register?`)) deleteContract(c.id).catch((err) => toast.error("Couldn't remove it", toastableErrorMessage(err))); }} className="text-xs text-muted hover:text-fg min-h-[32px]">Remove</button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
