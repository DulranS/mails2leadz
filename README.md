# AutoLeads: controlled outreach + pipeline for small businesses

Upload leads, send personalised email/SMS yourself, track replies, manage deals, and see what it's
worth. AI helps you write and prioritise; **you approve everything that gets sent**.

| Area | What you get |
|---|---|
| **Dashboard** | CSV upload, templates + A/B test, email/SMS/WhatsApp/call outreach with daily limits and duplicate protection, reply detection, follow-up queue (with "review all due with AI"), lead scoring |
| **AI** (DeepSeek by default) | **Draft** the first email, the next **follow-up** (written from what you actually sent, a different job each time), a **customer check-in** after a deal is won, and **analyse a reply** (what they want, the deal stage that fits, a suggested answer). A "pipeline coach" explains your numbers in plain language and suggests three actions. **Every AI output is a draft: you edit and approve, nothing is sent or changed on its own.** The best send time is learned from your own replies. Cheap model, cached, capped per customer per day and per month, usage shown to the customer |
| **CRM & Deals** | One deal per lead, shared stages everywhere (New → Contacted → Qualified → Demo → Proposal → Negotiation → Won/Lost → Delivery/Retention/Expansion) |
| **Business Value** | A "Do this next" list (replies with no deal, due follow-ups, quiet deals, goal gap) and monthly-goal progress. Past (won revenue by month, win rate, time to win), present (open/weighted pipeline, funnel, deals needing attention), future (30/60/90-day forecast with a range), ROI, AI cost |
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

## Not included on purpose
Consciously left out: auto-replying, fully automatic sending, lead scraping, external compliance/governance
integrations. Starter email/SMS wording is neutral and contains nothing about any particular business: customers
add their own offer (Account → "Your business" feeds every AI draft). Not applicable to this product: multi-currency tax, payroll, accounting.

## Before you deploy a new version
Publish `firestore.rules` (`firebase deploy --only firestore:rules`). The rules now make AI usage counters
read-only for customers; without republishing, the old rules still let a customer delete their own counters.
