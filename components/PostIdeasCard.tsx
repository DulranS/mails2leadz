"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { BUSINESS_ID_HEADER } from "@/lib/activeBusiness";
import { POST_GOALS, type PostGoal } from "@/lib/aiDraft";
import { Button, Card, Field, Input, Label, Select, Textarea } from "@/components/ui";

// Three social post ideas written from Settings > What we sell. Text only: Balancr does not post, schedule or track anything.
// The owner (or whoever makes the posts) copies what is useful. One AI message per press.
export default function PostIdeasCard() {
  const { settings } = useData();
  const { user, role, businessId: activeBusinessId } = useAuth();
  const toast = useToast();
  const [goal, setGoal] = useState<PostGoal>("new_customers");
  const [focus, setFocus] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (role !== "owner" && role !== "manager") return null;
  const hasOffer = (settings.offerContext ?? "").trim().length >= 20;

  async function write() {
    if (!user) return;
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${idToken}`, ...(activeBusinessId ? { [BUSINESS_ID_HEADER]: activeBusinessId } : {}) },
        body: JSON.stringify({ kind: "post_ideas", goal, focus }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Couldn't write post ideas.");
      setText(String(payload.text ?? ""));
    } catch (err) {
      toast.error("Couldn't write post ideas", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <div className="font-medium">Post ideas</div>
      <div className="text-xs text-muted mt-0.5 mb-3">
        Three ideas for social posts, written from what you told us you sell. You (or whoever makes your posts) review, shape and publish them; Balancr posts nothing.
      </div>
      {!hasOffer ? (
        <div className="text-sm text-muted">Add two or three sentences under Settings &gt; What we sell, and this will write posts for your business.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field>
              <Label>What the posts are for</Label>
              <Select value={goal} onChange={(e) => setGoal(e.target.value as PostGoal)}>
                {POST_GOALS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label>Focus on (optional)</Label>
              <Input value={focus} maxLength={200} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. our weekend repair slots" />
            </Field>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button type="button" disabled={busy} onClick={write}>{busy ? "Writing…" : "Write 3 post ideas"}</Button>
            <span className="text-[11px] text-muted">Uses one AI message.</span>
          </div>
          {text && (
            <div className="mt-3">
              <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(text);
                      toast.success("Copied", "Paste it into your post.");
                    } catch {
                      toast.error("Couldn't copy", "Select the text and copy it by hand.");
                    }
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
