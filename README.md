# Outbound Engine

A controlled, AI-assisted outbound pipeline built for SMEs (and your own
personal-business use) — not a black-box autopilot. Each customer signs into
their own account, sets up their own business identity and their own Gmail/
WhatsApp sending credentials, imports leads, and gets AI-scored, AI-drafted
messages — but **nothing goes out to a real person until that customer
clicks "approve & send."** Follow-ups and reply-detection are automated;
sending is not. That's a deliberate product decision, not a limitation: an
SME buying this needs to trust what goes out under their business name, and
"fully automated" is the fastest way to lose that trust the first time the
AI gets a tone wrong.

## What's automated vs. what's controlled

| Step | Automated? |
|---|---|
| Finding contact emails on a business's own website (optional) | Yes — you supply the business list, it finds the email |
| CSV import, dedupe, AI lead scoring | Yes — safe, nothing external happens |
| AI drafting (first touch + follow-ups) | Yes — but the result is a `draft`, not a send |
| **Sending** (email or WhatsApp) | **No — requires a click from the account owner** |
| Reply detection | Yes — daily check, stops future drafts on reply |
| Unsubscribe handling | Yes — one-click link in every email, no external service |
| Daily owner digest (drafts waiting / new replies) | Yes — emailed to the owner's own inbox only, never a lead |

## Finding leads, not just messaging them

There are now three ways leads get into the pipeline, from most to least
automated:

**1. `/dashboard/sourcing` — "Find leads on Google Maps" (new, primary path).**
Type an industry ("boutique hotels") and a place ("Austin, TX"), click
search. In one request the app:
1. Calls the **Google Places API** for matching businesses (name, address,
   phone, website, category, rating, review count) — Google's own
   supported way to get Maps data programmatically, not screen-scraping,
   so it doesn't break Google's ToS or get an IP blocked (see
   `lib/leadSourcing.js`).
2. Checks each business's own website for a public contact email
   (`lib/emailFinder.js`) — same idea as step 2 below, just inline.
3. AI-scores every result and inserts it as a new lead, deduped against
   anything already sourced (by Google Place ID).

Turn the same search into a **daily automation** from the same page — a
saved industry + location that runs unattended every morning via
`GET /api/leads/source` (see `vercel.json`), so new leads simply accumulate
without anyone touching the dashboard. Nothing downstream changes: sourced
leads flow into the exact same score → draft → approve → send pipeline as
a CSV import.

**2. "Find leads from websites" (`/dashboard/leads`) — CSV enrichment.**
If you already have a list of businesses — e.g. an export from a
directory listing, with a `website` column — but no email address yet,
this button looks up a public contact email on each business's own site
and pipes the result into the normal import → score → draft pipeline.
Expected input columns: `place_id, business_name, rating, reviews,
category, address, whatsapp_number, website` (see
`sample-businesses-for-enrichment.csv`).

Both (1) and (2) never touch personal/individual data — only publicly
published business contact information (Google's own business listing
data, or an email a business chose to publish on its own site).

**3. Plain CSV import (`/dashboard/leads`)** — if you already have emails,
skip sourcing entirely and import a CSV with `email, phone, full_name,
company_name, title, website` columns.

The CSV enrichment path optionally runs as a small separate FastAPI
service (`backend/`) instead of inline, because visiting several pages per
business at large batch sizes doesn't fit reliably inside one serverless
invocation — useful for a one-off bulk batch of hundreds of businesses.
Deploy it anywhere that runs a long-lived Python process (Render, Railway,
Fly — a free tier is enough), set `SERVICE_API_KEY` there and
`ALLOWED_ORIGINS` to your app's URL, then set `ENRICHMENT_SERVICE_URL` +
`ENRICHMENT_SERVICE_KEY` in the Next app's env vars. Leave both unset and
the dashboard simply hides that one button — nothing else depends on it.

## Architecture

```
Sign up / sign in (Supabase Auth) ──▶ account auto-created on first login
        │
Settings page ──▶ business identity + own Gmail/WhatsApp credentials
        │
CSV upload ──▶ /api/leads/import ──▶ AI scores lead (HOT/WARM/COLD) ──▶ leads table
        │
Daily cron (6am) ──▶ /api/campaigns/draft
    AI drafts the first-touch message for new leads → status: draft (NOT SENT)
        │
Dashboard "Drafts awaiting review" ──▶ edit if needed ──▶ Approve & send
    ──▶ /api/messages/:id/approve ──▶ actually sends via the account's own
        Gmail/Twilio credentials, schedules next_followup_at
        │
Daily cron (5am, before drafting) ──▶ /api/inbox/check
    polls each account's Gmail inbox → reply found → lead flagged 'replied',
    all future follow-up drafts stop for that lead
        │
Daily cron (7am) ──▶ /api/followups/draft
    drafts the next follow-up for leads whose next_followup_at has passed
    and who haven't replied — again, DRAFT only, same review step applies
```

Every account only ever sees its own leads and messages — enforced by
Postgres Row Level Security (`database/schema.sql`), not just app-level
filtering, so one SME's data is genuinely isolated from another's.

## Setup (in order)

0. **If you extracted this over an existing mails2leadz checkout** (instead
   of replacing the folder wholesale), run the cleanup script first —
   `bash cleanup-legacy.sh` (Mac/Linux/Git Bash) or
   `powershell -ExecutionPolicy Bypass -File cleanup-legacy.ps1` (Windows,
   no WSL/Git Bash needed). It removes old pages/lib/components that were
   built against providers and tables this rebuild doesn't have — skipping
   this step is the most common cause of a build failing on a stale page
   like `/crm`. Then `git add -A && git commit && git push` so the cleanup
   actually reaches whatever's deployed, not just your local folder.
1. **Supabase project**: create one, run `database/schema.sql` in the SQL
   editor. Copy the project URL + `service_role` key + `anon` key into
   `.env.local` (copy `.env.example` first).
2. **Supabase Auth**: email/password sign-up works out of the box. If you
   want zero-friction onboarding for SME customers, turn off "Confirm email"
   under Authentication → Providers → Email in the Supabase dashboard
   (otherwise new users must click a confirmation link before signing in).
3. **AI provider**: add `DEEPSEEK_API_KEY` (get one at
   platform.deepseek.com) — one key, shared across every account, since
   it's your infrastructure cost, not something customers configure.
   DeepSeek is the default (`AI_PROVIDER=deepseek`) because it's an
   OpenAI-compatible, dramatically cheaper model that's plenty for short,
   structured jobs like scoring a lead or drafting a sales message — see
   `lib/ai.js`. Set `AI_PROVIDER=openai` + `OPENAI_API_KEY` instead if
   you'd rather use OpenAI.
4. **Google Places API** (for `/dashboard/sourcing` — Google Maps lead
   sourcing): in the Google Cloud Console, enable "Places API (New)" on a
   project and create an API key, then set `GOOGLE_PLACES_API_KEY`.
   Optional — leave it blank and the "Find leads" page just says sourcing
   isn't configured; every other feature works fine without it.
5. **`CRON_SECRET`** and **`UNSUB_SECRET`**: any long random strings
   (`openssl rand -hex 32`).
6. `npm install`, `npm run dev`, open `/login`, sign up, you land on
   `/dashboard`. (`package.json` lists `tailwindcss` +
   `@tailwindcss/postcss` as devDependencies — if the UI ever renders
   completely unstyled, that's the tell that `npm install` wasn't run
   after a `package.json` change, not a config problem.)
7. **Each account fills in its own Settings** (`/dashboard/settings`):
   business identity (what drives every AI-drafted message), and its own
   Gmail OAuth credentials (client ID/secret/refresh token via the
   [OAuth Playground](https://developers.google.com/oauthplayground),
   scopes `gmail.send` + `gmail.readonly`) and, optionally, Twilio WhatsApp
   credentials. This is the one piece of setup you can't skip per customer —
   messages must come from *their* mailbox, not yours. Then set up lead
   sourcing from `/dashboard/sourcing` (industry + location, one-off or
   automated daily).
8. **Deploy to Vercel** (free Hobby plan — see below), set the same env vars
   there, and set `NEXT_PUBLIC_APP_URL` to your real deployed URL (used to
   build unsubscribe links).

## Staying on Vercel's free (Hobby) plan

All five scheduled jobs in `vercel.json` run once a day, staggered an hour
apart (lead sourcing, inbox check, outreach drafts, follow-up drafts, then
the owner digest last so it can report on what the earlier ones just did)
— Hobby caps Cron at once/day per job, and since sending is manual anyway,
daily is genuinely enough here; nothing about the "controlled" model needs
higher-frequency polling. No external scheduler required. Each route also
sets `maxDuration` and a small batch cap so a single invocation can't run
long enough to threaten Hobby's function-duration ceiling, and the whole
schedule totals a tiny fraction of Hobby's 1M invocations/month and 4
CPU-hour/month limits.

Vercel's Hobby plan has, at various points, also capped the *number* of
distinct cron jobs a project can register — that limit has moved over time,
so if adding one of these gets rejected on your account, fold the digest
into an existing cron instead of registering a separate entry: in
`app/api/followups/draft/route.js`, `import { sendDailyDigests } from
'../../../../lib/digest'` and `await sendDailyDigests()` at the end of the
`GET` handler, then delete the `/api/digest/send` line from `vercel.json`.
`lib/digest.js` was written as a standalone function specifically so
either wiring works with no other changes.

## Known limitation, called out on purpose

`accounts.gmail_refresh_token` and `accounts.twilio_auth_token` are stored
as plain columns for now. That's fine while it's just you, or a handful of
trusted early SME customers — but before charging strangers money, move
these into [Supabase Vault](https://supabase.com/docs/guides/database/vault)
(encrypted secrets) instead of a plain table. Deliberately not done here —
pulling in a secrets-management layer before you have a first paying
customer is exactly the kind of scope creep worth avoiding until it's
actually needed.

## What's deliberately NOT here (scope, not oversight)

- No team seats / multi-user accounts — one login per account.
- No billing/subscription system — that's a separate, later decision.
- No CRM-style pipeline stages beyond `new → drafted → contacted →
  followup_N → replied/won/lost/do_not_contact` — enough to run outbound,
  not a full CRM.
- No external compliance/consent-management integration — unsubscribe is
  handled in-house (`/api/unsubscribe`, a signed link, no third-party
  service), which is enough for a small business sending its own outreach
  without taking on a compliance-platform dependency. This is a "no
  external vendor" decision, not a "skip compliance" one: keep the
  unsubscribe link and the `do_not_contact` status working in every
  deployment — it's what keeps outreach legal (CAN-SPAM/GDPR-style opt-out
  requirements) and it's cheap to keep, unlike a consent-platform
  integration, which genuinely would be scope creep at this stage.
- No LinkedIn / social-platform scraping, and no raw HTML scraping of the
  Google Maps website itself — that breaks Google's Terms of Service and
  gets an IP blocked at any real volume. Google Maps lead sourcing
  (`/dashboard/sourcing`, `lib/leadSourcing.js`) instead calls Google's own
  Places API — the supported, ToS-compliant way to get the same business
  data programmatically. Email discovery (`lib/emailFinder.js`,
  `backend/scraper.py`) only ever fetches pages on a business's *own*
  website that it already chose to publish — never a platform, never
  personal/individual data.

## What changed in this pass

This build combines the previous rebuild ("fixed") with a review of the
earlier, much larger prototype (dozens of half-finished dashboards, a CRM,
an ICP wizard, Firebase remnants) — most of that wasn't reused, on purpose:
it was built against providers/tables this schema doesn't have, or was
scope beyond what a controlled, approval-gated outbound tool needs. What
*was* worth carrying forward was the standalone email-finder service
(`backend/` + `anemails/` in the old prototype), which is now wired into
the actual product instead of sitting disconnected:

- `app/api/leads/enrich` — proxies to `backend/` so the dashboard can turn
  a list of businesses into a list of leads with emails.
- `app/api/leads/[id]/messages` + the lead detail panel on the dashboard —
  full conversation history per lead (not just the latest draft), so an
  account owner can actually see what's gone out and what came back.
- `app/api/quota` + the "sends left today" tile — the daily cap was already
  enforced server-side; it's now visible before you hit it, not just when
  an approve click 429s.
- `backend/main.py` now requires a shared `SERVICE_API_KEY` and restricts
  CORS — as a standalone public URL it would otherwise work as an open,
  unauthenticated scraping proxy for anyone who found it, not just your
  own frontend.
- Dashboard, settings, and login pages restyled with Tailwind (already
  configured, previously unused) instead of inline styles — same logic,
  more readable at a glance for a non-technical SME owner.

## The dashboard is six pages, not one

Everything used to live on a single long page. It's now a proper app shell
(`app/dashboard/layout.js`: sidebar nav, live "sends left today" gauges,
one shared account/quota fetch instead of every page re-fetching it) with
six pages, each answering one question:

- **Today** (`/dashboard`) — "what needs me right now?" The draft-review
  queue is the hero, not one tile among many, because reviewing drafts is
  the one action that's actually gating the whole system. A funnel strip
  (new → drafted → in sequence → replied → won) sits below it for context.
- **Pipeline** (`/dashboard/pipeline`) — "where does everything stand?" A
  board grouped by coarse stage, click into any lead for its full
  conversation thread and to mark it won/lost/do-not-contact by hand. Not
  drag-and-drop, on purpose — status changes are either system-driven
  (a reply came in) or one of three deliberate manual actions, not a
  free-form CRM stage a lead gets dragged through.
- **Find leads** (`/dashboard/sourcing`) — "get me more leads." Search
  Google Maps by industry + location, or turn a search into a fully
  automated daily job. This is the top of the funnel; everything else in
  the app operates on whatever lands here.
- **Leads** (`/dashboard/leads`) — "grow and search the list." CSV import,
  the website-based email lookup, and a searchable/filterable table live
  here, separated from Today so the daily review flow isn't cluttered by
  list-growing actions you might do once a week, not every day.
- **Settings** (`/dashboard/settings`) — business identity, credentials,
  limits, plus a **draft preview panel**: generate a real AI draft against
  a fixed sample lead using whatever's currently in the form (saves it
  first), so you can judge tone and quality right after writing your offer
  description — before any real contact ever sees a message; and, further
  down, the Playbook and daily-digest test button (see below).
- **Analytics** (`/dashboard/analytics`) — "is this working, and what's it
  costing?" Funnel, reply/win rate, score mix, send volume, and real AI
  cost-to-date. See "What's new in this pass" below.

`lib/statusMeta.js` is the single source of truth for how a status/score
renders (label, color) — Today, Pipeline, Leads, and the lead drawer all
read from it, so they can't drift out of sync with each other.

## What's new in this pass: compounding value without adding risk

The previous version proved the controlled, approval-gated loop works.
This pass adds the layer an SME owner actually needs to run it well day to
day, without touching the "nothing sends without a click" guarantee or
pulling in any external compliance/consent platform:

- **Analytics** (`/dashboard/analytics`, 5th sidebar page) — funnel,
  reply/win rate, lead-score mix, a 14-day send-volume chart, and a real
  **AI cost tracker**: every scoring/drafting call's actual token usage is
  added to a running total on the account (`lib/aiUsage.js`), so the page
  shows real dollars spent and cost-per-lead — not a guess. It's how you
  answer "is this actually cheap to run" with a number instead of a hunch.
- **Playbook** (`lib/templates.js`, section in Settings) — click "Save as
  template" under any message you actually sent (in the lead drawer), and
  future AI drafts for that channel/step use your 1–2 most recent saved
  examples as style calibration (explicitly told not to copy them
  verbatim). The AI's voice gets closer to yours the more you use it,
  instead of staying flat at "generic AI tone" forever — and a
  better-calibrated first draft is also a *cheaper* one, since it needs
  fewer manual rewrites.
- **Bulk approve + hottest-first review** (Today page) — drafts now sort
  HOT → WARM → COLD, and you can select several and hit one "Approve &
  send" instead of clicking through each individually. Approvals still
  happen one at a time in sequence under the hood (so the daily quota
  check on each send stays accurate) — this is a UI convenience, not a
  weakening of the approval gate.
- **Daily owner digest** (`lib/digest.js`, `/api/digest/send`) — one email
  a day to *your own inbox* (never a lead's) summarizing drafts waiting and
  new replies, skipped entirely on a quiet day so it's not noise. This is
  the one thing in the whole system that's genuinely "fire and forget"
  automation, and it's safe to run that way precisely because the only
  person it messages is the person who already owns every send decision.
  There's a "send me a test digest now" button in Settings.
- Fixed a real bug surfaced while building the digest: `leads.updated_at`
  was never actually being refreshed on update (no trigger existed), which
  would have silently broken anything checking "when did this last
  change." `database/schema.sql` now has a proper `set_updated_at` trigger
  on `leads` and `accounts` — safe to re-run on an existing database.
