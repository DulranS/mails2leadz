# Outbound Engine

A lean, automated B2B outbound pipeline: import leads → AI scores + personalizes
→ sends (email, optionally WhatsApp) → auto follow-ups on a schedule → stops
instantly when someone replies. One config file makes it reusable for any
business, software or service.

This IS your mails2leadz project folder, pruned and rebuilt in place — same
repo, same config files (`next.config.mjs`, `tailwind.config.js`,
`jsconfig.json`, `public/`), so you can drop this over your existing local
copy or push it as-is. What's gone: the two competing databases (Firebase +
Supabase), ~30 duplicate dashboard files, ~45 old API routes built against
the old schema, and ~85 root-level progress-report markdown files from past
iterations. `backend/` (the Python scraper) was left untouched since it's
independent of the Next.js app. Nothing here was deleted from your original
upload — only from this rebuilt copy.

## How it actually works

```
CSV upload ──▶ /api/leads/import ──▶ AI scores lead (HOT/WARM/COLD) ──▶ leads table
                                                                            │
Dashboard "Send outreach" or Vercel Cron (weekdays 9am/2pm) ──▶ /api/campaigns/send
    picks HOT leads first, respects daily quota, AI drafts the message,
    sends via Gmail API or Twilio WhatsApp, schedules next_followup_at
                                                                            │
Cron every hour ──▶ /api/followups/run
    sends follow-up #1, #2, #3 (48h apart, configurable) until reply or exhausted
                                                                            │
Cron every 20 min ──▶ /api/inbox/check (Gmail polling)
Instant ──▶ /api/webhooks/whatsapp (Twilio webhook, real-time)
    either one flips the lead to status='replied' and CANCELS all future
    follow-ups — a human takes it from there
```

Nothing here auto-deletes a lead or fabricates a reply. Every send and every
inbound message is logged in `messages` so you can audit exactly what was
said to whom.

## Setup (in order)

1. **Supabase**: create a project, run `database/schema.sql` in the SQL
   editor, copy the project URL + `service_role` key + `anon` key into
   `.env.local` (copy `.env.example` first).
2. **Gmail API**: enable the Gmail API in Google Cloud Console, create an
   OAuth client, and get a refresh token via the
   [OAuth Playground](https://developers.google.com/oauthplayground) using
   scopes `gmail.send` and `gmail.readonly`. Put those in `.env.local`.
3. **OpenAI**: add `OPENAI_API_KEY`.
4. **business.config.js**: fill in `BIZ_*` env vars — this is what makes the
   AI write like *your* business instead of a generic SaaS demo. Two
   sentences in `BIZ_OFFER_DESCRIPTION` matter more than anything else in
   this repo.
5. **(Optional) WhatsApp**: create a Twilio account, activate the WhatsApp
   sandbox (or a registered sender for production), set
   `BIZ_CHANNEL_WHATSAPP=true`, and point the sandbox's "when a message
   comes in" webhook at `https://your-domain.com/api/webhooks/whatsapp`.
6. `npm install`, `npm run dev`, open `/dashboard`.
7. **Deploy to Vercel** (free Hobby plan is fine — see below for exactly
   what that means) and set up the external scheduler once. After that,
   nothing needs manual triggering; the dashboard buttons are for testing
   and one-off pushes.

## Staying on Vercel's free (Hobby) plan

Hobby's Cron feature only allows **one run per day per job** — anything more
frequent fails at deploy time. That's fine for the outreach send (once a day
is the right cadence anyway — you don't want to blast leads more than once
daily regardless of plan), but follow-ups and reply-checking need to run more
often than that to feel automated. The fix costs nothing:

1. `vercel.json` already schedules `/api/campaigns/send` through Vercel's
   built-in Cron, once on weekday mornings — this one stays inside Hobby's
   limit natively.
2. For `/api/followups/run` (hourly) and `/api/inbox/check` (every 20-30
   min), sign up free at [cron-job.org](https://cron-job.org) (or any
   similar free scheduler) and point it at:
   - `https://your-domain.vercel.app/api/followups/run` — every hour
   - `https://your-domain.vercel.app/api/inbox/check` — every 20-30 min

   In the scheduler's request settings, add a custom header:
   `Authorization: Bearer <your CRON_SECRET>` — matching the `CRON_SECRET`
   you set in Vercel's env vars. Without this header the routes return 401;
   this is what stops a stranger from finding your URL and burning your
   OpenAI/Twilio budget.
3. Vercel itself sends that same `Authorization: Bearer $CRON_SECRET` header
   automatically on its own Cron calls once `CRON_SECRET` is set as an env
   var, so one secret covers both paths.

**Everything else on Hobby is generous enough that you won't come close**:
1M function invocations/month and 4 CPU-hours/month, against maybe ~3,000
invocations/month at the schedule above — almost all of it spent waiting on
external APIs (OpenAI, Gmail, Twilio), not computing. Each route also sets
`maxDuration` and caps its batch size per run (10 leads for outreach, 30 for
follow-ups) specifically so a single invocation can't run long enough to
threaten Hobby's function-duration ceiling. If you outgrow this — hundreds of
leads a day, sub-hourly reply detection — that's the point to look at
Vercel Pro, not before.

## Deliberate scope decisions

- **Polling, not push, for Gmail replies.** A true push subscription needs a
  Google Cloud Pub/Sub topic and domain verification — real setup overhead
  for a marginal speed gain on a sales inbox. 20-minute polling is
  effectively instant for this use case.
- **AI failures never block the pipeline.** `scoreLead()` falls back to
  WARM if OpenAI is down or misconfigured — a bad API key should never stop
  leads from being imported. `draftMessage()` does surface errors, since a
  broken outbound message is worse than a delayed one.
- **One schema, one status field.** No `saas_*` tables, no duplicate lead
  concept. If you need channel-specific fields later, add columns — don't
  fork the table.
