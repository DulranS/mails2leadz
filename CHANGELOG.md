# Changelog

## Opt-out + hardening pass
- **Opt-out links in every email.** First emails, follow-ups and new-lead batches carry a one-click opt-out link and `List-Unsubscribe` headers. Opting out writes a per-customer suppression list, marks an open deal Lost ("unsubscribed"), cancels pending follow-ups, and every send / AI-draft route refuses that address (an opt-out cannot be reopened like a Lost deal). Opt-outs are not counted as lost sales in win rate / lost value. Test: `tests/unsubscribe.test.mjs`.
- **`send-new-leads` emails were declared quoted-printable but not encoded,** so any "=" (every link with a query string) could be corrupted. Now base64.
- **Google client secret is read only from `GOOGLE_CLIENT_SECRET`.** The `NEXT_PUBLIC_GOOGLE_CLIENT_SECRET` fallback is gone (a NEXT_PUBLIC_ value is published to every browser). The connection check flags the old name and says how to rename it and rotate the secret.
- Added `.env.example` (README and docs pointed to it), removed an empty stray file and two unused dependencies (`@supabase/supabase-js`, `node-fetch`).
- **Hard bounces stop further mail.** Reply checking also scans recent "address not found" bounce notices and suppresses those addresses (deal Lost, reason "bounced"; not counted as a lost sale). Soft failures never suppress. Test: `tests/bounces.test.mjs`.
- **DeepSeek model names can no longer take AI down.** If DeepSeek rejects the configured model name as unknown, the client tries the other current names once and remembers the one that works. Test in `tests/ai-client.test.mjs`.
- Shared tables: sorting is case-insensitive and number-aware with empty values last; pagination stacks on phones with larger tap targets.


## Final audit pass (last day)
Security / customer data
- **Removed CSV "Enrich" (route, service, buttons).** It posted customers' lead lists to a hard-coded third-party AWS endpoint that was not theirs (and the buttons never sent a sign-in token, so they always failed). Scraping/enrichment is out of scope, as the README says.
- **Tenant check can no longer be bypassed with a different `Content-Type`.** The gate only compared `userId` for `application/json` bodies, but the routes parse the body whatever the type says. It now checks every write request. Test: `tests/proxy.test.mjs`.
- **Third send route hardened.** `send-new-leads` now strips line breaks from From/To/Subject (header injection), refuses Lost deals, and shares the daily limit.

Pipeline bugs that would have embarrassed customers
- **Daily send limits never worked.** `sentAt` is stored as an ISO string, but the send route and the quota display compared it with a Date/Timestamp, which matches nothing and raises no error: the 500/day cap never triggered and the dashboard always showed 0 used. One shared counter (`lib/server/daily-count.js`) now compares ISO strings, falls back to a scan if an index is missing, and the batch loop enforces the remaining allowance mid-batch. Test: `tests/daily-count.test.mjs`.
- **`{{sender_name}}` was sent literally.** The starter templates use it, but the first-email route never filled it and used the dashboard's placeholder string as the From display name. One shared filler (`lib/server/template-vars.js`) now fills every occurrence in the first email and follow-ups. Test: `tests/template-vars.test.mjs`.
- **AI-approved first emails arrived with raw `<p>`/`<br>` tags.** The draft was converted to HTML but the route sends plain text. Drafts are now sent as plain text.
- Removed an unused second follow-up path inside `send-email` that skipped the "already replied / Lost / max 3" rules, and an unused `updateDealStage` helper that would have saved an invented $5,000 as a real deal value.

- **Removed the "SMS Qualify All Leads" bulk feature (button, 2 routes, helper).** Its send step was a stub: it logged the text, returned success with a `placeholder_` ID and saved the lead as "sent", so customers were told qualification texts went out when none did. Its reply route also could not receive real Twilio posts (form data, no `userId`). Single SMS through Twilio (`/api/send-sms`) is unchanged. Phone-call status webhook is unchanged.
- Older AI routes (`ai-smart-outreach`, `research-company`) now use the verified user, not the `userId` in the body. Reply search no longer breaks on subjects containing quotes.

Business value
- **Currency.** Every figure was hard-coded "$". Account → Money settings now has a currency (22 common ones) and an optional "1 USD = ?" rate that converts the AI provider's USD cost for ROI. Dashboard, Business Value, "Do this next" and the AI coach use it. Test: `tests/currency.test.mjs`.
- **AI follow-up queue review.** "✨ Review N due with AI" drafts the due email follow-ups one at a time (max 10 per run). You edit and approve or skip each; nothing is sent without a click, server limits still apply, and it stops if an AI limit is hit.
- The dashboard ROI now includes AI cost, matching the Business Value page.
- Upload filter defaults to "All" instead of "HOT only" (a CSV with a `lead_quality` column silently lost its WARM leads).

## Last-day hardening (second pass)
- **Sends are never repeated automatically.** A slow or failed email / SMS / call request used to be retried by the app (and, for follow-ups, again every 10 seconds by a background queue), which could reach a lead twice. Send and call requests now run exactly once, with a longer timeout; when one fails the app shows the server's reason (already replied, too soon, max reached) and you decide whether to try again. Reads are still retried. Test: `tests/api-retry.test.mjs`.
- Removed dead code: an unused follow-up scheduler that called a route that does not exist, and an unused scraper client.
- **Lost means Lost.** A deal marked Lost (including "asked to stop" from reply analysis) was only a label: the lead could still get a follow-up or a new cold email. The email send route, follow-up send route and AI follow-up draft now refuse Lost deals (reopen the deal to contact them again), and Lost leads no longer show in the follow-up lists. Test added in `tests/route-helpers.test.mjs`.
- **One set of numbers.** The dashboard's "AI-Powered Analytics" panel used an older engine with an invented $5,000 deal value, made-up stage weights and an unmeasured "confidence %". It now shows 30/60/90-day expected revenue (with range), stalled deals and win/loss from the same calculation as Business Value. The old engine was deleted.
- **Landing page.** There was none: `/` redirected to a sign-in button under the generic name "B2B Growth Engine". `/` is now a short, honest landing page (what it does, how it works, what stays in your control; no made-up stats or testimonials). The product name is `NEXT_PUBLIC_APP_NAME` (default AutoLeads), the browser tab now has a real title, and `NEXT_PUBLIC_CONTACT_EMAIL` optionally shows a contact line.
- **Phone calls, three leftovers fixed.** (1) The interactive call menu still connected "press 1" callers to the original owner's personal number; it now connects to the customer's own phone (Account → Your business), or says nobody is available. (2) The menu never read the key the caller pressed (Twilio posts it, the route only handled GET), so every key ended the call; keys 1/2/3 now work. (3) Pressing 3 used to say "removed from our list" and did nothing; it now records "do not call again" and the call route refuses to dial that number again. Pressing 2 records "wants info by email" on the call.
- **Phone numbers work in any country.** Four places assumed Sri Lankan numbers (a 0-prefixed number from any other country became +94). One shared `lib/phone.js` now keeps any number written with +CC / 00CC as is and applies `NEXT_PUBLIC_DEFAULT_COUNTRY_CODE` (default 94) only to local 0-prefixed numbers. Test: `tests/phone.test.mjs`.
- Removed the "077/076/075 numbers first" sort that overrode the customer's own sort choice.
- Lead lists no longer put Sri Lankan numbers first (an owner-specific sort); replied leads are ordered by most recent reply, follow-ups by urgency.

## Launch day: DeepSeek AI + selling-to-anyone fixes
AI (all human-approved, capped, cached)
- DeepSeek is the default provider (OpenAI/Anthropic stay as optional backups with automatic fallback). Thinking mode is switched off for drafting; cost is estimated at DeepSeek's peak price, with cached input billed at the cache price, so spend caps are never under-counted.
- **AI follow-up drafts** (`/api/ai-followup`): next follow-up written from the email actually sent, with a different job for #1/#2/#3. Sent through the existing follow-up route, so "not replied / max 3 / minimum gap" are still enforced by the server.
- **Customer check-ins** after a deal is won, delivery started, retention, expansion (onboarding / week-1 / day-30 / quarterly). Opens in the owner's own email app. Previously these reminders could not be sent at all (they went through the cold-outreach route, which refuses anyone who replied).
- **Reply analysis** (`/api/ai-reply-assist`): what they want, a suggested deal stage chosen from a fixed table (the AI can never mark a deal Won), a suggested answer, and a one-click stage change. Wording that tries to give the AI instructions is treated as data.
- **Pipeline coach** on Business Value (`/api/ai-insights`): plain-language read of the real numbers + three actions. Only totals are sent, never names or emails.

Fixes
- The app shipped with the owner's own pitch as the default for every customer: personal phone, Gmail, LinkedIn, portfolio, booking link, company name (email, follow-up, post-sale, WhatsApp, SMS, social templates) and the "bridge" call dialled the owner's phone. All replaced with neutral starter wording and the customer's own business name/phone.
- Remaining invented dashboard numbers removed (fixed $5k deal / 25% / 8% conversion, "+40% proven", "+35% send time", "3x conversion"). They now show the real pipeline and forecast.
- Follow-up send no longer fails when `GMAIL_SENDER_EMAIL` is empty (documented as optional), reads the verified user, picks the right row when a lead has several sent emails, and passes the caller's token to company tracking.
- Email header injection closed in both send routes (subject/to/from forced to one line).
- Phone calls: Twilio client is created lazily (a missing key no longer risks the build), call-status callbacks now carry the webhook secret and a valid base URL (call results were never saved), call recording is off unless enabled, call scripts use the customer's own business name.
- Won/delivery/retention/expansion reminders are created once per real stage change (re-saving "Won" used to stack duplicates).

## Final pre-sale review
Security / cost
- AI usage counters are now read-only for customers (they could delete them to reset their daily/monthly AI cap). Account deletion keeps these counters (counts and cost only) and says so.
- Removed three unused API routes: `/api/deals` (any signed-in user could edit or delete another customer's deal, and creating a deal crashed), `/api/cleanup-old-data` and `/api/cleanup-old-records` (would have deleted won/lost deals, i.e. revenue history).
- Customer data is never cached publicly: `no-store` on every per-customer API response.
- Account export/delete now covers every per-customer collection (campaigns, follow-up schedules, targets, contacts, SMS qualifications, daily metrics, backups were missed).
- The send route reads the same Google credential variables as every other route and never sends `From: undefined`.

Pipeline
- A reply (manual "Mark replied" or detected from Gmail) now marks every email sent to that lead and cancels their pending follow-up reminders. Automatic detection previously failed to record the company reply because its internal call had no sign-in token.
- CRM: one row per lead (was one per email sent); notes and next follow-up now actually display; "Closed Won" stat no longer always 0; Negotiation counts as pipeline; stage dropdown in the lead window updates; "Add Lead" works (referrals/inbound become real deals); deal value can be edited inline (estimates are marked); "Remind me in 3 days" creates a real reminder in the dashboard follow-up queue.

Business value
- Removed the dashboard "Business Intelligence" widget and its API routes: they showed invented numbers (assumed 25% open rate, $5,000 deals, 45-day cycle, 30%/70% pipeline). It is now a snapshot of the same real numbers as the Business Value page.
- Best send time is computed in the browser from the customer's own sent emails and replies (local timezone, minimum sample sizes, says so when data is too thin). The old route counted only emails that got replies, so every window looked 100% and it showed a made-up "+35% potential improvement".
- ROI: AI cost now uses the same 90-day window as revenue (exact, from monthly counters); cost per win divides by 90-day wins, not all-time wins. Won deals still on the default value are flagged and appear in "Do this next".
- AI usage card shows spend against the real monthly cap; due follow-ups no longer count people who already replied.
