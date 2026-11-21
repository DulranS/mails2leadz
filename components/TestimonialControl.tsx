"use client";

// On a feedback entry scored 8 or more: approve the customer's words for the public enquiry page, or take them down. Approval needs the
// customer's agreement (ticked here, and it is the owner's to confirm) and a name to show. Nothing is published except through that.
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { MAX_TESTIMONIAL_NAME, MAX_TESTIMONIAL_QUOTE, canFeature, displayNameFrom, validateTestimonial } from "@/lib/testimonials";
import { Button } from "@/components/ui";
import type { FeedbackEntry } from "@/lib/types";

export default function TestimonialControl({ f }: { f: FeedbackEntry }) {
  const { setFeedbackTestimonial } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayNameFrom(f.customerName));
  const [quote, setQuote] = useState((f.comment ?? "").slice(0, MAX_TESTIMONIAL_QUOTE));
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!can(role, "manage:support") || !canFeature(f.score)) return null;
  const shown = f.testimonial?.approved === true;

  async function save() {
    const problem = validateTestimonial({ score: f.score, displayName: name, quote, consent });
    if (problem) return toast.error("Not yet", problem);
    setBusy(true);
    try {
      await setFeedbackTestimonial(f.id, { displayName: name.replace(/\s+/g, " ").trim(), quote: quote.replace(/\s+/g, " ").trim() });
      toast.success("Shown on your enquiry page", "It appears within about five minutes");
      setOpen(false);
    } catch (err) {
      toast.error("Couldn't save it", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function take() {
    setBusy(true);
    try {
      await setFeedbackTestimonial(f.id, null);
      toast.success("Taken down");
    } catch (err) {
      toast.error("Couldn't take it down", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (shown) {
    return (
      <div className="flex items-center gap-3 mt-2 text-xs">
        <span className="text-good">Shown on your enquiry page</span>
        <button onClick={take} disabled={busy} className="text-muted hover:text-fg min-h-[32px]">Take down</button>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="mt-2">
        <Button variant="ghost" onClick={() => setOpen(true)}>Show on your website</Button>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-2 rounded-md border border-line p-3 text-xs">
      <label className="block">
        <span className="text-muted">Name shown</span>
        <input value={name} maxLength={MAX_TESTIMONIAL_NAME} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded border border-line bg-panel px-2 py-1.5" />
      </label>
      <label className="block">
        <span className="text-muted">Their words (edit to the part you may show)</span>
        <textarea value={quote} rows={3} maxLength={MAX_TESTIMONIAL_QUOTE} onChange={(e) => setQuote(e.target.value)} className="mt-1 w-full rounded border border-line bg-panel px-2 py-1.5" />
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>This customer has agreed to their words and name being shown on our website.</span>
      </label>
      <div className="flex gap-3">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Show it"}</Button>
        <button onClick={() => setOpen(false)} className="text-muted hover:text-fg min-h-[32px]">Cancel</button>
      </div>
    </div>
  );
}
