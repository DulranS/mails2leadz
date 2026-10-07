# Changelog

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
