# AutoLeads: controlled outreach + pipeline for small businesses

Upload leads, send personalised email/SMS yourself, track replies, manage deals, and see what it's
worth. AI helps you write and prioritise; **you approve everything that gets sent**.

| Area | What you get |
|---|---|
| **Dashboard** | CSV upload, templates + A/B test, email/SMS/WhatsApp/call outreach with daily limits and duplicate protection, reply detection, follow-up queue (with "review all due with AI"), lead scoring |
| **AI** (DeepSeek by default) | **Draft** the first email, the next **follow-up** (written from what you actually sent, a different job each time), a **customer check-in** after a deal is won, and **analyse a reply** (what they want, the deal stage that fits, a suggested answer). A "pipeline coach" explains your numbers in plain language and suggests three actions. **Every AI output is a draft: you edit and approve, nothing is sent or changed on its own.** The best send time is learned from your own replies. Cheap model, cached, capped per customer per day and per month, usage shown to the customer |
| **CRM & Deals** | One deal per lead, shared stages everywhere (New → Contacted → Qualified → Demo → Proposal → Negotiation → Won/Lost → Delivery/Retention/Expansion) |
| **Business Value** | A "Do this next" list (replies with no deal, due follow-ups, quiet deals, goal gap) and monthly-goal progress. Past (won revenue by month, win rate, time to win, why deals are lost, where deals come from, email A/B results), present (open/weighted pipeline, funnel, deals needing attention), future (30/60/90-day forecast with a range), ROI, AI cost |
| **Account** | Profile, "what I sell" (drives AI), your currency, deal-value / cost / stage-chance settings, download my data, delete my data and account |

Numbers come from the customer's own deals. Where a value is an estimate (a deal without a set value)
the app says so.

## Develop
```
npm install
cp .env.example .env.local   # fill it in
npm run dev
npm test                     # metrics, send-timing, AI client (incl. DeepSeek), reply intents, auth gate, header safety
```
Deployment: see `DEPLOYMENT_GUIDE.md`. Security model: `proxy.js` (every API call needs a signed-in user and
can only touch that user's data) and `firestore.rules`.

## What is working (Business Value)
- **Where your deals come from**: win rate and revenue by source: cold email (recognised from the emails sent here), referral,
  inbound, other (tag these in CRM → Add a lead). SMS / calls / WhatsApp get no reply signal back, so they cannot be attributed.
- **Email A/B test**: version A vs B by reply rate (counted by the first email each lead received). It only names a leader with 20+ leads
  per version and a 5-point gap; otherwise it says "too early to call".
- **Stage-chance suggestions**: from your own closed deals, shrunk toward your current numbers, never lower for later stages. It appears
  only after 10+ closed deals that reached a stage *and were tracked from creation* (deals created before this version only know their
  current stage, so they are not used). Nothing changes until you click Apply.

## Not included on purpose
Consciously left out: auto-replying, fully automatic sending, lead scraping, external compliance/governance
integrations. Stage win-chances are never changed automatically: the app only *suggests* new ones from your own closed
deals and you click Apply. Starter email/SMS wording is neutral and contains nothing about any particular business: customers
add their own offer (Account → "Your business" feeds every AI draft). Not applicable to this product: multi-currency tax, payroll, accounting.

## Before you deploy a new version
Publish `firestore.rules` (`firebase deploy --only firestore:rules`). The rules now make AI usage counters
read-only for customers; without republishing, the old rules still let a customer delete their own counters.

## Opt-out (unsubscribe) links
Every email the app sends (first email, follow-ups, new-lead batches) ends with a one-click opt-out link and carries
`List-Unsubscribe` / `List-Unsubscribe-Post` headers (the Unsubscribe button in Gmail/Yahoo). Pressing it:
adds the person to a per-customer suppression list (`suppressions`), marks an open deal Lost with reason "unsubscribed",
and cancels pending follow-ups. Every send and AI-draft route then refuses that address, and unlike a Lost deal an opt-out
cannot be reopened from the app. Opt-outs are not counted as lost sales in win rate. Needs `NEXT_PUBLIC_BASE_URL` (https),
`UNSUBSCRIBE_SECRET` (or `WEBHOOK_SECRET`) and the Firebase service account; **Account → Run connection check** shows
whether it is active. Re-publish `firestore.rules` after deploying.

**Bounces.** When "Check replies" runs, the app also looks for the mail system's "address not found" notices (last 14 days) for people you emailed and puts those addresses on the same do-not-contact list (deal marked Lost, reason "bounced", not counted as a lost sale). Full mailboxes, spam rejections and temporary errors never suppress anyone.
