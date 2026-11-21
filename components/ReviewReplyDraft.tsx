"use client";

// Drafts a reply to an online review with AI. The text is for the owner to read, edit and post on the platform themselves: Balancr
// posts nothing and sends nothing. The draft uses the business's existing AI allowance (the same route as post ideas).
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { Button } from "@/components/ui";

export default function ReviewReplyDraft({ customerName, stars, comment }: { customerName: string; stars?: number; comment?: string }) {
  const { user, businessId } = useAuth();
  const toast = useToast();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function draft() {
    if (!user) return;
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(businessId ? { [BUSINESS_ID_HEADER]: businessId } : {}) },
        body: JSON.stringify({ kind: "review_reply", name: customerName, stars, comment }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Couldn't draft a reply.");
      setText(String(payload.text ?? ""));
    } catch (err) {
      toast.error("Couldn't draft a reply", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (text === null) {
    return (
      <Button variant="ghost" onClick={draft} disabled={busy}>
        {busy ? "Drafting…" : "Draft a reply"}
      </Button>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      <textarea readOnly={false} value={text} onChange={(e) => setText(e.target.value)} rows={4} className="w-full rounded border border-line bg-panel px-3 py-2 text-sm" />
      <div className="flex gap-3 text-xs">
        <button onClick={() => navigator.clipboard?.writeText(text).then(() => toast.success("Copied", "Paste it on the platform"))} className="text-amber-soft hover:underline min-h-[32px]">Copy</button>
        <button onClick={draft} disabled={busy} className="text-muted hover:text-fg min-h-[32px]">{busy ? "Drafting…" : "Draft another"}</button>
        <span className="text-muted">Balancr posts nothing. Edit it, then post it on the platform.</span>
      </div>
    </div>
  );
}
