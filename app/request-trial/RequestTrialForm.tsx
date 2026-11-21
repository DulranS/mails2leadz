"use client";

// Public, signed-out lead-capture form — the "make it easier to request a
// trial" front door. Deliberately does NOT create an account or a login:
// see lib/provisioning.ts and app/admin/new-business/page.tsx for why
// account creation stays a deliberate, admin-only, one-at-a-time action.
// This just replaces "email/DM someone and hope they see it" with a
// structured submission that lands in the "Trial requests" tab of the
// admin panel, via app/api/trial-requests (Admin SDK — there is no
// Firestore client access to this collection at all, see that route's
// file header). A submission only reaches that queue once the visitor
// has clicked the confirmation link emailed to them (/verify-trial), and
// by default only Gmail addresses are accepted (lib/emailPolicy.ts).

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import SupportContact from "@/components/SupportContact";
import { TIERS, TRIAL_DAYS } from "@/lib/pricing";

const TEAM_SIZES: { value: string; label: string }[] = [
  { value: "solo", label: "Just me" },
  { value: "2-5", label: "2–5 people" },
  { value: "6-10", label: "6–10 people" },
  { value: "10+", label: "10+ people" },
];

// Plans come from lib/pricing.ts — the same list the pricing cards and the admin's billing
// forms use — so the names and prices here can't drift from what the site shows. The page
// still renders fine with no `plan` query param at all (someone clicking the plain nav
// "Request a trial" button rather than a specific pricing card).
const PLANS: { value: string; label: string }[] = TIERS.map((t) => ({
  value: t.id,
  label: `${t.name} — Rs ${t.monthly.toLocaleString("en-US")}/month`,
}));

// SupportContact renders nothing when neither channel is configured; this keeps its
// "Want to talk sooner?" lead-in from dangling on its own in that case.
const HAS_SUPPORT_CONTACT = !!(
  (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "") ||
  (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim()
);

function RequestTrialInner({ gmailOnly }: { gmailOnly: boolean }) {
  const params = useSearchParams();
  // Pre-fills from a pricing-card link like /request-trial?plan=Growth&cycle=annual
  // (see components/PricingSection.tsx) but stays fully editable — a
  // visitor who changes their mind on the way to submitting isn't stuck
  // with whichever card they clicked first.
  const initialPlan = PLANS.some((p) => p.value === params.get("plan")) ? params.get("plan")! : "";
  const initialCycle = params.get("cycle") === "monthly" || params.get("cycle") === "annual" ? params.get("cycle")! : "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [plan, setPlan] = useState(initialPlan);
  const [teamSize, setTeamSize] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot — a real visitor never sees or fills this field (see the
  // className below); a bot filling every input on the page will. Kept in
  // component state like every other field so it round-trips through the
  // same submit handler rather than needing special-cased read logic.
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // When the form appeared, so submit can report how long a person took to fill it in (a script
  // posting straight to the API has no such number; an instant one is a weak bot signal — see
  // lib/trialAbuse.ts, which only ever adds it to other signals, never acts on it alone).
  const shownAt = useRef<number>(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/trial-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          businessName: businessName || undefined,
          // Cycle rides along silently from the query param (not its own
          // form field — asking a visitor to re-confirm monthly/annual
          // here would just be friction for information already captured
          // on the pricing page) but only means anything alongside a plan.
          interestedPlan: plan ? (initialCycle ? `${plan} — ${initialCycle}` : plan) : undefined,
          teamSize: teamSize || undefined,
          message: message || undefined,
          website, // honeypot
          elapsedMs: shownAt.current ? Date.now() - shownAt.current : undefined,
          // Best-effort client signal, not a substitute for the header-based
          // capture in app/api/trial-requests/route.ts (which can't be
          // skipped since it never touches the browser). This just adds a
          // couple of extra data points a script-only bot usually won't
          // bother spoofing.
          clientHints: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
            screen: typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : undefined,
            language: typeof navigator !== "undefined" ? navigator.language : undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block py-2 font-display text-2xl font-bold tracking-tight">
            Balancr
          </Link>
          <div className="text-sm text-muted mt-1">
            Request a trial — {TRIAL_DAYS} days free, no card
          </div>
        </div>

        {sent ? (
          <div className="bg-panel border border-line rounded-lg p-6 text-sm text-fg leading-relaxed text-center">
            <p>
              Thanks{name ? `, ${name.split(" ")[0]}` : ""} — one last step. We&apos;ve emailed a confirmation link
              to <span className="text-good font-medium">{email}</span>.
            </p>
            <p className="text-muted mt-3">
              Open it to finish your request. It should arrive within a minute — check spam if you don&apos;t see it.
              Still nothing after ten minutes? You can submit this form again.
            </p>
            <ol className="text-left text-xs text-muted mt-5 space-y-2 list-decimal pl-5">
              <li>Click the link in that email to confirm it&apos;s really your address.</li>
              <li>Your account is created and you get a second email with a link to choose your password.</li>
              <li>You have {TRIAL_DAYS} days with the whole product. No card, nothing to cancel.</li>
            </ol>
            {HAS_SUPPORT_CONTACT && (
              <div className="mt-5 pt-4 border-t border-dashed border-line text-[11px] text-muted">
                Want to talk sooner?
                <SupportContact className="!justify-center mt-2 !text-xs" prefill="Hi, I just requested a Balancr trial." />
              </div>
            )}
            <Link href="/" className="inline-block mt-4 text-xs text-muted hover:text-fg">
              ← Back to Balancr
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-panel border border-line rounded-lg p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Your name</Label>
                  <Input
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Kamal Perera"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={gmailOnly ? "yourname@gmail.com" : "you@yourbusiness.com"}
                  />
                  <p className="text-[11px] text-muted mt-1">
                    {gmailOnly
                      ? "Please use a Gmail address — we'll send a confirmation link to it."
                      : "Use an email you can open right now — we'll send a confirmation link to it."}
                  </p>
                </div>
                <div>
                  <Label>Business name (optional)</Label>
                  <Input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Perera Hardware"
                  />
                </div>
                <div>
                  <Label>Plan you&apos;re interested in (optional)</Label>
                  <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
                    <option value="">Not sure yet</option>
                    {PLANS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Team size (optional)</Label>
                  <Select value={teamSize} onChange={(e) => setTeamSize(e.target.value)}>
                    <option value="">Prefer not to say</option>
                    {TEAM_SIZES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>What are you hoping to track? (optional)</Label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="e.g. Wholesale inventory plus a small install/service crew"
                  />
                </div>

                {/* Honeypot field — visually and semantically hidden from
                    real visitors (off-screen, not display:none, since some
                    bots skip fields their own automation can detect are
                    display:none) but present in the DOM for a bot to fill. */}
                <div className="absolute left-[-9999px] w-px h-px overflow-hidden" aria-hidden="true">
                  <label htmlFor="website">Website</label>
                  <input
                    id="website"
                    name="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                {error && (
                  <div className="text-xs text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? "Sending…" : "Request a trial"}
                </Button>
              </form>
            </div>
            <p className="text-xs text-muted text-center mt-4">
              No password to set up front — once you&apos;ve confirmed your email we&apos;ll create your
              account and email you a link to set one.
            </p>
            <p className="text-xs text-muted text-center mt-2">
              Already have a login?{" "}
              <Link href="/login" className="text-fg hover:underline">
                Sign in
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function RequestTrialForm({ gmailOnly }: { gmailOnly: boolean }) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <RequestTrialInner gmailOnly={gmailOnly} />
    </Suspense>
  );
}
