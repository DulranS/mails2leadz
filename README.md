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

## Finding leads, not just messaging them

If you (or your SME customer) already have a list of businesses — e.g. an
export from a maps/directory listing, with a `website` column — but no
email address yet, the "Find leads from websites" button on the dashboard
looks up a public contact email on each business's own site (checking
`/contact`, `/about`, etc.) and pipes the result straight into the normal
import → score → draft pipeline. It does **not** scrape Google Maps, LinkedIn,
or any other platform itself, and it never touches personal/individual data —
only publicly published business contact addresses on that business's own
website. This step is entirely optional: everything else works the same if
you just import a CSV that already has emails in it.

Expected input columns: `place_id, business_name, rating, reviews,
category, address, whatsapp_number, website` (see
`sample-businesses-for-enrichment.csv`) — that's deliberately the shape of
a typical exported business/directory listing, so you can point this at a
list you already have without reformatting it by hand.

It runs as a small separate FastAPI service (`backend/`) rather than inside
a Vercel function, because visiting several pages per business doesn't fit
reliably inside one serverless invocation. Deploy it anywhere that runs a
long-lived Python process (Render, Railway, Fly — a free tier is enough),
set `SERVICE_API_KEY` there and `ALLOWED_ORIGINS` to your app's URL, then
set `ENRICHMENT_SERVICE_URL` + `ENRICHMENT_SERVICE_KEY` (same value as
`SERVICE_API_KEY`) in the Next app's env vars. Leave both unset and the
dashboard simply hides the button — nothing else depends on it. Its job
store is in-memory, so a job in progress is lost if the service restarts;
fine for a batch you kick off and wait a minute or two for, not meant to
survive a redeploy mid-job.

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
3. **OpenAI**: add `OPENAI_API_KEY` — one key, shared across every account,
   since it's your infrastructure cost, not something customers configure.
4. **`CRON_SECRET`** and **`UNSUB_SECRET`**: any long random strings
   (`openssl rand -hex 32`).
5. `npm install`, `npm run dev`, open `/login`, sign up, you land on
   `/dashboard`. (`package.json` lists `tailwindcss` +
   `@tailwindcss/postcss` as devDependencies — if the UI ever renders
   completely unstyled, that's the tell that `npm install` wasn't run
   after a `package.json` change, not a config problem.)
6. **Each account fills in its own Settings** (`/dashboard/settings`):
   business identity (what drives every AI-drafted message), and its own
   Gmail OAuth credentials (client ID/secret/refresh token via the
   [OAuth Playground](https://developers.google.com/oauthplayground),
   scopes `gmail.send` + `gmail.readonly`) and, optionally, Twilio WhatsApp
   credentials. This is the one piece of setup you can't skip per customer —
   messages must come from *their* mailbox, not yours.
7. **Deploy to Vercel** (free Hobby plan — see below), set the same env vars
   there, and set `NEXT_PUBLIC_APP_URL` to your real deployed URL (used to
   build unsubscribe links).

## Staying on Vercel's free (Hobby) plan

All three scheduled jobs in `vercel.json` run once a day, staggered an hour
apart (inbox check, then outreach drafts, then follow-up drafts) — Hobby
caps Cron at once/day per job, and since sending is manual anyway, daily is
genuinely enough here; nothing about the "controlled" model needs
higher-frequency polling. No external scheduler required. Each route also
sets `maxDuration` and a small batch cap so a single invocation can't run
long enough to threaten Hobby's function-duration ceiling, and the whole
schedule totals a tiny fraction of Hobby's 1M invocations/month and 4
CPU-hour/month limits.

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
- No Google Maps / LinkedIn / social-platform scraping of any kind. The
  optional lead-sourcing step (`backend/`) only fetches pages on a
  business's *own* website that it already chose to publish, and only for
  business lists you already assembled yourself.

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
