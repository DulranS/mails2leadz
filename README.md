# AutoLeads: controlled outreach + pipeline for small businesses

Upload leads, send personalised email/SMS yourself, track replies, manage deals, and see what it's
worth. AI helps you write and prioritise; **you approve everything that gets sent**.

| Area | What you get |
|---|---|
| **Dashboard** | CSV upload, templates + A/B test, email/SMS/WhatsApp/call outreach with daily limits and duplicate protection, reply detection, follow-up queue, lead scoring |
| **AI** | Draft an email for one lead (you review/edit, then approve), company research notes. The best send time is learned from the customer's own replies (no industry averages). Cheap model by default, cached, capped per customer, usage shown to the customer |
| **CRM & Deals** | One deal per lead, shared stages everywhere (New → Contacted → Qualified → Demo → Proposal → Negotiation → Won/Lost → Delivery/Retention/Expansion) |
| **Business Value** | A "Do this next" list (replies with no deal, due follow-ups, quiet deals, goal gap) and monthly-goal progress. Past (won revenue by month, win rate, time to win), present (open/weighted pipeline, funnel, deals needing attention), future (30/60/90-day forecast with a range), ROI, AI cost |
| **Account** | Profile, "what I sell" (drives AI), deal-value / cost / stage-chance settings, download my data, delete my data and account |

Numbers come from the customer's own deals. Where a value is an estimate (a deal without a set value)
the app says so.

## Develop
```
npm install
cp .env.example .env.local   # fill it in
npm run dev
npm test                     # metrics, send-timing, AI client, auth gate
```
Deployment: see `DEPLOYMENT_GUIDE.md`. Security model: `proxy.js` (every API call needs a signed-in user and
can only touch that user's data) and `firestore.rules`.

## Not included on purpose
Consciously left out: auto-replying, fully automatic sending, lead scraping, external compliance/governance
integrations. Not applicable to this product: multi-currency tax, payroll, accounting.

## Before you deploy a new version
Publish `firestore.rules` (`firebase deploy --only firestore:rules`). The rules now make AI usage counters
read-only for customers; without republishing, the old rules still let a customer delete their own counters.
