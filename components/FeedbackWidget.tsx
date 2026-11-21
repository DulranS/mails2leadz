"use client";

// The one door for "I wish this did X" and "something's broken" — kept
// deliberately to a single component so there's exactly one place this
// logic lives, with two doorbells: components/AppShell.tsx mounts it in
// the signed-in app's sidebar footer and mobile "More" sheet (via
// `renderTrigger`, since AppShell is already a client component so a
// function prop between the two is fine), and app/page.tsx mounts a plain
// instance in the marketing-site footer for a visitor who isn't a
// customer yet (a Server Component can't pass a function prop across the
// boundary to a Client Component, so that usage sticks to the
// string/className props below instead).
//
// Posts to app/api/feedback (Admin SDK, no Firestore client access at all
// — see that route's file header), the same "public, unauthenticated
// write path, honeypot-guarded" shape as app/request-trial/page.tsx. A
// signed-in submitter's businessId/memberName/role/page are filled in
// automatically here so they're never asked to type context they didn't
// come here to provide — the whole point is that this should feel like
// dashing off a text, not filing a ticket.
import { useState, type FormEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/contexts/AuthContext";
import { Modal, Button, Textarea, Label, Input } from "@/components/ui";

const KIND_OPTIONS: { value: Kind; label: string; prompt: string; placeholder: string }[] = [
  {
    value: "idea",
    label: "Request something",
    prompt: "What would you like Balancr to do?",
    placeholder: "The more specific, the easier it is to build — e.g. \"let me filter customers by tag\".",
  },
  {
    value: "problem",
    label: "Report a problem",
    prompt: "What went wrong?",
    placeholder: "What happened, what you expected instead, and what you were doing right before it.",
  },
  {
    value: "other",
    label: "Something else",
    prompt: "What's on your mind?",
    placeholder: "Anything at all — we read every one of these ourselves.",
  },
];

type Kind = "idea" | "problem" | "other";

export default function FeedbackWidget({
  label = "Feedback",
  className,
  renderTrigger,
}: {
  /** Button text for the default trigger. Ignored if renderTrigger is given. */
  label?: string;
  /** Classes for the default trigger button. Ignored if renderTrigger is given. */
  className?: string;
  /**
   * Render your own trigger element instead of the default button — only
   * safe from another Client Component (e.g. components/AppShell.tsx),
   * since a Server Component can't hand a function prop across to a
   * Client Component. app/page.tsx (a Server Component) uses the default
   * trigger via `label`/`className` instead.
   */
  renderTrigger?: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={className ?? "hover:text-fg"}>
          {label}
        </button>
      )}
      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  // Safe to call unconditionally — AuthProvider wraps the whole app,
  // marketing page included (see app/layout.tsx). user/memberName/role/
  // businessId are simply null for a signed-out visitor.
  const { user, memberName, role, businessId } = useAuth();

  const [kind, setKind] = useState<Kind>("idea");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState(user?.email ?? "");
  const [website, setWebsite] = useState(""); // honeypot — see the route's file header
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function resetAndClose() {
    onClose();
    // The modal's already gone from view at this point, so resetting a
    // beat later (rather than immediately, which would flash the form
    // back underneath the closing animation) only matters the next time
    // it opens — nothing the user sees in between.
    setTimeout(() => {
      setKind("idea");
      setMessage("");
      setContactEmail(user?.email ?? "");
      setWebsite("");
      setError(null);
      setDone(false);
    }, 200);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Let us know what's on your mind first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          message,
          contactEmail: contactEmail || undefined,
          businessId: businessId || undefined,
          memberName: memberName || undefined,
          role: role || undefined,
          page: pathname,
          website,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const active = KIND_OPTIONS.find((k) => k.value === kind)!;

  return (
    <Modal viewOnly open={open} onClose={resetAndClose} title={done ? "Thanks" : "Talk to us"}>
      {done ? (
        <div className="text-sm space-y-4">
          <p className="text-fg">Got it — we read every one of these ourselves, no ticket queue in between.</p>
          <p className="text-muted">
            {contactEmail
              ? `We'll follow up at ${contactEmail} if we need more, or once it's sorted.`
              : "Leave an email next time if you'd like us to follow up on this one."}
          </p>
          <Button className="w-full" onClick={resetAndClose}>
            Close
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted -mt-1">
            Ask for anything you wish Balancr did, or tell us if something&apos;s not working. No account needed to
            report a problem, and no back-and-forth required to get heard.
          </p>
          <div>
            <Label>What&apos;s this about?</Label>
            <div className="grid grid-cols-3 gap-2">
              {KIND_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setKind(opt.value)}
                  className={clsx(
                    "text-xs px-2 py-2.5 rounded-md border text-center transition-colors",
                    kind === opt.value
                      ? "border-amber bg-amber/10 text-fg font-medium"
                      : "border-line text-muted hover:bg-panel2"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>{active.prompt}</Label>
            <Textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={active.placeholder}
              maxLength={2000}
              autoFocus
            />
          </div>
          <div>
            <Label>Email (optional — only if you&apos;d like a reply)</Label>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          {/* Honeypot — hidden from real visitors via CSS, an empty-but-
              present field is what actually baits a form-filling bot; a
              field that doesn't exist can't. Same pattern as
              app/request-trial/page.tsx. */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="feedback-website">Website</label>
            <input
              id="feedback-website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
          {error && <div className="text-xs text-bad">{error}</div>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Sending…" : "Send"}
          </Button>
        </form>
      )}
    </Modal>
  );
}
