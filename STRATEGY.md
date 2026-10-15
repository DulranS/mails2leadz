# Strategy: AutoLeads as our internal advantage

Goal: win business for ourselves, cheaply and consistently. Selling the software is **not** the goal. It stays possible because the product is built per-tenant from the start (see "If we ever sell it").

## Verdict
Pointing this at **internal advantage** is right, and the hybrid shape (outbound + inbound feeding one pipeline, one human approval step) is the right shape for it.
- **Why it compounds:** every email, reply, enquiry and deal is measured against our own results (A/B reply rates, win rate by source and by inbound channel, stage win-chances learned from our closed deals, cost per reply / per win from the AI usage log). A competitor can copy the screens, not the data we collect from running it.
- **Why it is cheap:** drafting is DeepSeek-priced and capped per owner per day; the lead worker uses free OpenStreetMap data; hosting is small. Cost per reply and per win is measured in Business Value, not guessed.
- **Why a human stays in the loop:** a sender reputation takes months to build and one bad week to lose. Every send is approved. This is a feature of the advantage, not a gap.

## The loop
```
OUTBOUND  worker finds + scores leads (daily) -> Lead Inbox -> drafts waiting overnight -> you review, press Send
INBOUND   content posts / link in bio / QR / website -> enquiry form (tagged with the channel) -> deal + reply drafted at once -> you review, press Send
BOTH      replies are read when found (opt-out suppressed, positive reply moves the deal forward, out-of-office ignored)
          -> one pipeline, one "Do this next" list (unanswered enquiries first) -> win/loss feeds back into:
          A/B result, win rate by source and inbound channel, stage win-chances, forecast, AI target suggestions
```

## Status (precise: built / not yet built / left out on purpose / not applicable)
| Area | Status |
|---|---|
| Outbound: find, score, draft, approve, send, follow up, read replies | **Built** |
| Drafts prepared ahead (first emails, follow-ups) | **Built** (needs `CRON_SECRET` + service account to run nightly) |
| Inbound: public enquiry form + hosted page, channel tags, instant reply draft, deal created, "unanswered enquiries" first in Do-this-next | **Built** |
| Inbound channel ROI (enquiries -> opportunities -> revenue per channel) | **Built** |
| Social posting by the app | **Consciously left out** (the planner drafts; you post; it keeps platform accounts safe and costs nothing) |
| Unattended sending / auto-replies to prospects / automatic Won-Lost | **Consciously left out** |
| Replies checked on a timer from the server | **Not yet built** (needs stored offline Gmail access; changes consent and what we tell customers) |
| Reading the full text of a reply (today: Gmail's ~200 character preview) | **Not yet built** |
| Referral loop (ask a won, activated customer for an introduction) | **Not yet built**: the best next cheap channel; deals can already be tagged "Referral" |
| WhatsApp/SMS/call reply signals feeding attribution | **Not yet built** (providers give no reply signal back) |
| Compliance-service integrations | **Consciously left out** |

## Daily / weekly rhythm (10 minutes a day is the point)
- **Daily:** open the dashboard -> reply to enquiries first (banner), then follow-ups, then first emails. Check replies.
- **Weekly:** Business Value -> channel table and A/B result; keep what shows revenue, drop what only shows enquiries.
- **Monthly:** apply (or ignore) the suggested stage win-chances; read the AI cost and cost per win.

## Risks to watch
- **Sender reputation:** keep the daily limits; stop and fix on a rise in bounces or spam complaints. Cold email law differs by country and is **our** responsibility; the app records opt-outs and honours them, it does not make a campaign lawful.
- **Gmail dependency:** sending and reading replies use each sender's own Gmail via a one-hour browser grant. Simple and safe for us; a real limit for anyone else.
- **Small numbers:** the tables say "too early to call" for a reason. Don't steer on ten enquiries.

## If we ever sell it (the option, not the plan)
**Already true:** every record is per user (`userId`), enforced by the API gate and the database rules; invite list; download / delete my data; per-user AI caps; per-user keys; business profile drives all AI text (nothing is hard-coded to us).
**Would still be needed (not built, deferred on purpose):** a plan and billing for the software itself; Google's app verification for the Gmail permissions (a security review); per-customer sending-domain setup and deliverability guidance; onboarding and support; legal documents written for a vendor. None of these blocks using it ourselves today.
