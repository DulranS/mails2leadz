# Commercial readiness: can this be sold as SaaS?

Short answer: **yes, as a single-owner-per-account product, once the live checks below pass.** The commercial layer is built, tested and **dormant**: with `SAAS_MODE` unset (our own use) every account is "internal", unlimited, with nothing changed. Turning it on is a configuration change, not a rewrite.

Status words mean exactly this: **Built** (in the code, tested) · **Not yet built** (would be needed, not done) · **Consciously left out** (decided against) · **Not applicable** (does not apply to us now).

## Built
| Area | What exists |
|---|---|
| Tenant isolation | Every account's data is stored under its own id. The API decides *who is calling* only from the verified sign-in (never a user id in the request body); the database rules enforce owner-only access for browser reads/writes; server-only collections (drafts, notices, tenants, audit, Gmail key) are unreachable from any browser. A test walks **every** API route and fails the build if one trusts the body, and another pins the exact set of public routes and the proof each one needs. |
| Plans, trial, limits | Free trial (14 days), Starter, Growth, plus an *internal* plan. Per plan: emails/day, AI requests/day, AI spend/month, AI-written enquiry replies/day, and feature flags (overnight drafts, overnight Gmail reply check, inbound, content). Tunable without code: `PLAN_OVERRIDES_JSON`. The numbers are **starting points**, not prices. |
| Account states | trial → active → past due (7-day grace) → limited; cancelled (paid time honoured) → limited; suspended by the operator. "Limited" = can read and export, no sending, no AI, no background jobs. |
| Enforcement | AI calls, email sends (single, bulk, follow-up), SMS, calls, lead ingest, overnight jobs, enquiry replies, offline Gmail connect. A plan can only *lower* the Gmail safety cap (500/day), never raise it. Fails open if the check itself is down (an outage must not stop a paying customer). |
| Software billing | Stripe Checkout, Stripe billing portal (update card / change plan / cancel), signed webhooks applied once and in order. Card data never touches our servers. Account deletion cancels the subscription. |
| Operator console | `/admin` (ADMIN_EMAILS only): all accounts' standing and usage, AI cost per account and in total, configuration check, suspend / unsuspend / extend trial / grant plan. Every action is written to an audit log. The operator sees **numbers, never a customer's leads, emails or deals.** |
| Onboarding | A first-steps checklist computed from what the account has really done (profile → leads → first send → first reply → first win). |
| Abuse and safety | Per-account request brake, per-account AI caps, public-endpoint spam checks and limits, opt-out/Lost/bounce suppression, acceptable-use terms, ability to suspend. |
| Data rights | Self-service export and delete (including the subscription and the Gmail key). |
| Legal pages | Terms and Privacy switch to subscription wording and list Stripe when `SAAS_MODE=on`. **Templates, not legal advice: have a lawyer review before selling.** |

## Not yet built (in order of how much it would matter)
1. **Teams / seats.** One person owns an account (`userId` is the owner everywhere). A shared team would need an organisation layer (members, roles, org-scoped rules). It is the biggest gap for selling to businesses with more than one salesperson, and it is a deliberate non-trivial refactor, so it is not hidden inside this pass. Selling to solo owners and very small businesses works today.
2. **Lifecycle emails** (trial ending, payment failed, welcome). In-app banners cover it; Stripe can send payment emails (enable them in the Stripe dashboard).
3. **Per-customer sending set-up.** Customers send from their own Gmail. Fine for low volume; a customer who wants to send at scale needs their own domain, authentication records and warm-up, which the app does not manage.
4. **Load and capacity testing.** Never done. Do it before announcing; the per-account limits and the Firebase/hosting plan decide the ceiling.
5. **Monitoring and alerting** beyond the health endpoint and the operator console; **scheduled database backups** (runbook in OPERATIONS.md; you must switch them on).
6. Usage-based/overage billing, annual plans, SSO, public API, white-label domains.

## Consciously left out
- Integrations with compliance-based systems (consent-management platforms, audit/attestation tooling, identity-verification services), as instructed. The app records opt-outs and honours them; it does not certify any customer's campaign as lawful.
- Unattended sending, automatic replies to prospects, social-network automation, scraping.

## Not applicable now
- Marketplace listings, reseller/partner programmes, multi-region hosting.

## Outside our control (decide before the first paying customer)
- **Google's rules for the Gmail permissions.** The app asks customers for Gmail *send* and *read* access. Google puts those under its sensitive/restricted-scope rules: an unverified app is capped at 100 users with a warning screen, and restricted scopes can require a security assessment. **Check the current rules in the Google Cloud console**: they change and sources differ. For our own use this does not matter; for selling it is the single biggest external gate and can take weeks.
- **Tax and invoicing** for software sales (Stripe Tax or an accountant), **refund policy**, **support commitments**.
- **Legal review** of the Terms and Privacy templates.

## What must be checked live before selling (none of this has been run against real accounts)
1. Set the Stripe variables, create the two prices, add the webhook endpoint, turn on `SAAS_MODE`, and sign in with a **new** test account: it should start a trial and see the checklist.
2. Subscribe with a Stripe **test** card: the plan should switch to Starter within a minute. Use "Manage billing" to cancel: access should continue until the period ends.
3. In Stripe, simulate a failed payment: a warning, then (after 7 days) limited. 
4. As operator: suspend the test account (it must stop sending and drafting and see the message), then unsuspend.
5. Confirm **your own** account is still unlimited (INTERNAL_EMAILS / ADMIN_EMAILS).
6. Try, as the test account, to read the other account's data with a hand-made request (a `userId` of the other account in the body): it must be refused (403).

## Switching it on (and off)
See DEPLOYMENT_GUIDE.md → "Selling it (SAAS_MODE)". To go back to internal-only, unset `SAAS_MODE`: everything reverts to unlimited; tenant records are kept.
