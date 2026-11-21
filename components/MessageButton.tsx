"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { buildShareTargets } from "@/lib/share";
import { buildMessage, templatesFor, type MessageAudience } from "@/lib/messageTemplates";
import { Button, Field, Label, Modal, Select, Textarea } from "@/components/ui";

// A "Message" link that opens a ready-written message the person can edit and send by WhatsApp or email, or copy. Balancr
// sends nothing itself: this only opens WhatsApp or the mail app with the text filled in (lib/messageTemplates.ts).
export default function MessageButton({
  audience,
  name,
  contact,
  topic,
  subject,
  suggested,
  className,
  label = "Message",
  ai,
}: {
  audience: MessageAudience;
  name: string;
  contact?: string;
  topic?: string;
  subject?: string;
  suggested?: string;
  className?: string;
  label?: string;
  // When given (and the viewer is an Owner or Manager), the window offers "Write with AI": a draft written from Settings > What we sell.
  ai?: { kind: "outreach" | "follow_up"; stage?: string; source?: string; notes?: string; daysOverdue?: number };
}) {
  const { settings } = useData();
  const toast = useToast();
  const { user, role, businessId: activeBusinessId } = useAuth();
  const [writing, setWriting] = useState(false);
  const canAi = !!ai && (role === "owner" || role === "manager");
  const hasOffer = (settings.offerContext ?? "").trim().length >= 20;
  const options = useMemo(() => templatesFor(audience), [audience]);
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(suggested && options.some((o) => o.id === suggested) ? suggested : options[0]?.id ?? "");
  const vars = { name, business: settings.businessName, topic, subject };
  const built = useMemo(() => buildMessage(templateId, vars), [templateId, name, settings.businessName, topic, subject]); // eslint-disable-line react-hooks/exhaustive-deps
  // The text is editable; it resets to the template whenever the template (or the modal) changes.
  const [edited, setEdited] = useState<string | null>(null);
  const text = edited ?? built.body;
  const targets = buildShareTargets(text, built.subject, contact);
  const hasContact = !!contact?.trim();

  async function writeWithAi() {
    if (!ai || !user) return;
    setWriting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(activeBusinessId ? { [BUSINESS_ID_HEADER]: activeBusinessId } : {}) },
        body: JSON.stringify({ ...ai, name }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Couldn't write a draft.");
      setEdited(String(payload.text ?? ""));
    } catch (err) {
      toast.error("Couldn't write a draft", toastableErrorMessage(err));
    } finally {
      setWriting(false);
    }
  }

  function close() {
    setOpen(false);
    setEdited(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Start on the template that fits now (a lead may have moved stage since this was last opened).
          if (suggested && options.some((o) => o.id === suggested)) setTemplateId(suggested);
          setEdited(null);
          setOpen(true);
        }}
        className={className ?? "text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"}>
        {label}
      </button>
      <Modal open={open} onClose={close} title={`Message ${name}`}>
        {open && (
          <div className="space-y-4">
            <Field>
              <Label>Message</Label>
              <Select
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setEdited(null);
                }}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </Select>
              <div className="text-[11px] text-muted mt-1">{options.find((o) => o.id === templateId)?.hint}</div>
            </Field>
            <Field>
              <Label>Text (edit it before you send)</Label>
              <Textarea rows={6} value={text} onChange={(e) => setEdited(e.target.value)} />
              {canAi && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Button type="button" variant="ghost" disabled={writing || !hasOffer} onClick={writeWithAi}>
                    {writing ? "Writing…" : "Write with AI"}
                  </Button>
                  <span className="text-[11px] text-muted">
                    {hasOffer ? "Written for this person from what you told us you sell. Uses one AI message. Read it before you send." : "Add what you sell under Settings and AI can write this for you."}
                  </span>
                </div>
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <a href={targets.whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex">
                <Button type="button">Open WhatsApp</Button>
              </a>
              <a href={targets.mailtoUrl} className="inline-flex">
                <Button type="button" variant="ghost">Email</Button>
              </a>
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text);
                    toast.success("Copied", "Paste it wherever you like.");
                  } catch {
                    toast.error("Couldn't copy", "Select the text and copy it by hand.");
                  }
                }}
              >
                Copy
              </Button>
            </div>
            {!hasContact && <div className="text-[11px] text-muted">No phone or email saved for {name}: WhatsApp and email will open without an address, so choose the person there.</div>}
          </div>
        )}
      </Modal>
    </>
  );
}
