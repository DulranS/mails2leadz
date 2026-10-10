# Changelog

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
