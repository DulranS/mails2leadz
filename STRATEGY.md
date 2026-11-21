# Strategy: Balancr as an internal advantage, with a commercial exit

**Decision (owner, Oct 2026).** The main goal is *not* to sell Balancr as a software product. It is the internal engine behind the managed finance +
inventory service and the owner's own business, and it is built so that selling it commercially stays possible if a pivot is ever needed.
This file is the decision record. Nothing here needs code today.

## What the advantage actually is
Software alone is not a moat (anyone can buy software). The edge is **cost to serve, consistency and speed** across many client businesses:

- AI-assisted entry (type a sale, check it, save it) cuts data-entry hours.
- Statements, forecasts, reorder points and anomaly flags build themselves, so a monthly report pack is minutes, not an evening.
- Month lock and the audit log make the work checkable; roles give each client Owner/Manager/Staff plus a view-only accountant seat.
- Opening-balance import, spreadsheet import/export and multi-currency make onboarding a client who already trades quick.

**Measure from client #1** (a spreadsheet is enough): hours per client per month, days from "yes" to books running, clients per person, and margin per
client (fee minus hours x your hourly cost minus hosting and AI). If hours per client do not fall as you add clients, the advantage is not real yet.

## Known structural limits (deliberate, each with a build trigger)
1. **One login belongs to one business** (`memberships/{uid}` holds a single `businessId`). Today the operator uses one login per client (a view-only
   accountant seat or an owner seat; a separate, plus-addressed email per client is a workable but untested workaround).
   *Build multi-business access when you have about 5 active clients and switching logins is costing real time.* It touches Firestore rules, the
   sign-in context and the AI routes, so do it as its own tested release, never in a deadline week.
2. **No cross-client health board.** The admin console shows billing and activity (MRR, renewals, last active), not clients' finances. Today: open each
   client's dashboard or ask the assistant for the business health check.
   *Build it when you know which exceptions you actually act on* (likely: overdue receivables, runway under N months, a loss-making month, no activity in
   14 days). Cheapest design: the daily cron writes one small health snapshot per client, so cost is one read pass per client per day, not per page view.
   Do not build it before about 3 clients; guessing the exceptions is wasted work.
3. **No cross-client benchmarks.** With consent and enough clients in one industry, anonymised margins and cash-cycle figures become a real asset.
   Collect them by hand first.

## Running costs (check current prices before relying on any figure)
- **Hosting.** Vercel's Hobby plan is non-commercial personal use only; any deployment used for financial gain needs Pro (about US$20/month).
  Move to Pro before the first client pays, and before pointing prospects at the site.
- **Firebase.** Be on the pay-as-you-go (Blaze) plan with a budget alert so a quota limit can never stop a client mid-month. At this scale the cost is small.
- **AI.** DeepSeek V4 Flash is very cheap. Typical use is pennies per client per month. A business that hits the daily cap every day costs roughly
  half of a Starter-sized fee. Set a spending limit in the DeepSeek dashboard; the per-business cap is `Settings.aiDailyMessageLimit`, the default
  is `DEFAULT_AI_DAILY_MESSAGE_LIMIT` in `lib/guardrails.ts`. Review real usage after week one.

## Keeping the commercial exit open
**Already in place:** per-business data isolation with server-enforced roles, hand-run provisioning and billing admin, plans and prices in one file
(`lib/pricing.ts`), landing page, demo with spending caps, backup and export, a plain-language privacy and terms page.
**What a real software launch would still need:**
- self-serve signup and automatic card payment (billing is manual by design today);
- Terms reviewed by a lawyer (liability limit, governing law; the draft deliberately omits both);
- a support process that does not depend on one person;
- a pricing decision: a public software price sits next to the service price, so sell the service as "done for you" and the plans as "do it yourself";
- a policy for `AUTO_ACTIVATE_TRIALS` (leave it off until you want unattended signups).

## Decision update (Oct 2026): what was and was not built for the "software is the business" and "many clients" paths
- **Built:** expiry/batch tracking (a food or pharma business needs it from day one, it is purely a warning, and it touches no money).
- **Built (v64):** seasonal view of revenue (derived only, 24+ months, cautious).
- **Built (v69):** batch trace: which batch each sale came from and who received a batch, as a derived memo (recorded when picked on the sale form, otherwise estimated earliest-expiry-first). Costing stays on weighted average cost. Batch-level COSTING was built next (v70) as an opt-in setting, default average cost.
- **Also open, not decided against:** several tax rates (documented exclusion; own release).
- **Deliberately not built, with the reason and the trigger:**
  1. **Automatic card payment.** The gateway depends on where the selling company is registered and banked, which is not decided. Sources found in Oct 2026
     disagreed, but most said Stripe merchant accounts are not directly available to businesses in Sri Lanka (a foreign entity is needed) and that local
     gateways such as PayHere are the usual route, with their own approval time (reported at several weeks). Wiring a provider before that choice means
     rewriting it. *Trigger:* the first customer who asks to pay by card, or monthly manual billing taking real time. *Design when triggered:* the provider's
     hosted checkout (card details never touch this app), a webhook that only RECORDS a payment into the existing billing history (`meta/billingHistory`) and
     never locks or unlocks an account by itself, and the manual bank-transfer path kept as the fallback. Landing page and Terms copy that say "no card" must
     change in the same release.
  2. **Self-serve signup.** Business creation is closed in the Firestore rules on purpose (abuse and cost). The trial flow already supports unattended
     activation behind `AUTO_ACTIVATE_TRIALS`; switch it on only after a lawyer-reviewed Terms page and a spending limit at the AI provider are in place.
  3. **Several businesses on one login.** Stays at the roadmap trigger above (about 5 active clients), as its own tested release, because it changes who
     can read whose data. One login per client keeps working meanwhile.
  4. **Lawyer-reviewed Terms.** Cannot be produced by software; book the review before the first public price.

## Protect the asset
- Keep the repository private, and put the Vercel, Firebase and AI-provider accounts under the business, not only a personal login.
- Keep `RECOVERY-RUNBOOK.md` and `MAINTENANCE.md` current; they are the continuity plan if the operator is unavailable.
- The playbooks, checklists and templates you write for the service are part of the advantage. Keep them in one shared place.

## Decision update (v76): readiness to sell to many customers
Sorted without asking, no external compliance systems. Built: advisory seat flag per plan in the admin console, batched admin reads (CHANGELOG v76).
- **Waiting on you:** card payment (design in the section above stands: hosted checkout, a webhook that only records, manual transfer kept as fallback) and the `AUTO_ACTIVATE_TRIALS` switch. Neither can be chosen by code.
- **Left out on purpose:** several businesses on one login. Many separate customers each need one login; the trigger above (about 5 active clients you operate yourself) is unchanged.
- **Scale ceiling (estimate, unmeasured):** the daily job and admin list read every customer per run; fine for hundreds, page or snapshot past about a thousand.
- **Seats:** advisory only. If Starter customers keep exceeding 2 logins, the fix is an upgrade conversation or a price change, not a code block.

## Decision update (v79): the buildable gaps
Built: tax summary by rate, quantity price breaks, serial/warranty, owner-tapped late-charge billing, a daily health summary on the admin list. Still not built: multi-business login and branch-restricted staff (rules changes that cannot be tested without the emulator; do these with it), card payment, bank feeds. (Live exchange reference rates: built in v94 from the free open-access Exchange Rate API, shown as a what-if only.) The health summary is deliberately written by the customer's own app, not recomputed on the server, so the formulas exist once.

## Decision update (v80): several businesses on one login
Built: join by invite while signed in, a business switcher, the server honouring the chosen business after the usual membership checks. The 5-clients trigger in the earlier decision is now moot for the accountant/operator case. Creating a second business of one's own stays an operator action (provision route). Branch-restricted staff stays out until the rules emulator can be run.

## Decision update (v84): not-built items, with a week left
Built: re-costing of sales made before their purchase (average costing). Held back on purpose: branch-restricted staff (needs query-level filtering of every subscription as well as rules, and the rules emulator cannot run here: a feature, not a tweak); card payment, bank feeds (external providers and credentials); live exchange rates are built in v94 as a what-if only; per-customer cost-to-serve, loyalty points, TAM/SAM/SOM (no trigger / not bookkeeping); auto-posted late fees (against the "controlled, not automatic" positioning). Gift vouchers are already covered by a prepaid customer deposit.

