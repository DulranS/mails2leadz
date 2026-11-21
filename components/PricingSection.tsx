"use client";

// Three-tier pricing, replacing the old single-plan block. A few
// intentional choice-architecture decisions here, all in the "make the
// good choice the easy one, don't remove the others" spirit rather than
// dark-pattern territory (no fake scarcity, no pre-ticked add-ons, no
// hiding the cheaper option):
//
// - The Growth tier is visually elevated (border, "Recommended" pill,
//   slightly larger scale on desktop) and sits in the middle so it reads
//   as the default, sensible choice framed by a cheaper option on one
//   side and a pricier one on the other — classic anchoring, not a trick,
//   since Growth is also genuinely this app's actual historical price
//   (see the old PRICING constant this replaced) and default recommendation.
// - The billing-cycle toggle defaults to Annual (better economics for
//   both sides — the business gets committed cash flow, the customer gets
//   two months free) but Monthly is one visible click away, not buried or
//   disabled. Whichever is selected applies to all three cards at once, so
//   comparing tiers isn't muddied by comparing different billing cycles.
// - Every card's call to action is "Start free trial", not "Buy" or
//   "Subscribe" — picking a card commits to nothing (see app/request-trial
//   and lib/provisioning.ts: there's no self-serve checkout anywhere in
//   this app, only a human-provisioned account), which is itself a nudge:
//   it lowers the stakes of picking "wrong" enough that visitors actually
//   pick something instead of stalling on the decision.
// - Selecting a tier carries `plan` and `cycle` through to /request-trial
//   as query params (real, functional — not just UI theatre) so the lead
//   the admin sees already says which plan the visitor was looking at.
//
// Tiers differ by team-size guidance, support level, and onboarding
// intensity — never by feature availability. That's not a simplification;
// see AccountStatus.plan's doc comment in lib/types.ts and the "Pricing"
// section this file replaces in app/page.tsx: nothing in this app is
// feature-gated by tier, plan is free text negotiated per customer, and
// there is no code path that would even know how to withhold a feature
// based on it. Claiming otherwise here would make this page lie about
// what the product actually does, so every tier lists the same core
// product and differs only on the things that are actually true: how many
// people it's sized for and how much hands-on help comes with it.
import { useState } from "react";
import Link from "next/link";

// Plans, prices and the trial length come from lib/pricing.ts — the same file the
// trial-request form and the admin's billing forms read, so this page can never show
// a price the admin doesn't invoice.
import { TIERS, TRIAL_DAYS, annualSaving, monthlyEquivalent, periodAmount, type BillingCycle } from "@/lib/pricing";

type Cycle = BillingCycle;

// Every plan includes the whole product — see the file header for why
// this list is identical across tiers rather than trying to invent a
// feature split that doesn't exist in the code.
const SHARED_INCLUDES = [
  "Stock, invoices, staff pay, loans and equipment",
  "Profit and loss, cash flow and balance sheet, built for you",
  "The AI assistant, and it works offline",
];

// A quiet top accent per plan so the three read as three distinct choices at a
// glance. Growth keeps the brand gold; it is also the recommended one.
const TIER_ACCENT: Record<string, string> = {
  Starter: "border-t-2 border-t-info",
  Growth: "border-t-2 border-t-amber",
  Business: "border-t-2 border-t-plum",
};

const currency = (n: number) => `Rs ${n.toLocaleString("en-US")}`;

export default function PricingSection() {
  const [cycle, setCycle] = useState<Cycle>("annual");

  return (
    <section id="pricing" className="border-t border-line">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 sm:py-24 lg:py-28">
        <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-[-0.025em]">Pricing</h2>
        <p className="text-muted mt-2 max-w-md">
          Every plan includes everything, from day one. Nothing is locked away on a cheaper plan.
          The plans differ only in how many people use it and how much help we give you setting up.
          One recovered late invoice or one avoided stock-out can cover a month&apos;s plan.
        </p>
        <p className="text-sm text-fg mt-3">
          <span className="text-good font-medium">{TRIAL_DAYS}-day free trial</span> on every plan · no card ·
          nothing to cancel
        </p>

        {/* Billing-cycle toggle. Annual is the default, but Monthly is a
            single visible click away — nothing here is hidden or disabled. */}
        <div className="mt-8 inline-flex items-center bg-panel border border-line rounded-full p-1 text-sm">
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            className={`px-4 py-1.5 min-h-[44px] sm:min-h-0 inline-flex items-center rounded-full transition-colors ${
              cycle === "monthly" ? "bg-line text-fg" : "text-muted hover:text-fg"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setCycle("annual")}
            className={`px-4 py-1.5 min-h-[44px] sm:min-h-0 rounded-full transition-colors flex items-center gap-1.5 ${
              cycle === "annual" ? "bg-line text-fg" : "text-muted hover:text-fg"
            }`}
          >
            Annual
            <span className="text-xs text-good font-medium">2 months free</span>
          </button>
        </div>

        <div className="mt-10 grid lg:grid-cols-3 gap-7 lg:gap-5">
          {TIERS.map((t) => (
            <div
              key={t.id}
              className={`relative rounded-lg p-6 flex flex-col h-full ${
                t.recommended
                  ? "bg-panel2 border border-amber"
                  : "bg-panel border border-line"
              } ${TIER_ACCENT[t.id] ?? ""}`}
            >
              {t.recommended && (
                <div className="absolute -top-3 left-6 bg-amber text-ink text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                  Recommended
                </div>
              )}

              <div className="text-sm font-medium text-fg">{t.name}</div>
              <div className="text-xs text-muted mt-1.5 leading-relaxed min-h-[2.5rem]">
                {t.tagline}
              </div>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="font-display text-2xl sm:text-3xl font-bold num">
                  {currency(monthlyEquivalent(t, cycle))}
                </span>
                <span className="text-muted text-xs">/ month</span>
              </div>
              <div className="text-[11px] text-fg/80 mt-1">
                About {currency(Math.round(monthlyEquivalent(t, cycle) / 30))} a day
              </div>
              <div className="text-[11px] text-muted mt-1">
                {cycle === "annual"
                  ? `Billed ${currency(periodAmount(t, "annual"))} / year — you save ${currency(annualSaving(t))}`
                  : "Billed monthly"}
              </div>

              <div className="mt-5 pt-5 border-t border-line space-y-2 text-xs text-muted">
                <div className="text-fg">{t.teamSize}</div>
                <div>{t.support}</div>
                <div>{t.onboarding}</div>
              </div>

              <div className="mt-5 pt-5 border-t border-line space-y-2 flex-1">
                {SHARED_INCLUDES.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-xs text-fg">
                    <IconCheck className="w-3.5 h-3.5 text-good mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <Link
                href={`/request-trial?plan=${encodeURIComponent(t.id)}&cycle=${cycle}`}
                className={`mt-3 inline-flex items-center justify-center min-h-[44px] px-6 rounded-md text-sm font-medium transition-all active:scale-[0.98] ${
                  t.recommended
                    ? "bg-amber text-ink font-semibold hover:bg-amber-soft"
                    : "bg-transparent border border-line text-fg hover:border-muted"
                }`}
              >
                Start free trial
              </Link>
              <p className="mt-2 text-center text-[11px] text-muted">{TRIAL_DAYS} days free · no card · nothing to cancel</p>
            </div>
          ))}
        </div>

        {/* How money actually works — spelled out because "how do I pay?" is the question
            that stalls a small-business owner who has already decided they like the product. */}
        <div className="mt-14 grid md:grid-cols-3 gap-x-8 gap-y-6 text-sm">
          {[
            ["1. Try it free", `Ask for a trial and a real person sets you up, usually within one working day. ${TRIAL_DAYS} days, the whole product, no card.`],
            ["2. Pick a plan", "Happy with it? Tell us which plan and whether you'd like monthly or annual. That's it. No checkout page and no card on file."],
            ["3. Pay the way you normally do", "Bank transfer or cash, with a simple receipt. We send a reminder before each renewal, and your account updates as soon as we've recorded your payment."],
          ].map(([title, body]) => (
            <div key={title} className="border-t border-line pt-4">
              <div className="text-fg font-medium">{title}</div>
              <div className="text-muted mt-1.5 leading-relaxed">{body}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-muted mt-5 max-w-md">
          Want to switch plans? Just ask, any time. Your data is always yours to download.
        </div>
      </div>
    </section>
  );
}

const ICON_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...ICON_STROKE}>
      <path d="M4 12.5 9 17.5 20 6.5" />
    </svg>
  );
}
