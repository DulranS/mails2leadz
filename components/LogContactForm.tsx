"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import { CHANNEL_LABELS, OUTCOME_LABELS, customerKey, validateCollectionNote } from "@/lib/collections";
import type { CollectionChannel, CollectionOutcome, CollectionSubjectKind } from "@/lib/types";
import { Button, Field, Input, Label, Select } from "@/components/ui";

// Who the contact was with. For a customer, `key` is their name (stored lower-cased); for a loan it is the loan's id.
export interface ContactSubject {
  kind: CollectionSubjectKind;
  key: string;
  label: string;
  suggestedAmount?: number; // pre-fills the promised amount, e.g. what is late
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

// One line in the collections diary: what you did, what came of it, and when to try again. Management notes only:
// it records a contact that already happened and never sends anything.
export function LogContactForm({ subject, onDone }: { subject: ContactSubject; onDone: () => void }) {
  const { addCollectionNote, settings } = useData();
  const toast = useToast();
  const today = todayIso();

  const [date, setDate] = useState(today);
  const [channel, setChannel] = useState<CollectionChannel>("call");
  const [outcome, setOutcome] = useState<CollectionOutcome>("reached");
  const [note, setNote] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [promisedAmount, setPromisedAmount] = useState(subject.suggestedAmount && subject.suggestedAmount > 0 ? String(Math.round(subject.suggestedAmount * 100) / 100) : "");
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState(false);

  const wantsPromise = outcome === "promised" || outcome === "partial";
  const amountNum = promisedAmount.trim() === "" ? undefined : Number(promisedAmount);

  const draft = {
    date,
    outcome,
    promisedDate: wantsPromise && promisedDate ? promisedDate : undefined,
    promisedAmount: wantsPromise ? amountNum : undefined,
    nextFollowUpDate: followUp || undefined,
  };
  const problem = validateCollectionNote(draft, today);

  const chip = "text-xs px-2.5 py-1.5 rounded border border-line text-amber-soft hover:bg-panel2 min-h-[36px]";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (problem) return;
        setBusy(true);
        try {
          await addCollectionNote({
            subjectKind: subject.kind,
            subjectKey: subject.kind === "customer" ? customerKey(subject.key) : subject.key,
            subjectLabel: subject.label,
            date,
            channel,
            outcome,
            note: note.trim() || undefined,
            promisedDate: draft.promisedDate,
            promisedAmount: draft.promisedAmount,
            nextFollowUpDate: draft.nextFollowUpDate,
          });
          toast.success("Contact logged", subject.label);
          onDone();
        } catch (err) {
          toast.error("Couldn't save that", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="text-sm text-muted">What happened when you got in touch with <span className="text-fg">{subject.label}</span>?</div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field><Label>Date</Label><Input required type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field><Label>How</Label>
          <Select value={channel} onChange={(e) => setChannel(e.target.value as CollectionChannel)}>
            {(Object.keys(CHANNEL_LABELS) as CollectionChannel[]).map((k) => <option key={k} value={k}>{CHANNEL_LABELS[k]}</option>)}
          </Select>
        </Field>
        <Field><Label>Outcome</Label>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value as CollectionOutcome)}>
            {(Object.keys(OUTCOME_LABELS) as CollectionOutcome[]).map((k) => <option key={k} value={k}>{OUTCOME_LABELS[k]}</option>)}
          </Select>
        </Field>
      </div>

      {wantsPromise && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <Label>{outcome === "partial" ? "They will pay the rest by" : "They promised to pay by"}</Label>
            <Input required type="date" min={date} value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} />
          </Field>
          <Field>
            <Label>How much (optional)</Label>
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={promisedAmount} onChange={(e) => setPromisedAmount(e.target.value)} placeholder={subject.suggestedAmount ? formatMoney(subject.suggestedAmount, settings.currency) : ""} />
          </Field>
        </div>
      )}

      <Field>
        <Label>Try again on (optional)</Label>
        <Input type="date" min={date} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        <div className="flex flex-wrap gap-2 mt-2">
          <button type="button" className={chip} onClick={() => setFollowUp(addDaysIso(today, 1))}>Tomorrow</button>
          <button type="button" className={chip} onClick={() => setFollowUp(addDaysIso(today, 3))}>In 3 days</button>
          <button type="button" className={chip} onClick={() => setFollowUp(addDaysIso(today, 7))}>Next week</button>
          {wantsPromise && promisedDate && <button type="button" className={chip} onClick={() => setFollowUp(addDaysIso(promisedDate, 1))}>Day after they promised</button>}
          {followUp && <button type="button" className="text-xs text-muted hover:text-fg min-h-[36px] px-2" onClick={() => setFollowUp("")}>Clear</button>}
        </div>
      </Field>

      <Field>
        <Label>Note (optional)</Label>
        <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. said the cheque is in the post, wife answered, shop was closed" />
      </Field>

      {problem && <div className="text-sm text-bad">{problem}</div>}
      <div className="text-[11px] text-muted -mt-1">
        This is a note for your own records. Nothing is sent to {subject.label}, and nothing is booked in your accounts: a payment still has to be recorded when the money actually arrives.
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy || !!problem}>{busy ? "Saving…" : "Save contact"}</Button>
      </div>
    </form>
  );
}
