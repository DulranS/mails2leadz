"use client";

// The automations the owner can switch on or off. Each one only sets fields on a lead, or holds back a text until the sending
// window. Nothing here sends a message. Saved on the settings record (owner only).
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { Button, Card, Field, Input, Label } from "@/components/ui";
import { resolveAutomations, validateAutomations, AUTOMATION_MAX_DAYS } from "@/lib/leadIntake";
import { DEFAULT_SMS_FROM_HOUR, DEFAULT_SMS_UNTIL_HOUR } from "@/lib/quietHours";
import type { AutomationSettings } from "@/lib/types";

// The form works in strings; the saved record holds numbers.
type Draft = {
  autoAssignInbound: boolean;
  autoFollowUpInbound: boolean;
  autoSequenceInbound: boolean;
  mergeDuplicateInbound: boolean;
  autoRevisitLostDays: string;
  autoFollowUpAfterProposalDays: string;
  defaultCountryCode: string;
  smsTimeZone: string;
  smsSendFromHour: string;
  smsSendUntilHour: string;
  outboundWebhookUrl: string;
  alertLowReviews: boolean;
  alertInspections: boolean;
  automationsPaused: boolean;
  alertActions: boolean;
  alertEscalations: boolean;
  alertCapacity: boolean;
  alertWeeklyReview: boolean;
};

function toDraft(s: AutomationSettings | undefined): Draft {
  const r = resolveAutomations(s);
  return {
    autoAssignInbound: r.autoAssignInbound,
    autoFollowUpInbound: r.autoFollowUpInbound,
    autoSequenceInbound: r.autoSequenceInbound,
    mergeDuplicateInbound: r.mergeDuplicateInbound,
    autoRevisitLostDays: String(r.autoRevisitLostDays),
    autoFollowUpAfterProposalDays: String(r.autoFollowUpAfterProposalDays),
    defaultCountryCode: r.defaultCountryCode,
    smsTimeZone: r.smsTimeZone,
    smsSendFromHour: String(r.smsSendFromHour ?? DEFAULT_SMS_FROM_HOUR),
    smsSendUntilHour: String(r.smsSendUntilHour ?? DEFAULT_SMS_UNTIL_HOUR),
    outboundWebhookUrl: r.outboundWebhookUrl,
    alertLowReviews: r.alertLowReviews,
    alertInspections: r.alertInspections,
    automationsPaused: r.automationsPaused,
    alertActions: r.alertActions,
    alertEscalations: r.alertEscalations,
    alertCapacity: r.alertCapacity,
    alertWeeklyReview: r.alertWeeklyReview,
  };
}

export default function AutomationsCard() {
  const { settings, updateSettings } = useData();
  const toast = useToast();
  const saved = toDraft(settings.automations);
  const [draft, setDraft] = useState<Draft>(saved);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft({ ...draft, [key]: value });
  }

  async function save() {
    const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
    const next: AutomationSettings = {
      autoAssignInbound: draft.autoAssignInbound,
      autoFollowUpInbound: draft.autoFollowUpInbound,
      autoSequenceInbound: draft.autoSequenceInbound,
      mergeDuplicateInbound: draft.mergeDuplicateInbound,
      autoRevisitLostDays: num(draft.autoRevisitLostDays),
      autoFollowUpAfterProposalDays: num(draft.autoFollowUpAfterProposalDays),
      defaultCountryCode: draft.defaultCountryCode.trim(),
      smsTimeZone: draft.smsTimeZone.trim(),
      smsSendFromHour: draft.smsSendFromHour.trim() === "" ? undefined : Number(draft.smsSendFromHour),
      smsSendUntilHour: draft.smsSendUntilHour.trim() === "" ? undefined : Number(draft.smsSendUntilHour),
      outboundWebhookUrl: draft.outboundWebhookUrl.trim(),
      alertLowReviews: draft.alertLowReviews,
      alertInspections: draft.alertInspections,
      automationsPaused: draft.automationsPaused,
      alertActions: draft.alertActions,
      alertEscalations: draft.alertEscalations,
      alertCapacity: draft.alertCapacity,
      alertWeeklyReview: draft.alertWeeklyReview,
    };
    const problem = validateAutomations(next);
    if (problem) return toast.error("Check the automations", problem);
    setBusy(true);
    try {
      await updateSettings({ automations: next });
      toast.success("Automations saved");
    } catch (err) {
      toast.error("Couldn't save the automations", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const row = (key: "autoAssignInbound" | "autoFollowUpInbound" | "autoSequenceInbound" | "mergeDuplicateInbound" | "alertLowReviews" | "alertInspections" | "automationsPaused" | "alertActions" | "alertEscalations" | "alertCapacity" | "alertWeeklyReview", text: string) => (
    <label key={key} className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1 w-4 h-4 accent-amber" checked={draft[key]} onChange={(e) => set(key, e.target.checked)} />
      <span>{text}</span>
    </label>
  );

  return (
    <Card className="p-4 space-y-4">
      <div>
        <div className="text-sm font-medium">Automations</div>
        <div className="text-xs text-muted mt-1">
          Switch on the ones you want. They only fill in fields on leads, or hold a text back until the sending window. None sends a message on its own.
          Merging duplicates is on by default.
        </div>
      </div>
      <div className="space-y-2.5">
        <div className="text-xs font-medium text-muted">Pause</div>
        {row("automationsPaused", "Pause every automatic change to leads and the webhook push (the alerts keep working; turn this off to resume)")}
        <div className="text-xs font-medium text-muted">New leads (website form and lead API)</div>
        {row("autoAssignInbound", "Give each new lead to the team member with the fewest open leads")}
        {row("autoFollowUpInbound", "Make each new lead due for follow-up today")}
        {row("autoSequenceInbound", "Start the five-touch follow-up sequence on each new lead (each step is a reminder; you send it)")}
        {row("mergeDuplicateInbound", "When someone already on file enquires again, add it to their lead instead of filing a second one")}
      </div>
      <div className="space-y-2.5">
        <div className="text-xs font-medium text-muted">Leads that move on</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <Label>A lead marked Lost is looked at again after (days, 0 = off)</Label>
            <Input type="number" min="0" max={AUTOMATION_MAX_DAYS} step="1" value={draft.autoRevisitLostDays} onChange={(e) => set("autoRevisitLostDays", e.target.value)} />
          </Field>
          <Field>
            <Label>A lead moved to Proposal sent is followed up after (days, 0 = off)</Label>
            <Input type="number" min="0" max={AUTOMATION_MAX_DAYS} step="1" value={draft.autoFollowUpAfterProposalDays} onChange={(e) => set("autoFollowUpAfterProposalDays", e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-muted">Only when the lead has no follow-up date already. A lead that is revisited or followed up keeps the date you set later.</p>
      </div>
      <div className="space-y-2.5">
        <div className="text-xs font-medium text-muted">Text messages (reminders for overdue invoices)</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field>
            <Label>Time zone (e.g. Asia/Colombo)</Label>
            <Input value={draft.smsTimeZone} maxLength={60} onChange={(e) => set("smsTimeZone", e.target.value)} placeholder="Leave empty for no window" />
          </Field>
          <Field>
            <Label>Send texts from (hour, 0 to 23)</Label>
            <Input type="number" min="0" max="23" step="1" value={draft.smsSendFromHour} onChange={(e) => set("smsSendFromHour", e.target.value)} />
          </Field>
          <Field>
            <Label>Until (hour, 0 to 23)</Label>
            <Input type="number" min="0" max="23" step="1" value={draft.smsSendUntilHour} onChange={(e) => set("smsSendUntilHour", e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-muted">
          Texts are held back outside this window and sent on the next daily run that falls inside it. Email is not affected. A window that runs past midnight (22 until 6) is fine.
        </p>
      </div>
      <div className="space-y-2.5">
        <div className="text-xs font-medium text-muted">Reviews</div>
        {row("alertLowReviews", "Alert me when a review of one or two stars comes in through the review API")}
        <div className="text-xs font-medium text-muted">Management</div>
        {row("alertActions", "Show open management decisions on the Agenda when their day is near or past")}
        {row("alertEscalations", "Show items a month or more overdue (escalations) on the Agenda")}
        {row("alertCapacity", "Show days that are booked beyond the rota, or booked with nobody rostered, on the Agenda")}
        {row("alertWeeklyReview", "On Mondays, show the operations review on the Agenda and how many items need a decision")}
        <div className="text-xs font-medium text-muted">Inspections</div>
        {row("alertInspections", "Show inspections that are due on the Agenda")}
        <div className="text-xs font-medium text-muted">Send new leads out</div>
        <Field>
          <Label>Webhook address (optional, https, e.g. a Zapier catch hook)</Label>
          <Input value={draft.outboundWebhookUrl} maxLength={500} onChange={(e) => set("outboundWebhookUrl", e.target.value)} placeholder="https://hooks.zapier.com/…" />
        </Field>
        <p className="text-xs text-muted">Each new lead from the website form or the lead API is posted to this address as JSON, once. A failed post does not lose the lead; it stays on the Leads page.</p>
        <div className="text-xs font-medium text-muted">Matching</div>
        <Field>
          <Label>Country code for local phone numbers (e.g. 94 for Sri Lanka, 1 for the US)</Label>
          <Input value={draft.defaultCountryCode} maxLength={4} onChange={(e) => set("defaultCountryCode", e.target.value.replace(/\D/g, ""))} placeholder="94" />
        </Field>
        <p className="text-xs text-muted">Without it, a number that starts with 0 cannot be matched to a lead that wrote +94 (or the reverse), so the same person can be filed twice.</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : "Save automations"}</Button>
      </div>
    </Card>
  );
}
