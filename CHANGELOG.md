## Pass 239 - offers, reliability, recommended package

- Offers with real end dates and guarantees; ending offers on the Do now list.
- Reliability score with its parts, on the measures screen.
- Credit-risk list and measure saved to the measures screen (was missed in Pass 238).
- Middle of three packages marked Most chosen.
- Tests run here: the offers and trust tests (4 checks), the full npm test chain (exit 0), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live services or checked on a phone.

## Pass 238 - credit risk, contribution, enrichment and Google Maps as one step

- Credit risk list for customers owing over 30 days.
- Optional cost to deliver in the pricing check, with the contribution per sale.
- Lead enrichment card and connection test (Apollo or People Data Labs).
- Lead search card named Google Maps (Places).
- Tests run here: the credit and contribution tests (3 checks), the full npm test chain (exit 0), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Apollo and People Data Labs test endpoints are unverified.
- Not run against live services.

## Pass 237 - Do now list, collapsible More, cash vs signed

- Do now list at the top of every screen: only what needs attention today, most urgent first, at most five, each with one link.
- Sidebar More block collapses and opens itself on its pages.
- Paid so far (cash from paid invoices, last 12 months) shown beside signed deals.
- Tests run here: the Do now tests (4 checks), the paid-vs-signed test (1 check), the full npm test chain (exit 0), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Credit risk on buyers is not yet part of customer health.
- Not run against live services or checked on a phone.

## Pass 236 - sidebar order

- Sales and marketing items at the top; deals and money next; less relevant items in a More block at the bottom.
- All 20 menu items kept.
- Tests run here: the full npm test chain (exit 0) and a production Next.js build (exit 0).

## Pass 235 - handwritten notes checked against sales and marketing

- Lifetime-value-to-acquisition-cost ratio shows its 3x target.
- SOPs restored to the menu as the sales playbook.
- Tests run here: the full npm test chain (exit 0) and a production Next.js build (exit 0).

## Pass 234 - app-keys owner is the first sign-in

- The first signed-in person is recorded as the owner of app keys, once; later sign-ins cannot take it.
- Only the owner can view or change app keys.
- Tests run here: the owner tests (3 checks), the full npm test chain (exit 0), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- If the owner needs to be reset, that is done in the database, not in the app.

## Pass 233 - own Facebook Page, Instagram and ad data; SMS broadcasts

- Facebook Page and Instagram drafts, published only after a typed POST.
- Meta connection requests publishing and ad permissions, keeps a long-lived token, the ad account and the linked Instagram account.
- SMS broadcasts with per-number text consent, valid mobile numbers, opt-out line, batch approval and the daily cap.
- Email and text consent recorded separately.
- Tests run here: the social and SMS tests (4 checks), the full npm test chain (exit 0), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Meta needs a reconnect for the new permissions.
- Not run against live Meta, Instagram or Twilio.

## Pass 232 - lists, segments, broadcasts, results

- Segments by tag, source, stage, city, value and activity; preview counts.
- Email broadcasts: drafts with fixed recipients, approval by typing SEND, opt-out on every email, daily cap, opt-out re-check at send.
- Consent recorded per contact; only agreed contacts are included.
- Campaign results by tag.
- Decided, not built: pop-ups, a native form builder, SMS broadcasts.
- Tests run here: the segment tests (4 checks), the full npm test chain (exit 0), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live email.

## Pass 231 - monthly digest catch-up

- The monthly digest runs on the first open of a month whose digest has not run yet, as well as on the 1st.
- Tests run here: the full npm test chain (exit 0) and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live services.

## Pass 230 - keys in the app, no cron, memory, scope

- App keys page (operators only): encrypted in the database; values never shown back; app-set keys take precedence over server settings.
- Connection, card payment, AI and sync readers use the same key source; the daily run warms it.
- Weekly tasks catch up on the first open after six days without a weekly run.
- Sales tools remember drafts on the device.
- Navigation limited to sales, marketing and deals; no data deleted.
- Tests run here: the app-keys tests (3 checks), the full npm test chain (exit 0), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Monthly digest catch-up on a later open is not built.
- Bootstrap values stay on the server.
- Not run against live services.

## Pass 229 - business details reach the features

- The Account page's business details are read through one shared reader, so the pitch, deck, creator brief, ideal customer and voice assistant pick them up.
- Fixed: the offer and ideal customer were read from the wrong field.
- Tests run here: the business-profile tests (3 checks), the full npm test chain (exit 0), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live services.

## Pass 228 - one header on the dashboard

- Removed the dashboard's duplicate brand block; the shared frame carries it.
- The dashboard header is a plain toolbar, not sticky, so headers no longer stack.
- Tests run here: the full npm test chain (exit 0) and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not checked in a browser.

## Pass 227 - dashboard and sidebar tidy-up

- Sidebar groups are contiguous, so 'Sell' is one block.
- Dashboard section titles without skipped numbers.
- Header buttons aligned right; Sign Out styled as a button.
- Phone search button moved to the bottom-left to avoid the dashboard's own button.
- Tests run here: the full npm test chain (exit 0) and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not checked in a browser. The dashboard still draws its own header under the shared top bar; a further cleanup would remove one of them.

## Pass 226 - insights from the Claude video

- Patterns in won and lost customers from call notes (facts only).
- Rep record over twelve months on the measures screen.
- Message check against a standard per channel; nothing sent.
- Proof bank with consent; only consented testimonials are usable.
- Ad spend audit from synced figures; reactivation grouping of lost deals with drafts only.
- Ad spend synced daily; the monthly ROI loop falls back to synced spend.
- Fixed: missing document imports on the measures route, caught by the import test.
- Tests run here: the insights tests, the full npm test chain (exit 0), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Meta ad audit waits on Meta's review.
- Not run against live AI or ad accounts.

## Pass 225 - dashboard gets the shared frame and search

- The dashboard was missing from the shared-frame list, so it had no top bar, navigation or search button. Added.
- The dashboard remains the first screen after sign-in.
- Tests run here: the full npm test chain (exit 0) and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not checked on a phone or desktop in a browser.

## Pass 224 - search on phones

- Floating search button on phones, on every screen.
- Top-bar search is an icon with a fixed size, so it cannot be pushed out of view.
- Search opens as a bottom sheet on phones.
- Tests run here: the full npm test chain (exit 0) and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not checked on a phone in a browser.

## Pass 223 - shared read cache

- Read-only data is shared between screens that open together: one request per address, reused for five seconds, concurrent requests merged.
- Reloads after a save always fetch fresh.
- Failed requests are not kept.
- Tests run here: the cache tests (4 checks), the full npm test chain (exit 0), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- No component memoisation: needs a browser profiler to justify, not done blind.
- The reported check count (916) is lower than last pass (927); not yet accounted for.
- Not checked in a browser.

## Pass 222 - thousands separators

- One formatter shows money and large numbers with commas (500,000 and 5,000,000); decimals only where present; n/a for missing values.
- Applied across the forecast, pipeline, money, targets, pricing, packages, objectives, comparables, margins, deal listings, the pitch and deck, and the monthly customer-value note.
- Tests run here: the number-format tests (3 checks), the full npm test chain (exit 0, 927 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Input boxes keep what you type; weekly and monthly text notes beyond the customer-value line are not formatted.
- Not checked in a browser.

## Pass 221 - quick actions and skip link

- Search palette lists the common actions (events, listings, pasted links, journeys, agreements, today's plan).
- Skip-to-content link on every screen.
- Tests run here: the quick-links tests, the full npm test chain (exit 0, 924 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not checked in a browser.

## Pass 220 - landing page and navigation

- Landing page restructured: sticky jump links, one hero with three actions, four grouped feature blocks, shorter controls and exclusions, 44px targets and focus rings.
- Top bar has a visible Search button that opens the command palette.
- Tests run here: the full npm test chain (exit 0, 924 checks) and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not checked in a browser on phones and desktops.

## Pass 219 - one click to every tool, command palette

- Open your tools on the Integrations screen: every outside tool, grouped, one click.
- Ctrl+K / Cmd+K command palette on every screen: jump to any screen or outside tool.
- Business pipeline and landing page updated for the one-click access.
- Removed a palette link to a screen that does not exist.
- Tests run here: the quick-links tests (3 checks), the full npm test chain (exit 0, 924 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Platform-gated items unchanged. Not run against live services.

## Pass 218 - automatic journey email (off by default)

- New switch: journey emails are sent automatically, only for email steps, only where the owner has recorded agreement, never to a do-not-contact address, each with an opt-out line.
- Enrolment has an agreement tick; steps are marked done only after a successful send.
- Tests run here: the automatic journey tests (4 checks), the switch list test (updated), the full npm test chain (exit 0, 921 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- SMS and WhatsApp journey steps stay manual.
- Not run against live Gmail.

## Pass 217 - corrective action on missed targets

- The weekly list adds one next step when revenue a month or new customers a month is below 80% of target. Figures come from paid invoices over the last twelve months.
- Landing page mentions the corrective step.
- Tests run here: the corrective tests (4 checks), the full npm test chain, and a production Next.js build. The code audit found no undefined names or correctness issues.

Limits, plainly:
- Win rate is not used for corrective steps (it needs the full deal history in the weekly run).
- Platform-gated items unchanged. Not run against live services.

## Pass 216 - partners, press, demand; landing and business pages

- Accounts typed as customer, partner or press; reminders name the type.
- Demand trend from received leads (thirty days against the thirty before).
- Business pipeline summary shows the forecast, deals at risk, demand, and the partner and press count.
- Landing page updated to what is built, and the platform-gated items named.
- Tests run here: the partners, press and demand tests (3 checks), the full npm test chain (exit 0, 913 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Platform-gated: social publishing, paid campaign creation, Google Business Profile, LinkedIn, Meta Lead Ads beyond admins.
- Not run against live services.

## Pass 215 - Google Places lead search, events, presets, packages

- Automatic weekly lead search through Google Places (official API, owner's key, tested before saving), added to the lead finder's import.
- Events with a public RSVP page: capacity, one RSVP per email, optional marketing tick, reminder the day before.
- Onboarding, renewal and win-back journey starts; package comparison with tax and deposit.
- Fixed: a result count of zero was read as twenty.
- Tests run here: the Places, events, presets and packages tests, the full npm test chain (exit 0, 910 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Partial: partnerships, positioning, PR. Platform-gated: social publishing, Google Business Profile.
- Not run against live Google Places or any other service.

## Pass 214 - journeys

- Journeys: up to eight ordered steps with waits, email or SMS. Enrol by email; the daily list shows each due step; you send it and mark it sent. A reply stops the journey for that person.
- Nothing in a journey is sent automatically.
- Tests run here: the journey tests (4 checks), the full npm test chain (exit 0, 901 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Semi-automatic by design. An automatic journey sender is not built.
- Not run against live services.

## Pass 213 - forecast, health, final scope check

- Quarter forecast: won so far plus open deals weighted by your stage probabilities, against three months of target.
- Deal health (idle time, missing value, missing next step) and customer health (no purchase, open complaint, low score), with the reasons named.
- Deals at risk shown on the measures screen.
- Final scope check against current RevOps benchmarks, with what is not built and why.
- Tests run here: the health and forecast tests (3 checks), the full npm test chain (exit 0, 897 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not built: buyer intent and visitor identification, call recording, a visual journey builder, full ABM platform, paid data subscriptions.
- Not run against live services.

## Pass 212 - gaps closed in sales, marketing and deals

- Rental check-out and extension texts (consent-checked, near the end time, switch off by default).
- Objectives and key results measured from real figures.
- Competitor prices entered and compared with your price.
- Referral asks to settled, happy customers, with a share code.
- Named accounts reminded when quiet for two weeks.
- PowerPoint deck (.pptx) alongside the printable deck; creator brief.
- Tests run here: the gap tests (7 checks), the full npm test chain (exit 0, 894 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live services. Google Business Profile, LinkedIn and Meta remain platform-gated.
- A community forum was decided against; referrals are built instead.

## Pass 211 - electronic signature through Dropbox Sign

- Provider chosen: Dropbox Sign, with the owner's API key (checked before saving).
- Agreements become a PDF with signature and date fields placed by text tags, and are sent for signature with the signer's name and email. Test sends are available.
- Requests are checked daily; signed ones appear in the week's actions.
- Typed-name acceptance by link remains. The landing page does not claim a higher legal tier than the provider gives.
- Tests run here: the PDF and signing tests (5 checks), the full npm test chain (exit 0, 887 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live Dropbox Sign.

## Pass 210 - landing page, business pipeline, deck, agreement acceptance

- Landing page rewritten: only what is built, what is off until switched on, and what is not included and why.
- Business page: buying, selling and support summary above the pipeline.
- Pitch deck: seven printable slides, from the owner's figures only.
- Agreement acceptance by one-time link: typed name, time, fingerprint of the text, no raw IP kept. Not a qualified electronic signature.
- Tests run here: the deck, acceptance and sales-tools tests, the full npm test chain (exit 0, 882 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Qualified electronic signature not built (needs a provider).
- Not run against live services.

## Pass 209 - RevOps, feedback loops, sales tools

- ROI loop: channel revenue against entered spend, a budget suggestion, and customer value by source, in the monthly digest.
- Pricing calculator, pitch outline built from saved figures, and contract or NDA drafts with legal terms left for a lawyer.
- Spend by channel is entered on the measures screen.
- Tests run here: the sales-tools tests (3 checks), the ROI tests (4 checks), the full npm test chain (exit 0, 874 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- No e-signature yet (needs a verified provider). No pitch deck file. No social selling. Cookie consent not verified.
- Not run against live data or providers.

## Pass 208 - search insight and case studies

- Google Search Console connects through the Google approval (read-only). Each Monday, up to three search opportunities go on the week's list.
- Case-study drafts: only for customers the owner records as agreeing in writing. Drafts use only the owner's notes; a number not in the notes is refused. Nothing is published.
- Tests run here: the search and case-study tests (5 checks), the full npm test chain (exit 0, 867 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live Search Console data or the AI provider.
- Site behaviour tracking is not built (it needs visitors' consent).
- Owners who connect Search Console need the approval once.

## Pass 207 - paste a link, sales targets

- Paste an eBay search link or a Companies House company link in the deals panel: it is searched or tracked. Other links are refused with the reason.
- Sales targets (revenue a month, new customers a month, win rate) with progress against the twelve-month average.
- Tests run here: the link and target tests (3 checks), the full npm test chain (exit 0, 862 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Other sites are not read. Competitor analysis is not built.
- Not run against live eBay or Companies House.

## Pass 206 - measures and support screen layout

- Money and the business model: collapsible, with stat cards and a labelled form (model, monthly spend, ideal customer), and a focus card for the chosen model.
- Automatic answers and the support queue: collapsible sections, labelled inputs, and clear reply controls. Same behaviour and data calls.
- Tests run here: the full npm test chain, and a production Next.js build. The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not checked in a browser.

## Pass 205 - Tally by one key, Twilio number found automatically

- Tally: one API key and a Connect button set the form webhooks and the signing secret. Shape checked against Tally's public API docs.
- Twilio: the sending number is read from the owner's account and kept, so it isn't typed.
- Tests run here: the Tally tests (2 checks), the full npm test chain (exit 0, 859 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live Tally or Twilio.
- Twilio still needs its account ID and token.

## Pass 204 - Stripe Connect behind a switch

- 'Connect Stripe' button: the owner approves on Stripe; the connected account id is stored. No keys pasted.
- Off by default. When the owner switches on Stripe Connect, invoice payments go to their connected account; otherwise nothing changes.
- The webhook accepts a connected account's payment only if it belongs to this owner, verified with the platform's secret.
- STRIPE_CONNECT_CHECKLIST.md: test mode first, then one small live payment and refund, and how to roll back.
- Tests run here: the Stripe Connect tests (4 checks), the full npm test chain (exit 0, 857 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live Stripe. Test mode first, as the checklist says.

## Pass 203 - key and button connections

- Typeform connects with one personal access token: the app sets the form webhooks and the signing secret.
- Slack connects with an approval; the alerts channel address is stored on the business settings.
- Typeform token field and Slack button added to Integrations.
- Still more than one value: Stripe (needs a live test before moving to Connect), Twilio, Tally, and Meta's pixel (app review).
- Tests run here: the key-and-button tests (4 checks), the full npm test chain (exit 0, 853 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live Typeform, Slack or Stripe.

## Pass 202 - business model, money measures, feedback loop

- Business model (B2B, B2C/D2C, rentals) with its own focus list; ideal customer stored.
- Average order value, price point, average contract value, lifetime value, acquisition cost, lifetime value to acquisition cost, paid versus organic wins, new customers.
- Repeated support questions become weekly actions; wins about three months old get an account review.
- Tests run here: the money and feedback tests (4 checks), the full npm test chain (exit 0, 849 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not built: Google Business Profile (needs Google approval), creative production, personalised video tools, Meta lookalike audiences (needs app review), rental check-out texts, wallet settings.
- Not checked in a browser.

## Pass 201 - every key has a place on the Integrations screen

- The screen showed 23 of the 50 stored keys; now one catalog (16 groups) shows all of them, and a test keeps the screen and the server in step.
- Cards for Companies House, Shopify, eBay, TikTok Events and the Vapi voice service, with their limits.
- Connection checks for Companies House, Shopify (domain checked first) and the voice service.
- Tests run here: the catalog tests (2 checks), the full npm test chain (exit 0, 845 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not checked in a browser; the new cards and fields need a look.
- Connection checks exist only for the services listed; the rest are saved, not tested.

## Pass 200 - one key wherever possible

- The Google connection also sets up the GA4 measurement id and secret from the owner's first web stream, and creates the purchase conversion action in Google Ads. Owners must reconnect once to approve analytics access.
- The voice agent needs only its key; the phone number is found from the account.
- Still more than one value: Stripe, Twilio, Slack, and signed lead-form tools (listed in GAP_STATUS). Meta's pixel needs the ads-read permission, which needs Meta's review.
- Tests run here: the one-key tests (4 checks), the full npm test chain (exit 0, 843 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against the live Google, GA4 or Vapi APIs.
- Owners who connected Google before must reconnect once.

## Pass 199 - deal finder on eBay's official API

- Owners save up to five search words. Each week (and on 'Look now'), eBay's official Browse API is searched with the operator's app key.
- Listings at least 20% below the middle of that search's results are kept as candidates in the deals pipeline, with price, discount, condition and link.
- Labelled honestly: compared with today's listings, not sold prices.
- Scraping of other marketplaces is not built.
- Tests run here: the deal-finder tests (2 checks), the full npm test chain (exit 0, 839 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against the live eBay API.
- eBay sold-price data is restricted; not available here.

## Pass 198 - deals panel layout

- The deals panel is rebuilt as seven numbered sections, each opening with one tap, with labelled inputs and touch-sized buttons.
- Results show as clear cards. The UK sold-price lookup by postcode is now on the screen.
- Tests run here: the full npm test chain (exit 0, 837 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not checked in a browser.

## Pass 197 - smart support desk

- New tickets are routed to the least-loaded team member; complaints and high-priority tickets go to owners and managers first; viewers never take tickets.
- Each ticket shows on track, due soon, past target, or done against its two-hour target.
- A ticket past target raises one owner alert; two hours past target, the alert says to reassign.
- The queue shows a ready answer from the library, customer history, and lets agents assign and reply to WhatsApp and SMS questions.
- Measures per agent and overall: target missed, answered automatically, unassigned, open and done, past target, reasons, repeat customers.
- Tests run here: the smart-support tests (6 checks), the full npm test chain (exit 0, 837 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Routing uses load and role only; no skills or time zones.
- Email replies stay in the inbox.
- Not run against live messages.

## Pass 196 - automatic WhatsApp and SMS support

- A customer's WhatsApp or SMS question is answered only from the owner's answer library, when the auto-reply switch is on.
- Complaints, refunds, payment or legal matters, requests for a person, uncovered questions and automatic replies from other systems go to the support queue with the message.
- STOP is never answered; empty messages are never answered; at most five automatic replies per customer per day.
- The answer library is set on the support screen ('question | answer' lines). Automatically answered tickets are counted in the support measures.
- The switch is off by default.
- Tests run here: the support-bot tests (5 checks), the switch list test (updated), the full npm test chain (exit 0, 831 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live Twilio messages.
- Free-text AI answers to customers are not built, by design.

## Pass 195 - gap check

- Five composite-index queries were missing their indexes; declared.
- The regenerated setup template had dropped 43 core settings; restored as a core group, with later operator settings listed.
- Tests run here: the full npm test chain (exit 0, 826 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

## Pass 194 - easier to use

- The CRM screen opens with today's work (start-of-day list, meetings, support, alerts), then leads and deals.
- Voice, call summaries, click-to-call, tender drafts, deal sourcing and resale are under one 'More tools' section, opened with one tap.
- The sections are native disclosures: keyboard, screen-reader and touch friendly, no script.
- Tests run here: the full npm test chain (exit 0, 826 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not checked visually in a browser; check the new order on a phone and a desktop.

## Pass 193 - Shopify and eBay by approval

- Shopify Connect: owner enters the store domain, approves in their own Shopify admin; the store and its token are stored. No pasted token.
- eBay Connect: owner approves in eBay; a refresh token is stored and renewed on each sync. The pasted token remains a fallback.
- Tests run here: the Connect tests (5 checks), the new store Connect tests (4 checks), the full npm test chain (exit 0, 826 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live Shopify or eBay accounts; token endpoints need one check each.

## Pass 192 - eBay publishing behind a switch

- With the 'Publish changed products on eBay' switch on and a category set, changed products are published as offers using the owner's own shipping, payment and return policies.
- Policies are read once a day; each product is published once and its ids are kept.
- The switch is off by default: a published offer is a live listing.
- Tests run here: the eBay publishing tests (2 checks), the switch list test (updated), the full npm test chain (exit 0, 822 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against a live eBay account; the offer and policy endpoints need one check.

## Pass 191 - eBay inventory sync

- Changed products go to the owner's eBay seller account as inventory items (official Sell Inventory API, owner's own user token).
- Quantity is the stock on hand, never negative; SKUs are validated; archived products are skipped.
- Publishing an offer needs the owner's own policies in eBay; that step is left to the owner.
- Tests run here: the eBay tests (2 checks), the full npm test chain (exit 0, 820 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Items are inventory only; the owner publishes offers in eBay.
- Not run against a live eBay account.

## Pass 190 - Shopify listings

- Changed products are sent to the owner's own Shopify store through Shopify's official Admin API, with the owner's own access token. Each product is sent once per change, and its store id is kept.
- The store must be a Shopify store domain, so the token is only ever sent to Shopify.
- Runs in the daily pipeline; does nothing when no store is connected or nothing changed.
- Boundary kept: no unsolicited messaging, no removal of opt-out or consent checks, no marketplace scraping.
- Tests run here: the Shopify tests (2 checks), the full npm test chain (exit 0, 818 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against a live Shopify store.
- Other marketplaces need per-platform developer approval.

## Pass 189 - Land Registry comparables, support queue, sales measures

- UK sold prices for a postcode from the official Price Paid data (no key), cached six hours; pasting prices remains the fallback.
- Support queue: each new complaint or support alert opens a ticket with a two-hour target; one-tap status changes.
- Support measures: open, past target, complaints open, resolved this week, median time to resolve, share meeting target.
- Sales measures on one screen: pipeline, twelve-month wins, win rate, waiting leads, buy-side tracked and realised margin, open support.
- Tests run here: the measures tests (5 checks), the full npm test chain (exit 0, 816 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Land Registry, Companies House and voice-service field names are unverified against live endpoints.
- Not run against live data.

## Pass 188 - buy and resell any asset

- Listings for vehicles, land or property, goods and businesses, each with its own fields.
- Comparables from sold prices the owner pastes; the middle price and range; the asking price placed against them.
- Resale margin after the price, fees, transport, repairs, holding cost and tax, checked against the owner's minimum.
- A listing left undecided for two weeks is flagged on the weekly list.
- Price parsing keeps thousands separators (12,000 reads as 12,000).
- Tests run here: the resale tests (5 checks), the full npm test chain (exit 0, 811 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Marketplace scraping is not built and will not be built.
- Automatic UK Land Registry feed not built; paste the free data instead.
- Not run against live data.

## Pass 187 - deals: buy side and sell side

- Buy side: find UK companies through Companies House (one key), track them, and see transparent signals and red flags. Owner listings can be added. Prices are checked against the owner's benchmarks. Tracked companies are rechecked weekly; only new red flags are reported.
- Deal stages move one at a time; won only from the offer stage.
- Sell side: a value range from the owner's multiples and a sale-readiness check with what to fix.
- Import check now understands hook array destructuring (a false positive had been reported for a state setter).
- Tests run here: the deals tests (6 checks), the full npm test chain (exit 0, 806 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- UK only; other countries need their own company register.
- Multiples and cost of capital are the owner's assumptions.
- Companies House field names to be verified; not run live.

## Pass 186 - complaints, support waiting, valuable quiet customers

- Complaints and support requests are reply intents. A complaint is recognised from plain wording; quoted old messages do not count.
- A complaint or support request with no answer after two hours raises one alert, shown in the alert list.
- Valuable customers (top fifth by value, at most two) with no activity for 120 days get a re-engagement action on the weekly list.
- An index for the reply-intent query is declared; it must be deployed.
- Tests run here: the support and value tests (3 checks), the full npm test chain (exit 0, 800 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- A full helpdesk is not built; it is treated as operations.
- Buy-side deal sourcing is outside selling and marketing and is not built.
- Not run against live replies.

## Pass 185 - real-time AI phone calls through a voice service

- The gap the hosting could not close is closed by a voice-agent service connected by key (Vapi as the reference). The service keeps calls connected in real time.
- Setup creates the owner's assistant (sales brief, no-prices and no-payments rules) from the owner's key and phone number, with a generated webhook secret.
- Each AI call starts on one tap from the day's call list. Nothing is dialled automatically.
- Finished calls return to the owner's address; the summary and next step are kept on the customer's record.
- The original turn-based voice agent is unchanged (lib/server/voice-agent.js).
- Tests run here: the voice-service tests (4 checks), the full npm test chain (exit 0, 797 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- The service's field names and endpoints follow its documented API as known at writing; verify them before switching on.
- Call costs, phone numbers and the owner's lawful basis for each call are the owner's responsibility.
- Not run against a live service.

## Pass 184 - daily reads narrowed, indexes declared, screens scanned

- The daily pipeline reads open, won and recently lost deals in bounded groups, not every deal. The monthly run still reads all deals on the first of the month.
- firestore.indexes.json and firebase.json declare the composite indexes the narrowed queries need. They must be deployed.
- Static scan of every component: no effect without a dependency list, and no effect depending on a function rebuilt each render.
- Tests run here: the index test (1 check), the full npm test chain (exit 0, 793 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- The indexes must be deployed before the narrowed daily query runs, or Firestore will reject it.
- Screens were checked statically, not in a browser.

## Pass 183 - efficiency

- The daily pipeline checks duplicates against the last 90 days of alerts (1,500 at most), not every alert ever written. Every alert carries a creation date, so nothing recent is missed.
- The start-of-day plan is kept on the owner's settings for 30 minutes. Reopening the app within that time is one read.
- Tests run here: the day-start tests (4 checks), the full npm test chain (exit 0, 792 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- The daily pipeline still reads all open and won deals each run; narrowing that is the next step.
- Screen effect dependencies were not audited line by line.

## Pass 182 - meeting briefs

- Before each confirmed meeting in the next day, a brief from the owner's records: deal and value, open quote and views, unpaid invoices, last call summary and agreed next step.
- Shown with the start-of-day block when the app opens. Nothing is sent.
- Quote records are matched by their customer address.
- Tests run here: the brief tests (2 checks), the full npm test chain (exit 0, 791 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- A brief only knows what is recorded; unsummarised calls do not appear.
- Not run against live data.

## Pass 181 - start of day on open

- The day starts once, by whichever comes first: the nightly job or the first app open that day. The same work runs (pipeline, alerts, digest), and the day is marked started.
- Opening the app shows today's call list (open deals first, then new leads with a number). Each call is one tap; nothing is dialled automatically.
- The call list is filtered by owner in the query, so another owner's records cannot use up the limit.
- Tests run here: the start-of-day tests (3 checks), the full npm test chain (exit 0, 789 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- A day with no open and no nightly run gets its work at the next open or run.
- Not run against live data.

## Pass 180 - TikTok Connect, final scope check

- TikTok Events can be connected by approval: the app finds the first pixel and stores its code and access. No key is pasted.
- Tests run here: the Connect tests (5 checks), the full npm test chain (exit 0, 786 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- LinkedIn Connect and lead forms need LinkedIn partner approval; not built here.
- Not run against live platforms.

## Pass 179 - Connect buttons

- Google Ads and Meta Lead Ads can be connected by approval on the platform's page. No key is pasted.
- The app stores the result for the owner: Google Ads refresh token and account; Meta Page, its token, the app check and a generated verify token.
- The approval state is signed, short-lived, and tied to the owner and the platform.
- Tests run here: the Connect tests (4 checks), the full npm test chain (exit 0, 785 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- TikTok, LinkedIn and Twilio are not Connect-ready here (app approval, or no owner-approval flow).
- Meta Lead Ads needs Meta's app review for accounts other than the app's admins.
- Not run against the live platforms.

## Pass 178 - TikTok and Google purchase conversions

- TikTok CompletePayment events for consented buyers' paid invoices (hashed).
- Google Ads enhanced conversions for consented buyers' paid invoices, sent to the owner's conversion action (GOOGLE_ADS_CONVERSION_ACTION, set under Integrations).
- Each sender runs in the pipeline job, sends each invoice once, and is off without the owner's keys and data-sharing confirmation.
- Tests run here: the TikTok and Google purchase tests (2 checks), the full npm test chain (exit 0, 781 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Not run against live ad platforms. The Google conversion action must be created in Google Ads first.

## Pass 177 - team members join by email on sign-in

- A person invited by email (Account, Team) joins automatically when they open Account signed in with that email. No link needed.
- Matching uses the verified sign-in email only; seat limits and roles are enforced on the server.
- The invite link still works.
- Tests run here: the team sign-in tests (2 checks), the existing team tests, the full npm test chain (exit 0, 779 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Real-time, low-latency phone conversations are not built; AI phone calls are turn-based.
- Not run against live Google sign-in.

## Pass 176 - per-owner lead-form intake

- Each account has its own lead-form address on Integrations. Typeform, Tally, LinkedIn, TikTok, Google Ads and Meta Lead Ads post there.
- Every check uses that owner's keys; server keys are not used, so one owner's keys cannot open another owner's forms.
- A new address stops the old one at once.
- The operator-level receivers still work for existing setups.
- Tests run here: the intake tests (7 checks), the full npm test chain (exit 0, 777 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- LinkedIn and TikTok still take the owner's key in the address.
- Not run against the live form tools.

## Pass 175 - owner keys, and the Google calendar return address

- Newer integrations read the owner's own keys first (saved under Integrations), with the server's keys only as a fallback: Meta sign-up sync and Purchase events, TikTok, Google Ads Customer Match, GA4, Apollo, People Data Labs, and both voice routes.
- The Integrations calendar card shows the exact return address to add in Google Cloud, with a Copy button.
- A Google redirect-address mismatch is named on return, instead of a generic error.
- Tests run here: the calendar redirect tests (2 checks), the updated enrichment-name test, the full npm test chain, and a production Next.js build. The code audit found no undefined names or correctness issues.

Limits, plainly:
- Lead-form webhook receivers still use the operator's server keys (see GAP_STATUS).
- The calendar connection works only when the return address in Google Cloud matches the one shown exactly.

## Pass 174 - tender drafts, Purchase events, visitor voice, waterfall enrichment

- Tender response drafts: paste a tender, get a first draft with placeholders. Nothing is submitted.
- Purchase events to Meta for paid invoices of consented customers (sign-up consent only).
- Voice chat for visitors on the public site, switched on by the owner, rate limited, keyed by the site key.
- Enrichment is a waterfall: Apollo first, then People Data Labs. Either key is enough. The enrichDeals switch no longer requires a specific key.
- Tests run here: the new sales feature tests (5 checks), the updated switch tests, the full npm test chain (exit 0, 768 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Phone-call voice, marketplace listings and tender submission are not built here.
- Google and TikTok purchase conversions are not built yet.
- Nothing has run against live providers.

## Pass 173 - KPI scorecard

- The first-of-month digest opens with a scorecard for last month: leads in, deals opened, lead-to-deal conversion, won and lost, win rate, average won value, and average time to win.
- Months with no data show n/a, not zero.
- Tests run here: the scorecard tests (2 checks), the full npm test chain (exit 0, 763 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

## Pass 172 - one-step automation mode

- Account has a 'Turn on automation' step. One confirmation turns on sending, approves every campaign angle, shares sign-ups with the ad platforms, and enables paid deal enrichment.
- Opt-outs, the suppression list, daily caps and the claim hold still apply. The app cannot verify the owner's right to contact people; the confirmation records that the owner accepts that.
- The campaign-angle check accepts every angle when all angles are approved.
- Tests run here: the automation-mode tests (3 checks), the full npm test chain, and a production Next.js build. The code audit found no undefined names or correctness issues.

## Pass 171 - one-click recommended setup

- Account has an 'Apply recommended setup' button. It switches on the claim hold on drafts and the morning brief, and never changes a choice already made.
- It never turns on sending, data sharing, or paid credits.
- Tests run here: the recommended-setup tests (2 checks), the full npm test chain (exit 0, 758 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

## Pass 170 - cross-sell suggestions

- The weekly action list suggests, for up to three customers, the product that customers who bought one of their products most often also bought (at least two customers must have bought the pair together). Nothing is sent to the customer.
- The Monday review loads product names so the suggestion reads properly.
- Tests run here: the cross-sell tests (2 checks), the action-list tests, the full npm test chain (exit 0, 756 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Built from storefront and buy-link orders only; service customers are not covered.
- A suggestion is a pattern in past purchases, not a forecast.
- Checked by tests, not against live orders.

## Pass 169 - lead enrichment from the uploaded worker, checked against the app

- Compared the uploaded Python worker and enrichment tools with the app. Most of their features already existed in the app.
- Added: Crawl-delay from robots.txt is honoured (capped at ten seconds). A website host that answers 429 or 503 is left alone for its Retry-After (capped at a minute). Several leads on one website reuse one crawl in a run.
- Test chain fixed: three test files had not been running in the npm test chain (crawl politeness, lead-finder speed, and the pass-115 growth tests). All are now included. One stale expectation in the pass-115 test was updated for the chargeCents field added in the foreign-currency work.
- Tests run here: the full npm test chain (exit 0, 754 checks), and a production Next.js build (exit 0).

Limits, plainly:
- Checked by tests, not against live websites or the live map servers.
- The Python command-line menu and run.bat were not carried over; the app's screens and daily run do the same steps.

## Pass 168 - lead finder: fewer timeouts on the free map servers

- Each map-server try now asks two public servers at once and keeps the first good answer, so one slow server no longer costs the whole try.
- Each try waits up to 9 seconds, down from 14 to 18, so a dead server is dropped sooner.
- Answers to identical tile queries are kept in memory for six hours. A resumed or repeated search does not ask the public servers again.
- The lead-finder tests now clear the answer cache between scenarios, and their request-count expectations match the new behaviour.
- Tests run here: the new speed tests (3 checks), the lead-finder suite (23 checks), the full npm test chain (exit 0, 714 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- The cache is in memory: it helps while a server instance stays warm, not across cold starts.
- Very large areas still finish over several searches; the search resumes where it stopped.
- Not run here against the live map servers.

## Pass 167 - follow-up on quotes opened but not answered

- A quote the customer opened, that is still open and has been quiet for three days, raises one alert in the pipeline job.
- The weekly action list includes the same quotes.
- The pipeline job reads only quotes that have been viewed, so the extra read stays small.
- Tests run here: the quote follow-up tests (2 checks), the action list tests, the full npm test chain (exit 0, 714 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- The alert is for you; nothing is sent to the customer.
- Not run here against live quotes.

## Pass 166 - automatic A/B winner

- A/B email tests choose their winner automatically once there are at least 100 test sends per version and the reply-rate difference is statistically clear (two-proportion z-test, 95%).
- The weekly job stores the winner, stops reading the sent-email history once a winner is stored, and the digest says which version won and why.
- The send screen sends the winner to everyone after that, and records those sends as non-test sends.
- Tests run here: the winner tests (4 checks), the full npm test chain (exit 0, 712 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Reply rate is the only measure.
- Winners are per account, not per campaign.
- Nothing has run against live sends.

## Pass 165 - UTM tagging of outbound links

- Every external link in an outbound email gets utm_source, utm_medium and, where given, utm_campaign, so a click can be traced to the email that sent it.
- Our own domain, unsubscribe, manage, pay and similar links, and links already tagged, are left exactly as they were. Nothing changes until the public base URL is set.
- Tests run here: the UTM tests (3 checks), the full npm test chain (exit 0, 708 checks), and a production Next.js build (exit 0). The code audit found no undefined names or correctness issues.

Limits, plainly:
- Email links only, through the single email builder.
- Not run here in an analytics tool.

## Pass 164 - speed to lead, discount-code results, owners and due dates

- New inbound leads with no first reply after an hour get one alert in the pipeline job.
- The first-of-month digest lists each discount code's uses, revenue and discount for last month.
- Each item in the weekly action list names an owner and a due date.
- The pipeline job now reads the inbox each run, to find waiting leads; that is one read per owner per run.
- Tests run here: the sales-signals tests (3 checks), the action-list tests (updated for the owner and due date), the full npm test chain (exit 0, 705 checks), and a production Next.js build (exit 0).

Limits, plainly:
- Speed-to-lead alerts run on the pipeline timetable: daily on Hobby, hourly on Pro.
- Discount results show revenue and discount, not margin, because cost of goods is not recorded.
- Nothing has run against live data.

## Pass 163 - multi-touch attribution and click-to-call

- Multi-touch attribution (lib/multi-touch.js): each won deal's revenue is split across the channels that touched the customer, under linear, U-shaped, first-touch or last-touch rules. The first-of-month digest shows the top channels for the last 12 months.
- An existing attribution module (lib/attribution.js, used by the attribution views) was briefly overwritten during this work. It has been restored from the previous release, and the new code lives in its own module. Nothing that used the original module has changed.
- Click-to-call: the owner's phone rings first; when they answer, the lead is dialled and joined, using the owner's own Twilio account. Phone numbers are checked before anything is dialled.
- Tests run here: the multi-touch tests (4 checks), the click-to-call tests (2 checks), the full npm test chain (exit 0, 702 checks), and a production Next.js build (exit 0).

Limits, plainly:
- Click-to-call needs the owner's Twilio keys and the owner's lawful basis to call each lead.
- Attribution uses the recorded deal source and emails sent; channels without records show as unrecorded.
- Nothing has run against live Twilio or live data.

## Pass 162 - weekly action list and call summaries

- Monday digest: this week's actions from the owner's records (overdue follow-ups and invoices, stalled deals, quotes with no answer).
- Call and meeting summaries: paste a transcript in the CRM; the AI returns a checked summary, next step, due date, objections and sentiment, kept in call notes.
- Tests run here: the ai-automation tests (6 checks), the full npm test chain (exit 0, 696 checks), and a production Next.js build (exit 0).

Limits, plainly:
- Summaries send the transcript to the configured AI provider; the owner should only paste transcripts they may process.
- The action list is read once a week per owner, to keep reads and cost down.
- Nothing has run against a live AI provider or live data.

## Pass 161 - product bundles

- A product can be a bundle of up to 10 other products, listed by SKU with quantities. It is sold at its own price.
- A sale takes stock from each component through the same stock check as any other order. A bundle the stock cannot cover is refused.
- Bundles are set on the Products page, on create and edit. An edit keeps a bundle's contents unless they are changed.
- Code audit on the changed files found no undefined names or correctness issues.
- Tests run here: the bundle tests (5 checks), the full npm test chain (exit 0, 690 checks), and a production Next.js build (exit 0).

Limits, plainly:
- Components must be stock-tracked or unlimited, and must exist and not be archived.
- Bundles cannot contain bundles, and bundle prices are fixed (quantity prices do not apply).
- Nothing has run in a browser.

## Pass 160 - loyalty points

- Owners set a points rate per unit paid (Account). Card payments earn points through the payment webhook, held per customer under a hash of their address, with an atomic increment.
- An invoice can take points off (100 points = 1 unit), checked before the invoice is written and taken off only after it is saved. A redemption that would leave nothing to charge is refused.
- The owner can read a customer's balance through an owner-only route.
- Tests run here: the loyalty rules (3 checks), the full npm test chain (exit 0, 685 checks), and a production Next.js build (exit 0).

Limits, plainly:
- Points are earned on card payments through the webhook only; a payment marked paid by hand does not earn yet.
- Points are not returned if an invoice is voided later.
- Redemption and balances are not on the invoice form or the customers list yet.
- Product bundles are still open.
- Nothing has run in a browser.

## Pass 159 - code audit fixes and fewer reads per owner

- A static check for undefined names, over every page, component and library file, found two real bugs on the Products page: the buy-link currency state was never declared. Both are fixed.
- The pipeline job reads each owner's consent list and suppression list once, and shares them with the Meta, TikTok and Google syncs, instead of reading them three times per owner per run.
- The same check also covers unreachable code, duplicate keys, duplicate declarations, invalid typeof comparisons and assignments to constants. It reports no findings.
- Tests run here: the full npm test chain (exit 0, 682 checks), and a production Next.js build (exit 0).

Limits, plainly:
- The audit tool is not part of the shipped build; it was run once and removed. The page-imports test keeps the most common class of error covered.
- Loyalty points and product bundles are still open.
- Nothing has run in a browser.

## Pass 158 - quantity prices, team quota, paid to date per customer

- Products can have quantity prices (10:90 means 10 or more at 90 each). The basket charges the best one the buyer qualifies for. Set when a product is added.
- Each team member can have a monthly won-value target, set beside their commission in Account. The first-of-month digest shows attainment.
- The customers list shows paid to date for each customer.
- Tests run here: the closing-sales tests (6 checks), the full npm test chain (exit 0, 682 checks), and a production Next.js build (exit 0; its warnings are the missing Firebase variables in this environment).

Limits, plainly:
- Quantity prices are set when a product is added, not edited yet.
- Loyalty points and product bundles are still open.
- Nothing has been run in a browser.

## Pass 157 - sales metrics in the monthly digest

- Quota attainment per salesperson, from a monthly target held in the team settings; shown on the first of the month.
- Pipeline velocity: average days from creation to a win over the last year, shown on the first of the month.
- Customer lifetime value: a helper that totals paid invoices per customer address.
- Tests run here: the sales-metrics tests (3 checks), the full npm test chain, and a production Next.js build (see result).

Limits, plainly:
- No quota field on the Team page yet; no lifetime value column on the Customers page yet.
- Nothing has run live.

## Pass 156 - fix: business page crash (loggedByEmail not defined)

- The business page called loggedByEmail without importing it, so the page failed to load with "ReferenceError: loggedByEmail is not defined". The import is added.
- A new test (tests/page-imports.test.mjs) fails if a page or component calls a camel-case library helper it has not imported. It covers the class of error that caused this.
- Tests run here: the new import check, the full npm test chain (exit 0, 673 checks), and a production Next.js build (exit 0).

Limits, plainly:
- The import check looks at camel-case helper names only, so it does not catch a missing import of a single generic word such as limit or load.
- Nothing has been run in a browser.

## Pass 155 - commission on won deals and the cross-industry framework mapping

- Commission: set a percentage in Account. The monthly digest, on the first of the month, lists each salesperson's deals won last month with their value and commission. Deals with no owner are shown as Unassigned.
- Google Ads Customer Match and browser live voice (Pass 154) are recorded in the register, with their setup steps in DEPLOYMENT_GUIDE.md.
- The register now maps the cross-industry framework's 35 areas and routes to market, with a status for each.
- The register and changelog had been damaged by an escaping error in the Pass 153 write. Both are repaired; the earlier sections are intact.
- Tests run here: the commission tests (3 checks), the full npm test chain, and a production Next.js build.

Limits, plainly:
- Commission is a single percentage on value. No tiers, splits or clawbacks.
- Nothing has run against live deals or a live digest.

## Pass 153 - setup status and a .env template

- `npm run setup:status` lists every optional feature as on, partly set or off, with the keys each one still needs.
- `npm run setup:env` writes .env.example with each key once, grouped by feature.
- The AI agents already in the app are recorded in GAP_STATUS.md. No new agent that sends without review is added.
- Tests run here: the setup-status tests (3 checks), the full npm test chain (exit 0), and a production Next.js build (exit 0).

## Pass 152 - LinkedIn lead-gen forms

- LinkedIn lead-gen submissions are stored in the inbox as new, checked against a key in the webhook URL before anything is read.
- Name, email, phone and company are mapped by question text.
- Tests run here: the closing-pass tests now include the LinkedIn intake (6 checks), the contract test, the full npm test chain (exit 0, 662 checks), and a production Next.js build (exit 0).

Limits, plainly:
- The LinkedIn payload shape follows LinkedIn's lead-gen format as known at writing; verify before switching on.
- Nothing has been run live.

## Pass 151 - closing pass for marketing and sales

- A quote is accepted only with the customer's full name typed in; the name and time are stored as the signature.
- Hours logged against a customer feed the profit view when that customer's deal has no hours typed.
- Apollo enrichment covers inbox leads as well as deals, within the same per-run cap.
- TikTok lead-form submissions are stored in the inbox as new, checked against a key in the webhook URL.
- Autosend sends only drafts whose campaign angle the owner has approved in Account. Behaviour change: until angles are approved, autosend sends nothing.
- Tests run here: the closing-pass tests (5 checks), the full npm test chain (exit 0, 661 checks), and a production Next.js build (exit 0).

Limits, plainly:
- Google Customer Match and real-time voice are not built, and are excluded from this pass.
- The TikTok lead payload follows TikTok's format as known at writing; verify before switching on.
- Nothing has been run live.

## Pass 150 - lead-score negatives and a deep gap check

- A bounced, unsubscribed or complained-about lead scores zero. A lead with no touch for 60 days loses 15 points; for 120 days, 30.
- The register now records a deep check against sales and marketing research. Covered items and the remaining open items are listed there.
- Tests run here: the lead-score tests (3 checks), the full npm test chain (exit 0, 656 checks), and a production Next.js build (exit 0).

Limits, plainly:
- Not run here against a live lead list.

## Pass 149 - Typeform and Tally lead forms

- Typeform and Tally submissions are stored in the inbox as new. The signature is checked against the owner's secret before anything is read; a missing or wrong signature is refused.
- Email, name, company and phone are mapped from the answers by their type and label. A submission without an email is not stored.
- The integration status page lists both connectors with their settings.
- Tests run here: the form connector tests (5 checks), the contract test, the full npm test chain (exit 0, 653 checks), and a production Next.js build (exit 0).

Limits, plainly:
- The mapping depends on answer types and labels; unusual labels may need relabelling.
- One owner per deployment.
- Not run here against live Typeform or Tally.

## Pass 148 - time-entry log per customer

- Hours can be logged against a customer's quote on the Quotes page: 0.05 to 24 hours for one day, not in the future, stored under the owner's time entries.
- Each quote shows its estimate and its logged actual rate, and flags a rate under the owner's hourly rate.
- Tests run here: the time-log tests (5 checks), the quote economics tests (4 checks), the full npm test chain (exit 0, 648 checks), and a production Next.js build (exit 0).

Limits, plainly:
- Hours feed the quote rows only. The profit view still reads one hours figure per customer.
- No per-task or per-project log.
- Not run here in a browser.

## Pass 147 - quote economics (estimated hours and the rate a quote pays)

- A quote can carry optional estimated hours (0 to 10,000). The quote list shows the rate it pays per hour, and flags it when it is below the owner's hourly rate.
- Tests run here: the quote economics and validation tests (4 checks), the full npm test chain (exit 0, 643 checks), and a production Next.js build (exit 0).

Limits, plainly:
- The rate uses the estimate, not logged hours. There is no time-entry log yet.
- Project management, HR records, purchase orders and multi-location stock are not built. They support operations rather than sales in this scope.
- Not run here in a browser.

## Pass 146 - on/off switches for the optional features

- Account has one switch per optional feature. Each runs only when the owner turns it on and the server has its keys.
- Deal enrichment through Apollo (APOLLO_API_KEY): job title and company size on up to 20 deals a run.
- TikTok sign-up events, hashed, with the same data-sharing box as Meta (TIKTOK_PIXEL_CODE, TIKTOK_EVENTS_TOKEN).
- Claim hold, on by default: drafts with price, result, guarantee, urgency or superlative wording are held for review.
- Autosend requires the owner's first-batch approval before it sends anything.
- Tests run here: the switch, claim-check, Apollo and TikTok tests (6 checks), the full npm test chain, and a production Next.js build (see result).

Limits, plainly:
- The claim check is rule-based and never approves a draft.
- The first-batch approval is per account, not per campaign.
- Apollo and TikTok endpoints follow their documentation as known at writing; verify before switching on.
- Google Customer Match is not built: it needs OAuth and developer-token approval.
- Not run here against Apollo, TikTok, or a live autosend.

## Pass 145 - confirmed sign-ups to Meta, hashed

- Each run sends the double opt-in sign-ups confirmed since the last run to Meta as hashed Lead events. Unsubscribed and suppressed addresses are never sent.
- Off unless the server has META_DATASET_ID and META_CAPI_TOKEN, and the owner ticks the data-sharing box in Account (the tick is recorded; the app does not verify the owner's right to share).
- Tests run here: the Meta selection and body tests (3 checks), the full npm test chain (exit 0), and a production Next.js build (exit 0).

Decisions recorded (not built yet): autonomous outreach is off by default, with the owner approving the first batch of each campaign.

Limits, plainly:
- Meta only; Google and TikTok are not built.
- Not run here against Meta.
- Lead events carry no value.

## Pass 144 - bought-list import asks for source and lawful basis

- The lead-finder CSV import asks where the list came from and the lawful basis (business contacts, consent, or an existing contract). Both are required; personal addresses need consent.
- The server checks the same rules on the import route before any row is queued. A blocked import returns the reasons.
- Consent rules moved to lib/consent-rules.js (pure, safe in the browser). Hashing stays in lib/consent-guard.js.
- Tests run here: the full npm test chain and a production Next.js build (see result).

Limits, plainly:
- The check covers the import path. A lead added any other way is not checked.
- The source and basis are kept with the import but not shown back afterwards.
- Automatic hashed audience sync is not built; the signups page already exports hashed audiences for manual upload.
- Not run here in a browser.

## Pass 143 - consent guards for bought lists and hashed sync

- A bought list is stored only when its source and lawful basis are recorded. Personal addresses in a bought list need consent as the basis. Enforced in the lead store.
- Hashed sync helpers: SHA-256 of the trimmed lowercase email; only customers with recorded marketing consent, a consent source and no withdrawal; a Meta Conversions API payload that carries hashes only.
- Tests run here: the consent-guard tests (5 checks), the full npm test chain (exit 0, 630 checks), and a production Next.js build (exit 0).

Limits, plainly:
- No screen collects the source and basis yet, so the bought-list path is not reachable from the app.
- The hashed-sync helpers send nothing. The sender, its schedule and the owner's data-sharing confirmation are not built.
- Autonomous outreach is not built; it awaits your decision on the default.
- Not run here against any platform.

## Pass 142 - Google Ads lead forms and GA4 conversions

- Google Ads lead-form submissions are stored in the inbox as new. The request is checked against a shared key before anything is read. Switched on by two server settings.
- Payments, enquiries, accepted quotes and confirmed bookings are sent to GA4 (Measurement Protocol) as purchase, generate_lead, quote_accepted and booking_confirmed. Only the event name, value and currency are sent: no customer data. Switched on by two server settings.
- The integration status page lists both.
- Tests run here: the new tests (6 checks), the full npm test chain (exit 0, 625 checks), and a production Next.js build (exit 0).

Limits, plainly:
- Google Ads lead forms serve one owner per deployment.
- A failed GA4 send is not retried.
- Not run here against Google or GA4.
- Server-side conversion APIs with hashed customer data (Meta, TikTok, Google Ads) are consciously left out, as audience sync is.

## Pass 141 - Slack, mailbox checks and Meta Lead Ads

- Slack alerts: the owner pastes a Slack incoming-webhook URL in Account. Hot replies, new enquiries, bookings requested or confirmed, payments and accepted quotes are posted there. No server key; a slow Slack gives up after five seconds.
- Mailbox check: with HUNTER_API_KEY set, an address Hunter's verifier calls invalid or disposable is held before a draft is sent. Results are cached 30 days per address. Without the key, or if the check fails, nothing is held.
- Meta Lead Ads: a webhook (/api/integrations/meta-leads) verifies Meta's signature with the app secret, reads the lead through the Graph API, and stores it in the inbox as new. Nothing is sent to the lead. Switched on by five server settings.
- The integration status page lists Meta Lead Ads with its settings.
- Tests run here: the new integration tests (7 checks), the full npm test chain (exit 0, 619 checks), and a production Next.js build (exit 0).

Limits, plainly:
- Meta Lead Ads serves one Page and one owner per deployment.
- The Hunter check uses credits: one per new address a month.
- Slack, Hunter and Meta were not called live here.
- Native Google Sheets, Shopify, HubSpot and Pipedrive sync is not built; outgoing webhooks cover pushing events to them.

## Pass 140 - push alerts and hourly checks, switched by keys and one command

- Push alerts for pipeline alerts. The owner taps "Turn on alerts for this device" on Account; the server sends a notification for new alerts once the three VAPID keys are set. Without them the Account page says it is not set up and nothing is sent.
- The pipeline check is its own job (/api/cron/pipeline). It was inside the daily run; now it runs on whatever timetable is active, and sends the push for new alerts.
- Two timetables: vercel.daily.json (Hobby, the default) and vercel.hourly.json (Pro). `npm run schedule:hourly` / `npm run schedule:daily` copy one into vercel.json; redeploy after.
- The service worker shows the push and opens the CRM on tap.
- The daily digest is sent once per local day (it used to be gated on the pipeline run; now it has its own flag).
- Tests run here: push helpers and the no-keys path (4 checks), the timetables (4 checks), the full npm test chain, and a production Next.js build (see result below).

Limits, plainly:
- Push and hourly checks are off by default; they need keys or Vercel Pro.
- Hourly checks read more data each hour.
- Nothing has been sent through a real push service or to a real device here.
- Not run here: the Account switch in a browser, a live push, and the hourly job on a Pro host.

## Pass 139 - the alert list updates live

- The pipeline alert list on the CRM page now listens to the alerts collection. A new alert appears, and a closed one disappears, without a reload.
- Tests run here: the full npm test chain and a production Next.js build (see the result line below).

Limits, plainly:
- Live only while the CRM page is open. There is no push notification.
- Not run here in a browser.

## Pass 138 - every cron job runs once a day (Vercel Hobby)

- vercel.json had two hourly jobs: newsletters (15 * * * *) and untouched-deal reassignment (40 * * * *). Vercel's Hobby plan allows daily jobs only, so the deploy would fail. Both are now daily: newsletters 09:15 UTC, reassignment 05:40 UTC. The other four jobs were already daily.
- Effects, plainly:
  - Scheduled newsletters start at the first daily run after their time, so up to a day late. A newsletter sends at most about 120 emails a day across all accounts (12 batches of 10 in one run). Before, that was about 120 an hour. Per-account daily limits are unchanged.
  - An untouched new deal moves to another free owner at the first daily run after the hour has passed, so up to a day later.
  - Autosend, drafts and reply checks were already daily and are unchanged.
- A test (tests/cron-schedule.test.mjs) fails if any job is scheduled more often than once a day.
- Comments and DEPLOYMENT_GUIDE.md now describe the daily schedule. A paid plan may run more often; that is optional.
- Known limit, not changed here: the digest and morning brief send only when the owner's local hour is between 6 and 22 at the daily run (05:30 UTC). For owners far west of UTC, the daily run falls outside that window and those emails are skipped that day.
- Tests run here: the cron schedule test, the full npm test chain (exit 0), and a production Next.js build (exit 0).

## Pass 137 - alert list, editable thresholds, monthly summary

- The CRM page lists open pipeline alerts with their reason. The owner marks each done. Marking done closes the alert only; the deal is not changed.
- Stall thresholds per stage are set on the Account page as "proposal 7, negotiation 14". Only open stages and whole days from 1 to 180 are kept; blank keeps the defaults.
- On the first day of each month, the owner's digest adds last month's won and lost counts, win rate, and the most common reasons lost.
- Tests run here: the threshold parsing, the monthly summary and digest (3 new groups of checks), the full npm test chain (exit 0, 604 checks), and a production Next.js build (exit 0). The build prints Firebase environment warnings because the build environment has no Firebase variables; it still completes.

Limits, plainly:
- The alert list loads when the CRM page opens; it does not update live.
- Marking done does not change the deal.
- The monthly summary is in the digest only, not on screen.
- Not run here: the CRM page in a browser, the digest arriving in an inbox, and the daily run.

## Pass 136 - pipeline alerts, renewals and booking reminders

- Each day, from the owner's own deals: an open deal that has sat in its stage past the stage's threshold gets one alert per stage entry; a lost deal for a revisitable reason gets one suggestion 90 days after it was lost; a subscription renewing within 14 days gets one alert.
- Alerts are stored in their own collection. They never enter the follow-up queue, which drafts and sends customer email. Nothing is sent to a customer for an alert.
- The owner gets one digest a day, only in the morning-brief window and under the same switch.
- A confirmed booking starting within two days gets one reminder to the customer, from the owner's Gmail, with the manage link when one can be made. Reminders are sent in the send window and recorded on the booking, so each is sent once.
- Tests run here: the new pipeline tests (9 checks), the full npm test chain (exit 0, 600+ checks), and a production Next.js build (exit 0).

Limits, plainly:
- Thresholds are fixed defaults. There is no in-app alert list yet; alerts appear in the digest.
- The digest is daily, not instant.
- The booking reminder reaches a customer who has unsubscribed from marketing, because it is part of a booking they made.
- Not run here: live Gmail, the daily run, and the digest arriving in an inbox.

## Pass 135 - bookings, automatic invoices and deal currency

- A deal has a charge currency, chosen in the CRM table beside its value (only the currencies the owner has saved rates for).
- Subscriptions and won-deal invoices are charged in the deal's currency at the owner's rate on the day they are made. The daily email for these invoices states the charge currency and amount, and the fixed rate.
- A booking that takes payment at booking is charged in the currency the customer picks on the public booking page. The booking request refuses a currency the owner does not offer.
- The owner's buy-link form on Products offers the saved currencies.
- A won deal whose currency has been removed from the saved rates is not invoiced. It is not invoiced in the wrong currency.
- Tests run here: the new automatic-invoice checks (3 more), the full npm test chain (exit 0, 592 checks), and a production Next.js build (exit 0), which compiles the changed screens.

Limits, plainly:
- Quotes made before this release keep their old free-text currency label; their amounts are not converted.
- A won deal whose currency has been removed is skipped until the owner re-offers it or changes the deal.
- The CRM, Products, booking and public pages have not been run in a browser. Stripe, email and the booking calendar have not been run live.

## Pass 134 - sales charged in another currency

- Quotes, storefront orders and buy links can be charged in a saved currency. The rate comes from the owner's saved rates on the server and is fixed when the sale is made. The public page offers the owner's currencies with an approximate amount; the order confirmation says what was charged.
- Quotes are priced in the business currency. The quote email, the follow-up, and the customer's quote page show the charge currency at the quote's fixed rate. Milestone and adjustment invoices take the quote's charge currency and rate.
- The owner's quote form offers the saved currencies in place of the free-text currency code. A quote made with an unsaved currency is refused with a message.
- Tests run here: the new sales test (8 checks) and the full npm test chain (exit 0).

Limits, plainly:
- Bookings that take payment at booking, and automatic invoices (subscriptions and won deals), stay in the business currency.
- Quotes made before this release keep their old free-text currency label and their amounts are not converted.
- The buy link can be charged in another currency through the API; the owner's buy-link button has no currency choice yet.
- The public page and the Quotes page have not been run in a browser. Stripe and email have not been run live.

## Pass 133 - invoices charged in another currency

- On the Billing page the owner can charge an invoice in any currency they have a saved rate for (Account page). The server takes the rate from the saved rates, never from the browser, and fixes it on the invoice when issued; the charge total (tax included) is stored with it.
- Stripe checkout charges the amount still owed in the charge currency. The payment webhook checks the currency, converts the charge back to the business currency at the fixed rate, and settles the books in the business currency (a charge equal to what is owed settles it exactly, so no cent is left open).
- Card refunds of a foreign payment go to Stripe in the charge currency, at the fixed rate. Refund capacity is still checked in the business currency.
- The invoice email, overdue reminders and the statement line show the charge currency and amount. The ledger keeps business-currency totals and adds the charge currency and total columns. Discount codes are refused on foreign invoices.
- Test-suite fixes made along the way: the edge public-route list in tests/saas.test.mjs was out of date (four routes added in Passes 124-130 were not listed), and the nine routes that resolve their owner without a session (OAuth callbacks with signed state, cron with its secret, storefront with its key, shipment webhook, signed statement link) are now named in the static route contract with their proof. Those checks were failing in the uploaded v131 too.
- Tests run here: the new foreign-invoice test (13 checks), the full npm test chain (exit 0). The dependencies were installed in the build environment for this run.

Limits, plainly:
- Only invoices created on the Billing page can be charged in another currency. Storefront orders, quotes and milestones, bookings, buy links, and automatic invoices (subscriptions and won deals) stay in the business currency.
- The rate is the owner's, fixed at issue; the app does not fetch rates and does not update an issued invoice.
- Manual payments are recorded in the business currency: the owner enters the equivalent.
- Realised FX gains and losses are not booked. The bank may add a conversion charge, so the amount received can differ from the books.
- Stripe must accept the currency for the owner's account. Checkout fails cleanly if it does not.
- Not run here: live Stripe, live email, and the Billing page in a browser.

## Pass 132 - approximate amounts in other currencies

- The owner types up to five indicative rates on the Account page (for example "EUR 0.92": how many euros for 1 unit of the business currency). The rates date is recorded when they change.
- Invoice emails (the send button and the automatic email), overdue payment reminders and storefront order nudges show the approximate amount beside the amount, with a sentence saying the figures are indicative, when the rates were set, and that payment is in the business currency only.
- Tests run here: the rate parsing (business currency, repeats, bad rates and the five-currency cap dropped), the rounding and listing, the sentence wording, and the three email builders with and without rates. Existing billing, invoice-tax, reminder, accounting-export, owner-report and release-file tests still pass. The import checker passes across all source files. Not run here: Gmail, Stripe, Firestore, the nightly run, and the Account page in a browser.

Limits, plainly:
- The app never fetches exchange rates. The owner types them and must update them; the rates date shows how old they are.
- The customer's bank sets the exact amount. Figures are shown as an approximation only.
- Nothing is charged, invoiced, stored or reported in a second currency. Stripe charges the business currency; the ledger, statements, receipts and the public page show no approximate amounts.

Still open: invoicing, charging and reconciling in a foreign currency (needs a currency on every invoice, payment and ledger row, and a conversion rule for reports); tax by destination (for the owner's accountant).

## Pass 131 - buying-signal feed alerts

- The owner adds up to five public RSS or Atom feeds. New items become alerts, tagged by keyword (tender, planning, hiring, funding, new business, or other). The alerts show on the Integrations page, newest first, capped at 100. Feeds are read nightly with the same safe reader the deal watch uses.
- Tests run here: the tagging rules (a plain item stays untagged), that only unseen items become alerts (including repeats inside one batch, a bug the test found and fixed in this pass), and the newest-first cap. Not run here: live feeds, the nightly run, and the page in a browser.

Limits, plainly:
- Tags come from keywords and can be wrong. They describe the item, not the company's intent.
- Alerts do not identify the company behind an item or contact anyone. Turning an alert into a lead is the owner's decision.
- No alert emails: they are seen on the Integrations page.
- Feeds must publish RSS or Atom. Many job boards and planning portals do not; the owner must find a feed for each source.

Still open: currency conversion (invoices, prices, the ledger and the statement are all in one currency; supporting several needs a currency on every price, invoice and report, and a rate source the owner trusts).
Left out by decision: real-time voice agents and autonomous outreach that contacts people without review.

## Pass 130 - shipping labels and carrier tracking

- On a paid storefront order, the owner presses "Buy the cheapest label". The weight is taken from the products on the order (an option's own weight when it has one). The carrier label is bought through the owner's own EasyPost account. The parcel is recorded on the order with its label link and tracking number, and the customer is emailed the tracking link.
- Carrier status comes back by webhook. The webhook does not trust its own body: it reads the tracker back from EasyPost with the owner's key before updating the parcel. Delivered parcels are reported to the customer once.
- International parcels get a customs declaration from the order's lines and their unit prices.
- Tests run here: the address rules (including the country bug found and fixed in this pass), the order weight with options and unweighed items, the cheapest-rate choice, the customs lines, and the status map. The import checker passes across all source files. Not run here: the EasyPost calls, labels, the webhook delivery, Firestore, and the mail.

Limits, plainly:
- Each label is paid from the owner's EasyPost account at the moment of the press. The app cannot undo a label once it is bought.
- Customs codes (HS) are not generated. Some carriers require them for international parcels. The owner must check the declaration before buying.
- The export declaration uses fixed codes for low-value goods. Other goods, and high-value shipments, may need different declarations.
- Currency is the EasyPost account's currency, not the shop's.
- No return labels, no insurance, no multi-parcel split of one order.
- The customer's address is the free text from the order, so the owner checks it on the form.
- If a label is bought but cannot be recorded on the order, the owner is shown the label link and must record the parcel by hand.

Still open: currency conversion; buying signals beyond Companies House (job postings, planning applications, tenders).
Left out by decision: real-time voice agents and autonomous outreach.

## Pass 129 - Outlook / Microsoft 365 calendar write-back

- The owner can connect Outlook or Microsoft 365, with calendar permission only. Confirmed bookings are added as events; cancelled, declined or moved bookings lose their event. Google and Outlook are kept separately, so one booking can appear on both calendars, each with its own event.
- The booking sync now runs for every connected calendar. A failure on one never blocks the booking or the other calendar.
- Tests run here: the Outlook event shape (subject, UTC times, busy), and the per-calendar create, keep and remove rules. Not run here: Microsoft's consent screen, Graph, token rotation, and Firestore.

Limits, plainly:
- The Microsoft app registration and the redirect address must be set up on the server first.
- Disconnecting removes the app's copy of the token. Microsoft keeps its own record of the grant until the owner removes it under "My apps".
- Same limits as Google: first name only, no two-way sync, and a change made directly in the calendar is not pushed back.

Still open: shipping labels and carrier status; currency conversion; buying signals beyond Companies House (job postings, planning applications, tenders).
Left out by decision: real-time voice agents and autonomous outreach.

## Pass 128 - Google Calendar write-back for bookings

- The owner can connect Google Calendar, with calendar permission only. A confirmed booking is added to the calendar as an event, with the service name and the customer's first name. A cancelled, declined or moved booking loses its event, so the calendar matches the bookings.
- Hooks: payment confirms a booking, the owner confirms, cancels or declines it, and the customer cancels or moves it. A booking is never given two events.
- The connection is stored encrypted, like the Gmail connection, and can be disconnected at any time.
- Tests run here: the rules for when an event is created, removed, or left alone, and the event content (service and first name only; no email or phone). Not run here: Google's consent screen, the calendar API, the redirect address registration, and Firestore.

Limits, plainly:
- Google treats calendar write access as a sensitive permission. Until Google has reviewed the app, consent lapses after seven days for apps in testing, and the owner must connect again.
- Only the customer's first name goes on the calendar.
- A change made directly in the calendar is not pushed back into the app.
- An event added before a booking changes outside these routes (for example a booking edited on another system) is not updated.
- If the event could not be written (for example the connection has lapsed), the booking is still confirmed and the owner is not told by this feature; check the Integrations page.

Still open: Outlook calendar writing; shipping labels and carrier status; currency conversion; buying signals beyond Companies House (job postings, planning applications, tenders).
Left out by decision: real-time voice agents and autonomous outreach.

## Pass 127 - stock for hand-made invoices; gift cards

- Hand-made invoices can take a product (or option) and a quantity off the shelf. The stock is taken in one transaction and refused if the shelf cannot cover it. The stock is kept in its own field, so the release that returns stock from unpaid storefront orders never touches it. Cancelling an unpaid hand-made invoice that took stock returns it once.
- Gift cards: a product flagged as a gift card gives the buyer held store credit equal to its value when a storefront order is paid, applied to their next invoice. It is issued once per order in the daily run. The ledger leaves gift credit out so the sale is not counted twice.
- Tests run here: targeted checks of the stock-line rules, the hand-made sale rules, and the gift-card rules. Not run here: Firestore, the transactions, the daily run, and the Billing form in a browser.

Limits, plainly:
- A paid hand-made invoice keeps its stock taken. Put it back with a stock adjustment.
- Only one product line appears on the Billing form. The API accepts up to ten.
- Gift credit is issued in the daily run, up to a day after payment.
- Gift credit goes to the buyer's email. The app has no recipient field.
- Gift sales are revenue on the invoice. Whether they should be deferred is a question for the owner's accountant.

Still open, and not finished in this pass: shipping labels and carrier status; Google and Outlook calendar write-back; currency conversion; buying signals beyond Companies House (job postings, planning applications, tenders).
Left out by decision: real-time voice agents and autonomous outreach.

## Pass 126 - abandoned-basket reminder; register corrected for ad spend

- Abandoned-basket reminder. A customer who asked for their basket by email, and has not ordered from that address within 1 to 3 days, gets one reminder with a fresh link to the same basket. The link is made from the basket's items and the storefront key the basket was saved from. No reminder after an order, a block (opt-out) is respected, and the owner's key is re-checked before anything is sent. A reminder is never reminded about in turn. The reminder goes out in the owner's send window, with the same send rules as other daily emails.
- Erasure: basket records are on the erasure scan list.
- Register correction: the Google Ads spend import was already built (read-only monthly import of Meta and Google Ads spend). The register listed it as not built. It is now listed as built, with Google's developer-token approval as the only outside step.
- Tests run here: targeted checks of the reminder rules (time window, unreminded, linkable, not a reminder, an order after saving cancels it, an earlier or non-storefront order does not, wording without false urgency). Not run here: Firestore, the mail send, the key re-check against live data, and the daily run.

Limits, plainly:
- The storefront key is stored on each basket record so a reminder can link back. The key already appears in every public-page URL; it is kept server side only. If the owner revokes the key, reminders stop.
- One reminder per basket. A customer who orders later from a different address is not connected to the basket.
- Reminders need the site's public address to be set (https). Without it, none are sent.

Still not built: discovery from other buying signals (job postings, planning applications, tenders); shipping labels and carrier status; Google and Outlook calendar write-back; stock taken for invoices made by hand; gift cards; currency conversion. Real-time voice and autonomous outreach remain left out by decision.

## Pass 125 - buying signals (newly registered companies), back-in-stock requests, erasure covers the new records

- Buying signals. Each night, companies newly registered at Companies House in the owner's SIC codes are found (optional area, look-back of 1 to 30 days). Each company is matched to a domain only when that domain's homepage carries the company's name in its title or main heading; otherwise it is not used. Confirmed domains go into the contact lookup (the owner's Hunter key), which puts a confident contact into the Lead Inbox. Nothing is sent. Each company is handled once, and at most 25 homepage checks run per owner per night.
- Settings: a "Newly registered companies" card on the Integrations page, with the Companies House key stored like the other keys (free, from the Companies House developer hub).
- Contact lookup is now one nightly phase for every owner with either the finder or signals switched on, so signal-only owners get contacts too.
- Back in stock. On a sold-out item or option, a visitor can ask once to be told when it can be ordered again. The request is stored with their address; the daily run sends one email when the item is orderable and marks it notified. Requests are rate limited and answered the same way whether or not the address is new.
- Erasure: the two new places that hold an email (restock requests and the contact-lookup queue) are on the erasure scan list.
- Tests run here: targeted checks with fake network responses: settings validation, company name to domain candidates, homepage matching (a matching page, a different company, a generic page), register parsing, the register request (key and filters), and back-in-stock timing. Not run here: the real Companies House service, real company websites, Hunter, Firestore, the mail send, and the cron.

Limits, plainly:
- Companies House gives no website or email. A company whose homepage does not carry its registered name is not contacted. Trading names that differ from the registered name will be missed.
- The domain check reads one homepage per candidate domain. It is a name check, not proof of ownership.
- A signal needs a Companies House key and a Hunter key. Without either, nothing is contacted.
- Back-in-stock sends one email per request, to the address the customer gave. It has no separate unsubscribe link; a customer who replies is handled by the owner.

Still not built: discovery from other signal sources (job postings, planning applications, tenders), shipping labels and carrier status, Google and Outlook calendar write-back, stock taken for invoices made by hand, gift cards, abandoned-basket reminders, currency conversion, live Google Ads import. Real-time voice and autonomous outreach remain left out by decision.

## Pass 124 - prospecting: contact recovery and deliverability checks

- Contact recovery. Good businesses that the lead finder reads but finds no email, phone or WhatsApp for were dropped and never revisited. They are now queued by domain. Each night, up to 20 domains per owner (highest score first) are looked up with the owner's own contact-lookup key (Hunter). A contact at Hunter confidence 70 or more becomes a normal Lead Inbox lead (status "new", nothing sent), with a named person filled in when Hunter has one. A domain is looked up once; its result is kept.
- Deliverability check before every send. Autosend and the review window hold a draft whose domain cannot receive mail (no MX and no address record). The result is cached for 30 days per domain. A temporary DNS failure never holds a send.
- Nightly cron: the contact recovery step runs for each owner with the finder switched on, after the finder itself.
- Tests run here: targeted checks of the recovery rules (domain extraction, which businesses are queued, the confidence bar, naming a person when confidence is close, and that the recovered lead passes the inbox sanitizer). Not run here: the DNS lookup against live domains, Hunter itself, Firestore, and the cron.

Limits, plainly:
- Contact recovery needs a Hunter key. Without one, queued businesses wait and nothing is looked up.
- It finds contacts Hunter already holds for the domain. A business with no published contact at all may still have none.
- The deliverability check cannot tell whether a mailbox exists, only whether the domain takes mail. It is not a substitute for a bounce list.

Still not built: discovery from buying signals (new company registrations, job postings, planning applications, tenders). The app searches OpenStreetMap by business type, and watches RSS or Atom feeds for listings. A signal source needs the owner to choose it, because each one has its own terms and some need a key. Autonomous AI agents that contact people without review remain left out by design; the AI drafts for review and the existing autosend stay the path to sending.

## Pass 123 - products can be edited, options get their own price and weight, returns and refunds made complete

- Products can now be edited, taken off the public page and put back on it. Before this, a product's price, name or options could not be changed after it was added (the stock panel pointed to an edit that did not exist). An edit never changes stock: stock moves only through the stock panel, checkout, returns and cancellations, inside one transaction, so an edit cannot overwrite a sale.
- Options: each option can have its own price and its own weight for postage (blank = the product's). The option id is editable on the Products page; keeping the id when renaming keeps old orders and returns matched. An option that still has stock cannot be removed by an edit.
- Archived products are hidden from the public page and cannot be ordered.
- Low-stock alert on the Products page (products and options with 3 or fewer left).
- Returns: fixed a bug in the return form. Quantities were stored under the product id but read under product and option, so every return failed with "Choose at least one line". Returns now work.
- Returns on orders placed before Pass 119: the owner picks the line and names the product whose stock goes back (or none).
- Card refunds on payments made before Pass 120: the owner enters the Stripe payment ID (pi_...). The server asks Stripe for the payment and accepts it only if it succeeded and belongs to the order (tagged to it, or its amount equals what the order paid).
- Refunds paid by hand: "Mark paid by hand" clears the amount owed, keeps a dated record, and shows on the customer statement.
- Accounting export (ledger): card refunds and refunds paid by hand are rows, split into net and tax in the same ratio as the invoice.
- Review request: one fixed-wording email a week after a storefront order's last parcel (or after payment for collected orders), using the review link already in business settings. Not sent without a link, not for orders with a return, not for orders older than 60 days.
- Tests run here: a targeted check of the new logic (edit keeps stock, option price and weight, legacy returns, Stripe payment matching, review timing, archived products hidden). JSX in the three changed screens parsed. Not run here: the full test suite, the production build, and anything that calls Firebase, Stripe or Gmail.

Limits, plainly:
- A return on an older order restocks only the product the owner names. Nothing is guessed.
- Stripe payment IDs: an older payment is matched by its amount when Stripe holds no order tag, so an order whose exact amount was paid by two other payments could still be ambiguous. The owner sees the match before refunding.
- Refunds paid by hand are recorded, not verified against the bank.
- Review requests are one email per order; the app does not chase, collect or write reviews.

Still not built: shipping labels and carrier status; Google or Outlook calendar write-back; stock taken for invoices made by hand; gift cards; back-in-stock alerts; abandoned-basket reminders for customers who gave an email; autonomous AI agents that contact customers (kept approval-gated by design).

## Pass 122 - product options (sizes, colours) with their own stock
- Products can have up to 30 options. Each option has its own stock count (blank = not tracked). Options are entered on the Products page as "name, stock", one per line; an option's id is its name in lower case with dashes, and duplicate names are refused.
- Storefront: one row per option; a basket line carries the option id; the price is the product's price for every option; sold-out is shown per option.
- Checkout takes stock per option inside one transaction; returns put stock back per option; the stock panel counts each option; the emailed basket keeps option ids.
- Returns: lines are matched by product and option. An option that has been renamed cannot be matched on older orders.
- Tests: tests/growth-pass115.test.mjs now 34 checks (option stock, duplicate names, option returns, option holds). Run here: growth (34), sales-ops (19), owners (6), release-files (5), import resolution (0 problems), and a parse of every changed file. Not run: tests that need firebase, stripe, next, twilio or redis.
- Limits, plainly: one price for all options; no per-option weight, so postage uses the product weight; renaming an option changes its id; the product safety buffer does not apply to options; nothing has been run against live services.

## Pass 121 - card refunds on the customer statement
- The customer statement lists each card refund as a debit ("Refund to card") and includes it in the outstanding balance and a refunded total.
- Tests: tests/growth-pass115.test.mjs now 33 checks. Run here: growth (33), sales-ops (19), owners (6), import resolution (0 problems). Not run here: the statement route itself (needs firebase).
- Limits: refunds made by hand (outside the card refund button) are not on the statement; the accounting export does not include refunds.

## Pass 120 - card refunds through the owner's Stripe account
- Card refunds: a recorded refund owed to a customer can be refunded to their card. The payment's Stripe reference is now stored when a payment is applied (onlinePaymentIntents). The refund is planned from that record (never more than is owed, never more than the payment still holds, one payment at a time), a pending flag blocks a second refund running at once, Stripe is called with the owner's own key and an idempotency key, and the refund is recorded only after Stripe confirms it.
- Orders panel: a "Refund to the customer's card" button where a refund is owed and a payment reference is stored.
- Tests: tests/growth-pass115.test.mjs now 32 checks (card refund planning). Run here: growth (32), owners, sales-ops, release-files, import resolution (0 problems), and a parse of every changed file. The Stripe call itself has not been run.
- Limits, plainly: payments before this release cannot be refunded here; refunds are not yet on the statement or accounting export; if Stripe makes a refund but the record cannot be saved, the response says so and the owner notes it by hand; nothing has been run against Stripe.

## Pass 119 - returns on storefront orders, cancelling unpaid orders, tax rates by country
- Returns: the owner records which lines of a paid storefront order come back, with a quantity per line (never more than was bought, and never a line returned twice). Sellable stock goes back for products that track stock, in the same transaction as the record. Refund or store credit; an optional restocking fee of 0 to 50%. Store credit is a held credit note for the customer, applied to their next invoice. A refund is recorded as owed (the app moves no money).
- Cancel: an unpaid storefront order can be voided; any stock it held goes back once. A paid order is returned instead.
- Tax by country: the owner enters a rate per country on the landing page; storefront orders to that country use it; others use the business default. The app does not decide registrations, thresholds, OSS/IOSS or reduced rates.
- Basket lines now carry product ids (needed for returns). Orders placed before this release do not, so the return form cannot match their lines.
- Fixed in review: a return does not add stock back when the order's hold had already lapsed (that stock had been returned when the hold lapsed).
- Tests: tests/growth-pass115.test.mjs now 31 checks (returns, caps, double return, store credit, tax rates). Run here: growth (31), sales-ops (19), owners (6), release-files (5), import resolution (0 problems), and a parse of every changed file. Not run: tests that need firebase, stripe, next, twilio or redis.
- Limits, plainly: no money moves; no automatic card refunds; orders from before this release cannot be returned through the form; tax rates are owner-entered and country codes are checked only for format; nothing has been run against live services.

## Pass 118 - postage by weight and country, several parcels, stock adjustments, weight on products
- Postage bands: the owner sets bands (max kg, fee, optional countries) on the landing page. The checkout works out the fee on the server from the weight of the order and the customer's country (two letters). Bands are tried cheapest first; an order is refused, not guessed, when no band fits: the country has no band, the order is too heavy, or a product has no weight. With no bands, the flat postage charge still applies.
- Product weight in kg (Products page), used for postage. Blank means not weighed; a weighed quote refuses a basket that holds an unweighed product.
- Several parcels: each storefront parcel is recorded in order (up to 20), listed on the order, and emailed to the customer, numbered when there is more than one. The parcel is recorded in a transaction.
- Stock adjustments: a panel on the Products page adds stock that arrived or takes off stock sold elsewhere, with a note. Stock never goes below zero. No invoice is created.
- Public page: asks for the country when posting, shows the postage bands in words, and says postage is added at checkout when bands are used.
- Changed: the ship route records each parcel inside a transaction, keeps the full parcel list on the invoice, and still stores the latest carrier and tracking number on the invoice for the existing screens.
- Tests: tests/growth-pass115.test.mjs now 27 checks (postage rules, weight, parcel wording). Run here: growth (27), sales-ops (19), owners (6), release-files (5), import resolution (0 problems), and a parse of every changed file. Not run here: any test that needs firebase, stripe, next, twilio or redis.
- Limits, plainly: postage weights are the owner's figures; no tax by destination; no currency conversion; no label or carrier status; no variants; manual invoices do not reduce stock; stock adjustments do not create invoices; nothing has been run against live services.

## Pass 117 - stock on hand, postage and shipment tracking, company-size routing, find-my-orders, basket by email, calendar links
- Stock on hand: a product can track stock on hand, a safety buffer kept back from the website, and a most-per-order limit (Products page). A basket takes its stock in one transaction. Sold-out products show as sold out; exact counts are never public. Stock taken by an order that is still unpaid after two days goes back; the invoice stays open.
- Postage: the owner sets one postage charge per order (landing page). A customer chooses collect or post; posting needs an address and adds the charge to the invoice.
- Shipment tracking: on the Products page, paid storefront orders take carrier, tracking number, optional https tracking link and expected delivery. The customer is emailed from the owner's Gmail. Labels are not printed.
- Company-size routing: optional size band on the enquiry form; owners list the bands they take; enquiries route to a free owner who lists the band, after the territory and industry rules.
- Find my orders: a public-page form emails a signed link to the orders and invoices of an address that has them. The answer is the same whether or not the address has orders. Three links an hour per address.
- Basket by email: a link restores a basket on another device, expires in seven days, and only a hash of its secret is stored.
- Booking confirmations carry add-to-Google-Calendar and add-to-Outlook links. The app writes nothing into calendars.
- New public routes: /api/shop/orders-link, /api/shop/basket-link, /api/shop/basket (each proved by the account's public key); the public-route contract test lists them.
- Fixed: the sales-ops test expected the old public-product shape; it now expects id, soldOut and maxPerOrder.
- GAP_STATUS.md rewritten: every item sits under exactly one status word.
- Tests: tests/growth-pass115.test.mjs now 24 checks. Run here: sales-ops (19), owners (6), release-files (5), growth (24), import resolution (0 problems), and a parse of every changed file. Not run here (packages missing from this environment): saas, routes-e2e, proxy, team-gate, money-path and the others that need firebase, stripe, next, twilio or redis. The public-route list was checked against the contract test by parsing both (35 routes, identical).
- Limits, plainly: no live run of any change; stock holds lapse after two days but a late payment is still accepted; postage is flat; tracking is entered by hand; find-my-orders and basket links depend on the owner's Gmail and an https public address; company size is what the buyer says.

## Pass 116 - untouched hand-offs move once, receipts for paid storefront orders, basket kept on the device
- Untouched hand-offs: a new deal with no update or recorded touch for an hour after it was handed to an owner moves once to another free owner, by the same rule as arrivals (territory, industry, least loaded). Runs hourly through the new cron route /api/cron/reassign (listed in vercel.json; host cron must call it with CRON_SECRET). Never moves a deal already moved, a deal whose touch time is unknown, or to an owner who is away or full. Up to 50 accounts and 1,000 candidate deals per run.
- Receipts: a paid storefront order gets one receipt from the owner's mail in the next daily run, listing the invoice, the amount and the lines bought. Only orders paid in the last 7 days; older paid orders are not mailed later.
- Basket: the quantities on the public page stay on the device between visits, cleared after a successful order. Name and email are never stored on the device.
- Gap register (GAP_STATUS.md) updated: these three move to Built with their limits; stock deduction is kept as not built, with the reason stated.
- Tests: tests/growth-pass115.test.mjs now 16 checks (reroute rules and receipt rules added); the SaaS contract test includes the new cron route, which is proved by its CRON_SECRET gate. Import resolution: no problems. Changed files parse. The shipped-file list is regenerated.
- Limits, plainly: the hourly and daily jobs have not run on a host; "touched" depends on the app recording touches, so a send the app does not record as a touch will not stop a move; no email goes to the new owner.

## Pass 115 - industry routing, cohorts, testimonials, storefront basket, unpaid-order nudge
- Industry routing: owners list the industries they take (on the Owners page). A deal whose industry contains one of those words goes to a free owner who lists it; otherwise the usual rule applies (territory, then least loaded). Arrivals with an industry on the deal use the same rule. Enquiries carry no industry and route as before.
- Repeat-buying cohorts on the business page: paid invoices grouped by the month of each customer's first payment, with repeat rates at 1, 3, 6 and 12 months. A rate shows only once every customer in that month has had the full window; cohorts under 5 are flagged.
- Testimonials on the public page: entered by the owner, and saved and shown only when the owner ticks that the customer agreed in writing. A text-only save of the landing page no longer wipes them.
- Storefront: the public page has an order form for public products. Guest checkout (name and email). Prices come from the server's product list. One invoice per order, with any held credit applied and a card pay link when card payment is set up. Rate limit 10 orders per 15 minutes per address; a filled honeypot is answered without recording anything. Not in a basket: discount codes, stock deduction, shipping, a pipeline deal, a receipt email.
- Unpaid storefront orders: one fixed-wording nudge a day after the order if still unpaid and not yet overdue, sent from the owner's mail with the pay link. Needs card payment set up. Overdue invoices stay with the existing reminder routine.
- New file GAP_STATUS.md: every business gap in one place, sorted into Built, Not built, Consciously left out, Not applicable now, and Outside what code can settle. Compliance-based external integrations are listed as consciously left out, by instruction.
- Tests: tests/growth-pass115.test.mjs (10 checks, no packages needed); the SaaS contract test now includes the new public checkout route with its key proof; the shipped-file list is regenerated. Import resolution: no problems. Changed files parse. The full test suite and the production build were not run here (no packages installed in this environment); nothing has been run against live services.
- Limits, plainly: none of the new features has been run against a live Stripe, Gmail or Firestore; cohort rates are only as good as the invoice data (paid invoices, matched by email); the storefront does not email a receipt and does not reduce stock.

## Pass 114 - Lead Inbox, assignment on arrival, WhatsApp outreach recorded
- Lead Inbox no longer loses leads. Handing leads to the sender used to mark them as loaded on the server straight away, so a lead vanished from the inbox if the hand-off was lost (another device, a closed tab, or a hand-off older than six hours). Now a lead leaves the inbox only when its email is actually sent.
- Lead Inbox imports are create-only inside a transaction. Two imports running at once can no longer overwrite a lead that was already loaded and reset it to "new".
- WhatsApp contacts are recorded in one list, users/{uid}/whatsapp_sent, the same list the official WhatsApp send route writes to. Conversations opened from the follow-up and reminder screens are logged there too (phone digits and the address, if known; never the message). Lead Inbox imports skip anyone already messaged on WhatsApp.
- A new enquiry or booking is assigned to an owner straight away when there is a team (two or more owners), using the same rule as the Owners page. A deal that already has an owner is left alone. Before this, assignment ran only when someone opened the Owners page.
- Checked and left as they are: the morning brief already lists follow-ups that are due and replies with no deal yet.
- Limits: the WhatsApp log accepts 120 records a minute per account, and phone numbers of 6 to 15 digits. Assignment considers the 2,000 most recent open deals when counting each owner's load.
- Not covered: WhatsApp conversations opened in other places than the three dashboard screens are not yet recorded; the end-to-end test does not run the Lead Inbox import (it needs the live transaction).
- Tests: the full suite passes, including tests/lead-pipeline.test.mjs. The production build compiles.

## Pass 113 - inbound to outbound hand-off (enquiry and booking)
- An enquiry or booking request now stops any scheduled cold follow-up to that address. Previously, a person who had just asked to talk could still receive a sales follow-up from the outbound sequence.
- The buyer's country is saved on the deal. It was previously written in the wrong place, so an enquiry with a country was saved without it, and the draft-complete flag was not recorded (which also affected the daily draft cap).
- The owner is notified of each new enquiry through the webhook "enquiry.received" (for Zapier, Slack, or a CRM), so a new lead is not left until the next day.
- Limits: the stop check looks at up to 50 sent-email records per address, and only at the moment of enquiry.
- Tests: the full suite passes, including tests/inbound-stop.test.mjs. The production build compiles. The enquiry route itself is not in the end-to-end test (it uses Next's after() hook), so its changes are checked by reading and by the helper's test.

## Pass 112 - race-safe credit and discount codes; held credit on existing invoices
- Held credit can no longer be used twice. Each credit note is read again inside the transaction that saves the invoice; if it changed, the save is retried from the start (up to three times) and nothing is written in between.
- A discount code's last use can no longer be taken by two buyers at once. The use is claimed atomically before the invoice is saved, and given back if the save fails. This applies to product buy links and to codes typed on the pay page.
- Held credit can now be applied to an existing unpaid invoice (Billing, "Apply held credit"). It is refused if the invoice has a payment or earlier credit, so balances stay correct.
- Tests: the full suite passes, including tests/promo-tx.test.mjs. The production build compiles. The race protection is tested against a stand-in transactional database, not a live Firestore.

## What is deliberately limited (kept on purpose)
These are safety limits, not gaps: sending caps (500 newsletter emails a day per account; 12 batches an hour platform-wide; 3 follow-ups per lead; Gmail's own limits); rate limits on sign-up, code guessing, cron and owner actions; 90-day expiry on statement, confirmation and pay links; a 5-minute minimum on scheduled sends; AI daily and monthly spending caps; 5,000-row caps on exports, statements and per-account reads; and the requirement of an https public address before any link or unsubscribe is produced.

## Still outside what code can settle
Live behaviour against Gmail, Stripe, DNS and Meta/Google; browser checks of the new screens; syncing audiences to ad platforms through their APIs.

## Pass 111 - held credit is applied to the next invoice
- When a customer has credit held for them (a revised quote refunded as credit), it is applied automatically to their next invoice: from the manual invoice form, a milestone invoice, a booking deposit, or a product buy link. Credit is used oldest first and never more than the invoice total. If the credit covers the whole invoice, the invoice is recorded as paid at zero.
- The credit is only marked as used after the invoice has been saved, so a failed save never uses up a customer's credit.
- The invoice keeps its original billed amounts, so statements and accounting exports count the bill once and the credit once. Net and tax are split in proportion when credit is taken off.
- Credit still open (not yet decided) or already used is never applied. Credit can be applied only to invoices created after this release; existing unpaid invoices are not changed.
- Tests: the full suite passes, including tests/credit-apply.test.mjs. The production build compiles.

## Pass 110 - landing page and pipeline review
- Pipeline: a stage label the app does not recognise no longer moves a deal back to "New" (a prospect). An existing deal keeps its stage, so a won customer stays a customer. Common spellings are understood: "closed won", "Closed-Lost", "negotiating", "proposal sent", "in progress" and similar, with spaces, hyphens and capitals treated alike. A brand-new deal with an unknown label is still a new prospect.
- Landing page (front door): corrected the claim "Nothing goes out on its own". Automatic sending exists and is off by default; the page now says so. Added the newsletter and discount-code features, and described them only as far as they are built (double opt-in, scheduled sends within daily limits).
- Public business page: a "Join our mailing list" button. The sign-up form opens with the same key as the public page, so no second key is needed. Revoking the public-page key also stops new sign-ups.
- Checked and left as they are: the forecast does show a range and says so when there are fewer than five closed deals; the daily and monthly AI spend caps are enforced; the follow-up cap of three is enforced.
- Tests: the full suite passes, including tests/deal-stage.test.mjs. The production build compiles.

## Pass 109 - scheduled newsletters, discount codes at checkout, lead finder review
- Scheduled newsletters: set a start time on a draft (at least 5 minutes ahead, within 90 days) and it starts by itself. An hourly job starts due newsletters and sends them in batches with no page open. The job is shared fairly across accounts, sends at most 12 batches of 10 an hour platform-wide, and keeps the 500-a-day cap per account. A newsletter whose start fails (for example, nobody confirmed yet) goes back to draft with the reason.
- Discount codes at checkout: when a business has active codes and an invoice is unpaid, the customer is offered an optional code box before paying. A valid code reprices that invoice (price, tax and total follow the discount; the due date does not change) and is recorded on the invoice with the list price. Codes work only before any payment, once per invoice, and once per customer where the code says so.
- Limits: 10 code attempts per invoice link every 10 minutes; a code is refused if the business has switched it off, it has expired, or it has been used up.
- Lead finder review (no change): searches run against OpenStreetMap under a daily search and site budget, with 4 to 10 second timeouts, a 600 KB page cap, three sites at a time, and robots.txt respected.
- Still open: syncing audiences to Meta and Google through their APIs (needs your ad accounts and platform approval); a live website chat widget (WhatsApp conversations already exist for this); checkout codes on invoices that have already had a payment.
- Tests: the full suite passes, including tests/promo.test.mjs (checkout pricing) and tests/broadcast.test.mjs (scheduling and fair batching). The production build compiles.

## Pass 108 - newsletters to the confirmed list, lead magnet
- Newsletter (Products page): draft a subject and message, start it, and send it in batches of 10 from your connected Gmail, paced about two seconds apart. Only people who confirmed are sent to; anyone unsubscribed or suppressed is skipped, checked again at send time. {{name}} becomes the first name, or "there".
- Every newsletter email carries an unsubscribe link and a line saying why the person is receiving it. A newsletter is refused when the public address is not https, because the unsubscribe link could not work then.
- Limits: 150 characters for the subject; 10 to 5,000 for the message; at most 5,000 people in one newsletter; 500 newsletter emails a day per account; the snapshot of recipients is taken when you start, so people who join later get the next one. One newsletter sends at a time. Cancel stops it at the next batch.
- Newsletter sends are not recorded as outbound sales emails, so they do not inflate the sales funnel. They are counted on the newsletter itself.
- Welcome download: a https link (for example a guide) emailed to each new subscriber after they confirm. Skipped quietly when none is set; it never blocks the confirmation.
- Account deletion now covers newsletter drafts.
- Known limits: sends happen only while the owner is pressing Send next batch (the page continues for up to 30 batches per press); there is no scheduled sending yet. Gmail's own daily limits still apply on top of the 500 cap. Each email is a plain-text message.
- Tests: the full suite passes, including tests/broadcast.test.mjs. The production build compiles.

## Pass 107 - discount codes, mailing list with double opt-in
- Discount codes for your own products (Products page). Make a code as a percent or a fixed amount, with an optional end date, a minimum price, a total number of uses, and a one-use-per-customer rule. Type the code on a buy link and the invoice is made at the discounted price, with the original price and the discount recorded. A code can never make the price zero, and an expired, used-up, switched-off or not-yet-valid code is refused.
- Mailing list. A hosted sign-up form (a link from Products, "Make sign-up link") with a consent box that says what the person agrees to. Each sign-up is confirmed by an emailed link before the person is added (double opt-in). The form has a hidden field that catches bots; the confirmation link expires after 7 days; the confirmation page changes nothing until the person presses its button, so mail scanners cannot confirm people by opening the link. The answer to a sign-up is the same whether or not the address is already on the list.
- Exports: a contacts file for your own tools (confirmed people by default), and an audience file of SHA-256 hashes for Meta and Google custom audiences (no plain addresses). Unsubscribed and suppressed addresses are never exported. Account deletion and single-person erasure now cover both the codes and the list.
- Limits: the list holds up to 50,000 people; 10 sign-ups per minute per address source; 20 owner list changes per minute; 200 codes per account; an export holds up to 10,000 rows; codes are 3 to 20 letters or numbers.
- Assumptions and known limits: the total-uses count is updated after the invoice is made, so two buyers at the very same moment can both take the last use (a best-effort cap). The sign-up link key is shown once; making a new one stops the old one working. The sign-up form and the confirmation email need a working mail provider; without one, sign-up says it is not available rather than storing people who were never confirmed.
- Not built: sending broadcast emails to the list (export it to your mail tool for now); automatic sending of a lead magnet on sign-up.
- Tests: the full suite passes, including tests/promo.test.mjs and tests/signup.test.mjs. The production build compiles.

## Pass 106 - customer statements, accountant exports
- Statement of account for any customer: everything billed, paid and credited, with the running balance, the amount still owed, and how long each open invoice has been overdue (not yet due, 1 to 30, 31 to 60, 61 to 90, over 90 days). Voided invoices are left out; credit notes reduce what is owed; a credit larger than the bill shows as a credit balance owed to the customer.
- Get a statement link from Billing ("Accountant and customer statements") and send it to the customer. The link opens a read-only page showing only that customer, with pay links for open invoices when the public address is https. It expires after 90 days, and a changed or forged link is refused. The page is marked not to be indexed and sends no scripts.
- Accountant export from Billing: a Xero sales-invoice import file (Xero's column names, dates as day/month/year, tax type only where there is tax), or a ledger (one row per invoice and per credit note, credit notes negative) for QuickBooks, Sage, or a spreadsheet. Filter by issue date. Cells that could run as formulas in a spreadsheet are neutralised; numbers, including negative credit notes, stay numbers.
- Limits: 5,000 invoices and 5,000 credit notes per export or statement (a notice shows on a statement that is cut short). Both features are read-only and use no AI.
- Tests: the full suite passes, including tests/statement.test.mjs and tests/accounting-export.test.mjs. The production build compiles.
- Assumptions: a payment without a recorded paid date (part payments) is dated by the invoice's issue date. Xero's date format and tax-type names depend on your Xero region and chart; check the import preview in Xero before importing.

## Pass 105 - credit notes for revised quotes, sender-domain check, erase one contact, hot-reply webhook
- Credit notes replace the "refund due" flag on revised quotes. Each one gets its own number (CN-0001, CN-0002...), references the quote, and can be held as credit for the next invoice, or recorded as refunded in cash. The amount must be more than zero, and a credit note is issued once per quote.
- Sender-domain check (Account, "Can your emails reach inboxes?"): reads the public SPF, DKIM and DMARC records for the domain you type and says what to fix, with the record to publish. Free-mail domains are explained, not judged. Limited to 12 checks a minute per account.
- Erase one person's data (Account, "Erase one person's data"): removes that contact's leads, deals, drafts, follow-ups, notes and messages, and clears the address and text from their sent emails (the counts stay). Requires typing ERASE. Limited to 5 requests a minute. Invoices and credit notes are kept for tax records, and their opt-out address stays on the list so they are not contacted again. Each erasure writes an audit entry holding a fingerprint, not the address.
- Hot replies (interested, meeting request, pricing question) emit a signed "reply.hot" webhook event to the owner's existing webhook endpoints.
- Tests: the full suite passes, including tests/sender-auth.test.mjs, tests/erase-contact.test.mjs and tests/credit-notes.test.mjs. The production build compiles.
- Not built: applying held credit to the next invoice automatically (it is applied by hand); a sender-domain check for providers other than public DNS (for example, Google Postmaster complaint rates, which need the owner's Google account).

# Changelog

## Pass 104 - open and click tracking for outbound emails (the dashboard counts now fill in)
- Found a gap: the dashboard and the sent-leads list read opened and clicked counts on each sent email, but nothing ever wrote them, so they stayed at zero.
- Outbound emails now carry an open image signed to their sent-email record, so the first open and count are recorded.
- Links in outbound emails go through a click redirect. The reader still sees the same address; the redirect records the click and goes straight on to it. A click can only go to the address signed into its link; a changed address or a non-web address is refused.
- Unsubscribe links are never rewritten. Follow-up emails are recorded against the original email's record.
- Text in outbound emails is escaped in the HTML version.
- Tests: the full suite passes, including 3 new cases in tests/reach.test.mjs. The production build compiles.
- Opens are approximate: some mail apps load images automatically, so an open can be recorded without a person reading the email. Set TRACK_OPENS=off to turn tracking off.
- Not built: a store app (App Store or Play). The installable web app is the route to a phone app without one.
## Pass 103 - customer page views, and open tracking for invoices
- Quotes: the accept page records when a customer views a quote (first view and count). It changes nothing else: viewing never accepts or declines a quote, and link scanners that open the page do not count as an accept. Shown on the Quotes page as "page viewed".
- Invoices: invoice emails, nightly and manual, carry a signed tracking image. The first open and count are recorded on the invoice. Opens are approximate, as for quotes.
- A tracking image for a quote cannot record an invoice open, and the reverse.
- Tests: the full suite passes, including 1 new case in tests/reach.test.mjs. The production build compiles.
- Not built: open tracking for outbound campaign emails (the outbound sending path builds plain text; it would need the same image added); click tracking beyond the quote view; a store app.
## Pass 102 - country on enquiries, open tracking for quotes, an installable app
- Enquiries take a 2-letter country. It is stored on the deal and used for territory routing before the email domain. Territories are now exact where the buyer gives a country.
- Open tracking for quote emails sent from the app. A 1x1 image, signed to that quote, records the first open and the count, shown on the Quotes page. Opens are approximate: some mail apps load images automatically. Quote emails are now HTML with the tracking image; the text is escaped. Set TRACK_OPENS=off to turn tracking off.
- Installable app: a web manifest, an icon, and a service worker that installs the app to a phone home screen. The service worker caches nothing, so quotes and invoices are never stale.
- Tests: the full suite passes, including 4 new cases in tests/reach.test.mjs. The production build compiles.
- Not built: a store app (App Store or Play) — the installable web app is the route to a phone app without a store; click tracking (only opens are tracked); open tracking for outbound campaigns and invoices (only quote emails are tracked).
## Pass 101 - territories, availability and caps for owners; an alert for unclaimed deals
- Territories: each owner can cover territories (country codes). A deal goes to a person who covers its territory first. The territory comes from the email's country domain (for example .lk), which is a proxy for location, not a true location. Deals on other domains are treated as 'com'.
- Availability: an owner can be marked away, and is then skipped for new deals. A cap limits open deals per owner; a person at their cap is skipped.
- A deal is never left without an owner. If everyone is away or full, the least-loaded owner takes it.
- Auto-assign, manual assignment and new inbound leads all use these rules.
- Alert for unclaimed deals: once a day, under the morning-brief switch, the owner gets one email listing open deals with no owner for more than 24 hours. A quiet day sends nothing.
- Owners page: per owner, away, cap and territories, with Save.
- Tests: the full suite passes, including 6 new cases in tests/owners.test.mjs. The production build compiles.
- Limits: territories are read from the email domain, so a deal on a .com address with a Sri Lankan buyer goes to the 'com' pool. An enquiry form that records the buyer's country would be more exact; not built. Away status is set by hand, not from a calendar's out-of-office.
## Pass 100 - checked against published CRM and sales-tool feature lists; outgoing webhooks added
- Research: compared against common small-business CRM feature checklists and sales-routing tools (2026 guides: round-robin and weighted routing, territory routing by region, industry or size, out-of-office cover, unclaimed-lead alerts, outgoing webhooks to Zapier and Make, scheduling, and lead capture).
- ADDED: outgoing webhooks. Owners add an https address and choose events: quote.accepted, payment.received, booking.requested, booking.confirmed. Each delivery is a POST signed with a per-address secret (HMAC-SHA256 over timestamp and body), so the receiver can check it came from AutoLeads and reject replays older than five minutes. The secret is shown once. A failed delivery never undoes the action that caused it. Integrations page, "Send events to other tools".
- Tests: the full suite passes, including 5 new cases in tests/webhooks.test.mjs. The production build compiles.
- Still not built (from the research): territory routing by region, industry or company size (routing is by least-loaded owner only); out-of-office and capacity limits on owners; an alert for open deals with no owner after a set time (the Owners page shows the count, but nothing notifies you); a native mobile app (the web app works on a phone; no installable app); email open and click tracking (consciously left out: tracking pixels and link rewriting conflict with the consent and deliverability rules the app follows, so this is a deliberate choice, not an omission).
- Not verified: delivery to a live Zapier or Make address.
## Pass 99 - revenue trend on the Business page
- Under the monthly won-revenue bars, the Business page now shows the trend (rising, falling or flat) and a rough next-month figure from a straight-line fit of the last six months. It is an estimate, labelled as one, not a forecast. Fewer than three months gives no trend.
- Tests: the full suite passes, including 3 new cases in tests/trends.test.mjs. The production build compiles.
## Pass 98 - landing page, and the business-type coverage
- Landing page (Landing page, under Sell). The owner writes a tagline and an about paragraph. The public page at /site?k=<enquiry key> shows the business name, those texts, the services (name, length, price), the public product prices and descriptions, and buttons to get in touch or book. It never shows costs, margins, customers, invoices, staff or SKUs. Enforced by the public-content function and tested.
- Coverage by business type, as checked against the code (sales and marketing only):
  Covered: products (buy links, invoices with card payment, reorder reminders); services (bookings, quotes, milestones); hybrid businesses (quotes can mix products and services, bookings for services, buy links for products); productized services (fixed-price subscriptions through recurring deals and invoices); B2C (WhatsApp, SMS, bookings, consent) and B2B (quotes, deals, follow-ups); referral and broker commissions and partner payouts (the partners module); a landing page for any of these.
  Not built: marketplaces and C2C platforms (two-sided listings and payouts between users are a separate product); freemium tiers and ad-based revenue (the app does not sell attention); franchise systems; loss-leader bundles as a pricing concept (a product can be priced low, but there is no bundle logic); pay-what-you-want donations; rental or leasing with asset return and depreciation tracking; supplier purchase orders for dropshipping or wholesale (stock is tracked, purchasing is not); B2G tender and procurement workflows; legal-form features (not a sales concern).
- Tests: the full suite passes, including 2 new public-page cases in tests/sales-ops.test.mjs. The production build compiles.
## Pass 97 - revisions settle what was billed; a number belongs to one account; the invoice counter is atomic on both SDKs
- A revised quote settles what was already billed under the quote it revises. Scheduled earlier quotes: the invoiced milestones are the exact amount billed. Each milestone of the revision is credited against that amount, earliest first; a milestone fully covered is marked "covered by an earlier invoice" and is never invoiced again.
- Earlier quote without a schedule: the amount billed is the sum of invoices sent to the same customer since that quote was accepted. This is the best available figure, because invoices do not name their quote. It can include an unrelated invoice to the same customer in that period, so check it.
- A revision that costs more than was billed gets one adjustment invoice for the difference (unscheduled revisions). A revision that costs less records a refund due on the quote, with "Mark refund returned" once you have returned it. The app does not move money for refunds.
- A revision is billed only by its own adjustment or schedule. The nightly routine does not bill it again.
- A Twilio number can belong to one account only. Saving a number that another account already uses is refused.
- The invoice counter is atomic on the client-SDK setup too (a client transaction), as on the server SDK.
- Tests: the full suite passes, including 1 new credit case (tests/sales-ops.test.mjs) and 2 new end-to-end steps (now 29 through the real routes). The production build compiles.
- Not closable inside the app: live verification of the external services; the Google Ads developer-token approval; streaming low-lag voice (needs a separate real-time audio service); the calendar provider's refresh delay.
- Still not covered by an automated test: the public enquiry route, outbound drafting and sending from the lead inbox, Gmail sends, Twilio calls and SMS, and reminders.
## Pass 96 - AI keys per account; the SaaS AI limit closed
- The AI provider keys (DeepSeek, OpenAI, Anthropic) are per account, stored encrypted, and entered on the Integrations page, like the other service keys.
- In SaaS mode an account uses its own AI keys. It never uses the operator's, so an account without its own key gets "AI not configured" rather than being billed to the operator. To keep paying for AI on your plans, set SAAS_OPERATOR_AI=on on the server (the operator then pays; the default is off).
- Self-hosted: the server settings are used, as before, and an account key, if set, takes precedence.
- The voice assistant's outbound and inbound checks use the account's own AI keys.
- Tests: the full suite passes, including 1 new AI-key case and an updated readiness case in tests/integrations.test.mjs (28 cases in that file). The production build compiles.
- Still open, and not closable inside the app: live verification of all external services; the Google Ads developer-token approval (Google's decision); streaming low-lag voice (needs a separate real-time audio service); provider calendar refresh delay (Google publishes calendars every few hours); reconciling revised quotes with invoices already sent (needs a decision: credit notes or manual adjustment).
## Pass 95 - the booking limits closed: any calendar rule, named time zones, team managers' calendars
- Calendars are now read with a maintained iCalendar parser (node-ical). It handles named time zones, any repeat rule (daily, weekly, monthly, yearly, and the rest), exceptions (EXDATE), single occurrences moved or cancelled in the calendar (RECURRENCE-ID), all-day events, and "free" events.
- Times with no zone are read as the owner's own local time, whatever zone the server runs in.
- Team managers' calendars block their times too. The owner adds each manager's calendar address under "Your own calendar" on the bookings page. Addresses are stored encrypted, one per person.
- Fail closed, as before: if a person's calendar cannot be read, or is not a calendar, that person's times are not offered and a confirmation is refused. The public page says some times are hidden.
- The older hand-written calendar reader is removed; the production path now uses the parser above.
- Tests: the full suite passes, including 4 new calendar cases (named time zone with an exception, a moved occurrence, a cancelled occurrence, and a non-calendar file refused) and the zone-less time case. The production build compiles.
- Remaining limit, outside the app: a calendar provider publishes its secret address with a delay. Google, for example, refreshes it every few hours, so an event added a few minutes before a customer books may not yet be seen. The app caches each calendar for ten minutes. Confirmation is checked against the calendar again at the moment of confirming.
## Pass 94 - bookings: confirmation emails, per-person hours, a choice of person, the owner's calendar
- Confirmation emails: when a booking is confirmed (by you, or automatically when its payment arrives), the customer gets a confirmation from your connected Gmail, with their manage link. It is sent once per booking. If Gmail is not connected, nothing is sent, and the confirm response says why.
- Two-way calendar: connect your own calendar by its secret iCal address (Account on the bookings page). Its events block your times, so nothing is booked over them. The calendar is only read. It is read every time a time is offered or a booking is confirmed. If it cannot be read, your times are not offered at all, and the public page says some times are hidden: fail closed, so a double booking cannot happen.
- Repeating events: daily and weekly repeats (with interval, count, until and weekday) are read. Other repeat rules are NOT expanded, so such an event blocks only its first occurrence.
- Per-person hours: each person can have their own working hours. A person without their own hours uses the shared hours.
- A choice of person: a service can be done by several people. The public page offers one list of free times, each tagged with who takes it, or the customer can choose a person. Each booking belongs to the person who takes it. A person not offered for the service cannot be booked.
- Owner confirmation re-checks the calendar at the moment of confirming, so a time taken since the request is refused.
- Tests: the full suite passes, including 6 new unit cases (tests/booking-calendar.test.mjs) and 6 new end-to-end steps (now 27 through the real routes). The production build compiles.
- Not built: reading the calendars of team managers (only the owner's calendar blocks times); events with a named time zone other than the owner's are read as the owner's local time (set the calendar to the owner's time zone); other repeat rules (monthly, yearly, and exceptions to a repeat).
## Pass 93 - bookings: calendar feed, customer self-service, payment at booking, staff, no-shows
- Calendar: each owner has a calendar feed address. In Google, Outlook or Apple Calendar, subscribe to it by URL, and confirmed bookings appear and stay up to date. It is one way: bookings go out to the calendar, and events in the owner's own calendar do not block bookings.
- Customer self-service: every booking has a signed manage link (sent with the booking page's confirmation and listed on the bookings page). The customer can move the booking to another free time, or cancel it. Changes are allowed only with 24 hours' notice. A moved booking goes back to requested, so the owner confirms the new time. A link works only for its own booking, and a calendar link cannot be used to change a booking.
- Payment at booking: a service with a price waits for card payment. The request creates an invoice with a pay link, and the booking is confirmed automatically when the payment event arrives. If the time was taken in the meantime, the booking is flagged for review, not confirmed. Without card payments set up, a priced service is booked as a request, as before.
- Staff: each service is given to one staff member (the owner, or a team manager). Two staff members can have bookings at the same time. The working hours are shared across the account (one set of hours for everyone).
- No-shows: the owner records completed, no-show or cancelled for bookings that have started (not before). A customer with two or more no-shows must pay in advance for a priced service, or, for a free service, is flagged for the owner's review.
- Tests: the full suite passes, including 5 new cases in tests/booking-policy.test.mjs and 10 new end-to-end steps (now 22 through the real routes). The production build compiles.
- Not built: two-way calendar sync (events in the owner's calendar blocking bookings); per-staff working hours (hours are shared); a customer choosing which staff member they want; automatic confirmation emails (the app gives the links; the owner sends the confirmation from the mail app, or uses the draft).
## Pass 92 - bookings with a real calendar, and the pipeline tested end to end
- Bookings (B2C services). The owner sets services (name, length, optional price) and weekday working hours in their own time zone (Bookings page, under Sell). A public booking page (/book, with the account's enquiry key) shows only free times: on the working days, on a fixed grid, with a one-hour lead time, and never a time already requested or confirmed.
- A customer's request is recorded as a booking (requested) and opens an inbound deal, source "Booking request", as an enquiry does. A second request for the same time is refused. A filled hidden field is treated as a bot and records nothing.
- The owner confirms or declines. Confirming moves the deal to "demo" and takes the time off the public calendar. A confirmation is refused if it overlaps another confirmed booking. Reminders for tomorrow's bookings open as drafts in the mail app; nothing is sent by the app.
- Tests: the full suite passes, including 7 new unit cases (tests/booking.test.mjs) and 6 new end-to-end booking steps (tests/routes-e2e.test.mjs, now 16 steps through the real routes). The production build compiles.
- Pipeline check: the end-to-end test covers quote, accept, deal, invoice, payment, and booking request, confirmation and deal. Not covered by any test: the public enquiry form route, the outbound drafting and sending from the lead inbox, Gmail, Twilio, and the reminders.
- NOT BUILT: calendar sync (bookings do not appear in Google or Outlook calendars); customers rescheduling or cancelling themselves; payment when booking; several staff members with their own calendars; no-show handling.
## Pass 91 - products, buy links and reorder reminders (D2C and repeat business)
- Products page (under Sell): a small catalogue with name, price and SKU.
- Buy link: for a customer's email, the app makes an invoice for the product (quantity supported), numbered as usual, with a card-payment link when card payments are set up. You send the link; the payment webhook marks the invoice paid, as for any invoice. Without card payments, the app says so and points you to Billing.
- Due to buy again: customers whose last paid purchase is 60 days or more old, with nothing unpaid. Each has a draft reorder note that opens in your mail app. Nothing is sent by the app.
- Abandoned purchases: an unpaid buy-link invoice gets the existing overdue reminders.
- Tests: the full suite passes, including 4 new cases in tests/sales-ops.test.mjs. The production build compiles.
- NOT BUILT: a public storefront (customers browsing and paying on their own, with a cart). Buy links are created by the owner, not by customers.
- NOT BUILT: a booking calendar with available time slots for services. The public enquiry form takes a request, but does not hold or check a time slot.
- NOT BUILT: shipping, stock levels, and order fulfilment. A product is a price and a name, not an inventory item.
## Pass 90 - the money path tested through the real HTTP routes
- New test, tests/routes-e2e.test.mjs, calls the actual route handlers over HTTP, against an in-memory database. It runs: create a quote with a 30/70 schedule; the customer opens the link; the customer accepts (deal won, deposit invoiced, number INV-0001); the owner releases the completion (INV-0002, once only); a real Stripe-signed payment marks the deposit paid; the same event again changes nothing; a wrongly-signed event is refused; a payment over the balance is flagged for review; a forged link and a pay link signed with another key are refused.
- The test swaps only the database layer (tests/fixtures). Signatures use Stripe's own signing helper and the app's own encryption.
- NOT covered by any test here: creating a Stripe Checkout page (GET /api/pay), since it calls Stripe's network API; the Gmail, Twilio, Meta, Google Ads, Hunter and AI calls; and how the real database behaves (the in-memory store is a simplification, and it has no transactions, so the invoice counter here runs on its non-atomic path).
- Tests: the full suite passes, including the 9 route cases. The production build compiles.
## Pass 89 - end-to-end test of the money path
- New test, tests/money-path.test.mjs, runs one flow in memory from quote to paid invoice, using the same functions the routes call, in order: a plain quote (accept, won deal, invoice, card payment, repeated webhook ignored); a deposit and completion schedule (deposit invoiced on acceptance, the nightly routine skips the deal, part payment, full payment); a payment larger than the balance (refused for review); and a revision accepted after the deposit (deposit stays billed, completion replaced).
- What it does NOT cover: the HTTP routes and the Firestore calls. Those run only in a live environment, and need the live check still to be done.
- Tests: the full suite passes, including the 4 new end-to-end cases. The production build compiles.
## Pass 88 - win-back for expired quotes
- On the Quotes page, an expired quote has a "Draft win-back" button. It opens a note in your mail app, asking whether the customer still wants to go ahead and offering an updated quote. The note does not restate the old price, which may be out of date. Nothing is sent by the app.
- Tests: the full suite passes, including 1 new case in tests/sales-ops.test.mjs. The production build compiles.
- Not built, deliberately: quote price testing. It needs many quotes per price point before the results mean anything, so it is not worth building before there is that volume.
## Pass 87 - readiness is accurate; server settings and webhook addresses are on the Integrations page
- FIXED: a service's readiness ignored deployment settings in SaaS mode, so card payments and the AI voice assistant showed "needs keys" even when the operator had set the server up. Deployment settings (public address, signing secret, AI key, Gmail sign-in) now always count. Account keys keep the rule that a SaaS account never uses the operator's keys.
- The Integrations page lists the server settings, marked Set or Not set, with what each one is for. Names and states only; no values are shown.
- The page shows the exact addresses to paste into the provider consoles: Twilio messaging (SMS and WhatsApp), Twilio voice (inbound calls), and the Stripe webhook (checkout.session.completed). They are built from the public https address and shown once it is set.
- Tests: the full suite passes, including 3 new cases in tests/integrations.test.mjs. The production build compiles.
- Still set on the server, not on the page: the AI key, the public address, the signing secret, the Gmail sign-in, and the key-storage key (TOKEN_ENC_KEY). Each is listed on the page with its status.
- Still done in the provider consoles, by you: pasting the webhook addresses. The page shows them.
## Pass 86 - the consciously left out items, implemented
- Invoice numbers are automatic. Each invoice gets the next number with the account's prefix (default INV-, format INV-0042). A number typed by hand is kept. The next number never repeats one already in use, even one typed by hand or made before this release. Billing, the nightly routine and milestone invoices all use the same counter. The counter is atomic when the server SDK is in use. The client-side fallback is not atomic, and this is a known limit.
- AI calls are recorded by default. The disclosure says so, both outbound and inbound. Recording can be turned off with VOICE_RECORD_CALLS=off, and then the disclosure says the call is not recorded. Recording status is returned to the app by Twilio, and the owner plays a recording from the call log. The audio is fetched with the account's own Twilio keys.
- Contacts found by a company lookup go into the lead inbox, the same path every other lead takes. The inbox applies its own rules: opted-out people, people already emailed, and existing customers are skipped. The lookup still does not contact anyone by itself.
- Revising an accepted quote: a new quote can revise an accepted one. When the revision is accepted, the earlier quote's milestones that are not yet invoiced are replaced. Milestones already invoiced stay as billed, so the owner reconciles any difference between the old and new totals. The deal's value updates to the revised net price.
- Tests: the full suite passes, including 3 invoice-numbering cases and 2 revision cases. The production build compiles.
- Not built: streaming (low-lag) voice. It needs a separate real-time audio service and is not a business-rule choice.
- Not verified: the live database, the Twilio recording callbacks and audio playback, and the invoice counter under concurrent use.
## Pass 85 - payment milestones, and the margin floor blocks sending
- Payment schedule on a quote: type it as "Deposit:30, Completion:70" (up to six milestones, each 1 to 100%, adding up to exactly 100%). Each milestone is a share of the NET price; the last takes any rounding, so they add up to the net price exactly.
- On acceptance, the first milestone (e.g. the deposit) is invoiced at once. Later milestones are invoiced in order by the "Invoice next milestone" button on the accepted quote, once each. Milestone invoices carry the tax rate and payment terms from Account, as other invoices do. Email a milestone invoice from Billing with its Email button.
- A scheduled deal is marked as billed by its milestones, so the nightly routine does not also invoice it in full. Deals without a schedule are unchanged.
- Margin floor now blocks sending from the app: a quote below the floor cannot be sent until the owner confirms the choice. A quote below the floor also asks for confirmation before its email is opened in the mail app. Follow-ups are not blocked by the floor, because the quote was already sent.
- Tests: the full suite passes, including 4 new cases in tests/sales-ops.test.mjs. The production build compiles.
- Not verified: the milestone invoice writes are checked by the build and by the logic tests, not against the live database.
- Consciously left out: changing a schedule after a quote is accepted (a changed schedule is a new quote), and invoice numbering (the owner types numbers, as before).
## Pass 84 - deal owners, and a margin floor on quotes
- Deal owners page (under Sell). Each open deal can be given to the owner or to a team manager. Viewers cannot own a deal. The page shows how many open deals each owner has.
- Spread unowned deals: gives every unowned open deal to the owner with the fewest open deals, so the work spreads without a rota. Closed deals and deals that already have an owner are left alone.
- New inbound leads (from an unmatched number, see Pass 82) go to the least-loaded owner straight away.
- Margin floor on quotes. Each quote is checked against the deal's recorded delivery cost. Below the floor (default 30%) the quote is flagged before it is sent. The floor is set on the Quotes page. The delivery cost is kept internally and is never shown to the customer or put in the email.
- A quote with no recorded delivery cost is not checked, and the app says so.
- Tests: the full suite passes, including 6 new cases in tests/sales-ops.test.mjs. The production build compiles.
- Not built: deposit and milestone invoicing (invoices for part of a deal before the rest; this changes how invoices are created, so it is a separate change); blocking a quote below the floor (the app warns, the owner decides).
## Pass 83 - connect and verify: a test button per service, and a setup check
- Every ready service on the Integrations page has a "Test this connection" button. The check is READ-ONLY: it reads the account's status and sends, posts, charges or changes nothing. Checks: Twilio (SMS, calls, WhatsApp and AI calls), Stripe, Meta (account active), Google Ads (sign-in works), Hunter (key works, with searches left this month), and Gmail (your connected mailbox).
- AI keys are not tested by button: they are checked the first time the AI is used. This avoids spending tokens on a test.
- A failed check says which key to look at. It never shows a secret.
- Command-line setup check: `npm run setup:check` lists every connection as READY, NEEDS KEYS or NOT BUILT, with the exact keys still missing. It prints names and states only, never values.
- Tests: the full suite passes, including 5 new cases in tests/connection-test.test.mjs. The production build compiles.
- Important: the checks have NOT been run against live accounts. They are written to the services' documented read-only endpoints and checked only with fake responses here. Run them once with your real keys before relying on any connection.
- Still not built: streaming (low-lag) voice (needs a separate real-time audio service); Google Ads spend import needs a developer token that Google must approve, which is outside the app.
- Consciously left out: audio recording of AI calls; importing lookup contacts straight into outreach.
## Pass 82 - a number with no customer can become a lead
- On the Integrations page, a number in "Numbers with no matching customer" can be made into a lead by adding the person's email (and an optional business name). The lead is a normal inbound lead in the first stage, source "Inbound enquiry", channel "SMS reply" or "WhatsApp reply", with the number kept on the deal.
- Earlier replies from that number are linked to the lead, and later replies from it match the lead too.
- Making a lead does NOT give consent to any messages. Consent is recorded separately, as before.
- Refused, with a reason: an email that is not valid; a number not in the list; a number already linked; an email that already has a deal (open that deal in the CRM instead).
- Tests: the full suite passes, including 1 new case in tests/enrich-inbound.test.mjs. The production build compiles.
- Reclassified: AUDIO RECORDING of AI calls is CONSCIOUSLY LEFT OUT. Recording a call needs consent rules that differ by country and by party; the transcript already records what was said. STREAMING (low-lag) VOICE is NOT BUILT in this app: it needs a separate real-time audio service with a persistent connection, which a Next.js route cannot host. It is a separate build.
- Consciously left out (unchanged): importing contacts found by lookup straight into outreach; each contact is still chosen by the owner.
## Pass 81 - unmatched numbers, company contact lookup, inbound AI calls
- Replies from a number with no matching customer are kept per number (count, last message, channel) and listed on the Integrations page. No lead is created automatically, because a lead needs an email address; add the person in the CRM to act on it.
- Company contact lookup (Hunter, the account's own key): enter a company website and see the public contacts found there. Nothing is saved or sent by the lookup. Each lookup uses the account's Hunter credits. Route: /api/contacts/lookup. (The older app/api/enrich route stays retired: it sent lead lists to a third-party endpoint. This one sends only a domain.)
- Inbound AI calls (/api/voice/inbound): when someone rings the business's number, the AI answers with the same rules as an outbound call: it says it is an automated assistant, stops on request, keeps a transcript, and is limited to six turns. You must point the number's voice webhook at /api/voice/inbound in Twilio. Inbound calls are not capped by the daily limit, so Twilio and AI costs apply to every call.
- A stop said on an inbound call withdraws that caller's AI-call consent, where a matching record exists.
- Tests: the full suite passes, including 4 new cases in tests/enrich-inbound.test.mjs. The production build compiles.
- Consciously left out: importing lookup results straight into outreach. Each contact is still chosen by the owner, so consent is not assumed.
- Not built: a lead created from an unmatched number (needs the email address); audio recording of calls; streaming (low-lag) voice.
## Pass 80 - replies by SMS and WhatsApp are recorded; STOP is honoured
- Inbound SMS and WhatsApp replies are received at /api/inbound/twilio. Each is recorded for the account that owns the number it was sent to, and shown on the Integrations page under "Replies by SMS and WhatsApp".
- Twilio's signature is checked against the account's own auth token before anything is recorded. A request that does not match is refused.
- A reply that is exactly STOP, STOPALL, UNSUBSCRIBE, CANCEL, END or QUIT withdraws that person's SMS, WhatsApp and AI-call consent and suppresses their email. Words inside a sentence ("please stop calling") are recorded as replies, not opt-outs. START does not restore consent: the owner records it again.
- A reply is never answered automatically.
- Numbers are indexed when saved. A number saved before this release must be saved once more so its replies can be matched; the Integrations page says so. A number used by two accounts is indexed to the last account saved (known limit).
- Tests: the full suite passes, including 5 new cases in tests/inbound.test.mjs. The production build compiles.
- Not built: creating a lead from a reply by a number that matches no customer (the reply is listed, unmatched); third-party contact enrichment (lead enrichment is still scraping-based); inbound AI calls; one number per account is assumed for SMS and WhatsApp.
## Pass 79 - SMS and calls use the account's own keys; invoices emailed from Billing; AI phone assistant
- CLOSED, the SaaS blocker from Pass 78: SMS (send-sms) and phone calls (make-call) now use the account's own Twilio keys, never the server's. A SaaS account with no keys is told to add them on the Integrations page.
- CORRECTION to the Pass 78 note: call-webhook never used Twilio keys. It only checks the shared WEBHOOK_SECRET. The leak was in send-sms and make-call only, and both are fixed.
- Invoices from the Billing page: an "Email invoice" button for open and overdue invoices sends from the owner's connected Gmail. It carries the pay-by-card line when card payments are set up. A settled invoice cannot be sent. Each send is recorded on the invoice.
- AI phone assistant (outbound only), turn by turn over Twilio, using the AI key the server already has. It is built and tested at the logic level; it has NOT been run on a live call. Rules it cannot be configured out of: it says at the start that it is an automated assistant; it says so again when asked; it stops and records an opt-out the moment someone asks not to be called; it only calls people with a recorded agreement; calls only go out between 9:00 and 18:00 in the owner's time zone; a daily cap (VOICE_AGENT_DAILY_CAP, default 20); at most six turns; anything outside the stated purpose goes to a person at the business; it never quotes prices.
- Each call keeps a transcript, shown on the Integrations page under "Recent AI calls". The call is not audio-recorded.
- Tests: the full suite passes, including 8 new cases in tests/voice-agent.test.mjs. The production build compiles.
- Limits, in plain terms: each turn waits for speech recognition, the AI and speech synthesis, so replies lag by about a second; it is not a live streaming voice. Check the law where each person is before any call. The AI key is still the server's, so in SaaS mode the operator pays for AI usage; per-account AI billing is not built.
- Not built yet: answering inbound calls; audio recording of AI calls; streaming (low-lag) voice; per-account AI keys for SaaS.
## Pass 78 - keys per account; Google Ads; nightly ad-spend sync
- SECURITY FIX to Pass 77. Card payments, WhatsApp and ad-spend read the SERVER's keys for every account. With SAAS_MODE on, one customer's invoice payments would have gone into the operator's Stripe account, and another's WhatsApp would have sent from the operator's number. They now use each account's own keys, and a SaaS account never falls back to the server settings.
- Keys are entered on the Integrations page, stored encrypted (AES-256-GCM, via TOKEN_ENC_KEY), and never shown again. The page shows only whether a key is set, and where it comes from (this account, or the server settings on a self-hosted install). Without TOKEN_ENC_KEY, keys cannot be saved per account, and nothing is stored in plain text.
- Google Ads spend (read-only): monthly cost per month, added alongside Meta, with the same rule that a month you entered by hand is never overwritten.
- Nightly ad-spend sync, once a day, under the morning-brief switch, for the accounts that have keys. Each source that fails is reported; it does not stop the other.
- Reminders from the Billing page (overdue invoices) carry the pay-by-card line when the account has card payments set up. The line is added by the server, after any AI wording, so it is always exact.
- Keys are checked against the account's own values for the webhook as well: a payment event is accepted only if it verifies against the webhook secret of the account it names.
- Tests: the full suite passes, including 7 new cases in tests/integrations.test.mjs (24 in that file). The production build compiles.
- NOT FIXED, and must be before selling as SaaS: the SMS, call and call-webhook routes (app/api/send-sms, make-call, call-webhook) still use the server's TWILIO_* keys for every account. In SaaS mode that is the operator's number. Moving them to per-account keys is the next change.
- Not built yet: invoices you email yourself from the Billing page have no pay line (only the nightly invoices and overdue reminders do); an AI voice agent that places or answers calls on its own (needs a live voice pipeline and per-country recording-consent rules; calls you place yourself already work through Twilio).
## Pass 77 - connections: add the keys, and the feature switches on
- New Integrations page (under Account). It lists each connected service, whether its keys are set (names only, never values), what it unlocks, what runs by itself, and the consent or limit that applies. Filling in a service's keys is all it takes.
- Card payments on invoices. The invoice email gets a "Pay by card online" line when card payments are set up. The link opens a Stripe Checkout page for the balance owed; a completed payment is applied through the same rules as a recorded part payment (partial, or paid in full), and is applied only once even if Stripe resends the event. A payment that does not fit the balance is flagged for review, never forced. Uses STRIPE_PAYMENTS_SECRET_KEY, deliberately separate from the software-subscription key, so customers' money never goes to the software seller's account.
- Meta Ads spend import. A button on the Integrations page brings in the last three months of paid-ads spend (read-only). Months you entered by hand are never overwritten, and a same-every-month entry that covers a later month stops that month being imported twice.
- WhatsApp through Twilio, with Meta-approved templates only. Recording a customer's consent is a separate step; a send is refused unless WhatsApp is connected, a template is set, consent is on record with a phone number, and the contact is not opted out or lost.
- Keys to add (names in .env.example): STRIPE_PAYMENTS_SECRET_KEY, STRIPE_PAYMENTS_WEBHOOK_SECRET, PAY_SECRET (optional), TWILIO_WHATSAPP_FROM, TWILIO_WA_TEMPLATE_QUOTE / _FOLLOWUP / _INVOICE, META_ACCESS_TOKEN, META_AD_ACCOUNT_ID.
- Tests: the full suite passes, including 17 new cases in tests/integrations.test.mjs. The production build compiles.
- Not built yet: Google Ads spend import (needs a Google developer token that Google approves, and its own sign-in); an AI voice agent that places or answers calls by itself (needs a live voice pipeline and recording-consent rules per country; calls you place yourself already work through Twilio); a nightly Meta import (today it is a button); pay links on invoices sent by hand from the Billing page (the nightly invoices carry the link).
- Limits to know: the Meta token, the Stripe key and the Twilio keys are single values in the server settings, so they serve one owner per deployment. A multi-account (SaaS) setup needs each account's own keys stored securely; that is not built. Card payments need a currency your Stripe account can charge; anything else falls back to USD.
## Pass 76 - customer replies to quotes show on the quote (button and nightly)
- "Check for replies" looks in the Gmail thread of each sent quote, and only reads it. When the customer has written back, the quote moves to "Customer replied: answer them" with a link to their reply. Nothing is sent or changed in Gmail.
- A quote with a reply gets no follow-up reminder, so nobody is nudged after answering.
- The check reads up to 25 quotes per press, to keep the Gmail calls small. "Mark as handled" moves it back to waiting once you have answered; a later check does not flag the same message again.
- Quotes sent before this release have no thread recorded, so they cannot be checked; they still work normally.
- Tests: the full suite passes, including 1 new case in tests/quotes.test.mjs. The production build compiles.
- The nightly routine runs the same reply check before the quote reminder, so a reply is known before any reminder is considered. The check is read-only in Gmail.
- Not built yet: replies from WhatsApp or SMS.
## Pass 75 - send quotes and follow-ups from your own Gmail
- The Quotes screen sends a quote, or a follow-up, from your connected Gmail with one press. Nothing goes out on its own. The accept link is included, and "sent" is recorded only when Gmail accepts the message, with the Gmail message id.
- Refused, with a reason shown: a customer who opted out or whose deal is lost; a quote with no accept link (set your public https address first); a quote already sent (use a follow-up); a quote that is no longer open. A follow-up needs the quote to have been sent first.
- Quote sends are recorded on the quote, not in the cold-outreach records. The automatic cold follow-up sequence never picks up a customer who was quoted, and quote sends do not count toward the cold-send daily limit.
- If the email is sent but the app cannot record it, the screen says so and asks you not to send it again.
- "I sent it" and "Open in my email" still work, for quotes sent outside the app.
- Tests: the full suite passes, including 1 new case in tests/quotes.test.mjs. The production build compiles.
- Not built yet: showing customer replies to a quote on the quote (replies arrive in your normal inbox); sending a quote from a connected WhatsApp or SMS line.
## Pass 74 - quote reminders and invoice status on accepted quotes
- The nightly routine now sends you, the owner, one reminder a day when quotes need a follow-up (no answer after 3 days, or expiring within 3 days). Nothing is sent to a customer. A quiet day sends nothing. It runs under the same switch as the morning brief (Account, Autopilot).
- Accepted quotes on the Quotes screen show their invoice: created, emailed, or paid. The invoice is matched by customer, net amount and date, so another invoice to the same customer is never taken for this one. If none exists yet, the screen says the nightly routine creates it, or it can be created from Billing.
- Expiry is counted in calendar days: a quote valid to 2 November, seen on 31 October, shows 2 days. A quote valid until today shows "expires today".
- Tests: the full suite passes, including 3 new cases in tests/quotes.test.mjs. The production build compiles.
- Not built yet: sending the owner's reminder by text or push (today it is email, like the morning brief); quote follow-up drafts written by AI (the drafts are fixed wording, so they cost nothing and cannot invent a price).
## Pass 73 - the Quotes screen
- New page, Quotes (under Sell). Write a quote with its lines, tax, valid-until date and terms. The app builds the email with the accept link: open it in your own mail app, check it, press send, then press "I sent it". Nothing is sent for you.
- The screen sorts every quote: not yet sent, waiting for an answer, follow up now, accepted, and closed (declined, expired, withdrawn).
- Follow up now: a quote with no answer after 3 days, or expiring within 3 days, gets a follow-up draft that opens in your mail app. "I sent a follow-up" restarts the 3-day clock. Nothing is sent automatically.
- Withdraw: a quote can be withdrawn before it is accepted. The customer's link then says it was withdrawn, and it cannot be accepted.
- Make a new quote from an earlier one: the lines, terms and customer are copied; the valid-until date is left blank for you to set.
- Accepted quotes that could not update their deal are marked on the screen, so they can be fixed in the CRM.
- Structure: the browser-safe quote logic is in lib/quote-core.js; the signed accept link stays server-only in lib/quotes.js. Nothing in the quote flow needs a browser-side secret.
- Tests: the full suite passes, including 4 new cases in tests/quotes.test.mjs. The production build compiles.
- Not built yet: reminders about follow-ups by email or in the nightly routine (today the follow-up list is shown when you open the screen), and a sent-date check against the real mail thread (sent is what you tell the app).
## Pass 72 - an accepted quote wins the deal, and the existing routine invoices it
- When a customer accepts a quote, the deal moves to Won at the quote's net price (before tax). From there the existing nightly routine creates the invoice and emails it, and the reminders follow as before. No second step for you.
- Net price, not the quote total: the invoice adds your own tax setting, so using the total would charge tax twice. The quote's tax line stays on the quote.
- A deal that is already Won is not changed, so a second accept cannot invoice twice. An existing deal keeps its source and name; a customer with no deal gets a new Won deal.
- If the deal cannot be updated, the acceptance is still recorded and the quote is marked dealSyncError, so it can be checked. The customer is not shown an error.
- Tests: the full suite passes, including 3 new cases in tests/quotes.test.mjs, one of which runs the accepted deal through the invoice planner. The production build compiles.
- Not built yet: the screen to create and list quotes (the API works, the screen does not), reminders for quotes not yet answered, and expiry follow-up. These are the next automation steps.
## Pass 71 - cost per outbound win
- The Business page's marketing panel now shows cost per outbound win next to cost per inbound win. It is outreach-tool spend divided by the wins that came from email. Your own time is not counted, and the panel says so.
- Withheld (n/a) until there is both outreach spend and an email-sourced win in the last three months. The partial-months warning applies as before.
- Checked and already in place, no change needed: CAC by channel, lifetime value, LTV to cost, payback in months (revenue and margin), lead scraping and enrichment, inbound enquiries, follow-up drafts, win rate by source, template and angle.
- Not built on purpose: automatic spend import from ad platforms (needs their API keys and a per-account setup; the owner enters spend by hand, which keeps the numbers honest).
- Tests: the full suite passes, including 2 new cases in tests/marketing.test.mjs. The production build compiles.
## Pass 70 - quotes the customer can accept online
- New: a quote (title, lines with quantity and price, optional tax, valid-until date, terms) is saved for a customer. The totals are computed from the lines; nothing is invented.
- The customer opens a signed link from the quote email, reads it, and presses Accept or Decline, with an optional name. Each answer is recorded once. An expired quote cannot be accepted. GET changes nothing, so mail scanners cannot accept a quote by accident.
- The owner creates a quote through the quotes API and receives the email text, the accept link, and a mailto link that opens their own mail app with everything filled in. They press send.
- The accept link needs a public https address (NEXT_PUBLIC_BASE_URL) and a signing secret (QUOTE_SECRET, or UNSUBSCRIBE_SECRET). Without them the quote is still saved, with a warning and no link.
- Not built yet: a Quotes screen and a button on the CRM deal drawer. The quotes API works now, but the owner cannot create a quote from the screens yet. Not yet built: sending the quote from the app's Gmail connection (the mailto link is used instead). Not built on purpose: online payment on the quote; that needs a payment provider decision.
- Public route /api/quote is registered in the public-route contract with its own proof (the signed token).
- Tests: 407 pass (12 new in tests/quotes.test.mjs). The production build compiles.
## Pass 69 - reminders ask only for what is still owed
- Collection drafts (Billing page) and the nightly reminders now quote the balance still owed. A part-paid invoice is no longer chased for the full amount.
- The prompt to the AI says "amount still owed", so the wording matches.
- Tests: 237 pass (1 new). The production build compiles.
## Pass 68 - part payments on invoices
- Billing page: Record part payment. Enter what the customer paid; the invoice stays open with the balance still owed, shown as partial. Paying the balance settles it. Paying more than is owed is refused.
- Outstanding and aging totals now count what is still owed, including tax. Paid invoices keep their full value.
- Known limit: the reminder wording and the invoice email generated from the Billing page still quote the full invoice amount, not the balance. Check the wording before sending a reminder on a partly paid invoice.
- Tests: 236 pass (3 new). The production build compiles.
## Pass 67 - no second contact under a different email
- A lead is no longer put in the Lead Inbox when its business name matches an existing deal under another email. Names are compared ignoring case, punctuation and company suffixes (Ltd, Pvt, Inc and similar), so "Kandy Dental Ltd" matches "Kandy Dental". Names shorter than four letters are never matched.
- This prevents a second outreach, and a second invoice, to the same business. It is counted in the job's "already in CRM" total.
- Tests: 233 pass (2 new). The production build compiles.
## Pass 66 - optional sales tax or VAT on invoices
- New setting under Account > Money settings: "Sales tax or VAT on invoices (%)". It defaults to 0, so nothing changes for businesses that do not charge tax.
- Each invoice keeps its net price, so revenue reporting is unchanged, and records the tax and the total. The invoice email shows "plus tax X, total Y" when there is tax.
- Applies to automatic subscription invoices, won one-off sales, and invoices created on the Billing page.
- This is a calculation and display feature, not a tax filing. Check the rate and wording with your accountant.
- Tests: 231 pass (4 new). The production build compiles.
## Pass 65 - a new sending account warms up before it sends at volume
- A sending account now starts at 20 emails a day and rises in weekly steps: 50 from day 7, 100 from day 14, 200 from day 21, then no extra limit of its own (the plan and the safety cap still apply). This protects a new Gmail account from being flagged for sudden bulk sending.
- Accounts that were already sending before this rule existed keep their full cap. The ramp only starts for an account with no earlier sent email.
- The dashboard's remaining-today count uses the same cap, so it shows the real limit.
- Tests: 227 pass (3 new). The production build compiles.

Housekeeping: the earlier test failures in this session came from a full disk in the working environment, not from the code. The suite is green on a clean install.
## Pass 64 - AI drafts for WhatsApp, SMS and calls, with one tap to send
- The deal drawer has three buttons: Draft WhatsApp, Draft SMS and Call brief. The AI writes a short message from the offer, the business, the stage and the notes. For WhatsApp and SMS, a link opens your own app with the text already filled in, and you press send.
- A call brief gives four short lines before a call: where they are, what they care about, the likely objection with a reply, and an opening sentence. It says "not recorded" rather than guessing.
- Nothing is sent or called by the app. No WhatsApp, SMS or calling API is used, so there is no per-message cost, no bulk-sending rule, and no carrier or call-recording setup from this feature.
- Tests: 224 pass (3 new). The production build compiles.
- Not built on purpose: automatic WhatsApp or SMS campaigns (per-message cost and sender registration), automatic outbound calls (cost and recording consent), and automatic Instagram messages (the platform prohibits automated direct messages). Existing Twilio calling and SMS remain available only where you have set up your own keys.
## Pass 63 - referral asks are drafted automatically too
- The nightly routine now drafts referral asks for customers who are ready for them, each with that customer's personal link. Order: review, then referral, then feedback; at most 5 a night. Nothing is sent without your approval.
- Referral asks need your inbound key and an https public address (NEXT_PUBLIC_BASE_URL). Without both, referral asks stay a button on the Customers page, and the preflight check flags a missing or non-https address.
- Each queued ask records its date on the customer, so the buttons and the nightly job agree.
- Tests: 221 pass. The production build compiles.
## Pass 62 - the Lead Inbox shows what was found about each lead
- Each lead row now shows the decision maker and their title, the company size when known, and what the website gave (email on site, phone only, no contact on site, no website, unreachable, or blocks reading). Until now this was stored but not shown where leads are reviewed.
- Tests: 220 pass. The production build compiles.
## Pass 61 - every imported business shows what its website gave us
- Each business read by an import or search now gets one outcome: email found, phone only, no contact details on the site, no website listed, site unreachable, or site asks robots not to be read.
- The Find leads screen summarises the outcomes for the job, for example "12 email found · 4 phone only · 3 no website listed". The totals carry across nights, so an overnight import keeps its count.
- The outcome is stored on each lead row, so it can be used later when reviewing leads.
- Tests: 220 pass (1 new). The production build compiles.
## Pass 60 - a preflight check for the live run
- New command: npm run preflight. Reads .env.local and lists every setting a live run needs, marked OK, MISS (required) or skip (optional). It prints names and status only, never values. Required settings cover the database, the AI key, Gmail, the app address, the cron and opt-out secrets, and Stripe when SAAS_MODE is on.
- Checked the database security rules against the new deal-watch data. The owner's own data and the server login are both covered, so no rule change was needed.
- Tests: 219 pass (5 new). The production build compiles.
## Pass 59 - imports and searches finish overnight, without the page open
- A search or list import used to move forward only while the Find leads page was open. Starting one now marks the owner for the nightly run, and the nightly run carries the job forward within the same time box and the same daily website limit (500 by default).
- Stopping at the daily limit, finishing, or running out of time all end the carry cleanly. If the index update fails, the job still runs.
- Tests: 214 pass (2 new). The production build compiles.
## Pass 58 - final: no re-prospecting of existing customers
- A lead whose email is already in the CRM (any deal stage) is no longer put in the Lead Inbox. It is counted as "already in CRM" in the job's stats. Previously drafting already avoided cold email to them; now the inbox does not show them either.
- The CRM's email list is cached for five minutes, so a long search does not re-read deals on every batch. If the deals cannot be read, nothing is skipped.
- Tests: 212 pass (2 new). The production build compiles.
## Pass 57 - relationship asks are drafted automatically
- **The gap this closes.** Review and feedback asks were created only when someone clicked the button on each customer. Now the nightly routine drafts them.
- **Who gets asked.** Customers who meet the same rules as the button: delivered, settled, activated, not at risk, scoring 7 or more or not scored, and not asked in the last 90 days. A review ask is drafted only when the owner has saved a review link. Reviews come first, then feedback. At most 5 per night.
- **Approval stays in place.** Drafts go to the same queue as the other drafts, marked as asks. Nothing is sent unless auto-send is on. Turning Autopilot off stops the nightly drafting.
- **No duplicates.** An ask already waiting, sent or dismissed is not drafted again, and the date of each ask is recorded on the customer, so the button and the nightly job agree.
- **One source of wording.** The follow-up route's customer messages moved into lib/post-sale.js, unchanged, so the button and the nightly job say the same things. Testing found a missing sender name in the shared builder; it is fixed in both callers.
- **Not automated, on purpose.** Referral asks need a personal link built from the request, so they stay a button.
- Limit: the nightly drafts asks inside the existing time box, and the queue shows them as follow-up items. Check how they appear in the drafts list on a live run.
- Tests: 210 pass (4 new). The production build compiles.
## Pass 56 - deal finding that runs by itself: listing feeds, a price memory, and a nightly watch
- **The gap this closes.** Undervalued-deal screening needed a pasted list every time. The nightly search only found sales leads. Now the app watches listing feeds for you.
- **Listing feeds** (Find leads > Watch listing feeds every night). Paste up to 5 RSS or Atom feed addresses that listing sites offer for your searches. Only web addresses are accepted. Each night the app reads only the new items, takes the price from the text (currency-marked amounts, k and lakh, mileage and years excluded), and keeps a note of prices per model or area.
- **Judged against memory, not against themselves.** A new listing is compared with the prices seen before that night. It becomes a deal at 20% or more under the typical price with a profit after your sell fee and costs, and a check at more than 60% under. A group needs 4 prices before it can be judged, so the first night only learns.
- **Pasted lists teach the watch.** Screening a CSV now remembers its prices by default (untick to skip), so the nightly watch starts from work already done.
- **No extra schedule.** The watch runs inside the nightly job that already exists, with a 60-second time box, and never blocks drafts or the sales finder.
- **Safety.** Feeds are read through the same safe fetch the crawler uses, which blocks private and internal addresses. Titles and descriptions are shown as plain text. Nothing is bought, contacted, or sent.
- **Limits, stated plainly.** The watch can only see what the feeds contain, and many listing sites do not offer feeds. Groups are judged by the first three words of the title, so messy titles compare less well. Profit is an estimate before taxes and time.
- Tests: 206 pass (9 new), including a full nightly run against a fake store. The production build compiles.
## Pass 55 - an easier menu on phones and tablets
- **The menu is grouped into five sections**: Today (Dashboard, Lead Inbox, Conversations), Sell (CRM & Deals, Content, Customers, Partners), Money (Business Value, Billing, Assets and loans, Stock), Run the business (Payroll, Contracts, SOPs, Experiments), and Account. Every page keeps its address and name.
- **Mobile menu**: Escape closes it; the page behind it stops scrolling while it is open; and its links leave the tab order when it is closed, so a keyboard or screen reader does not reach hidden items.
- Desktop layout is unchanged. Touch targets were already at least 44px in the shared buttons and inputs, so no sizes changed.
- Tests: 198 pass. The production build compiles. The layout has not been viewed on real devices.
## Pass 54 - the enrichment script's best features in the app, and a deal screen for undervalued listings
- **Named decision makers** (`lib/enrich-extract.js`). A founder, owner, director or other leader named on the business's own public pages is recorded with their title, and their first name fills the first-name field, so outreach greets a real person. Ported from the Python enricher and checked against its test expectations. Marketing words alone ("owner", "our founder story") are not treated as people. Testimonials can name a person as an owner of a different business, so review names before a campaign.
- **Company size** is estimated from explicit headcounts first, then weaker wording; unknown is shown as unknown, never guessed.
- **Sitemap discovery.** For sites whose menus are built by JavaScript, the sitemap's contact, about and team pages are read even when the links are not visible. Same site only, at most 8 pages, nothing from blog or shop sections.
- **Inbox keeps the name.** Moving a lead to the inbox no longer clears its first and last name.
- **Deal screen** (Find leads page, `lib/deal-screen.js`). Paste or upload a CSV of listings (cars, land, anything with a price). Each listing is compared with the median of its comparable group (same model and year, or same area) using only the listings in the same file. Listings 20% or more under the median are shown as deals with an estimated profit after your sell fee and repair and transport costs. Listings more than 60% under are shown as "too cheap to be true" for checking, not as deals. Groups with fewer than 4 listings give no benchmark. Nothing is fetched from marketplaces.
- **Not ported, on purpose:** the Google Maps search in the uploaded worker. The app's own search uses public OpenStreetMap data and works with EasyScraper or any CSV you import.
- **Not ported yet:** resumable checkpoints for very long runs (the app's search jobs resume by step instead), a per-row enrichment status column, and sharing one crawl across duplicate websites.
- Tests: 198 pass (10 new). The production build compiles.
## Pass 53 - silent failures become visible: "Needs your attention"
- **The problem this solves.** The app's on-demand health check only helps if you think to press it. The worse case is a job that stopped days ago while nothing said so. A quiet night also used to look identical to a stopped one, because the nightly record was written only when something happened.
- **A heartbeat.** The nightly routine now records when it last ran, on every run for an account with an Autopilot switch on, including quiet nights.
- **Needs your attention** (top of Business Value). Shown only when something you switched on is not working: the nightly routine has not run in 26 hours or ever, the Gmail connection expired, the reply check is stale, automatic posting failed, or auto-find cannot suggest searches. Each line says what to do. When everything is fine, the card does not appear.
- Only features you have switched on are judged, so nothing is reported as broken when it was never set up.
- 6 new tests (179 in total). The production build compiles.

## Pass 52 - the commercial readiness document brought up to date
- COMMERCIAL_READINESS.md listed team logins and lifecycle emails as not built. Both are built (team logins with Manager and Viewer roles in Pass 36, salary privacy in Pass 44, system emails in Pass 36), so the document now lists them as built, with the live checks a buyer would need (team roles, cache backend).
- Still open, and stated plainly: per-customer sending set-up, load testing, monitoring and backups, and the external gates (Google's Gmail review, legal review, tax).
- No code changed in this pass.

## Pass 51 - less typing: one-off sales invoice themselves, and fixed costs are entered once
- **Won sales are invoiced automatically** under the existing auto-billing switch (Account > Autopilot). A one-off deal won in the last 14 days, with a real value and a customer email, gets an invoice the next morning, in the same send window and with the same wording as subscription invoices. Estimates, subscriptions (already automatic), zero values, and wins already invoiced by hand are skipped. Old history is never invoiced when the switch is turned on.
- **Same-every-month marketing spend.** A tool or subscription is entered once and counts every month until you remove it, instead of being typed in each month.
- Tests: 173 pass (7 new). The production build compiles.
- Deliberately still manual: marking invoices paid and bills settled, monthly attendance and payroll inputs, and stock purchases. These depend on money actually moving, and there is no bank connection, so the app asks rather than guesses.

## Pass 50 - finding businesses by itself, from your context
- **Auto-find** (Find leads > Find businesses for me every night). Turn it on and set your area once. Each refresh, the AI reads what you sell (your offer and profile) and your own results (which kinds of business you emailed, replied to, and won), then suggests the business types most likely to buy, chosen only from the searchable list. Those become nightly searches in your area. New businesses land in your Lead Inbox for review. Nothing is sent.
- **Turning it on fills the list straight away**; after that the nightly routine refreshes it when it is empty, when every search has gone dry, or once a week. A refresh is never asked for more than once a day, which keeps AI cost low.
- **Dry searches retire.** A search that stops finding new businesses is dropped, and the AI is not asked to suggest it again (the finder remembers the most recent 60 retired searches), so the nightly run is not spent on an exhausted area.
- **Failures never stop the night.** If the AI is unreachable or your offer is not described yet, the note on the Find leads page says why and the existing searches are left alone.
- Works wherever the map has coverage: the area is free text (city, region, or country), and results come from the public OpenStreetMap data already in use. Social networks are not scraped, and no lists are bought.
- 7 new tests (166 in total). The production build compiles.

## Pass 49 - public review asks, and supplier payment days (the last two gaps)
- **Public review asks** (`lib/customers.js` reviewState, Customers page). Paste your review page (Google, Trustpilot, Facebook) once under Public reviews. The Ask for a review button appears only for customers who are delivered, settled, activated, not at risk, scoring you 7 or more (or unscored), and not asked in the last 90 days. The draft includes only your own https link and never offers anything in return, because review platforms forbid incentivised reviews. When they tell you they left one, tap They left a review. The card shows asked and left counts.
- **Supplier payment days** (`lib/cash-cycle.js` supplierDays). Bills now record the day they were billed (optional) and the day they were marked paid. Average days from bill to payment is taken over paid bills in the last 90 days, shown once there are at least 3. The cash cycle subtracts it, so it is no longer measured before supplier credit when you record bill dates.
- Broadcast emails to many past customers are deliberately not built. A bulk send would be the one feature that can damage your sending reputation and invite spam complaints, and the per-customer asks already cover the relationship channel. This is a decision for you, not an omission.
- 8 new tests (159 in total). The production build compiles.

## Pass 48 - marketing spend, and cost per win by channel
- **Marketing spend** (`app/components/MarketingSpendPanel.js`, Business Value page, under the pipeline). Enter what you spent each month on paid ads, content and social, outreach tools, events, or other marketing. Stored under your own account, with remove.
- **Cost per win** (`lib/marketing.js`): spend over the last three months divided by customers won in the same months, and cost per inbound win (inbound-channel spend over inbound-tagged wins). Withheld as n/a until both spend and wins exist, and flagged as overstated when a month has no spend entered.
- Referral rewards and partner commission are deliberately not entered here, because Profit already counts them, so counting them twice would understate the return.
- Review of the marketing gaps against the brief: feedback asks and referral asks were already tracked; public review requests (a link to your Google review page) are not built yet.
- 6 new tests (151 in total). The production build compiles.

## Pass 47 - contribution margin and the cash cycle, the last two numbers the brief named
- **Contribution margin** (`lib/profit.js`, Business Value > Profit). What each sale keeps after everything that varies with selling it: delivery cost, partner commission and AI spend, as a share of revenue. Shown with the same rule as gross margin: only when every counted win has a delivery cost, so missing costs can never flatter it. Shown as n/a until then.
- **Cash cycle** (`lib/cash-cycle.js`, Business Value > cash card). Days to get paid plus days stock sits before it sells. Supplier credit is not included yet, because bills have no payment date; the figure says so. Service businesses are measured on days to get paid alone, and nothing is shown until a paid invoice exists.
- 5 new tests (145 in total). The production build compiles.

## Pass 46 - a shared cache across instances, and trial-to-paid for the software itself
- **Shared cache when `REDIS_URL` is set** (`lib/server/shared-cache.js`). The account-standing check that runs before every sending, AI and background call was cached in each server instance's own memory, so a suspension or plan change could take up to a minute to reach every instance, and each instance re-read the database. That cache now lives in Redis when `REDIS_URL` is set, so a change applies to every instance at once and one read serves them all. Without `REDIS_URL`, or when Redis is unreachable, it falls back to the previous per-instance memory and nothing breaks.
- **Redis fails fast.** The Redis client no longer queues commands while disconnected (it fails at once and the caller falls back) and gives up connecting after 3 seconds, so a Redis outage cannot hold a request open.
- **Cache stats say which backend is live** (`serverCache: 'redis' | 'memory'`, operator only).
- **Trial-to-paid for the software** (`lib/saas-metrics.js`), shown on the operator console (`/admin`). Converted = a Stripe subscription exists (accounts an operator switched to a paid plan by hand are not counted, since nothing shows they paid). Decided = paid plus finished-and-unpaid trials; internal and suspended accounts are left out. The rate is withheld until 5 trials have finished.
- Verified: 140 tests pass (9 new), the production build compiles, and the shared cache was checked across three separate processes against a real Redis server (a value written by one is read by another, deleted by a third, and reads fall back in 0 ms with Redis down). Not yet checked: a live deployment against your own Vercel and Stripe accounts.

## Pass 45 - the rest of the business-model list: seasonal, leasing and renting, lending, and never pricing to the bottom
Checked your taxonomy (scarcity, commodity, convenience and subscriptions, seasonal trading, leasing and loans, passive assets, brand) against the app. Product, service, subscriptions, scarcity and brand were covered. These were not:
- **Seasonal businesses (tourism, events, weddings, education, farming).** Account: set how busy each month usually is (100 is average). Business Value shows the season ahead (the next three months, what to expect in sales) and Do this next warns before a quiet or a busy stretch. After a year of sales the app learns the pattern by itself; what you declare always wins. The recent run rate is made season-neutral first, so a busy quarter is not mistaken for the new normal.
- **Leasing, renting and passive assets.** An asset can now earn rent or lease income each month, shown with its yearly yield. That income counts as revenue in Profit and arrives week by week in the cash forecast.
- **Lending.** Loans have a direction: money you owe, or money you lent out. Money lent is an asset (a loan book), its interest is income, and the repayments you receive land in the cash forecast on their dates (two weeks later in the harsher case).
- **Never pricing to the bottom.** What could hurt you now flags when your average sale falls 15% or more against the previous 90 days (only with 3 real sales in each period), and says so when you are winning more customers at lower prices.
- **Debt risk.** Loan payments are set against what the business keeps each month; over 30% is a warning, over 50% (or payments with no gross profit) is serious.
- 17 new tests.

## Pass 44 - a full safety sweep, and salaries stay private
Instead of another feature, a pass to make sure nothing added in the last rounds can break or leak.
- **Static scan of the whole app** for undefined variables, undefined components, hooks called after an early return and duplicate props (the kinds of bug a build does not catch because they only crash after sign-in). It found one: an old helper in `lib/firebase-operations.js` (unused, from the first version) called a function that does not exist. Fixed. Nothing else, and the scan was proven to catch both kinds of bug on a planted sample.
- **Salaries and money structure are the owner's alone.** Team members (Manager and Viewer) could have read payroll, loans, assets, bills, contracts and partner payments through the database rules. Those collections are now owner-only in the rules; the Payroll, Assets and loans, Contracts and Partners pages tell a team member that, and Business Value hides profit, cash, runway, what you own and owe, partners and contracts from them (profit depends on payroll, so showing it without payroll would be wrong). The owner sees everything, unchanged.
- Rules test extended to pin this. See TEAM_ACCESS.md for what each role sees.

## Pass 43 - a partner and affiliate network (the leverage that sells without your time)
The same inbound and outbound diagrams as before were already covered; the new "fourth son" idea (connect suppliers and buyers through a network of partners instead of doing the work yourself) plus the diagrams' "influencer and affiliate marketing" and "referral or affiliate program" pointed at one real gap: you could tag links by channel and thank referring customers, but there was no way to run partners and pay them fairly.
- **Partners (new page, in the sidebar).** Add a supplier, a business that serves your customers, an influencer, a reseller or a happy customer. Each gets their own tagged enquiry link (the same form, credited to them). Terms are a share of the CASH COLLECTED from the customers they bring and/or a flat amount per paying customer, never on a promise.
- It shows per partner: leads, wins, deal value, cash collected, commission earned, paid and owed, and says when you have overpaid. Record each payment you make ("I paid them"). Leads that arrive on a partner link nobody set up are flagged instead of lost. Pausing a partner keeps their link working and counted.
- **Business Value** shows the network (leads, won, earned, owed, the best partner), and payments made to partners in the last 90 days count as a cost in Profit. **Do this next** tells you what you owe partners, so the network stays worth joining.
- 7 new tests. Stored under your own account, so team roles and the database rules already cover it.

## Pass 42 - the messaging playbook: honest persuasion, built into every message
Took the marketing and sales psychology from the 20 screenshots and kept only what makes outreach, replies and proposals win. The app already had angle testing, objection answers, proof points, a booking link and BANT fields; what was missing was the rest of the levers, and a way to qualify before spending time. Everything below is honest by design: the AI may use only facts you typed, and the guardrail now forbids invented scarcity, discounts, deadlines, reviews or original prices.
- **Your messaging playbook (Account, Your business):** the smallest first step (the tiny yes), a real guarantee or policy (risk reversal), what waiting costs them (loss framing), before and after (contrast), one honest limitation (it raises trust in everything else), true availability or a real deadline (the only scarcity allowed), and your 2 to 3 offers with real prices and one highlighted. A meter shows how many of 10 levers are filled and why the next two matter. Empty levers are simply not used.
- **Offers in proposals and closing notes:** the AI presents only your real offers with your exact prices and points to the one you marked as best value. Fewer, clearer choices.
- **First emails answer the likeliest worry before it is voiced,** in one short sentence, using only your own answer to your top objection.
- **Three new message angles that test the psychology fairly:** What waiting costs, Others like you, Before and after. Each enters the rotation only once you have typed the real material for it, so nothing is ever invented, and the existing angle test measures which lever works in your market.
- **Qualifying intake on the enquiry form (optional):** budget, who decides, and when. The answers fill the lead's qualification, show next to the message, and make the AI reply warm and light when there is no budget or no timeline (and mark it Warm), or quick and concrete when they are ready. Fewer time-wasters, at the cost of slightly fewer enquiries, so it is off by default.
- Deliberately not built: fake anchor prices, manufactured urgency, fabricated reviews, gamified or addictive loops. They work on the buyer's weaknesses and eventually on your reputation.
- 10 new tests.

## Pass 41 - employees and payroll, assets and loans, contracts (the functions of running a business that were missing)
Mapped the whole list (getting customers, money, operations, customers, employees, tech, legal, reporting) against the app. Customers, money, operations, tech and reporting were covered. Three areas were not:
- **Payroll (new page).** Employees (basic, fixed allowances, EPF cover, first and last day), a monthly register of unpaid absent days, paid leave, commission, other additions and deductions (APIT and advances by hand), payslips, and the EPF and ETF figures. Defaults are the current Sri Lankan rates (EPF 8% employee plus 12% employer, ETF 3% employer, on total earnings, due by the last working day of the next month); they are editable settings because they change by law. APIT income tax is NOT calculated, public holidays are not known, and what counts as earnings for EPF should be confirmed by your accountant: the page says so. CSV download, a "mark EPF and ETF as paid" switch, and Do this next reminds you 10 days before and after the due date. The team's regular monthly cost (with employer EPF and ETF) now flows into Profit and the cash forecast automatically.
- **Assets and loans (new page).** Assets that lose value evenly, gain value yearly, or are valued by you. Loans with real interest, months left, payoff date and total interest, and a warning when a payment does not even cover the interest. Loan payments land in the 13 week cash forecast on their dates and the interest counts as a cost in Profit. Business Value shows what the business owns, owes and is worth (including cash, money owed to you and stock).
- **Contracts (new page).** A register of agreements (customers, suppliers, staff, lease, loans) with end date, notice period, auto-renew and a link to the signed document. It watches the dates: ended, renewed by itself, notice date reached, ending soon. Not legal advice; no document is generated.
- 14 new tests. Everything is stored under your own account, so team roles and the database rules already cover it.

## Pass 40 - the lead finder no longer starves quietly
Checked the finding part end to end: nightly saved searches find and read businesses, good ones land in the Lead Inbox, HOT ones get drafts the same night, autosend sends them (if switched on, with caps). One real weakness: a saved search runs dry (every business in that area has been seen), the night is still spent on it, and the pipeline quietly goes empty.
- **Dry searches are noticed.** After two finished nightly runs in a row that add no new lead, a search counts as dry. The night skips dry searches and takes turns among the rest, so no night is wasted on a finished area. If every search is dry it still tries the next in turn (areas gain new businesses) and says so.
- **Do this next tells you:** "Your nightly searches have stopped finding new leads", naming the searches, with what to do (widen the area or try a related type of business; Lead Inbox has ideas for who to look for next).
- 5 new tests.

## Pass 39 - the lessons from the 20 business-systems screenshots, checked against the app
Mapped them: cash, unit economics, SOPs and leverage, feedback loops, incentives, concentration and diversification were already covered. Four things the pages underline were not:
- **Will the money be there when bills are due?** Profit is an opinion; cash on the due date is a fact. New 13 week cash forecast on Business Value: your cash, unpaid invoices by due date, running costs, and the bills you enter, as two bookends (everyone pays on time; payments come 2 weeks late and overdue ones never arrive). It names the week you would run short and why. Bills (rent, suppliers, loan repayments, tools; once or monthly) are entered on the Billing page. It does not count new sales or tax, and says so.
- **What an hour of your own time earns.** Enter your hours per customer (Customers, Details) and what an hour of your time is worth (Account). Business Value shows what each hour really earns and says plainly when it pays less than your time is worth: still a job. Also: how long your cash lasts if every sale stopped today.
- **Would customers recommend you (NPS).** A 0 to 10 answer per customer, score from 5 answers, and the detractors to speak to first.
- **Found while testing:** the cash forecast could never reach its "even on time you run short" state. Fixed, with a test for each state.
- 11 new tests.

## Pass 38 - thinking outside the box: the two things that decide whether a still-undecided founder gets an answer
Features were not the gap. The risks left were running out of money while deciding, and never deciding.
- **Experiments (new page, in the sidebar).** Every idea becomes a test: one sentence, what you count, the number that means it worked, a judging date. At most three running at once, because ten half-finished tests teach nothing. On the judging day Do this next tells you; you enter the real number, the app suggests (hit the target: double down; about half: change one thing; clearly short: stop, and do not continue because time was spent), and you record your own decision. After three finished tests it shows how many hit their target. Business Value lists what is running.
- **How long your cash lasts (Business Value).** Type the cash you have (Account; optional). With your costs and your profit it shows the monthly result, how many months the cash lasts, and how many if unpaid invoices come in. Before any sale the burn is just your running costs. It says when it is not losing money, asks you to update a figure older than 30 days, and warns in Do this next when it is under 12 months.
- 7 new tests. Nothing existing changed; both are stored under your own account so team roles and the database rules already cover them.

## Pass 37 - the practical mechanics: stock and capital, risk, demand check, profit-based unit economics
Mapped your list of what a business really needs (market validation, sales, unit economics, retention, ops and inventory, risk) against the app. Sales, retention, CAC, lifetime value and payback were there. Four things were not:
- **Stock and capital (new page, in the sidebar).** For any business that buys to resell (goods, vehicles, equipment, boxes, assets). Add what you bought (full cost, asking price, supplier, date), mark it sold or written off. It shows money tied up, expected proceeds and profit, how long stock sits (ageing, slow stock over 90 days), profit made, average days to sell, return per year on the money used, a 30/60/90 day cash-back forecast (only once 3 sales show how long things take), supplier share of spend with margin and speed per supplier, and room left in a stock budget you set in Account. Stock sales also flow into Profit, so a trading business sees real profit.
- **Is the demand real?** From the funnel you already have: it refuses to judge under 50 people contacted, and the only thing it calls proof is someone paying. Otherwise it says what the pattern points at (silent, replies but little interest, interest but no payment).
- **What could hurt you.** Customer concentration (largest customer and top 3 as a share of 12 month revenue), how much monthly revenue repeats by itself, one supplier dominating spend, winning mostly on price, delivery full. Measured from your records; competition and regulation are left to your judgement and say so.
- **Unit economics on profit.** Lifetime value and payback were on revenue, which flatters a business that costs a lot to deliver. Once delivery costs give a margin, both are also shown on profit.
- 10 new tests. Existing data untouched: stock is stored under your own account (users/{you}/inventory), so team roles and the database rules already cover it.

## Pass 36 - team logins and system emails (work for internal use, for selling the software, or both)
These were the two things left unbuilt, and they matter if you sell the software or grow a team. Built so nothing changes for a single owner.
- **Team logins.** Invite people to sign in with their own account and work inside your workspace as Manager (all daily work) or Viewer (read only). Account, Team logins: optional email lock, role, a link you can always copy (valid 7 days, shown once, only a hash is stored), change a role, remove someone, cancel an invite. The owner keeps the team, plan and payments, keys, the mailbox connection and deleting the account.
- **How it is enforced.** The gate (proxy) decides on the server whose workspace a person works in from records only the server writes, then enforces the role per route. The database rules were extended so managers read and write the owner's data and viewers only read, never the roster, keys or server-only records. A failed lookup always falls back to the person's own workspace, never to more access. The previous rules are kept as `firestore.rules.v31-owner-only` for rollback.
- **Seats.** Plans now include team seats (trial 1, starter 2, growth 5; internal and non-SaaS use `TEAM_MAX_SEATS`, default 10). Waiting invites count.
- **System emails.** Team invite, trial ends in 3 days, trial ended, payment failed (each once, from the daily job, SaaS mode only). One mail setting: Resend or any webhook. With none set nothing breaks and invites give a link. Every attempt is logged.
- **Members see** a small Account page (role, leave), a banner showing they are in a shared workspace, and view-only is explained instead of failing silently.
- **Fixed while testing this:** the SOPs page read the signed-in user the wrong way and would have shown "please sign in" even when signed in. Fixed.
- 23 new tests (role gate, invites, store, rules shape, lifecycle, system mail). See TEAM_ACCESS.md, including a 10 minute check to run once after publishing the rules: they could not be run against a real Firebase project here.

## Pass 35 - lines of business: find out which business actually works
You are still deciding what business to run, and the app assumed one offer. Now you can run several ideas side by side and let the numbers choose.
- **Account: "Your lines of business"** (optional, up to 5), for example a service, a resale line and the software itself.
- **Customers, Details: "Which line of business"** tags each customer.
- **Business Value: "Which line of business works":** wins, revenue, average deal, profit, profit per deal and margin per line, with the best marked only once at least two lines each have 3 wins with a delivery cost entered. Before that it says exactly what is missing. Untagged customers are counted so nothing is hidden.
- 5 new tests.

## Pass 34 - company, not a job: SOPs, the absence check, and why customers choose you
Checked against: customers cannot easily substitute you (convenience, status or identity, a problem they must solve), scaling without more people, and "use SOPs and leverage, then be absent and see how it functions".
- **SOPs page** (new, in the sidebar): six standard procedures that use the screens of this app (finding leads, replying and closing, onboarding, delivering, billing, support). Edit them to match how you work, set who does each one (you, someone else, automated), mark them reviewed. Three or more steps counts as written down; an owner other than you counts as handed over.
- **Business Value: If you were away.** For each of the six parts of the business it says whether it runs by itself (autopilot), is handed over (SOP with another owner), or still needs you, with the live count waiting right now (replies, overdue invoices, stuck onboarding, renewals). One plain verdict: mostly runs without you, partly depends on you, or still a job. Plus people in the business, customers per person and revenue per person, so you can see whether growth needs more headcount.
- **Why they chose you.** Customers, Details: pick the main reason (convenience, a problem only you solve, status or identity, trust, quality, price). Business Value shows the split and says plainly when most customers chose you on price, because anyone can undercut that. Nothing is claimed until 5 reasons are recorded.
- 6 new tests; sidebar and frame route list updated.

## Pass 33 - delivery capacity (do not sell more than you can deliver)
Checked the app with a new lens: what stops a business from growing itself to death. Acquisition, closing, retention and profit were all there, but nothing connected selling to the ability to deliver, which is how a service or agency business loses the customers it already has.
- **Account: \"Most customers you can serve well at once\"** (optional; leave empty if capacity is not a limit, for example a product business).
- **Business Value: Delivery capacity** card with a bar (green, amber at 80 percent, red when full or over) and a plain instruction: slow outreach, raise your price, or add capacity.
- **Do this next** warns before the next campaign when delivery is nearly full, full or over. The AI coach is told too, so it stops recommending more selling when delivery has no room.
- It only informs. Nothing is paused automatically. 4 new tests.

## Pass 32 - delight: customers become proof (checked against the inbound/outbound, funnel, lifecycle and 7 Ps frameworks)
Mapped the app to the standard frameworks (inbound and outbound, attract-convert-nurture-close-expand, awareness to loyalty, inbound automation with opt-out and convert exits, the 7 Ps). Everything was already covered except one link: a happy customer could be asked for a referral, but nobody asked them how it went or turned the answer into proof for outreach.
- **Customers: \"Ask how it went\"** (AI draft you read and send yourself): offered 14+ days after winning, once the customer is activated, with no open issue and nothing overdue; never more than once every 120 days. No incentives, no pre-written praise, no invented results.
- **Their result, as proof:** a one-line note per customer (only a result they really got and are happy for you to mention), and \"Add to my proof points\" puts it straight into the three results the AI is allowed to cite in outreach and replies. Limits and duplicates are checked.
- 4 new tests. Nothing else changed.

## Pass 31 - two parallel builds combined (best of both)
Two builds started from v23 and changed different parts, so they were merged file by file (three-way against v23). Nothing was overwritten; the one file both touched (Business Value) merged without conflicts.
- **From build A:** niche learning loop. Category is remembered on every first email, Business Value shows which kind of business replies and buys, and the AI target finder learns from it (`lib/niche.js`, `lib/server/niche-evidence.js`, send routes, autosend, draft queue, ai-targets, dashboard).
- **From build B:** passes 28 to 30 below: enriched CSV download, profit (delivery cost, monthly costs, margin, break-even, profit forecast) and "Run it on my computer" for the Python worker.
- Both are on the Business Value page now: the profit panel and the niche table sit side by side.
- **Where they meet: profit per kind of business.** The niche table gets a Profit column (revenue minus the delivery costs you entered, only for wins that have a cost; never guessed, with "n of m costed" when partial), and the AI target finder is told the margin of niches that produced sales. Pick a niche by what you keep, not what you bill.

## Pass 30 - start a worker search from the web app
The Python worker could only be started by typing on your computer. Now the web app can ask for it.
- **Lead Inbox: "Big search? Run it on my computer".** Type a business and place, press Queue it. Up to 5 waiting at once, cancel any that have not started, status updates on screen, and the inbox reloads when a search finishes.
- **Worker: `pull` command and menu option 5.** Asks the app what is queued, runs each search exactly like menu option 1, delivers the leads to the Lead Inbox and reports added / already known / failed back to the app. `--loop-minutes N` keeps checking. A request the computer started but never finished (laptop closed) is offered again after 6 hours.
- Safe by design: the app never connects to your computer. The worker asks, with your existing ingest key. New route `/api/lead-inbox/jobs` (ingest key) and `/api/worker-queue` (signed in); queue stored server-side in `finder_jobs`, so `firestore.rules` needs no change.
- 7 new JS tests and 5 new worker tests.

## Pass 29 - revenue is not profit (the one real value gap left)
Checked every area against "works for any kind of business, even the software itself". Selling, delivering, billing, retention, forecast and unit economics were all there. What was missing: the app knew what you earn, not what you keep. A resale or service business can look great on revenue and lose money.
- **Delivery cost per customer** (Customers > Details): what it cost you to deliver that deal. 0 means it cost nothing, empty means not entered.
- **Other monthly costs** (Account): wages, rent, ads, software. Feeds profit and break-even.
- **Business Value > Profit (last 90 days):** won revenue, gross profit and margin, running costs, net profit, break-even revenue per month, a 30-day profit forecast built on the existing forecast, and deals that cost more than they brought in. Nothing is guessed: it stays hidden until costs exist, says how many wins still lack a cost, and flags estimated deal values.
- The AI coach now sees profit totals (never names) and judges by margin when it is present.
- New `lib/profit.js`, 10 tests. Existing data is untouched; deals without a cost simply show as "not entered".

## Pass 28 - download the enriched leads
- **Lead Inbox: Download as CSV.** Everything the finder, the CSV import or the worker enriched (emails, phones, socials, scores, decision-maker fields) can now be downloaded straight from the web app: the current filter, or only the ticked leads. Same columns the sender's CSV import reads. Before, enriched leads could only go to the sender, not back out as a file.
- Checked, nothing else to build: in-app Find leads, in-app CSV import and enrichment, nightly searches and the optional Python worker already cover "scrape or import, enrich, deliver" from the web system. Tests and build pass.

## Pass 28 (parallel build, merged in pass 31) - last-day audit against the full brief: which KIND of business replies and buys (the learning loop for targeting)
**Audit result.** Every step of acquisition -> sale -> delivery -> retention -> cash already existed (passes 1-27); Google Maps is gone (OpenStreetMap + CSV import, no key, no card); every AI call goes through the one DeepSeek-first client; the finder, the CSV enrichment and the Python worker all run from the app or alongside it. One real gap remained in the "war chest": the app measured which message angle, template, channel and source work, but **not which kind of business** (plumbers, dentists, ...) replies and buys, so "who should I look for next?" was answered from a guess, not from our own record.
- **Category is now remembered on every first email** (`sent_emails.category`, cleaned to one short lowercase label by `cleanNiche`; web addresses, phone numbers and junk are dropped, a cell with several categories keeps the first). Stored by every path that sends a first email: the one-lead AI send, the "draft all, approve together" batch, the overnight queue + Autosend (the queue now carries the category), the CSV bulk sender (`category` column) and `send-new-leads`.
- **Business Value -> "Which kind of business replies and buys"**: per niche, emailed -> replied -> real chats -> won -> revenue. Counted once per lead under the category of their first email; a reply to any later email counts. A niche is labelled "too few yet" under 10 leads; a verdict (8+ points of reply rate ahead of the next niche, two niches with 10+ leads) is only shown when the data supports it; leads with no category are counted and stated, not guessed.
- **"Who should I look for?" now learns from it.** The AI target finder is given our own per-niche results (niches with a sale or with 10+ emails; four emails and no reply is not evidence) and told to rank by them and to quote only those numbers. No results yet = the prompt is exactly what it was.
- **Side fix:** the single-lead AI send did not record its message angle (so it was missing from the angle test); it does now.
- Code: `lib/niche.js` (pure), `lib/server/niche-evidence.js`, `app/business/page.js`, `app/api/ai-targets/route.js`, the send routes, `lib/server/autosend.js`, `lib/server/prepare-drafts.js`, `lib/draft-queue.js`, `app/dashboard/page.js`. Cost: nothing extra (arithmetic on rows already loaded; the target finder prompt grows by up to 5 short lines).
- Tests: `niche` (cleaning, per-lead counting, qualified/won/revenue, verdict rules, uncategorised count, evidence lines). The test caught a real bug while writing it (a web address was being cut at the "/" and kept as "https"). Import check OK, 271 files parse.
- **Not run:** `next build` and the suites that import Firebase / Stripe / Next (the package registry is blocked in the build sandbox), and nothing against a live Firebase. Run `npm test` and `npm run build` on your machine before deploying.

## Pass 27 - phone numbers no longer pass as business names; going back and forth between pages no longer reloads everything
Both reported from real use. The second was fixed in the architecture, not page by page.

**1. A phone number is never a business name.** Scraped lists and map data sometimes carry the phone number in the name field, and it then showed up as the business in CRM & Deals (and in "Hi 0771234567," greetings and on invoices).
- New `lib/lead-name.js`: recognises phone-like names in any format (not "7 Eleven" or "24/7 Plumbing"), and where it honestly can derives a name from the lead's own website or business e-mail domain ("acme-plumbing.lk" -> "Acme Plumbing"). It never invents one: free-mail, social and link-in-bio hosts give nothing.
- Applied where names enter: Lead Inbox (finder, CSV import and worker all pass through it), list import, the map finder (next real name tag first), dashboard CSV rows, send-email, send-new-leads, send-followup, AI deal drafts, and deal writes (a phone number is never stored as a deal name).
- Applied where names are read: CRM, Business Value, Customers, Billing and recurring-revenue numbers show the cleaned name (or the e-mail), so old records that already hold a number are fixed on screen without editing the data. A lead with no usable name shows "Unnamed business".
- CRM lead details: **Rename / Add a name** next to the company (saved on the deal, which wins everywhere).
- A genuinely blank name is still treated as nameless (unchanged).

**2. Architecture: stop re-downloading and re-building on every navigation.** Causes found: every page drew its own copy of the sidebar and top bar (thrown away and rebuilt on each navigation), every page started its own sign-in listener and showed a spinner until it answered, and every page downloaded its own copy of the same Firestore collections (the Business page alone up to ~11,000 documents per visit, against the free plan's 50,000 reads/day), then re-rendered from empty. A toast also re-rendered the whole page it appeared on.
- **One persistent frame.** `app/components/AppShell.js` (root layout) holds the sidebar, top bar, avatar and theme button for the 8 app pages and stays mounted between them. `DashboardLayout` now only hands over the page title, so pages are unchanged. The dashboard keeps its own frame.
- **One sign-in listener.** `app/components/AuthProvider.js`: no per-page "who is signed in?" wait; switching accounts or signing out empties the cache so data never leaks between accounts.
- **One shared, cached read layer** (`lib/swr-cache.js`, `lib/client-data.js`): the first page to ask downloads a collection, the others reuse it (60 s for deals / sent emails / invoices / inbox / follow-ups, 2-5 min for the rest); simultaneous asks share one download; a failed download is never kept.
- **Always fresh after a change.** `lib/client-firestore.js` replaces `firebase/firestore` in all browser code and drops exactly the cache entries a write touches; any server call that may write (send, draft, import...) clears the read cache (`lib/api-writes.js`; read-only calls are exempt).
- **Instant return.** Each page remembers what it last showed and repaints it at once, refreshing quietly behind it; only the very first visit shows a spinner.
- **Calmer rendering.** Toasts no longer re-render pages (split notification context); theme and auth values are memoised; the sidebar and top bar are memoised.
- Tests: `client-cache` (15), `lead-name` (7), `lead-name-wiring` (5). A throwaway harness also server-rendered all 8 pages inside the new frame with fixture data; it caught a real bug (a local variable named `stale` on the Business page shadowed the new cache function), fixed here.
- Not run in a real browser, and the dashboard (own frame) is still a full switch when you go to or from it; its data was already cached.

## Pass 26 - the forecast counts what is already under contract; customer value against cost to win (merged with pass 25 below)
Two parallel v21 builds were compared file by file and combined: they changed different files (pass 25 = closing tools; this pass = business numbers), so nothing was overwritten.
- **Gap closed: "What to expect" ignored recurring revenue.** The forecast only weighed the open pipeline, so a business with paying subscribers and an empty pipeline was told to expect nothing. Business Value now shows, for 30 / 60 / 90 days, **already committed (monthly recurring revenue still running) + from the pipeline**, with the range. A subscriber whose renewal date passed with no record of them leaving is left out until confirmed (the page says how much that is); the low end assumes customers renewing soon leave, only for the time after their renewal date. A one-off business sees exactly what it saw before.
- **Cash already invoiced and waiting** (and how much is overdue / due in 30 days) is stated under the forecast but never added to it: mostly it is revenue already counted.
- **Customer value against cost to win.** Lifetime value / cost per win, and months for a new customer to pay their win cost back, with a plain verdict (3x or more is healthy). Each is withheld until its inputs are real. Win cost = this tool + AI spend only; your own time and commission are not in it.
- **Proposal guard tightened (pass 25 code).** When a deal value IS set, a proposal may contain only that amount: any other price the AI writes (`WRONG_PRICE`, "$1,800" when the deal is $1,500; also a made-up monthly or yearly figure) is discarded like an invented one. Same-price formats ($1,500 / 1500 USD / LKR 150,000 / Rs. 90000) pass.
- Code: `lib/outlook.js` (pure), `app/business/page.js`, `lib/deal-extras.js` (`moneyAmountsIn`), `app/api/ai-deal-draft/route.js`. Tests: `outlook` (10), `closing-tools` (5 groups). Not run in a browser.

## Pass 25 - closing and repetition: proposals, and lost deals worth another try
- **Draft a proposal** (CRM > open deal). `ai-deal-draft` gets a `proposal` kind: a short written proposal, as an email you edit and send, built ONLY from the notes, the four qualification answers, what you sell, the deal value and your payment terms. No real value set = a `[price to confirm]` placeholder. A draft that contains a price that was not given, or promises a guarantee or discount, is discarded (`proposalProblem`, tested) instead of shown.
- **Draft a check-in email** for lost deals (CRM > lost deal). A `revive` kind for deals lost on price, timing or silence, 45+ days after the last contact (later of last update and last contact, so one you just sent is not suggested again). A plain "no", "no real need", "other", an opt-out, a bounce and anyone on the suppression list are never revived (`reviveCheck`, tested; the server and the screen use the same rule). The existing "win back" nudge in Do this next now points at it.
- Tests: `closing-tools` (4 groups). Costs: one cheap DeepSeek call per draft, under the existing daily AI caps; nothing is sent automatically.

## Pass 24 - last-day audit against the full brief: post-level auto-analytics, docs made truthful
- **Which post brought the enquiry, automatically.** Each post's enquiry link now carries its own tag (`&c=`), the public form passes it on, and Content shows "N enquiries from this post" on the card and a total under "What is working" (counted from the owner's own enquiry records; no typing). The scheduled auto-poster sends the same tagged link. The bio link stays platform-level, since every post shares it. Before, an enquiry was credited to the platform only, and per-post results had to be typed in by hand.
- **Gmail token cache** (pass 23) moved out of the component, so it survives page changes and no longer adds React lint errors.
- **Docs made truthful.** STRATEGY.md and COMMERCIAL_READINESS.md still listed the Conversations log, team/commission, Autosend, scheduled posting and the lead finder as "not built / left out"; they now say what exists and what really remains (separate team logins, load testing, Google's Gmail verification for selling).
- Checked, no change needed: Google Maps API is gone everywhere (OpenStreetMap, no key, no card); every AI call goes through the one DeepSeek-first client; MRR / churn / lifetime value / renewals, cost per reply and per win, ROI and the versus-hiring comparison exist; weekly KPI, onboarding, billing/collections and customer health exist.
- Tests: content (+1). Import check OK.

## Pass 23 - more of it runs on the Firebase packages
- **Gmail permission through Firebase sign-in.** The dashboard now asks for the Gmail permission with Firebase Auth (`reauthenticateWithPopup` with the gmail.send / gmail.readonly scopes), so sending and reading replies no longer need a separate Google client id or secret. The token is kept in memory for 50 minutes (fewer pop-up windows). If the Sender email setting is a DIFFERENT Gmail than you signed in with, Google's own script is loaded on demand as before (needs `NEXT_PUBLIC_GOOGLE_CLIENT_ID`), because Firebase cannot grant a token for another account. `send-followup` no longer refuses to run without a client id and secret. They are only needed for the automatic overnight Gmail features.
- **Logins verified with firebase-admin.** `lib/server-auth.js` checks the ID token locally with `firebase-admin` (needs only `NEXT_PUBLIC_FIREBASE_PROJECT_ID`) and falls back to Google's lookup call. Trade-off: a Firebase account you DISABLE keeps working until its token expires (at most 1 hour) when the local check accepts it.
- **Easier server credentials.** `FIREBASE_SERVICE_ACCOUNT_JSON` is read as downloaded, on one line, wrapped in quotes or as base64 (`lib/service-account.js`). A damaged or incomplete key is reported at start-up with the reason, and a key from a different Firebase project than the web app is flagged. On Google's own hosting (or with `GOOGLE_APPLICATION_CREDENTIALS`) no key is needed: firebase-admin uses Application Default Credentials.
- The connection check's Gmail line now tests the Firebase web config; the client id/secret only affect an optional "automatic Gmail" note.
- Tests: `service-account` (7).

## Pass 22 - connection check: clearer database error, no false alarm for phone calls
- **Database check** now recognises "16 UNAUTHENTICATED / invalid authentication credentials" and says what it means (the service-account key was read but Google rejected it: deleted, disabled, wrong project, or damaged when pasted) and how to replace it. Before, it suggested checking unrelated variables.
- **Call webhook protection** no longer shows red when Twilio is not configured (it only matters if phone calls are used).
- Tests: connection-status and release-files pass.

## Pass 21 - last-day audit: two real gaps closed
- **Import your own list, in the app.** Lead Inbox → "Already have a list? Import it". Any scraped or exported CSV (Google Maps extension, bought list, CRM export): columns are recognised whatever they are called (title / name / business name, website / url, email, phone / whatsapp number, address, category), a Google Maps link or a Facebook page is never mistaken for a website, local phone numbers get the default country code, duplicates and rows with no contact are dropped, and a preview shows what was understood before anything runs. The same resumable job then reads each website, scores each lead and delivers the good ones to the Lead Inbox (labelled `list: <file name>`). No map request, so it does not use the 12 daily searches; only the 500 daily website reads. A supplied email is kept even without a website. Up to 500 businesses per file; refused while another search is running (it would replace that queue). This closes the "Google Maps -> scrape -> enrich -> send" route without the paid API, and covers cities where OpenStreetMap is thin. New: `lib/lead-import.js`, `startImport` in `lib/server/lead-finder-job.js`, action `import-list` in `/api/find-leads`.
- **Never cold-email someone you already deal with.** A lead found again by the finder, the worker or an import used to be eligible for a cold first email even when they were already a customer, an inbound enquiry, a WhatsApp/call conversation or a referral (only "emailed from here", opted out and Lost were checked). Now any existing deal blocks the automatic cold paths: Lead Inbox delivery (`known` is counted among the skipped), overnight first-email drafting (no AI cost spent), the draft review window and Autosend (`stillGood`). Follow-ups are unchanged (they need a deal). Fails open if the lookup fails. Manual sends are never blocked by this.
- Docs: STRATEGY.md and README.md still said social posting and unattended sending were left out; corrected to match passes 18 and 20.
- Tests: `lead-import` (7). Full suite and `next build` pass. Not run live: a real CSV through a deployed app against Firebase.

## Pass 20 - the "still open" items, built
- **Automatic social posting.** Turn on "Publish my posts automatically" in Account and paste the "catch hook" address of your own Zapier / Make / Buffer scenario. Each day the posts that are due are sent to it (text with hashtags, the tagged enquiry link, a visual brief) and marked posted; your automation publishes them to LinkedIn, Facebook, Instagram, X and so on. AI-drafted posts wait about 20 hours so you can read or skip them; a post with an unfilled [bracket] or older than 3 days is never sent; failures keep the post scheduled and the reason is shown. Internal / private addresses are refused. "Send a test" checks the address first.
- **Conversations page.** A reply that came in on WhatsApp, SMS, a call, LinkedIn, Instagram, TikTok, Facebook or in person is logged in 20 seconds: the AI reads it, the deal moves forward (never backwards), follow-up emails to that person stop, and the exchange is kept. A new deal is credited to the channel.
- **Team and commission.** Add the people who work the pipeline (Account, "Your team": name, role, commission %), pick an owner on any deal (CRM or Conversations), and the Business Value page shows each person's open pipeline, wins, win rate, the cash actually collected on their deals and the commission it earns, this month and all time. Commission is only on invoices marked PAID. Deals with no owner are listed so nothing is lost. This is a label for credit and pay on the one shared login; separate staff logins are intentionally not part of this build.
- Also: morning brief and weekly report e-mail, learned best angle, "last run" line, autopilot alerts (earlier passes in this release).
- Tests: team (4), conversations (6), post-webhook (6), autosend (13), owner-report (5), content (10), lead-finder (23), 15 orchestration scenarios.

## Pass 19c - map search that survives busy free servers
- A busy server's "504" used to be read as "area too big": the search split the area and gave up instead of trying the next server. It now tries the next server.
- A search is now a grid of small tiles (middle of the city first, at most 4 x 4), two quick tries per tile. A tile the servers cannot answer is skipped and remembered; the other tiles' leads are still returned with a note ("only part of the area was searched"), and the next search of the same thing resumes where it stopped. Only when nothing at all can be fetched is it an error, and then it stops after a couple of tiles instead of burning the whole time.
- A search the map could not answer no longer uses up the daily allowance of 12.
- The server that answered last is tried first. Tests: tiles, 504 handling, skipped tiles, resume, allowance (23 lead-finder tests).

## Pass 19b - Lead Inbox "free map servers are busy"
- Cause: the business-name search asked the free OpenStreetMap (Overpass) servers to match a regex across every key of every object in the area. City-sized searches could not finish and timed out. It now uses the indexed form (the cheap `shop`/`craft`/... key filter first, then the name match) and a lighter server-side timeout.
- Each attempt is shorter (22 s) so a slow server is dropped for the next one instead of using the whole budget; a fourth public mirror was added.
- If the name search is still too heavy, the search falls back to the category search alone instead of failing (some leads beat none).
- Tests: query shape, and the fallback (20 lead-finder tests). Not testable here: the real public servers.

## Pass 19 - closing the manual gaps
- **Morning brief**: a short email to yourself, only on days something needs you (replies without a deal, due follow-ups, hot leads waiting, money owed, posts due, a stopped Autosend). Quiet days send nothing; on Mondays the weekly report replaces it.
- **Learn from replies**: autopilot favours the cold-email angle with the best reply rate, but only once at least two angles have 15+ leads and a clear gap. Your own choice in Account always wins. Switch it off and it stops being used.
- **Post now** opens X and LinkedIn with your post already filled in (the text is still copied); other networks open as before.
- Cron order changed so the brief reports what Autosend just did: Autosend 04:00 UTC, daily job 05:30 UTC.
- Export and delete now include `autosend_log` (the Autosend daily counter). **Republish `firestore.rules`.**
- New switches in Account -> Autopilot (also turned on by "Run my business on autopilot"). 5 new unit tests files/cases and 2 new server scenarios (14 total).

## Pass 18 - Autopilot (the operating spine runs itself, inside limits)
- **Autosend**: the server sends the overnight drafts from the owner's Gmail (opt-in "automatic sending" permission), with a daily cap (max 50), a weekday send window, a pause between emails, inbound replies first, the same checks as a hand-pressed Send, opt-out links on every email, and automatic pauses on bounces (>=5% of 7 days), Gmail rate limits, repeated failures or an expired grant.
- **Billing autopilot**: monthly subscription invoices are raised and emailed (never the first invoice), and overdue invoices get polite reminders (max 3, spaced, fixed wording, no AI cost).
- **Weekly report** emailed to the owner on Monday; **content autopilot** drafts and schedules next week's posts when the calendar runs empty (posting itself stays one tap).
- Account -> Autopilot: one button plus a switch per part, a plain-words status line, pause/resume, daily cap and window. New crons `/api/cron/daily-ops` and `/api/cron/autosend` (shared `cronGate`).
- Verified with 17 new unit tests and 12 end-to-end scenarios of the real server code against an in-memory database.
- **Never silent**: each real Autosend / daily-ops run leaves a one-line record (shown as "Last run" in Account -> Autopilot), and a paused or blocked Autosend becomes a top item in Business -> "What to do next" (urgent when it stopped itself, a reminder when you paused it).

## Pass 17 - churn win-back
- Customers who left now have a "Draft win-back note" button: an honest, no-discount, no-pressure AI note that asks what would have made it better (new post-sale purpose `churn_winback`; never enters the prospect sequence).

## Pass 16 - found by actually running the pages
- A customer who had left (churned) still appeared under "Won but not invoiced" and in "Do this next", asking you to invoice someone who is gone. Churned customers are now excluded (business metrics carry `churnedAt` through; `computeUnbilled` skips them). Two tests added.

## Pass 15: subscription business value (MRR, churn, lifetime value, renewals)
**The gap.** Every number assumed a sale is a one-off amount. A subscription business (or the software itself) lives on monthly recurring revenue, who renews and who leaves; marking a leaver "Lost" would also have wrongly lowered the win rate.
**Customers → open a customer → Subscription:** a monthly amount (a yearly plan: price ÷ 12; 0 = one-off), an optional next renewal date, and **"This customer left (churned)"** with an optional reason. A churned customer stays a Won deal (revenue earned is still revenue), leaves the active list and its health counts, and sits under **Customers who left** with a **Reactivate** button. A renewal within 30 days, or a date that passed with no record of them leaving, flags the customer "Needs attention" with the reason.
**Business Value → Recurring revenue** (appears only once a customer has a monthly amount, so a one-off business sees nothing new): MRR, ARR, net new MRR (30 days), monthly churn (from subscriptions that existed 90 days ago; flagged as a rough guide under 5), lifetime value (average revenue per subscriber ÷ churn, capped at 5 years, and withheld until someone has actually left: no invented figure), MRR at the end of each of the last 6 months (rebuilt from start and leave dates with today's amounts), and renewals due or overdue.
**Turning subscriptions into cash.** *Billing → Subscriptions to invoice* lists active subscribers whose last invoice is about a month old or older (28+ days; voided invoices ignored; never-invoiced customers stay in "Won but not invoiced"), with a one-tap prefilled invoice (their monthly amount, "Subscription, <month>"). *Do this next* now also says when subscription invoices are due, when renewal dates have passed with no record of the customer leaving, and when subscribers renew within 30 days.
The **weekly report** (copy / email to yourself) gains a recurring-revenue line (MRR, subscribers, net new this month, renewals within 30 days) for subscription businesses only.
**Not changed:** forecast, win rate, pipeline and ROI maths. Nothing is estimated; a deal counts as recurring only when you typed an amount.
**Tests:** `recurring` (16: deal writes, MRR/ARR, churn base and rate, capped lifetime value, no-churn, trend, renewals, latest-write-wins, customer list and health, subscriptions due, next actions). Syntax of every file parsed; nothing run in a browser.

## Pass 14: build no longer breaks on leftovers from an older release; "not saving" is now diagnosed on screen
**The build failure.** Unzipping a release over an older project leaves behind files the new release dropped. Those leftovers (`lib/reply-text.js`, `lib/gmail-watch.js` and a server file that used them) imported names this release no longer exports (`QUOTE_CUT_RE`, `encryptToken`, `decryptToken`, `tokenKeyUsable`), which is exactly the Turbopack error "export X was not found". This release itself was always consistent.
**Fix.** `npm run build` now runs a cleanup first (`scripts/remove-retired-files.mjs`): the two known leftovers are removed, and any other source file under `app/`, `lib/`, `components/`, `hooks/` that this release does not own (list: `scripts/shipped-files.txt`) is **moved to `_stale/`**, not deleted, and printed in the build log. `KEEP_UNLISTED_FILES=1` turns the sweep off. After adding or removing a source file yourself, run `npm run manifest`.
**Checker.** `npm run check:imports` (also in `npm test`) walks every file and fails on a missing file, a name that is not exported, or a package missing from package.json: the whole error class, without a build or an install.
**Not saving to the database.** (1) A real bug: A/B test results were written without the owner field the Firestore rules require, so the database refused them; fixed (and a failed save no longer interrupts a send). (2) The usual cause of "nothing is saved" is the server running without its service account, so every server write is refused by the rules. A red banner now appears at the top when the connection check finds that, naming the cause (not set / unreadable / rejected / package missing) and the fix; **Account → Run connection check** shows the same. Silent when all is well.
**Server login (no service-account key).** If your project will not let you create a key, the server can sign in to Firebase Auth as one dedicated email/password user with the normal Firebase client package (`FIREBASE_SERVER_EMAIL` / `FIREBASE_SERVER_PASSWORD`); `firestore.rules` has an `isServer()` rule for that one UID (a placeholder that matches nobody until you paste the UID). Same full access as a service account, same routes, nothing else changes; the service account still wins when both are set. The connection check reports which mode is active and, if sign-in or the rules fail, why. Steps: DEPLOYMENT_GUIDE.md.
**Google Maps.** Already gone since Pass 13 (OpenStreetMap, no key, no card, runs inside the app); nothing else to change.
**Tests:** `release-files` (import graph, manifest up to date, simulated leftovers are moved aside and the build graph is clean again, sweep switch and damaged-list safety), `connection-status`. Syntax of all 219 source files parsed (JSX included). **Not run:** `next build` and the suites that need installed packages (the package registry was not reachable from the build sandbox), and nothing against a live Firebase.

## Pass 13: the lead finder is inside the app (no separate worker needed)
**One flow.** Lead Inbox → **Find leads now** searches OpenStreetMap, reads each business's website, scores it with the worker's own formula and fills the inbox; **Search nightly** runs your saved searches (up to 5, one a night) before the overnight drafts, in the existing nightly job (no extra scheduled job, so it stays inside the free plan). The AI target suggestions now have **Find now** / **Every night** buttons instead of commands to paste. Nothing is sent: leads land in the inbox as "new".
**Built for the free hosting plan.** A search is a resumable job (`finder_jobs`): one quick map request queues the businesses, then time-boxed steps (about 50 s each) read a few websites at a time. The page keeps stepping while it is open; the nightly run continues anything unfinished. Phone-only businesses go first so results appear at once. Repeat searches only find what is new.
**Safe to run on our server.** Websites come from a public map, so the fetcher refuses anything that is not a public web address (private/loopback/link-local ranges, odd ports, credentials, internal names, DNS answers pointing inside), re-checks every redirect hop, honours robots.txt, caps page size and time, and reads HTML only. Per-account daily limits (12 searches, 500 websites; `FINDER_DAILY_SEARCHES` / `FINDER_DAILY_SITES`). `finder_jobs` is server-written (no browser can edit what the server fetches), included in export and deletion.
**What it does not do (the worker still does):** decision-maker names and company size from team pages, own-CSV `import`, very large slow crawls. The in-app version scores without a decision-maker bonus (max 82 instead of 100; HOT still reachable at 70).
**Also:** the ingest route and the finder now share one inbox writer (`lib/server/inbox-store.js`); the obfuscated-email reader no longer swallows the next word after a sentence-ending dot. **Republish the Firestore rules** (`finder_jobs`).
**Tests:** `lead-finder` (19: category parity with the AI target list, query safety, extraction, scoring, inbox selection, address guard incl. redirects to internal addresses, robots, crawl, map search, job steps/cancel/limits, nightly turns). Full suite, worker tests and `next build` pass. Not run live (needs the real map servers and a deployed app).

## Pass 10: built to be sold as SaaS (dormant unless SAAS_MODE=on): plans, billing, operator console, onboarding, isolation hardening
Our own use is **unchanged**: with `SAAS_MODE` unset every account is internal and unlimited. Full status, gaps and live checks: **COMMERCIAL_READINESS.md**; running it: **OPERATIONS.md**.

**Tenant isolation hardened (applies always).** Every API route now decides *who is calling* from the verified sign-in only (`identify()`); a `userId` in the request body is just a claim and a mismatch is refused (403). Previously 14 routes read it from the body and relied on the proxy alone. The nightly job calls routes directly with a secret. Server-wide diagnostics (`cache-clear`, `cache-stats`, `email-debug`) are operator-only. A test walks every route and fails if one regresses, and pins the exact set of public routes and the proof each needs.
**Plans and limits.** Trial (14 days), Starter, Growth, Internal; emails/day, AI requests/day, AI spend/month, AI enquiry replies/day, feature flags; tunable with `PLAN_OVERRIDES_JSON`. States: trial, active, past due (7-day grace), cancelled (paid time honoured), limited, suspended. Enforced on AI, all send routes, SMS/calls, ingest, overnight jobs, enquiry replies, offline Gmail. `INTERNAL_EMAILS` / `ADMIN_EMAILS` are never limited.
**Software billing (Stripe).** Checkout, billing portal, signed webhooks applied once and in order (duplicates, out-of-order and late "paid after cancelled" events handled). Account deletion cancels the subscription.
**Operator console `/admin`.** All accounts' standing and usage, AI cost per account, configuration check, suspend / unsuspend / extend trial / grant plan, audit log. Numbers only: never a customer's data.
**Onboarding checklist** and plan/trial banners (SaaS mode). **Plan & billing** card in Account. **Per-account request brake** in the proxy. Terms and Privacy switch to subscription wording and list Stripe when SaaS mode is on.
**Tests:** `tenant`, `onboarding`, `saas` (billing events, signatures against the Stripe SDK, operator actions, rate limiter, identity helpers, route-contract checks). Full suite and `next build` pass. **Not run live:** Stripe Checkout/portal/webhooks against a real Stripe account, the operator console and plan enforcement in a browser, a second real account trying to reach the first. Do the live checks in COMMERCIAL_READINESS.md with Stripe test keys.
**Not built:** teams/seats (one owner per account), lifecycle emails, load testing, scheduled backups (you switch them on), per-customer sending-domain setup, Google's Gmail app verification (outside our control).

## Pass 9: replies found while you are away, read in full; posts carry the tagged link
Nothing here sends anything. The server's Gmail access is **read-only**.

**Replies checked every night (opt-in).** Account → *Replies checked for you* → **Connect Gmail (read-only)**. Google asks once for `gmail.readonly` with long-term access; the app keeps that key **encrypted** (AES-256-GCM, `TOKEN_ENC_KEY`) in a collection no browser can read or write. A nightly job (00:30 UTC, `/api/cron/check-replies`) runs the same reply check as the button for every connected owner: opt-outs recorded, positive replies move the deal forward, out-of-office ignored, bounces suppressed, and the dashboard shows **"While you were away"** with what happened. Disconnect revokes the key at Google and deletes it; deleting the account does the same. If Google stops honouring the key (revoked, or the 7-day limit of an app in *Testing* mode) the owner gets a "reconnect" notice instead of silent failure. Overnight drafts (01:30) now run after the reply check, so nobody who just replied is nudged.
**Replies are read in full** (button and overnight): the matching message is fetched in full and only what the person wrote themselves is used (the quoted original, which contains our own footer, is cut off), instead of guessing from Gmail's ~200-character preview. We keep the short summary and the result, not the text.
**Content planner:** each post can carry **your enquiry link tagged with its platform** (LinkedIn, Facebook, X: appended to the post; X counts a link as 23 characters; Instagram and TikTok: "put this in your bio" with a copy button), so enquiries from posts are credited to the platform in Business Value without any manual tagging.
**Privacy page updated** to say exactly this (full reply read, optional long-term read-only key, how to revoke).

**Deploy notes:** set `TOKEN_ENC_KEY`; register `https://YOUR-DOMAIN/api/gmail-offline/callback` as an authorized redirect URI in Google Cloud; publish the consent screen (**Testing = 7-day expiry**); republish the Firestore rules (`reply_notices`). Full steps: DEPLOYMENT_GUIDE.md.
**Tests:** `tests/gmail-offline.test.mjs` (message text extraction, encryption round-trip and tamper/wrong-key failure, OAuth state forgery/expiry, notices, tagged post links). Full suite and `next build` pass. **Not run live:** the Google consent and callback, the nightly job and the full-message read against a real mailbox (no Google credentials here). Run the test in DEPLOYMENT_GUIDE step 6 before relying on it.
**Known limits:** one Gmail connection per owner; Vercel's free plan runs jobs once a day; the reply check still looks at one latest message per sent email; Google's consent-screen rules (verification, 7-day testing limit) are Google's and change.

## Pass 8: the learning loop + a salesperson's toolkit (sales kit, angle test, referrals, speed-to-lead, activity planner)
Nothing here sends anything. Everything below uses only what the owner entered or achieved: no invented benchmarks, no invented proof.

**Sales kit (Account → Your business)**: a **booking link** (https only), up to 3 **real results** you can stand behind, and your **honest answers to common objections**. Drafts offer the booking link as the one-click next step, may cite only your proof points, and replies / enquiry answers / closing nudges use your objection answers when one truly fits. The enquiry thank-you page shows the booking button. The kit is re-validated on the server when it is read (the browser writes the profile), so a bad link or odd text never reaches a prompt.
**Message-angle test (cold email)**: each new lead is assigned one of six honest angles (saves time, more customers, saves money, fewer mistakes, small first step, curious question), evenly and stably per lead, so the comparison is fair. The sent email remembers its angle; **Business Value → "which message angle gets replies"** shows reply rate per angle and only names a leader with 15+ leads on two angles and an 8-point gap. Optional: **Lean on this angle** (6 in 10 new leads get it; the rest keep rotating).
**Referral loop (Customers)**: a happy customer (activated, healthy, 30+ days in, nothing open or overdue, not asked in 90 days) gets an **Ask for a referral** draft carrying **their own tagged enquiry link**. Anyone who uses it becomes a **Referral deal credited to that customer**, with a reply drafted at once. Business Value lists referral revenue per customer; Do-this-next suggests who to ask.
**Speed-to-lead**: Business Value shows the median time to first answer on enquiries and the share answered within the hour.
**Activity planner**: **"What it takes to hit your goal (cold email)"** works backwards from your own reply, qualify and win rates to the emails per week you need, next to what you send now. It refuses to plan until there are 50+ leads emailed, 5+ replies, 3+ qualified and 1+ win, and says what is missing.

**Changed:** AI rules gained two lines (use only the booking link / proof points provided). Changing them changes the 24h response-cache key, so old cached drafts are not reused.
**Tests:** `tests/sales-kit.test.mjs` (link safety, kit parsing, angle assignment fairness and stats, planner maths, referral eligibility and link, referral metrics, response time, next action). Full suite and `next build` pass. **Not run live:** the AI prompts with the new kit and angles (no keys here), the referral draft end to end, and the new pages in a browser. Read the first few drafts before trusting them.
**Known limits:** the angle test needs volume (about 90+ emails before the table means anything); referral links use an ASCII-only tag (accents are dropped from the customer's name in the tag); the planner covers cold email only (inbound and referrals come on top).

## Pass 7: inbound + outbound as one system (enquiry form, instant reply draft, channel ROI) and the strategy note
Nothing here sends anything. Strategy, status and the "if we ever sell it" checklist: **STRATEGY.md**.

**New: inbound**
- **Enquiry form.** Account → *Enquiry form* makes a link (`/enquire?k=…&src=…`) for your Instagram/LinkedIn bio, a QR code, an email signature or a website (copy-paste iframe embed). Tag each link with where it is shared. The key is write-only: it can only submit an enquiry to you.
- **Each enquiry becomes a deal** ("Inbound enquiry", with its channel) and **a reply is drafted at once** into the review queue (banner: "⚡ Reply to N new enquiries"). You see what they asked above the draft, edit, press Send. A person who is already a deal keeps their stage; someone you already emailed gets no first-reply draft.
- **"Do this next" puts unanswered enquiries first**, oldest first, with their age in hours.
- **Business Value: "Inbound: which channel brings enquiries that turn into sales"**: enquiries -> real opportunities -> won -> revenue per channel (small numbers are labelled as a hint).
- Protection for a public endpoint: honeypot + link-stuffing checks (bots get a normal 200 and nothing is stored), field limits, one enquiry per person per day, per-IP and per-key rate brakes, **20 AI-drafted replies per owner per day** (the enquiry is still stored beyond that), opted-out contacts are never drafted for. The owner always comes from the key, never from the request.

**Deploy notes:** republish the Firestore rules (`inbound_enquiries`, server-written); `/api/inbound` is public by design (proxy allow-list) and answers cross-origin so a website embed works; `/enquire` is disallowed in `robots.txt`.
**Tests:** `tests/inbound.test.mjs` (cleaning, spam, tags, ids, queue, channel metrics, waiting list, next action) and a proxy test (public endpoint vs signed-in key route). Full suite and `next build` pass. **Not run live:** the public endpoint against real Firebase/DeepSeek, and the hosted page in a browser (no keys / no display here), so submit one test enquiry after deploying.

## Pass 6: closing the gaps below "you approve every send" (drafts prepared overnight, replies read, out-of-office fixed)
Nothing here sends anything. A human still presses Send on every email. This pass removes the manual steps *around* that button.

**New**
- **Drafts ready for review.** Switch on **Account → Drafts prepared overnight**. The server then writes first emails for your best new leads (HOT; WARM optional) and the follow-ups that are due, parks them in a queue, and the dashboard shows "N drafts ready for your review". Open one and you get the same review window as "Draft all, approve together": edit, untick, press Send once.
  - When it runs: right after the lead worker delivers new leads (first emails), every night at 01:30 UTC (`vercel.json` cron → `/api/cron/prepare-drafts`, needs `CRON_SECRET`), and on demand with **Prepare now**.
  - Caps: 10 first emails + 10 follow-ups per run, 30 unreviewed drafts at most; drafts older than 5 days go stale. The cron needs **no Gmail access**: it only writes drafts.
  - Opening follow-up drafts first checks for replies (same as "Draft all"). The queue also re-checks every draft before showing it: replied, opted out, Lost, already emailed, or that follow-up already sent -> dropped.
  - Unticked drafts are dismissed (not re-drafted tomorrow); drafts that failed to send stay ready. Sent first emails are marked loaded in the Lead Inbox.
- **Replies are read the moment they are detected** (`lib/server/reply-triage.js`): explicit opt-out wording ("stop emailing me", "unsubscribe") is added to the do-not-contact list at once; an interested / meeting / pricing / question reply creates or moves the deal **forward** (never backwards, never to Won, never to Lost; switch off with "move their deal forward for me" in Account); "not interested" and AI-read opt-outs only store a suggestion. The dashboard says what it did.
- **Out-of-office replies no longer count as replies** (bug, pre-existing): an automatic answer used to mark the lead as replied, cancel the follow-ups and inflate the reply rate. It is now remembered and ignored; a real reply later is picked up normally.

**Changed**
- The first-email and follow-up AI drafting rules moved to `lib/server/draft-core.js` and are used by both the buttons and the overnight job (one copy of the prompts and safety checks). `ai-smart-outreach` and `ai-followup` answer exactly as before.

**Deploy notes:** set `CRON_SECRET` (any long random string) on the host; **republish the Firestore rules** (`draft_queue` and `autopilot_users` are new, server-written collections); `vercel.json` is new (other hosts: call `GET /api/cron/prepare-drafts` daily with `Authorization: Bearer <CRON_SECRET>`).
**Tests:** `tests/draft-queue.test.mjs` (settings, queue ids, who gets drafted, due follow-ups, staleness, out-of-office / opt-out wording, forward-only deal moves). The full suite and `next build` pass. **Not run:** the new routes against a live Firebase / DeepSeek / Gmail (no keys in the build environment), so the first overnight run needs a live check.

**Merged with Pass 5 (reply-check rotation + worker `add` command), which was made separately on the same base.** The two touch `check-replies` and the follow-up batch together: rotation picks which emails are checked, then this pass reads each reply that is found.

**Still NOT built, on purpose or by constraint**
- *Consciously left out:* unattended sending, automatic replies to prospects, automatic Won / Lost on a reply.
- *Not yet built (constraint):* checking replies on a timer or from the server. Gmail access is a one-hour token the browser grants on click; a server job would need stored offline Gmail access, which changes the sign-in consent and what you tell customers. Replies are checked when you press Check replies or open the follow-up drafts.
- *Known limit:* reply reading uses Gmail's short preview (about 200 characters) of the reply, not the full text; enough for intent, thin for edge cases, which is why only clear intents act on their own.

## Pass 5: closing the loop on outbound automation
**Bug fixed (pre-existing, affected every sender with more than 50 emails)**
- **Replies to most of your emails were never detected.** `/api/check-replies` loaded every unreplied sent email and checked only `slice(0, 50)` in storage order: a fixed, arbitrary 50. Most recipients never reply, so those same 50 were re-checked forever and a reply to any other email was missed, so follow-ups kept going to people who had answered and the reply never became a deal. Now each call picks never-checked emails first (newest first), then the one checked longest ago, only from the last 60 days, and stamps `replyCheckedAt` on every email it looked at, so repeated calls cover everything and progress survives a timeout. The response reports `eligible` and `waiting`; the "Draft all, approve together" follow-up step keeps checking (max 3 rounds) while emails are waiting. `maxDuration` is now 60s for the route. Tests: `tests/reply-check-order.test.mjs` (200 emails are fully covered in 4 calls; the old behaviour would see the same 50 forever).

**New: AI suggestions now become a daily routine that runs by itself**
- Worker command `python autoleads_worker.py add -q "dentists, opticians" --location "Leeds, UK"` adds a search to the daily routine without the menu or editing `autoleads.json` (uses the existing validated writer, recognises a search that is already there, never writes a file the worker could not load again).
- "Who should I look for?" now offers, per suggestion, **Copy: search once** and **Copy: add to daily routine**, plus **one command that adds all of them**. With the worker scheduled (`schedule --install`), the loop is: AI picks who to target -> worker searches every morning, rests searches that stop finding new businesses -> leads land in the Lead Inbox, scored. The add commands appear only when a place was typed (the worker needs one). Tests: JS (`worker-categories`) and Python (every term's `add` command is accepted by the worker's real parser; end to end through `main()`: no settings file, missing words, missing place, duplicates, file still loads, the next planned run includes the new search).

**Still by design a human step:** approving what is sent (3 gates: first emails, follow-ups, closing). The single "Send Email" button in the follow-up queue relies on the last reply check; the batch flow always checks first.

## Pass 4: found by actually rendering the app in a browser (nothing had ever been looked at before)
**Bugs fixed (all pre-existing)**
- **Every AI draft window showed as a solid grey screen.** The shared `Modal` put its dialog underneath its own `position: fixed` overlay, and the overlay used `bg-opacity-75`, a Tailwind v3 class that Tailwind v4 removed (so the overlay was fully opaque). Affected: the single AI draft, "Draft all, approve together" follow-ups, the CRM dialogs, the Lost-reason prompt and the new first-email batch. Fixed (`bg-gray-500/75`, dialog `relative z-10`, `role="dialog"`, 44px close button). Verified in a real browser: the dialog is now the top element.
- **The dark/light toggle only half worked.** Tailwind v4 ignores `tailwind.config.js`, so `dark:` styles followed the device setting while the toggle changed a class nothing listened to (dark page with white cards, or light page with dark cards). `globals.css` now declares `@custom-variant dark (&:where(.dark, .dark *))`, and the first-visit default follows the device setting (the saved choice wins afterwards). All four device x toggle combinations checked.
- **The follow-up queue opened on every visit, even empty.** A brand-new customer's first screen was a blank "0 pending" window. Tasks are now read at sign-in (so the header badge is right) and the queue opens by itself only when something is due.
- **New customers saw no "Finish setup" guidance for 10 seconds.** The business settings arrived with the deferred deals load. They are now read at sign-in.
- CRM leads table: Last contact / Next follow-up / Value and Score are hidden below 1360px screens so Company, Stage and Actions fit phones and tablets (`hideOnMobile` option on `DataTable`). The CRM title no longer wraps to three lines.
- Content page: the post box grows to show the whole text, "1 post" plural, "X (Twitter)". Lead Inbox: the target-finder card folds away once leads are waiting.

**Tests:** `tests/ui-guards.test.mjs` fails if v3-only opacity utilities come back, if the Modal dialog loses its stacking, if the dark variant is removed, if the queue opens unconditionally again, or if an AI send path stops scheduling follow-ups.
**How it was checked:** a throwaway copy of the app with in-memory Firebase mocks and seeded data was driven with headless Chrome at 390px and 1280px: no horizontal overflow and no JavaScript errors on 8 pages, and the bulk first-email flow was run end to end (4 leads drafted, 1 already-emailed lead skipped, 3 sent, 9 follow-up tasks created, deals set to Contacted, queue badge updated). Gmail, the AI and sending were stubbed in that run, so a live smoke test with your own accounts is still needed.

## Last-day pass 3: the operating spine (find → draft → send → follow up → post → measure)
**Bugs fixed**
- **Leads emailed through the AI draft button never entered the follow-up queue.** The queue is built only from `follow_up_tasks`, and only the bulk CSV sender created them (plus a one-time migration that runs only when the queue is completely empty). The one-lead AI send now schedules the follow-ups too (`scheduleEmailFollowUps`, de-duplicated, same shape as the bulk sender). Tests: `tests/first-email-batch.test.mjs`.
- **Run-rate dipped on the 1st of every month.** It averaged the last three calendar months, counting the month in progress as a full month; the annual figure multiplies it by 12. It is now the last 90 days of wins / 3, the same window as ROI. Test proves steady sales read steady across a month boundary.
- **Funnel undercounted lost deals.** A deal lost after the demo no longer counted as having had a demo. Stages now count deals that are there or passed through (saved `reached` history); opt-outs excluded. Open pipeline is unchanged.
- **AI first-email drafts for opted-out / Lost contacts** now stop before the AI call (the follow-up route already did this).

**New (all human-approved, capped, DeepSeek by default)**
- **Draft first emails with AI, approve together** (dashboard, next to Send Emails): up to 10 new leads per run, written from your business profile plus public facts (kind of business, location, website), two at a time, shown in one window to edit / untick / send once. Reads the loaded CSV, so email-only leads work (the on-screen contact list only holds rows with a phone number). Every server rule still applies (opt-out, Lost, 24h duplicate guard, daily cap). Sent leads get follow-up tasks automatically.
- **Who should I look for?** (Lead Inbox): the AI reads "what I sell" and suggests 3 to 6 kinds of local business to target, each with a ready-to-run worker command. It can only suggest the 70 business types the worker recognises as real category searches (`lib/worker-categories.js`; `worker/test_worker.py` fails if the two ever drift), and every answer is validated before it is shown.
- **Content** (`/content`, inbound): AI drafts a week of posts for LinkedIn / Instagram / Facebook / TikTok / X with a **design brief** for whoever makes the visuals; edit, schedule, post with one tap (copies the text and opens the network), mark posted, log reach / engagement / enquiries. Analytics by platform and theme name a leader only with 3+ posts with results on at least two of them; after 5 posts with results the AI is told (ids only, never text) which platform and theme work best. Posts live under `users/{uid}/content_posts`: **no Firestore rules republish needed**; included in "download / delete my data". The AI writes `[bracketed]` placeholders instead of inventing customers or results, and the page shows a warning on any post that still has one.
- **Do this next** now shows hot leads waiting in the Lead Inbox (urgent when nothing is in play) and posts due / an empty content calendar.
- Default `AI_DAILY_CALL_LIMIT` 60 → 100 (a draft costs ≈ $0.0004 at DeepSeek's peak price; the $5/month cap is the real guard).

**Checked, no change needed:** Google Maps is fully gone (no Google API call anywhere; `place_id` is an OpenStreetMap id). DeepSeek model name `deepseek-flash` and the peak prices in `lib/ai-client.js` match DeepSeek's current official pricing page.
**Not built on purpose:** posting to social networks automatically (each network needs its own approved developer app and verification, and unattended posting is the fastest way to lose an account), sending without you present, auto-replies.
**Known limits:** `npm run lint` is not configured in the project (ESLint is not a dependency); a dry run with it shows only React-compiler style rules, no undefined variables or hook-order errors. Tests: `npm test` (24 files), `worker/test_worker.py` (94).

## Final business-readiness pass
- **Invite list.** `ALLOWED_EMAILS` (emails and `@domain` entries; `ADMIN_EMAILS` always allowed) is enforced in `proxy.js` for every signed-in API call, so strangers cannot spend your AI budget. Blocked people get a 403 with code `NO_ACCESS`; a banner explains it and offers sign-out (`AccessNotice`). Unset = open, as before. Webhooks, health, opt-out and ingest routes are unaffected. Connection check now reports open vs invite-only. Tests: `tests/proxy.test.mjs`.
- **Postal address in every email.** New Account field (`profile.address`), printed above the opt-out link in first emails, follow-ups and new-lead batches (text and HTML, escaped, one clean line, read once per request, never blocks sending). Tests: `tests/unsubscribe.test.mjs`.
- **Privacy Policy and Terms** pages (`/privacy`, `/terms`) written for what the app really does (Gmail scopes with the Google Limited Use statement, AI provider disclosure, deletion). Linked from the landing page footer. Have a lawyer read them before you charge.
- **Landing page:** "Request access" button (when a contact email is set), a "Leads found for you" card (the optional worker), legal links, Open Graph/Twitter tags, `robots.txt`, `sitemap.xml`. A malformed `NEXT_PUBLIC_BASE_URL` can no longer break the layout.
- **Setup banner** on the dashboard now lists exactly what is still missing (what you sell, typical deal value, postal address).
- **Hygiene:** the dashboard no longer sends the Firebase refresh token to the send route (it was not a Google token and the server could not use it).
- README no longer says lead finding is excluded: it is the optional OpenStreetMap worker, and the README now says so.
- **Worker lock heals itself.** If a run crashed or its window was closed, the next run now notices the old process is gone and carries on (before: it refused for 6 hours with "another autopilot run is in progress"). Checking the process is done in a Windows-safe way. The Python 3.14 `WindowsSelectorEventLoopPolicy` deprecation warnings no longer clutter the console. Tests: `LockTests` in `worker/test_worker.py`.
- **Worker menu.** Running the worker with no words in a terminal (double-click `run.bat`) now shows a menu: (1) find leads for ANY business type and place typed fresh each time (own folder per search, shared \"already seen\" memory, optional push to the Lead Inbox, optional \"repeat every morning\"), (2) use your own CSV (drag it in: a preview of what was understood and whether it is worth enriching, then crawl, score and push), (3) run the daily routine, (4) tools. \"plumbers in Dubai, UAE\" is understood. The scheduler is unaffected (it runs `run` explicitly, and without a person at the keyboard the old behaviour remains). Raw CSVs: column names like \"E-mail\", \"Phone Number\", \"Business Name\" are recognised and an email you already have is kept instead of lost. `run.bat` starts faster (installs packages only when missing). Tests: `MenuTests`.
- Checked: `npm test` (16 files), `worker/test_worker.py` (73), `next build`.

## Last day: Google Maps replaced by OpenStreetMap (free, no key, no card)
- **Lead finding no longer needs Google.** `worker/autoleads_worker.py` now searches OpenStreetMap: Nominatim finds the area, Overpass lists businesses (phone, website, email, Facebook, Instagram when mapped). Several public Overpass servers are tried in turn; areas that are too big are split into smaller ones automatically. Nothing to sign up for, nothing to pay.
- Same hand-off as before: rows keep the same columns (`place_id` is now `osm:<type>/<id>`, plus `maps_url`), so the crawler, scoring, Lead Inbox, ingest and CSV import are unchanged. The `setup` wizard no longer asks for a key.
- **Old installs keep working:** `--google-key`, `--api-key` and a `google_maps_api_key` in `autoleads.json` are accepted and ignored. `min_reviews` is ignored (OpenStreetMap has no ratings).
- Politeness built in: about one request per second, a per-install User-Agent (set `AUTOLEADS_CONTACT` to your email), `NOMINATIM_URL` / `OVERPASS_URL` overrides if you ever host your own. The Lead Inbox footer credits "OpenStreetMap contributors" (ODbL).
- Known limits: coverage is thinner than Google in some countries (check your area first with `search`), many results have a phone but no website (kept as phone-only leads), and OSM-only leads with just a gmail address and phone score below the default minimum, so the email is dropped and they stay phone-only. Use `enrich` to run your own CSV through the website crawler.
- **Bring your own scrape:** `python autoleads_worker.py import my_scrape.csv` takes a CSV you collected yourself (for example with a Google Maps extension), raw or already enriched, cleans it (common column names understood, empty and contact-less rows dropped, junk columns ignored), reads the websites unless it is already enriched, scores it and delivers it to the Lead Inbox (`source: import`). Falls back to writing `<name>_app_import.csv` for upload on the dashboard when the worker is not connected. Tested on a real 122-row scrape and its enriched version.
- Tests: `worker/test_worker.py` search tests rewritten against a mock OpenStreetMap server (split, cap, budget, retries, servers down, heavy area, CLI, old flags).
- UI: desktop sidebar no longer sits in the page flow (content was pushed right on CRM, Business, Customers, Billing, Account and Inbox); menu buttons have labels and 44 px tap targets; the active page is marked for screen readers.
- Docs: `START_HERE.md` and `README.md` updated. Old scripts in `anemails/` are untouched and still Google-based: use the worker instead.

## Lead inbox and autopilot hand-off
- **Lead Inbox** (`/inbox`, `lib/lead-inbox.js`, `lead_inbox` collection): leads delivered by the external autopilot script wait here with status new / loaded / dismissed. "Load into the sender" turns the selection into CSV text and the dashboard imports it through the same `processCsvContent` as an uploaded file (hand-off via localStorage, ignored after 6 hours).
- **Ingest API** `/api/lead-inbox/ingest`: authenticated by the owner's ingest key (`Bearer <uid>.<secret>`, only a SHA-256 hash stored), allowlisted fields, max 300 leads per request, idempotent document ids, skips opted-out, lost and already-emailed contacts. Needs the Firebase Admin service account (refuses otherwise). Listed as public in `proxy.js` because it checks its own key.
- **Key management** `/api/lead-inbox/key` (create, replace, revoke) and an Account card. The key is shown once.
- Rules and export/delete include `lead_inbox`. **Republish `firestore.rules`.** Sidebar: Lead Inbox.
- Tests: `tests/lead-inbox.test.mjs`.
- **One worker file** `worker/autoleads_worker.py` replaces four scripts (crawler, Maps search, pipeline, autopilot): `setup` wizard (also installs missing packages and the daily schedule), `check`, `run`, `plan`, `status`, `schedule`, `find`, `enrich`, `search`. Keys live in `worker/autoleads.json` (git-ignored, mode 600), environment variables override. The Account page shows a ready-made `setup` command after creating the ingest key. Tests: `worker/test_worker.py` (56).

## BDR coverage pass: billing, customers, qualification, weekly KPI
New (all human-approved; AI = DeepSeek by default, capped and cached like the rest)
- **Billing** (`/billing`, `lib/billing.js`, `invoices` collection): invoice records with due dates, mark paid / void, aging buckets, cash collected, average days to pay, on-time rate, 6-month cash chart, and "Won but not invoiced". Overdue reminders via `/api/ai-deal-draft` (`kind: collection`): tone by lateness, one per 3 days (enforced server-side), amount verified in the draft, forbidden wording (legal action, fees, interest) rejected, plain template fallback when AI is unavailable or capped. Opens in the owner's own email app; logs the reminder.
- **Customers** (`/customers`, `lib/customers.js`): onboarding checklist stored on the deal, activation rate and days to activate, health with explicit reasons, support issues (add, resolve, AI reply draft that promises only what the owner types), AI check-in drafts matched to customer age, ticking the matching post-sale reminder.
- **Qualification + closing**: four answers per deal in the CRM lead window; AI next-step email for Qualified to Negotiation (`kind: closing`, refuses opted-out and Lost contacts).
- **Weekly KPI** (Business Value): this week vs last week, headline, email-to-me, copy as text. Deals now record when each stage was first reached (`stageTimes`) so weeks are dated honestly; older deals simply do not appear in "newly qualified".
- **Versus hiring a rep** (optional, Account): base pay + commission % vs what this costs. Hidden unless entered.
- "Do this next" now includes overdue invoices, unbilled wins, at-risk customers, not-activated customers and unqualified deals. The AI coach also reads totals for money owed, customer health and the weekly numbers (no names).
- Navigation: Customers and Billing added; sidebar shows the app name instead of a hard-coded one; avatar shows the user's initial; deal-value inputs on Business Value use the customer's currency symbol (was "$").
- Data export/delete include `invoices`. **Republish `firestore.rules`.**
- Tests: `billing`, `customers` (extras, health, BDR, next actions), `weekly-kpi`.
- Second audit: re-saving an old deal at the same stage no longer counts as fresh progress in the weekly report; Business Value reads up to 2000 deals (same as the CRM); new win-back signal: deals lost on timing or silence 3 to 12 months ago appear in "Do this next" so they can be reopened.
- Known behaviour: customers won more than 45 days ago with no logged contact show as "At risk" until you press "I spoke to them" once.
- Still not done on purpose: payments, tax invoices, sending without you, scheduled/cron emails (Gmail tokens are short-lived browser tokens).

## Automation: draft everything, approve once
- **⚡ Draft all, approve together** (dashboard → Pending Follow-Ups): checks Gmail for new replies first, AI-drafts every due prospect follow-up (max 10 per run, two at a time), and opens ONE window with all drafts. Edit, untick, press Send once. Sends are paced 1.5 s apart through the normal follow-up route, so every server rule still applies (not replied, max 3, minimum gap, daily limit, opt-outs, Lost deals). Nothing is sent before that press; skipped leads are listed with the reason. Customer check-ins (post-sale) stay separate: they open in your own mail app.
- Consciously not automated: sending without you present (Gmail tokens are short-lived browser tokens; no refresh token is stored on the server), auto-replying, lead scraping.

## Final day: why deals are lost
- **Lost reason.** Marking a deal Lost (dashboard, CRM, Business Value, or the AI reply suggestion) now asks why in one tap (price, timing, competitor, no need, said no, went silent, other) or lets you skip. Stored on the deal, cleared if the deal is reopened, never overwrites the system reasons `unsubscribed` / `bounced` (still not counted as lost sales). The AI "not interested" suggestion records its own reason.
- **Business Value → "Why deals are lost"**: lost deals grouped by reason, largest money first; deals marked Lost without a reason show as "Not recorded". The AI pipeline coach receives only whitelisted reason ids + counts (no names).
- **Where your deals come from** (Business Value): deals, win rate and revenue by source. Cold email is recognised from sent emails; "Add a lead" now asks referral / inbound / other. SMS, calls and WhatsApp are not attributable (no reply signal returns).
- **Email A/B results** (Business Value): reply rate and wins per version, counted by each lead's first email; a leader is named only with 20+ leads per version and a 5-point gap.
- A/B report counts only emails sent in A/B mode (new `abTest` flag on sent emails; older rows count from the first version-B email onward), so plain sends from before a test do not skew version A.
- **Stage-chance suggestions**: every deal now records the stages it passed through (`reached`, `reachedFull` for deals tracked from creation). With 10+ such closed deals at a stage, Business Value suggests new chances (shrunk toward yours, never lower for later stages). Applied only on click; it merges just `probabilities`.
- Tests: `tests/business-metrics.test.mjs` (grouping, opt-out exclusion, write rules). `npm test` and `next build` pass.

## Opt-out + hardening pass
- **Opt-out links in every email.** First emails, follow-ups and new-lead batches carry a one-click opt-out link and `List-Unsubscribe` headers. Opting out writes a per-customer suppression list, marks an open deal Lost ("unsubscribed"), cancels pending follow-ups, and every send / AI-draft route refuses that address (an opt-out cannot be reopened like a Lost deal). Opt-outs are not counted as lost sales in win rate / lost value. Test: `tests/unsubscribe.test.mjs`.
- **`send-new-leads` emails were declared quoted-printable but not encoded,** so any "=" (every link with a query string) could be corrupted. Now base64.
- **Google client secret is read only from `NEXT_PUBLIC_GOOGLE_CLIENT_SECRET`.** The `NEXT_PUBLIC_GOOGLE_CLIENT_SECRET` fallback is gone (a NEXT_PUBLIC_ value is published to every browser). The connection check flags the old name and says how to rename it and rotate the secret.
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
