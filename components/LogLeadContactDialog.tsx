"use client";

// Records one contact attempt on a lead. Balancr never contacts anyone: the person has already sent the message or made the
// call, and this only writes down what happened. The rules live in lib/leadPipeline.ts (logContactPlan).
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { Button, Field, Label, Select, Textarea, Modal } from "@/components/ui";
import { CONTACT_CHANNELS, CONTACT_OUTCOMES, MAX_CONTACT_NOTE, logContactPlan, sequenceStatus } from "@/lib/leadPipeline";
import { todayIso } from "@/lib/format";
import type { Lead, LeadContactChannel, LeadContactOutcome } from "@/lib/types";

function newContactId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export default function LogLeadContactDialog({
  lead,
  open,
  onClose,
  initialChannel,
  countsAsStep,
}: {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  initialChannel?: LeadContactChannel;
  countsAsStep?: boolean; // true when opened from a sequence step: the touch moves the sequence on
}) {
  const { logLeadContact } = useData();
  const { user, memberName } = useAuth();
  const toast = useToast();
  const seq = sequenceStatus(lead, todayIso());
  const sequenceActive = !!seq && (seq.state === "due" || seq.state === "upcoming");

  const [channel, setChannel] = useState<LeadContactChannel>(initialChannel ?? "call");
  const [outcome, setOutcome] = useState<LeadContactOutcome>("spoke");
  const [note, setNote] = useState("");
  const [counts, setCounts] = useState<boolean>(!!countsAsStep && sequenceActive);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const plan = logContactPlan(
        lead,
        { channel, outcome, note, countsAsStep: counts && sequenceActive },
        Date.now(),
        { uid: user?.uid, name: memberName ?? user?.email ?? undefined },
        newContactId(),
      );
      if (!plan.ok) {
        toast.error("Couldn't log the contact", plan.error);
        return;
      }
      await logLeadContact(lead.id, plan.patch);
      toast.success(
        outcome === "asked_stop" ? "Noted: they asked not to be contacted" : "Contact logged",
        `${lead.name}${outcome === "asked_stop" ? " is now marked Do not contact" : ""}`,
      );
      setNote("");
      onClose();
    } catch (err) {
      toast.error("Couldn't log the contact", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Log a contact with ${lead.name}`}>
      <div className="space-y-4">
        <p className="text-xs text-muted">
          Balancr sends nothing. Make the call or send the message yourself, then write down what happened here.
        </p>
        {lead.doNotContact && (
          <p className="text-xs text-bad">This person asked not to be contacted. Only &quot;Asked us to stop&quot; can be logged.</p>
        )}
        <Field>
          <Label>How did you reach them?</Label>
          <Select value={channel} onChange={(e) => setChannel(e.target.value as LeadContactChannel)}>
            {CONTACT_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>What happened?</Label>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value as LeadContactOutcome)}>
            {CONTACT_OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Note (optional)</Label>
          <Textarea
            rows={3}
            maxLength={MAX_CONTACT_NOTE}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Wants a quote for 40 chairs, call back Thursday"
          />
        </Field>
        {sequenceActive && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={counts} onChange={(e) => setCounts(e.target.checked)} />
            <span>This counts as the next step of the follow-up sequence</span>
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save contact"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
