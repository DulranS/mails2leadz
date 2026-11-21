"use client";

// Owner or manager: an email to every customer who agreed to offers and has an email address, each with their own unsubscribe link.
// The send runs on the server (app/api/marketing/send) and is capped per send and per day.
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { campaignRecipients, validateCampaign, MARKETING_RUN_LIMIT, MAX_BODY } from "@/lib/marketing";
import { Button, Card, Field, Input, Label, Textarea } from "@/components/ui";

export default function EmailCampaignCard() {
  const { user, businessId, role } = useAuth();
  const { customers } = useData();
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const audience = useMemo(() => campaignRecipients(customers), [customers]);
  if (role !== "owner" && role !== "manager") return null;
  const problem = validateCampaign({ subject, body });

  async function send() {
    if (problem || audience.length === 0) return;
    const count = Math.min(audience.length, MARKETING_RUN_LIMIT);
    if (!window.confirm(`Send this email to ${count} customer${count === 1 ? "" : "s"}? It cannot be recalled.`)) return;
    setBusy(true);
    try {
      if (!user) throw new Error("Sign in again to send.");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/marketing/send", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
        body: JSON.stringify({ subject, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't send the campaign.");
      toast.success(`Sent to ${data.sent} customer${data.sent === 1 ? "" : "s"}`, data.failed ? `${data.failed} could not be sent.` : data.heldBack ? `${data.heldBack} more are waiting: send again later.` : undefined);
      if (!data.failed && !data.heldBack) { setSubject(""); setBody(""); }
    } catch (err) {
      toast.error("Couldn't send the campaign", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 !p-3.5">
      <div className="text-sm font-medium">Email campaign</div>
      <div className="text-xs text-muted mb-3">
        Goes only to customers marked as agreed to offers who have an email address ({audience.length} now). Each email has their own one-click unsubscribe link.
        Up to {MARKETING_RUN_LIMIT} per send. Changes no sale or balance.
      </div>
      <div className="space-y-3">
        <Field><Label>Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} /></Field>
        <Field>
          <Label>Message</Label>
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX_BODY} />
          <div className="text-xs text-muted mt-1">Each customer is greeted by first name, and the unsubscribe line is added for you.</div>
        </Field>
        <div className="flex justify-end">
          <Button onClick={send} disabled={busy || audience.length === 0 || (subject !== "" || body !== "" ? problem !== null : true)}>{busy ? "Sending…" : "Send campaign"}</Button>
        </div>
      </div>
    </Card>
  );
}
