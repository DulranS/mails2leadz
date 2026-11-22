# Business gap status (after Pass 236)

Status words, used exactly as defined:
- **Built**: in the code, with its limits stated beside it.
- **Not built**: could be built, not done. The reason is given.
- **Consciously left out**: decided against, with the reason.
- **Not applicable now**: does not fit this market or this use.
- **Outside what code can settle**: needs something the app cannot do by itself.

Compliance-based external integrations (consent-management platforms, audit or attestation tools, identity checks, anything that certifies a campaign as lawful) are **consciously left out**, by instruction.

Nothing has been run against live accounts. Every external service (Gmail, Stripe, Twilio, Meta, Google Ads, calendars, AI providers, shipping) needs a live run before it is relied on. Packages are not installed in the build environment, so the full test suite and a production build have not been run on this build.

## Built

| Area | What exists | Limits, stated plainly |
|---|---|---|
| Territory routing | New enquiries and bookings go to an owner who covers the buyer's country. | Country comes from the form, or else the email domain. A .com address with a Sri Lankan buyer goes to the com pool unless the form records the country. |
| Industry routing | Owners list industry words; a deal whose industry contains one goes to a free owner who lists it. | Word match on the deal's industry text. Enquiries carry no industry unless it is on the deal. |
| Company-size routing (Pass 117) | The enquiry form asks an optional size band (1-10, 11-50, 51-200, 201+); owners list the bands they take. | Only enquiries that give a size route by size. Imported leads carry no size. The size is what the buyer says. |
| Owner availability, caps, fallback | Away owners are skipped, caps limit open deals, and a deal is never left unowned. | Away is set by hand, not from a calendar. |
| Account-based ownership | One deal per customer email, so a returning customer stays with the same owner. | Exact email match. |
| Untouched hand-offs move once | A new deal with no update or recorded touch for an hour moves once to another free owner (daily job: the move happens at the first daily run after the hour has passed; up to a day later). | "Touched" = its last update or recorded touch moved. A send the app does not record as a touch does not count. The new owner is not emailed; the Owners page shows it. |
| Unowned-deal alert | Daily reminder for open deals with no owner after 24 hours. | An alert, not an automatic assignment. |
| Quotes | Quote screen, follow-ups, accept and decline links, margin floor, payment milestones, revisions with credit. | Follow-up drafts use fixed wording. The margin floor warns and blocks sending until the owner confirms. |
| Invoices and payments | Automatic numbering, card pay links, deposits and milestones, held credit applied to the next invoice, discount codes at checkout, overdue reminders (at most three, fixed wording). | Card payment needs the owner's own payment account. Credit applies only to invoices made after it was held. |
| Repeat-buying cohorts | Business page: customers grouped by first paid month, with repeat rates at 1, 3, 6 and 12 months. | Paid invoices only, matched by email. A rate appears only once the whole window has passed. Cohorts under 5 are flagged. |
| Public page | Name, tagline, services, public product prices (with sold-out flag), testimonials, delivery choice, order form, basket by email, find-my-orders. | Shows only public details. Never costs, stock counts, customers or invoices. |
| Testimonials | Owner enters real customer words; each is shown only when the owner ticks that the customer agreed in writing. | The app does not collect or write reviews. Up to 12 shown. |
| Storefront order | A guest orders public products with a card pay link (or the owner sends the invoice if card payment is not set up). One invoice per order; prices and delivery charge come from the server. | No discount codes in a basket (use the buy link or the pay page). Rate limit 10 orders per 15 minutes per address. An order is an invoice, not a pipeline deal. |
| Stock on hand (Pass 117) | Each product can track stock on hand. A basket takes its stock in one transaction, so two buyers cannot both take the last unit. A safety buffer can be kept back from the website. A most-per-order limit applies. Sold-out products show as sold out. | Stock is taken when the order is placed, not while browsing. If an order is still unpaid after two days, its stock goes back on the shelf and the invoice stays open; a payment that arrives later is still accepted, so the owner checks stock. Manual invoices do not reduce stock. Exact counts are never shown to the public. |
| Returns on storefront orders (Pass 119) | The owner records which lines of a paid order come back, puts sellable stock back (where the product tracks stock), and chooses a refund or store credit, with an optional restocking fee of up to 50%. Store credit becomes a held credit note that is applied to the customer's next invoice. | The app moves no money: a refund is recorded as owed and the owner pays it back by their own means. A line cannot be returned past the quantity bought. A refund cannot exceed what was paid. Stock is not added back if the order's hold had already lapsed (its stock was put back then). Only orders placed after Pass 119 carry the product link the return form needs. Refund = price paid scaled to include tax, less the fee. |
| Product options (Pass 122) | A product can have up to 30 options (sizes, colours). Each option has its own stock count (see Pass 123 for its own price and weight). The public page shows one row per option; orders, returns and stock changes are per option. | Options are typed in as "name, stock, price, weight, id" (Pass 123 added price and weight). The id is kept when the owner edits the Id column; renaming without changing the Id keeps old orders matched. The product-level safety buffer does not apply to options. |
| Card refunds (Pass 120) | A recorded refund owed to a customer can be refunded to their card through the owner's own Stripe account, against the payment it was charged to. Each refund is recorded on the invoice after Stripe confirms it. | Only payments made after this release carry the Stripe reference the refund needs; older payments are refunded on Stripe or by hand. The refund is taken from one payment at a time (no split refunds). The invoice keeps the original payment; refunds are listed beside it and on the customer statement as debits. They are not yet in the accounting export. Stripe's own refund fees and timing apply. |
| Cancel an unpaid storefront order (Pass 119) | The owner voids an unpaid storefront order, and any stock it held goes back on the shelf, once. | A paid order is returned, not cancelled. If the customer pays after cancellation, the payment is still recorded and the owner must refund it by their own means. |
| Tax rate by customer country (Pass 119) | The owner enters a tax rate for each country (for example GB, 20); a storefront order to that country is charged that rate. Other countries, and collected orders, use the business default. | The owner enters the rates. The app does not decide whether a registration is needed, which thresholds apply, or which goods get a reduced rate. Those are for the owner's accountant. A country code is checked for format only, not against the list of countries. |
| Stock adjustments (Pass 118) | Products that track stock can be added to (stock arrived) or taken off (sold outside the website, for example at a market), with a note. Stock never goes below zero. | Changes the count only: no invoice is created. Invoices made by hand do not reduce stock; use this panel for them. |
| Postage and delivery choice (Pass 117, weight and destination Pass 118) | The owner sets postage bands by weight, each optionally for certain countries, or one flat charge. A customer chooses "collect" or "post it to me"; posting asks for an address and a country, and the charge is worked out on the server at checkout. | An order is refused, not guessed, when postage cannot be worked out: no band for the country, too heavy for every band, or a product with no weight. Weights are the owner's figures. One currency; no tax by destination (cross-border VAT is not calculated). |
| Shipment tracking, several parcels (Pass 117, parcels Pass 118) | For a paid storefront order the owner records each parcel (carrier, tracking number, optional https tracking link, expected delivery). Each parcel is listed on the order and emailed to the customer from the owner's Gmail, numbered when there is more than one. | The owner buys postage or labels at the carrier; the app prints no labels and receives no carrier status. Up to 20 parcels per order. |
| Receipt for a paid storefront order | The customer gets a receipt listing the invoice, the amount and the lines bought, from the owner's mail, in the next daily run. | Orders paid in the last 7 days only. Not a tax document; the invoice remains the record. |
| Unpaid storefront order nudge | One fixed-wording email, a day after an order still unpaid and not yet overdue, with the pay link. | Needs card payment set up. One email per order. |
| Find my orders (Pass 117) | A customer enters their email on the public page and is emailed a link to their orders and invoices with this business. The page gives the same answer whether or not the address has orders. | The link is a signed statement link valid for the statement period (90 days). No password, no account. Three links an hour per address. The statement shows every invoice and payment for that address, as the owner's statement does. |
| Basket by email (Pass 117) | A customer can email themselves a link that restores their basket on another device. | Quantities only. Expires after 7 days. Only a hash of the link's secret is stored. Stock and prices are checked again at ordering. |
| Basket on the device | The quantities stay on the device between visits. | Not synced across devices (the email link does that). Name and email are never stored on the device. |
| Calendar links in booking confirmations (Pass 117) | The booking confirmation carries "add to Google Calendar" and "add to Outlook" links. | Links for customers who prefer to add the booking themselves. Owners' calendars are written separately (Google, Pass 128). |
| Bookings | Public booking, per-person hours, owner and team calendars read by secret address, payment at booking, customer reschedule and cancel, no-show tracking. | Calendars are read, not written. Providers can take hours to publish a change, so the app re-checks at confirmation. |
| Outreach and follow-up | Lead inbox, cold sequences, follow-up cap of three, opt-out and bounce suppression, daily send cap of 500, drafts, reply checking. | Sends from the owner's own Gmail, so Gmail's limits apply. |
| Newsletter | Double opt-in list, scheduled sends in fair batches, unsubscribe on every email, discount codes. | Only to people who confirmed. 500 a day per account. |
| Measurement | Win rate by channel and template, speed-to-lead, attribution by source, open and click tracking on quote, invoice and outbound campaign emails, NPS, churn and renewal, cash and profit. | Open tracking is an image that the recipient's mail client may block. |
| SMS, WhatsApp, calls | Per-account Twilio keys, STOP and opt-out handling, recorded consent, AI phone assistant with disclosure, opt-out, calling hours and daily cap. | Not verified on a live call. |
| Installable web app | Works on a phone from the browser. | Not a store app. |

| Product editing and archiving (Pass 123) | Edit a product's name, price, weight, description, safety buffer, most per order and options; take a product off the public page and put it back. | An edit never changes stock (the stock panel does that). Options with stock cannot be removed by an edit. Archived products are hidden and cannot be ordered; past orders are not affected. |
| Option price and weight (Pass 123) | Each option can have its own price and its own postage weight. Option ids are editable, so a rename keeps old orders matched. | Blank price or weight uses the product's. |
| Low-stock alert (Pass 123) | Products and options with 3 or fewer left are listed on the Products page. | On-screen only; no email. |
| Card refund on an older payment (Pass 123) | The owner enters the Stripe payment ID; the server checks with Stripe that it succeeded and belongs to the order. | Owner must find the pi_ ID on Stripe. Refund is still one payment at a time. |
| Refund paid by hand (Pass 123) | Records that an owed refund was paid back by bank transfer or cash, with a dated note; shown on the statement and in the export. | Recorded, not checked against the bank. |
| Refunds in the accounting export (Pass 123) | Card refunds and refunds paid by hand appear as ledger rows, split into net and tax. | Ledger format only. Xero's sales import does not carry refunds. |
| Returns on orders before Pass 119 (Pass 123) | Older lines are matched by position; the owner names the product whose stock goes back. | No stock goes back unless a product is named. |
| Review request after delivery (Pass 123) | One fixed-wording email a week after the last parcel (or payment for collected orders), using the review link in business settings. | Not sent without a link, not after a return, not for orders over 60 days old. |

| Contact recovery (Pass 124) | Good businesses whose website shows no email are queued and looked up each night with the owner's own Hunter key (up to 20 a night). A confident contact becomes a Lead Inbox lead, with a named person when available. | Needs a Hunter key. Finds only what Hunter holds for the domain. |
| Deliverability check before sending (Pass 124) | Autosend and the review window hold a draft whose domain takes no mail. Cached 30 days per domain. | Checks the domain, not the mailbox. Temporary DNS failures do not hold a send. |

| Newly registered companies (Pass 125) | Each night, UK companies newly registered in the owner's SIC codes are found, their domain is confirmed by the homepage carrying the registered name, and their contact is looked up (Hunter). Leads wait in the Lead Inbox. | Needs a Companies House key and a Hunter key. A company whose site does not carry its registered name is not used. Trading names that differ from the registered name are missed. |
| Back in stock (Pass 125) | A visitor asks once to be told when a sold-out item or option is orderable again; one email, then the request is closed. | No separate unsubscribe link: the request is one-off and the address was given for it. |
| Erasure covers new records (Pass 125) | Restock requests and the contact-lookup queue are included in customer erasure. | Erasure is as complete as its scan list; new collections must be added to it. |

| Abandoned-basket reminder (Pass 126) | A customer who asked for their basket by email and has not ordered from that address within 1 to 3 days gets one reminder with a fresh basket link. No reminder after an order. | Needs the storefront key stored on the basket record (server only). The reminder is sent only in the owner's send window. |
| Monthly paid-ads spend import (Pass 126 register correction) | Meta and Google Ads monthly spend is read (read-only) into marketing spend. Months entered by hand are never overwritten. | Google needs its developer token approved before the import works. Monthly, not daily. |

| Stock for invoices made by hand (Pass 127) | The Billing invoice form takes a product (and option) and a quantity off the shelf in one transaction; a sale the shelf cannot cover is refused. Cancelling an unpaid hand-made invoice that took stock puts it back, once. | A paid hand-made invoice keeps its stock taken; put it back with a stock adjustment. Only one product line is offered on the form (the API takes up to ten). Hand-made sales are not held back by the online safety buffer. |
| Gift cards (Pass 127) | A product flagged as a gift card gives the buyer held store credit equal to the line's value when a storefront order is paid. The credit is applied to their next invoice like store credit from a return. Issued once per order, in the daily run. | Issued in the daily run, so up to a day after payment. Credit goes to the buyer's email; there is no recipient field. The ledger leaves gift credit out so the value is not counted twice; treating gift sales as deferred revenue is for the owner's accountant. |

| Google Calendar write-back (Pass 128) | The owner connects Google Calendar (calendar scope only). A confirmed booking is added as an event with the service and the customer's first name; cancelled, declined or moved bookings lose their event. Works for bookings confirmed by payment, by the owner, and by the customer's own cancel or move. | Google asks for a sensitive permission: until Google's review is complete the consent lapses after 7 days for apps in testing. Only the first name is written. The event does not carry email or phone. An event added before a change made outside these routes is not updated. Outlook is not built. |

| Outlook calendar write-back (Pass 129) | The owner connects Outlook / Microsoft 365 (calendar permission only). Confirmed bookings are added as events with the service and the customer's first name; cancelled, declined or moved bookings lose their event. Each calendar is kept separately, so a booking can be on Google and Outlook at once. | Microsoft's calendar permission is delegated; the owner grants it in their own account. The Microsoft app registration and redirect address must be set up on the server. Disconnecting removes our copy; Microsoft keeps its grant record until the owner removes it under "My apps". Same limits as Google: first name only, no two-way sync. |

| Shipping labels and tracking (Pass 130) | On a paid storefront order, the owner buys the cheapest carrier label through their own EasyPost account. The weight comes from the products on the order. The parcel is recorded, the customer is emailed the tracking link, and carrier status (in transit, out for delivery, delivered) comes back by webhook; the customer is told once when it is delivered. International parcels get a customs declaration built from the order's lines. | Each label is paid from the owner's EasyPost account, on the press only. Customs codes (HS) are not generated and the owner must check the declaration; the export declaration value is the price paid per unit. Currency is the EasyPost account's. No return labels, no insurance. The owner's sender address is typed in (or remembered), not checked. The customer's address is the free text from the order, so the owner corrects it on the form. Carrier availability follows EasyPost. |

| Buying-signal feed alerts (Pass 131) | The owner adds up to five public RSS or Atom feeds (job boards, council planning lists, tender notices, news). New items appear as alerts, each with a keyword tag (tender, planning, hiring, funding, new business). Checked nightly. | Tags are keyword rules, so they can be wrong; they are shown as tags, not judgements. Alerts do not identify a company or contact anyone; the owner decides. No email is sent for an alert; they are seen on the Integrations page. Only feeds that publish RSS or Atom work. |
| Approximate amounts in other currencies (Pass 132) | The owner types up to five indicative rates, for example EUR 0.92 (how many euros for 1 unit of the business currency). Invoice emails, payment reminders and storefront order nudges show the approximate amount beside the amount in the business currency, with the date the rates were set. | Indicative only: the app never fetches rates and the owner types them. The customer's bank sets the exact amount. Payment, the Stripe charge, invoices, the ledger, statements, receipts, stock and the public page stay in the business currency, and the public page shows no approximate amounts. Rates need updating by hand. |
| Invoices charged in another currency (Pass 133) | On the Billing page the owner can charge an invoice in any currency they have a saved rate for. The rate is taken from the owner's saved rates on the server, and is fixed on the invoice when it is issued. The customer gets the invoice email and pays by card in that currency: Stripe charges the amount still owed at the fixed rate. The books, the statement total, the ledger and the revenue figures stay in the business currency. Card refunds go back in the charge currency. | Only invoices made on the Billing page (and their email, reminders, statement line, card payment, refund and ledger row). The rate does not move for an invoice once issued. Stripe must support the currency for the owner's account; if it does not, checkout fails and nothing is charged. A foreign invoice cannot use a discount code. Manual payments (Mark paid, part payments) are recorded in the business currency: the owner enters the equivalent. The bank may add a conversion charge. Card refunds can differ by a cent from the original charge because of rounding. |
| Sales charged in another currency (Pass 134) | Quotes, storefront orders and buy links can be charged in a saved currency. The customer picks it on the public page (or the owner on the Quotes page); the rate is the owner's saved rate, fixed when the quote or order is made. Quote amounts, the quote email, the follow-up and the customer's quote page show the charge currency. Milestone and adjustment invoices for a quote are charged at the quote's fixed rate. | Quotes are priced in the business currency and converted at the fixed rate for display. Quotes made before this release keep their old free-text currency label and are not converted. The buy link is set up through the API; the owner's buy-link screen has no currency choice yet. Bookings are not covered (see Not built). Same bank and Stripe limits as Pass 133. |
| Bookings, automatic invoices and deal currency (Pass 135) | A deal has a charge currency, chosen in the CRM table. Subscriptions and won-deal invoices are charged in it at the owner's fixed rate on the day they are made. A booking that takes payment is charged in the currency the customer picks on the booking page. The owner's buy-link screen has a currency choice. | A won deal whose currency has since been removed from the saved rates is not invoiced (it is never invoiced in the wrong currency); the owner must re-offer the currency or change the deal. Bank and Stripe limits as before. Bookings and buy links are checked in the build, not run live. |
| Pipeline alerts and reminders (Pass 136) | Each day, from the owner's own records: open deals that have sat in one stage too long get one alert per stage entry (thresholds by stage: 7 to 14 days). Lost deals for a revisitable reason (price, timing, no response) get one suggestion 90 days after they were lost. Subscriptions renewing within 14 days get one alert. The owner gets one digest a day, in the morning-brief window. Confirmed bookings starting within two days get one reminder to the customer, from the owner's Gmail. | Nothing is sent to a customer except the booking reminder. Alerts are kept in their own collection, never the follow-up queue, which drafts and sends customer email. Thresholds are fixed defaults (not yet editable). Alerts are seen in the daily digest only; there is no in-app list yet. The digest is daily, not instant. A booking reminder goes to a customer who has unsubscribed from marketing, because it is part of a booking they made; this is a judgement the owner should know. Checked by tests and a build, not run against live Gmail. |
| Pipeline alert list, thresholds and monthly summary (Pass 137) | The CRM page lists open pipeline alerts, each with its reason, and the owner marks it done. Stall thresholds per stage are set on the Account page (blank keeps the defaults). On the first day of each month the digest adds last month's won and lost counts, win rate and the most common reasons lost. | The alert list updates live while the CRM page is open. Marking done only closes the alert; it does not change the deal. The monthly summary appears in the digest, not on screen. Win rate counts only closes recorded in the deal's stage history. Checked by tests and a build, not run in a browser. |
| Push alerts and hourly checks, switched by keys and one command (Pass 140) | Phone and browser push for new pipeline alerts: the owner turns it on from Account; the server sends it once the three VAPID keys are set. The pipeline check is its own job: daily on Vercel Hobby (the default), hourly on Vercel Pro (`npm run schedule:hourly`, then `npm run schedule:daily` to go back). Nothing is sent to a customer. | Push does nothing until the keys are set; the Account page says so. Hourly checks need Vercel Pro and cost reads: each hour each autopilot owner reads up to 2,000 deals and 3,000 alerts. The digest is once a day. A device that revokes permission stops receiving push; the server removes subscriptions the push service reports gone. Not run here against a real push service or a real device. |
| Slack, mailbox checks and Meta Lead Ads (Pass 141) | Slack: the owner pastes an incoming-webhook URL in Account; hot replies, enquiries, bookings, payments and accepted quotes are posted there (no server key). Mailbox check: with a Hunter key (the one used for company lookup), an address the verifier calls invalid or disposable is held before a send; results are cached 30 days. Meta Lead Ads: five server settings; each new lead form entry lands in the inbox as new. | Slack needs the owner to create the webhook in Slack. The Hunter check uses Hunter credits (one per new address a month) and holds only invalid or disposable addresses; a failed check never holds a send. Meta: one Page and one owner per deployment, from server settings; leads are stored, never sent to. Not run here against Slack, Hunter or Meta. |
| Google Ads lead forms and GA4 conversions (Pass 142) | Google Ads lead-form submissions land in the inbox as new (three server settings). Payments, enquiries, accepted quotes and confirmed bookings are sent to GA4 as events (purchase, generate_lead, quote_accepted, booking_confirmed), so Google Ads can count and optimise on them. The events carry the value and currency only; no customer data. | Google Ads lead forms need the shared key set in the lead form webhook. GA4 events are sent when they happen; a failed send is not retried. Mark the custom events as key events in GA4 before Google Ads can import them. Not run here against Google. |
| Consent guards (Pass 143) | A bought list is stored only when its source and lawful basis are recorded; personal addresses need consent as the basis (enforced in the lead store). Hashed sync helpers: SHA-256 of the trimmed lowercase email, only customers with recorded marketing consent, a consent source and no withdrawal. | The bought-list gate is enforced, but no screen yet collects the source and basis, so the bought-list path cannot be used from the app. The hashed-sync helpers are not sent anywhere: the sender, its schedule and the owner's data-sharing confirmation are not built. Not run here against any platform. |
| Bought-list import with its source and lawful basis (Pass 144) | The lead-finder CSV import asks for where the list came from and the lawful basis before the file can be imported. The server checks both again before any row is queued, and personal addresses need consent as the basis. Both are kept with the import. | The check covers the import path only; a lead added any other way is not checked. The recorded source and basis are not shown back to the owner after import. Not run here in a browser. |
| Confirmed sign-ups to Meta, hashed (Pass 145) | Each daily or hourly run sends the sign-ups confirmed since the last run to Meta as hashed Lead events. Only double opt-in sign-ups count as consent; unsubscribed and suppressed addresses are never sent. Off unless the server has META_DATASET_ID and META_CAPI_TOKEN and the owner ticks the data-sharing box in Account. | Meta only, and only sign-ups. Not run here against Meta. The owner must hold the right to share these contacts; the tick box records that they confirmed it, the app does not verify it. Lead events carry no value. |
| On/off switches, claim hold, first-batch approval, enrichment and TikTok (Pass 146) | Account has one switch per optional feature, each on only when the owner turns it on and the server has its keys: deal enrichment (Apollo, job title and company size, up to 20 deals a run), TikTok hashed sign-up events (with the same data-sharing box as Meta), and the claim hold (on by default). Drafts with price, result, guarantee, urgency or superlative wording are held for review. Autosend sends nothing until the owner approves the first batch. | The claim check is rule-based: it catches common wording, not every claim, and it never approves a draft. Apollo and TikTok endpoints and payloads follow their documentation as I know it; verify both against current docs before switching on. Not run here against Apollo or TikTok. |
| Quote economics (Pass 147) | A quote can carry optional estimated hours. The quote list shows the rate the quote pays per hour, and flags it when it is under your hourly rate (Account). Estimated hours are validated (0 to 10,000). | The rate uses the estimate, not hours actually logged. There is no time-entry log yet. Not run here in a browser. |
| Time-entry log per customer (Pass 148) | Hours can be logged against a customer's quote on the Quotes page (0.05 to 24 hours a day, not in the future). Each quote shows its estimate next to the logged actual rate, and flags a rate under your hourly rate. | Hours feed the quote rows only. The profit view still takes one hours figure per customer and does not read the log yet. There is no per-task or per-project log. Not run here in a browser. |
| Typeform and Tally lead forms (Pass 149) | Submissions from Typeform and Tally arrive in the inbox as new. Each request is checked against its signing secret before anything is read. Email, name, company and phone are mapped from the answers by their type and label. Two server settings each, plus one shared owner id. | The mapping relies on field types and labels such as 'name' and 'company'; a form with unusual labels may need its fields relabelled. Nothing is sent to the person. Not run here against live Typeform or Tally. |
| Lead-score negatives (Pass 150) | A bounced, unsubscribed or complained-about lead scores zero. A lead with no touch for 60 days loses 15 points; for 120 days, 30. | Based on the fields the app already writes; a lead with no touch date is not reduced. Not run here against a live lead list. |
| Typed-name quote acceptance (Pass 151) | Accepting a quote needs the customer's full name typed in; the name is stored as the signature with the time. Declining needs no name. | A typed name is an acceptance record, not a qualified electronic signature. Not run here in a browser. |
| Logged hours in the profit view (Pass 151) | Hours logged against a customer feed the profit view when that customer's deal has no hours typed and has a delivery cost recorded. | The profit view counts hours only for wins that have a delivery cost. Not run here in a browser. |
| Enrichment of inbox leads (Pass 151) | Apollo enrichment (switch and key as before) now also covers inbox leads, within the same 20-records-per-run cap. | Relies on the inbox leads carrying a user id. Not run here against Apollo. |
| TikTok lead forms (Pass 151) | TikTok lead submissions arrive in the inbox as new, checked against a key in the webhook URL. Nothing is sent to the lead. | The payload field names follow TikTok's lead format as known at writing; check them against TikTok's current docs before switching on. Not run here against TikTok. |
| Campaign-angle approval for autosend (Pass 151) | Autosend sends only drafts whose angle the owner has listed in Account; drafts with no angle count as general. The first-batch approval still applies. | The angle is a free label on each draft, so a campaign is only as separate as its angle. Behaviour change: after this release, autosend sends nothing until its angles are approved. Not run here against a live send. |
| LinkedIn lead-gen forms (Pass 152) | LinkedIn lead-gen submissions arrive in the inbox as new, checked against a key in the webhook URL. Name, email, phone and company are mapped by question text. Nothing is sent to the lead. | The question-text mapping and the payload shape follow LinkedIn's lead-gen format as known at writing; verify against LinkedIn's current docs before switching on. Not run here against LinkedIn. |
| Setup status and a .env template (Pass 153) | `npm run setup:status` prints every optional feature as on, partly set or off, with the keys each still needs. `npm run setup:env` writes .env.example with every key once, grouped by feature. | It reads the server's environment only; it does not check the keys work. |
| Google Ads Customer Match (Pass 154) | Each run adds the sign-ups confirmed since the last run to a Google Ads Customer Match list, as hashed emails, through an offline user data job. Only double opt-in sign-ups count as consent. Off unless the owner turns on Google Ads Customer Match in Account, the server has the Google Ads keys, and the owner ticked the data-sharing box. | The Google Ads payloads and OAuth refresh follow Google's API as known at writing; verify against Google's current docs before switching on. Each sign-up is added once; the list is created once and reused. |
| Live voice from the browser (Pass 154) | The CRM page has a Start live voice control. The server issues a short-lived voice key only when Live voice is on in Account and the server key is set; the browser then talks to the voice service directly. The assistant answers questions and offers a call, and does not quote prices, promise results or take payments. | Owner's browser only, for now: a visitor on the public site, or a phone call, needs its own session route. The voice service's realtime endpoints follow its documentation as known at writing; verify before switching on. Latency depends on the connection. |
| Commission on won deals (Pass 155) | The owner sets a commission percentage in Account. The monthly digest, on the first of each month, lists each salesperson's deals won last month, their value and their commission. Deals with no owner are shown as Unassigned. | Percentage on value only; no tiers, splits or clawbacks. Ownership comes from the deal's owner field. Not run here against live deals. |
| Sales quota attainment (Pass 157) | Team members can carry a monthly won-value target (quota). The first-of-month digest shows each person's won value for last month against the target, as a percentage. | The target is read from the team settings data; the Team page has no quota field yet, so it is set in the data for now. Not run here. |
| Pipeline velocity (Pass 157) | The first-of-month digest shows the average days from a deal's creation to its win, over the last 12 months. | Needs deal creation dates; deals made before those were recorded are skipped. Not run here. |
| Customer lifetime value (Pass 157) | Paid totals per customer address, from invoices (voided invoices excluded). | A helper only: the Customers page does not show it yet. |
| Quantity prices on products (Pass 158) | A product can have quantity prices, such as 10:90 (10 or more at 90 each). The basket charges the best quantity price the buyer qualifies for. Set on the Products page when a product is added. | Set when a product is added; editing an existing product's quantity prices is not in the edit form yet. Base price only: option prices do not take quantity prices. Each must be for 2 or more and below the normal price. Not run here. |
| Team quota (Pass 158) | Each team member has a monthly won-value target, set on the Account page next to their commission. The first-of-month digest shows attainment against it. | Monthly won value only. Not run here. |
| Paid to date per customer (Pass 158) | The customers list shows what each customer has paid to date, from their invoices (voided invoices excluded). | Shown on the list line only; no sorting or filtering by it yet. Not run here. |
| Loyalty points (Pass 160) | The owner sets a points rate per unit paid in Account. Each paid invoice (through the payment webhook) earns points, held per customer under a hash of their address. An owner can take points off a new invoice (100 points = 1 unit), checked before the invoice is written and taken off only after it is saved. The balance is readable through an owner-only route. | Earn happens on card payments through the webhook; a payment marked paid by hand does not earn points yet. Redemption and the balance are available through the invoice and balance routes, not yet on the invoice form or the customers list. Points are not refunded if an invoice is later voided. Not run here. |
| Product bundles (Pass 161) | A product can be a bundle of other products, listed by SKU with quantities (for example MUG x2, COASTER), up to 10 products. The bundle is sold at its own price. A sale takes stock from each component through the same stock check as any other order; a bundle the stock cannot cover is refused, never oversold. Set on the Products page on create and edit. | Components must be stock-tracked or unlimited, and must exist and not be archived. Bundles cannot contain bundles. Bundle prices are fixed; a bundle does not apply quantity prices. Not run here in a browser. |
| Weekly action list (Pass 162) | On Mondays the digest lists up to 8 actions from the owner's own records: overdue follow-ups, overdue invoices, stalled deals, and quotes with no answer after 7 days. Each shows its reason. | Built from the records as they are; the list is a prompt, not a queue, and nothing is sent. Reads quotes, invoices and follow-ups once a week per owner. Not run here against live data. |
| Call and meeting summaries (Pass 162) | Paste a transcript in the CRM; the AI returns a short summary, the next step, an optional due date, objections and sentiment, kept on the customer's record in call notes. Nothing is sent to the customer. Rate limited to 20 an hour per owner. | Uses the configured AI provider and its cost; the transcript is sent to that provider. The reply is checked (length, date format, allowed values) before it is kept. Not run here against a live AI provider. |
| Drafted replies to inbound messages | Already in the app: reply triage and draft preparation, held for approval under the first-batch rule. | Existing feature, recorded here for completeness. |
| Multi-touch attribution (Pass 163) | Revenue from each won deal is split across the channels that touched the customer: the deal's source and the emails sent to them before the win. Linear, U-shaped, first-touch and last-touch models. The first-of-month digest shows the top channels for the last 12 months (linear). | Built in its own module (lib/multi-touch.js); the existing attribution views are unchanged. Channels are as recorded: a deal with no source is unrecorded. Reads sent emails once a month per owner. Not run here against live data. |
| Click-to-call (Pass 163) | From the CRM, the owner enters their phone and the lead's. Their phone rings first; when they answer, the lead is dialled and the two are joined, using the owner's own Twilio account. | Needs the owner's Twilio keys, and the owner must only call people they may lawfully contact. A national number needs its country code to dial. Not run here against Twilio. |
| Speed to lead (Pass 164) | A new inbound lead with no first reply after an hour gets one alert in the pipeline job, shown in the alert list and the digest. | Alerts run on the pipeline timetable: daily on Hobby, hourly on Pro. The alert clears when the owner marks it done, not automatically when a reply is sent. Not run here. |
| Discount-code results (Pass 164) | On the first of each month the digest lists each discount code's uses, revenue and discount given for last month. | Revenue and discount only; the cost of goods is not known to the app, so margin per campaign is not calculated. Not run here. |
| Owner and due date on actions (Pass 164) | Each item in the weekly action list names an owner (from the deal's owner, or Unassigned) and a due date. | Owners come from the team list and deal owners; invoices and quotes are Unassigned unless their record names someone. Not run here. |
| UTM tagging of outbound links (Pass 165) | Every external link in an outbound email gets utm_source, utm_medium (email) and, where given, utm_campaign. Links to the business's own domain, opt-out, manage, pay and similar paths, and links already tagged, are left alone. Nothing changes until the public base URL is set. | Email links only, through the one builder every send uses. Tagging does not decide the campaign name; the campaign is only set where a caller gives one. Not run here in an analytics tool. |
| Automatic A/B winner (Pass 166) | A/B email tests pick their winner automatically once the evidence is clear: each version needs 100 test sends, and the reply-rate difference must be statistically clear (95%). The check runs weekly and stops once a winner is stored. From then on the send screen sends the winner to everyone, and the digest says which version won and why. | Reply rate is the only measure. Test sends only count when the owner ran them as a test. Winners are per account, not per campaign. Not run here against live sends. |
| Follow-up on quotes opened but not answered (Pass 167) | A quote the customer has opened, that is still open (not accepted, declined or withdrawn, and not expired), and has been quiet for three days, raises one alert in the pipeline job, and appears in the weekly action list. Nothing is sent to the customer. | The alert clears when you mark it done, not when the quote changes. Reads only quotes that have been viewed. Not run here against live quotes. |

## Not built

- **Project management (tasks and milestones per project).** Supports delivery of won work more than sales. Not built. The time-entry log is per customer (Pass 148).
- **Feeding the time log into the profit view.** Built (checked 23 Nov 2026, pass 366): app/business/page.js passes the time log to computeProfit through loggedByEmail, and the owner's logged hours replace the single hours figure per customer.
- **Per-campaign approval for autosend.** Built per account, not per campaign: the owner approves once, before the first send (Pass 146). A campaign-level approval is not built.
- **Enrichment beyond deals.** Apollo enriches deals (Pass 146); leads in the inbox and contacts are not enriched yet.
- **TikTok lead generation.** Not built: same pattern as Google and Meta lead forms; it needs its own keys.
- **Other form builders (JotForm, Google Forms) as native connectors.** Not built: the same pattern applies; Zapier or Make, or the lead-inbox ingest, covers them today.
- **Google Ads lead-form extension, native.** Not built: the same pattern as Meta Lead Ads can be added; it needs its own webhook and keys.
- **Native sync with Google Sheets, Shopify orders, HubSpot or Pipedrive.** Not built natively. The outgoing webhooks (Zapier, Make) cover pushing deal and booking events to these tools; reading orders or deals back in is not built.
- **Several Meta Pages or owners on one deployment.** Not built: Meta Lead Ads serves one Page and one owner per deployment.
- **A per-change trigger.** Built (passes 367 and 368): a move into proposal, negotiation or a won stage alerts at once when made in the app. Changes made anywhere else alert within 15 minutes once the free scheduler calls /api/cron/stage-watch. On Vercel Pro that check runs hourly (one command, `npm run schedule:hourly`); on Hobby it runs daily.

Each item says what is missing and why. None of them can be closed from inside the app alone.


- **Quotes made before Pass 134.** Not built: their free-text currency label is not a rate, so their amounts are not converted. The owner re-issues them to charge in another currency.

## Consciously left out

- **HR records beyond payroll, purchase orders and supplier bills, multi-location stock.** These support operations rather than marketing or sales. Left out for this scope; say if you widen it.
- **Server-side conversion APIs for Meta, TikTok and Google Ads (hashed customer data).** Sends hashed personal data to ad platforms, the same concern as audience sync; the GA4 events above carry no customer data and are the route used instead.
- **Compliance-based external integrations** (consent-management platforms, audit and attestation tools, identity checks, lawfulness certification). Left out by instruction.
- **Customer lists sent to ad platforms** (Meta and Google audience sync). Sends personal data to third parties and needs consent records and platform approval.
- **Tax decisions by the app** (which countries need registering, thresholds, OSS and IOSS, reduced rates). These belong to the owner's accountant; the app applies the rates the owner enters.
- **Customer passwords and accounts.** Sign-in with passwords adds personal-data duties. Emailed links (orders, basket) cover the need without storing a password.
- **Automatic replies to prospects, and a chat that answers by itself.** Spam and consent risk; the owner replies, with drafts.
- **AI voice agents that place or answer calls on their own, and audio recording of AI calls.** Recording rules differ by country and by party. Calls the owner places remain.
- **Automatic outbound calls, WhatsApp or SMS campaigns, and automatic Instagram direct messages.** Cost, consent and platform rules.
- **Scraping social networks, and buying lead lists.**
- **Bulk broadcast emails to many past customers.** Puts sending reputation at risk; confirmed newsletters are the supported route.
- **Fake anchor prices, manufactured urgency, fabricated reviews, addictive loops.**

## Not applicable now

- Accounting and tax treatment, outside the marketing and sales scope: realised exchange gains and losses, and tax by destination (VAT or sales tax by country). The owner's accountant handles them; the app applies the rates the owner enters.
- Marketplaces and person-to-person (C2C) platforms; freemium and advertising revenue; franchise systems; donations; government tenders; rental with depreciation; supplier purchase orders.
- Native store apps (the installable web app is used).
- Selling-side items, out of scope: usage-based billing, annual plans, single sign-on, public API, white-label domains.

## Outside what code can settle

- Shipping-provider and carrier accounts (needed for labels and carrier status).
- Google's review of calendar scopes (needed for calendar writing).
- Live checks of every external service (Gmail, Stripe, Twilio, Meta, Google Ads, Hunter, AI providers, calendar feeds).
- Google's approval of the Google Ads developer token, and review of Gmail permissions.
- Real-time (low-lag) voice: needs a separate audio service.
- Calendar providers' publishing delay.
- Shipping-provider accounts, if labels or carrier status are wanted.
- Lawyer review of the Terms and Privacy templates.

## Deep check against the sales and marketing research (Pass 150)

Covered: lead capture (forms, landing and signup, Meta, Google, Typeform, Tally), enrichment and verification, scoring with recency tiers and negatives, routing and reassignment, sequences that stop on reply, proposals with acceptance and milestones, bookings, pipeline alerts, attribution views, conversions to GA4, consented hashed sync to Meta and TikTok.

Open in scope: Google Customer Match (needs OAuth and developer-token approval); campaign-level approval for autosend (approval is per account); enrichment beyond deals; the time-entry log feeding the profit view; TikTok lead forms; typed e-signature on proposals (acceptance is by clicking accept, not a typed signature); real-time (low-lag) voice (needs a separate audio service).

## Closing pass (Pass 151) and the last items (Pass 154)

Closed in code: typed-name acceptance, logged hours in the profit view, enrichment of inbox leads, TikTok and LinkedIn lead-form intake, campaign-angle approval for autosend, Google Ads Customer Match, and browser live voice.

Not verified live: every integration, the daily and hourly jobs, Gmail, Stripe, Meta, Google, TikTok, LinkedIn, Apollo, Hunter, Slack, OpenAI voice, and the browser screens. These need one real account each; they are not closed by code alone.


## Last search sweep (Pass 152)

The final search turned up one item not yet built: LinkedIn lead-gen forms. Built in Pass 152. The rest of the search results describe coverage the app already has (enrichment waterfalls, verification, CRM sync, conversion sync), or tools that are not one-key integrations.

## AI agents (Pass 153)

Already in the app, inside guardrails: AI drafting and overnight draft preparation; reply checks; deal routing and reassignment; autosend that sends only within your rules, after your first-batch approval and for approved campaign angles; a claim hold on drafts with price, result or urgency wording. Consciously left out: an agent that contacts people without review.

## Cross-industry sales and marketing framework (Pass 155)

Mapped against the framework's 35 activity areas and its routes to market. Statuses use the same definitions as above.

| # | Area (from the cross-industry framework) | Status | Where it stands |
|---|---|---|---|
| 1 | Market research and intelligence | Partly built | Lead finder, buying-signal feeds, segmentation. Market sizing and competitor price research are not observable by the app. |
| 2 | Strategy and planning | Partly built | Campaign and content planning. Go-to-market documents are not built. |
| 3 | Product and service marketing | Partly built | Storefront products and service bookings. Product bundles are built (checked 23 Nov 2026: lib/bundles.js, products page and sales tools). |
| 4 | Brand management | Not built | Brand identity and guidelines are design work outside the app. |
| 5 | Pricing and promotions | Partly built | Discount codes, price floors, currency choice. Quantity price breaks are built (up to five per product, checked 23 Nov 2026: products page and the shop). Other tiers are not. |
| 6 | Digital marketing | Partly built | Email, SMS, WhatsApp, content plan, posting. SEO tooling is not built. |
| 7 | Paid advertising | Partly built | Ad spend import, ROAS, hashed audiences (Meta, Google, TikTok). Campaign creation stays in the ad platforms. |
| 8 | Content and creative | Partly built | Content plan and AI drafts. Photography, video and design production are not built. |
| 9 | Inbound marketing | Built | Site, landing pages, lead magnets, forms, enquiries. |
| 10 | Outbound marketing | Partly built | Cold email with review, lead finder, AI phone calls. LinkedIn outreach is consciously left out (platform terms). Direct mail is not built. |
| 11 | Public relations | Not built | Press releases and media relations are not built. |
| 12 | Events and experiential | Not built | Event management is not built. |
| 13 | Trade and shopper marketing | Not applicable now | Retail merchandising and in-store promotions do not fit this scope. |
| 14 | Partnership and affiliate | Built | Partners, referral asks, buy links. |
| 15 | Campaigns and automation | Built | Sequences, triggers, broadcasts, journeys. |
| 16 | Sales strategy and planning | Partly built | Weighted forecast and pipeline. Quotas are built (pass 367): a monthly target per person on the Owners page, with won value and share of target this month (lib/quota.js). |
| 17 | Lead management | Built | Capture, scoring with negatives, routing, nurture, follow-ups. |
| 18 | CRM and pipeline | Built | Deals, stages, lost reasons, pipeline alerts. |
| 19 | Inbound sales | Built | Enquiries, bookings, quotes. |
| 20 | Outbound sales | Partly built | Email and AI phone calls. Manual cold calling is not a feature. |
| 21 | Sales execution and closing | Built | Demos through bookings, quotes with milestones, typed-name acceptance. Negotiation stays manual. |
| 22 | Bidding and tenders | Not built | Tender notices are watched through buying signals. AI bid drafts are built (checked 23 Nov 2026: BidDraft component and the bids draft route). |
| 23 | Channel and distribution | Partly built | Partners and buy links. Distributor and reseller management is not built. |
| 24 | Retail and transactional | Partly built | Storefront, bookings, subscriptions. Point-of-sale hardware does not apply. |
| 25 | E-commerce and marketplaces | Partly built | Storefront, abandoned basket, back-in-stock. Third-party marketplace listings are not built. |
| 26 | Business development | Not built | Partnership sourcing is judgement work the app does not automate. |
| 27 | Account management | Built | Customers, renewals, relationship records. |
| 28 | Retention and expansion | Partly built | Renewals, win-back, reactivation, referrals. Loyalty programmes are built (checked 23 Nov 2026: lib/loyalty.js, used on three pages). |
| 29 | Sales enablement | Partly built | Sales kit, SOPs, templates. Training materials are not built. |
| 30 | Sales operations | Built | Team routing, team statistics, commission on won deals (Pass 155). |
| 31 | Customer intelligence | Partly built | Segments and purchase history. Lifetime value per customer is not built. |
| 32 | Performance analytics | Partly built | Acquisition cost and ROAS, win rate, forecast. Pipeline velocity and market share are not built. |
| 33 | Reporting | Built | Weekly KPIs, monthly summary, digests. |
| 34 | Sales and marketing technology | Built | CRM, automation, enrichment, verification, attribution. |
| 35 | Feedback and insights | Built | Review and feedback asks, lost reasons. |
| D | Industry-specific workflows (hospitality, real estate, healthcare, and similar) | Consciously left out | Each vertical has its own workflow. Generic features cover the common cases: bookings for appointments, the storefront for retail, subscriptions for recurring service. |
| E | Routes to market: B2B, B2C, D2C, subscription, direct sales | Built | All run through the routes above. |
| E | Routes to market: wholesale, channel, B2B2C | Partly built | Partners, buy links and trade pricing by quantity are not built. |
| E | Routes to market: B2G (government tenders) | Not built | Tender notices are watched; bid writing is not built. |
| E | Routes to market: marketplaces (C2C, B2B), franchise, licensing | Consciously left out | Platform businesses need their own product. |

## Closing check (Pass 157)

Closable items still open, which I have not built yet:
- Quota field on the Team page, and a customer lifetime value column on the Customers page.
- Quantity price breaks (trade pricing for wholesale) on products.
- Product bundles on the storefront.
- Loyalty points: earn on paid orders, redeem against the next order.

Not closable in the app, left out for compliance or external reasons: Google and TikTok conversion sync with hashed customer data beyond the consented sign-up sync; marketplace listings on third-party platforms (their APIs and approval); SEO tooling and market-share data; PR, events and brand design production; government tenders as bid writing; real-time voice for phone calls and visitors (needs a persistent connection and a separate service).

## Closing check (Pass 161)

All closable sales and marketing gaps from the Pass 157 and 158 lists are now built: quota attainment, pipeline velocity, customer lifetime value, quantity prices, team quota, loyalty points and product bundles. Items that cannot be closed in the app, for compliance or external reasons, are listed as left out in the register above.

## Deep research check (Pass 163)

The latest sweep of sales engagement and CRM feature lists turned up two items, both now built: multi-touch attribution and click-to-call. Cycle length, win rate by source, forecasting, sequences, call recording and transcription through the AI summaries, and call tracking through the owner's Twilio numbers were already in place.

## Final sales and marketing check (Pass 164)

Checked against the images and video in the latest brief, for the sales and marketing side only. Covered: customer acquisition cost and lifetime value, the repeatable sales process (sales kit and SOPs), pipeline ghosts (stalled-deal and follow-up alerts), speed to lead, KPIs for each salesperson (quota attainment), decisions with an owner and a due date (action list), channel comparison (attribution and acquisition cost), discount-code results, and exceptions such as price-floor approvals.

Left out on purpose, because they are operations, finance, hiring or culture rather than sales and marketing: cash categorisation, weekly cash rhythm, cost-based margin per campaign, hiring and culture, operational fulfilment, and tool consolidation.

## Research sweep (Pass 165)

The final search for sales and marketing gaps turned up one item not yet built: UTM tagging of outbound links. Built in Pass 165. Everything else the sweep covered was already in the app or is consciously left out (see the lists above).

## Research check (Pass 166)

The sweep of email automation platforms turned up automatic A/B winner selection. It is built in Pass 166 with a statistical threshold, not a fixed timer. The remaining items from that sweep were already in the app or are consciously left out.

## Research check (Pass 167)

The sweep found one gap not yet covered: quotes the customer opened but never answered. Built in Pass 167 as an owner alert, with nothing sent to the customer.

## Lead finder reliability (Pass 168)

The lead finder kept timing out on the free map servers. Cause: each tile waited up to 14 seconds on one server before trying the next, so a 40-second budget covered only one or two tiles on a busy day, and the search then reported that the servers were busy.

Changes: each try asks two map servers at once and keeps the first good answer; each try waits up to 9 seconds; answers to identical tile queries are kept in memory for six hours, so a resumed or repeated search does not ask the public servers again. The map-server load per tile is at most two requests, one tile at a time.

Limits, plainly: the answer cache lives in memory, so it helps while a server instance stays warm, not across cold starts. The search still runs within one request's time limit, so very large areas still finish over several searches (the search resumes where it stopped). Not run here against the live map servers.

## Lead enrichment from the uploaded worker and enrich.py (Pass 169)

The uploaded Python tools (autoleads_worker.py, enrich.py, run.bat) were compared with the app's own JavaScript. Most of what they do was already in the app: the map search, website reading (home, contact, about, team and sitemap pages), email and phone extraction, decision makers, company size, tech stack, JSON-LD, lead scores and confidence, CSV import with enrichment, the daily run, and resume after a break.

Closed in Pass 169: Crawl-delay from robots.txt is honoured (capped at ten seconds); a website host that answers 429 or 503 is left alone for its Retry-After (capped at a minute), instead of being asked again at once; and several leads on the same website reuse one crawl in a run.

Not carried over: the Python command-line menu and run.bat. The same steps are the app's own screens and daily run, so no separate program is needed.

Limits, plainly: these are checked by tests, not against live websites or the live map servers.

## Cross-sell suggestions (Pass 170)

Storefront orders record the products bought. The weekly action list now suggests, for each customer, the product that customers who bought one of their products most often also bought, if they don't have it yet. At least two customers must have bought the pair together. Up to three suggestions a week. Nothing is sent to the customer; the owner decides.

Upsell was already covered by the Day-30 check-in template. Not covered: suggestions for service customers, whose orders do not list products, and suggestions in the daily digest (weekly only).

Limits: built from storefront and buy-link orders only, and the suggestion is a pattern in past purchases, not a guarantee of a sale. Checked by tests, not against live orders.

## Less setup, one click (Pass 171)

Account has an "Apply recommended setup" button. It switches on the safe defaults that cost nothing and send nothing: the claim hold on drafts, and the morning brief. It never turns on sending, data sharing or paid credits, and it never changes a choice you have already made.

Limits: it covers only those two defaults. Sending, data sharing, paid enrichment and the Slack, Twilio and provider keys remain your decisions.

## Automation mode (Pass 172)

Account has a "Turn on automation" step with one confirmation. Once confirmed, it turns on: sending (autosend), with every campaign angle approved so the per-campaign approval no longer holds sends back; sign-up sharing with the ad platforms; and paid enrichment for deals. The claim hold stays on, and opt-outs, the suppression list and daily caps still apply.

The app cannot check that you have the right to contact the people on your lists. That confirmation is yours, and the step records that you gave it.

## KPI scorecard (Pass 173)

On the first of each month the digest now opens with a scorecard for last month, computed from the owner's own records: leads in, deals opened, lead-to-deal conversion, won and lost counts, win rate, average won value, and average time to win. A month with nothing shows n/a rather than a misleading zero.

The rest of the sales and marketing KPIs (acquisition cost, lifetime value, quota attainment, pipeline velocity, revenue by channel, discount results, cross-sell) were already reported, in the monthly digest or on the business screen.

Limits: the scorecard reads the lead inbox up to 1,000 records and the deals already loaded, once a month. It is computed from recorded dates, so a deal with no creation date is left out of the cycle time.


| Tender response drafts (Pass 174) | Paste a tender in the CRM; the AI returns a first draft: summary, understanding, approach, experience, pricing notes, a compliance checklist and questions for the buyer. Prices, certificates and references are left as placeholders. Nothing is submitted. Rate limited to 10 an hour per owner. | Drafts only; the owner reviews and submits. The draft is as good as the tender text pasted and the profile saved. Not run here against a live AI provider. |
| Purchase events for consented customers (Pass 174) | Each run sends a Purchase event to Meta for each paid invoice whose buyer is a consented sign-up, with the amount and currency; hashed emails only. Off without the Meta keys and the data-sharing confirmation. | Meta only, not yet Google or TikTok. Sign-up consent is the only consent recognised. Not run here against Meta. |
| Voice chat for visitors on the public site (Pass 174) | Visitors can talk to the business's assistant from the public site. Switched on by the owner (visitorVoice), rate limited, keyed by the site key, no tools, no prices, no payments. | Browser voice only. Phone calls need a separate always-on voice service and are not built. Not run here against a live voice provider. |
| Waterfall enrichment (Pass 174) | Deals and inbox leads are enriched with Apollo first (when its key is set), then People Data Labs (when its key is set and Apollo found nothing). Job title, company, size and industry are stored. | Needs at least one of the two keys. Field names follow each provider's documented reply; check them before relying on them. Not run here against either provider. |

## Items previously left out, now built where the code can do it (Pass 174)

- Purchase conversions beyond sign-ups: built for Meta, for consented customers only.
- Tender responses: built as drafts for the owner to review and submit.
- Live voice for visitors: built in the browser on the public site. Phone-call voice remains unbuilt because it needs an always-on voice service.
- Marketplace listings (Etsy, eBay, Amazon and similar): not built. Each needs a seller account and an API approval from the platform. That is an external permission, not a code gap.
- Server-side conversion sync for Google and TikTok beyond sign-ups: not built here; the same pattern as Meta can be added once each platform's conversion API is confirmed for this account.

## Owner keys and the Google calendar return address (Pass 175)

- Owner keys: the newer integrations (Meta sign-up sync and Purchase events, TikTok events, Google Ads Customer Match, GA4 conversions, Apollo and People Data Labs enrichment, and the live and visitor voice) now read the owner's own keys first, saved under Integrations, and use the server's keys only as a fallback. Apollo, People Data Labs, the Meta, TikTok and GA4 keys were added to the list the Integrations page shows.
- Google calendar connection: the Integrations card now shows the exact return address the app sends to Google, with a Copy button, and names a redirect-address mismatch when Google reports one. The address must match the Authorised redirect URI in Google Cloud character for character.
- Not changed by this pass: the lead-form webhook receivers (Typeform, Tally, LinkedIn, TikTok leads, Google and Meta lead forms) still read the operator's server keys, because a webhook must be routed to an owner before its signature can be checked. Making them owner-scoped needs a per-owner address or index.
- The browser message about accounts.google.com and favicon.ico is Google's own sign-in page, not this app; it is not from the app's code.

## Per-owner lead-form intake (Pass 176)

Scope: sales and marketing lead capture only.

Built: each account has its own lead-form address (shown on Integrations, with copy and a new-address button). Typeform, Tally, LinkedIn, TikTok, Google Ads and Meta Lead Ads post to that address. The owner's own keys are used for every check; no server keys are used, so one owner's keys cannot open another owner's forms. A new address stops the old one at once.

Partial, flagged:
- LinkedIn and TikTok: the owner's key goes in the address as &key=, as before.
- Meta: the subscription check and the app secret use the owner's keys; lead details are fetched with the owner's page token.
- The earlier operator-level receivers still work for existing setups. They can be removed once the owner addresses are in use.
- Not run here against the live form tools.

Consciously left out: any form tool not in the list above.

## Team access and AI follow-ups (Pass 177)

Team access: already built before this pass, by invite. The owner enters a team member's email on Account and chooses a role (manager or viewer). The person signs in with Google using that email and works inside the owner's account. The new step: a pending invite now joins automatically when the invited person opens Account while signed in with that email. Matching uses the verified sign-in email only. Seat limits and roles are enforced on the server.

AI follow-ups and messages: already built (AI follow-up drafts, autosend within your rules, sequences that stop on reply).

AI phone calls: already built as turn-based conversations (the AI speaks, listens and replies on a Twilio call, keyed by your Twilio account).

Not built: real-time, low-latency phone conversations. That needs a voice service that stays connected during the call, which cannot run on this hosting. Live voice in the browser and on the public site is built.

Not run here against live Google sign-in, Twilio or the AI provider.

## Purchase conversions: Meta, TikTok, Google (Pass 178)

- Meta: Purchase events for consented buyers' paid invoices (Pass 174).
- TikTok: CompletePayment events for consented buyers' paid invoices, hashed, with amount and currency.
- Google Ads: enhanced conversions for consented buyers' paid invoices, hashed, sent to the owner's conversion action (GOOGLE_ADS_CONVERSION_ACTION, set once under Integrations). GA4 also reports every payment as a purchase, without customer data.

Each sender runs once per pipeline run, sends each invoice once, and is off without the owner's keys and data-sharing confirmation.

Not run here against the live ad platforms. The conversion action must be created in Google Ads first.

## Connect buttons (Pass 179)

Where a platform can hand over access by approval, the owner clicks Connect and approves on the platform's page. Nothing is pasted.

- Google Ads: approve in Google. The app stores the refresh token and the first Google Ads account on the login.
- Meta Lead Ads: approve in Facebook and pick the Page. The app stores the Page and its token, and generates the Lead Ads verify token and app check itself.

The operator sets these once, on the server: CONNECT_STATE_SECRET, META_APP_ID, META_OAUTH_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, and the Google OAuth client (already used for Gmail and calendar).

Not built here: Connect for TikTok, LinkedIn and Twilio. TikTok and LinkedIn need their own app approval from the platform; Twilio has no owner-approval flow, so its account keys are pasted. Meta's Lead Ads permission needs Meta's app review before it works for accounts other than the app's own admins.

Not run here against the live platforms.

## TikTok Connect and final scope check (Pass 180)

TikTok Events can be connected by approval: the owner approves in TikTok for Business; the app finds the advertiser's first pixel and stores its code and access. The operator sets TIKTOK_APP_ID and TIKTOK_APP_SECRET once.

Final scope check, sales and marketing only:
- Built: lead capture from every form and ad channel, enrichment, scoring, routing, follow-ups, outbound with review and automation, quotes, storefront, bookings, invoices and payments, loyalty, bundles, cross-sell, attribution, KPIs and the monthly scorecard, purchase conversions to Meta, TikTok and Google, Connect for Google Ads, Meta and TikTok, per-owner lead-form addresses, team access by email, AI follow-ups, turn-based AI calls, tender drafts.
- Consciously left out: marketplace listings on third-party platforms (each needs a seller account and approval from the platform); bid submission for government tenders (drafts only, by design); operations, finance and hiring (outside this scope).
- Blocked by an outside party: LinkedIn lead forms and Connect (LinkedIn partner approval); Meta Lead Ads for accounts other than the app's admins (Meta app review); real-time, low-latency phone calls (needs a voice service that stays connected, which this hosting cannot run).
- Not run here: any live platform, Google sign-in, Twilio, the AI provider, the lead finder against the live map servers.

## Start of day, on open (Pass 181)

The owner's working day starts once, however it starts: the nightly job, or the first time the app is opened that day. The same work runs in both cases (pipeline, alerts, the morning digest), and the day is marked started so it is never repeated. Opening the app also shows a "Today: N to call" list built from open deals and new leads that have a phone number. Each call is one tap; nothing is dialled automatically.

Limits: a day that is never opened and whose nightly job did not run has no start-of-day work until the next open or run. The call list reads up to 500 deals and 300 leads per open, filtered by owner in the query. Not run here against live data.

## Meeting briefs (Pass 182)

Before each confirmed meeting in the next day, the start-of-day routine builds a short brief from your own records: the deal and its value, an open quote and whether it has been opened, unpaid invoices, the last call summary and the agreed next step. A person with no earlier records is marked as a first meeting. The briefs appear when you open the app, with the call list. Nothing is sent.

Also already in the app and covered by the monthly digest: win/loss reasons, the KPI scorecard, and the discount-code results. Price and discount approval is the quote floor (a quote below it needs your approval).

Limits: the brief is built from the records as they are; a call that was never summarised does not appear. Reads up to 200 meetings, 500 invoices, 300 quotes and 300 call notes per open. Not run here against live data.

## Efficiency review (Pass 183)

Screens: two live listeners exist, both clean up when they unmount. The day block loads once per page load (a module flag), and moving between screens does not repeat it. No screen re-fetches on every render. Not yet audited line by line: every screen's effect dependencies, which needs a browser profile.

Server, per owner:
- Daily pipeline: reads up to 2,000 deals, up to 1,500 alerts from the last 90 days (was 3,000 from all time), and up to 300 leads and 300 viewed quotes. Monthly and weekly extras run only on their day, and the A/B history stops being read once a winner is decided.
- Start of day: the first open builds the plan (about 1,600 records at most); reopening within 30 minutes costs one read, and the plan is kept on the owner's settings.
- Ad-platform sends: each sends only new consented records since its last run, and each shares one contact read per run.

Known costs still open: the daily pipeline reads all open and won deals each run, which grows with the owner's deal count. Narrowing that to open deals plus recent wins is the next step.

## Efficiency, closed (Pass 184)

- Daily pipeline reads: open deals (up to 1,500), won deals (up to 400) and recent losses (up to 300), instead of every deal. The first of the month still reads every deal, because the monthly figures need them all.
- Index file added: firestore.indexes.json (deals by owner and stage; sent emails by owner and test flag), with firebase.json pointing to it. These indexes must be deployed before the narrowed queries run.
- Screens: a scan of every component found no effect without a dependency list, and none depending on a function rebuilt on every render. Two listeners, both cleaned up. This is a static check; it has not been run in a browser.

Not closed here: running the screens in a browser to measure renders; and live cost figures, which need real data.

## Real-time phone conversations, through a voice service (Pass 185)

The gap that the hosting could not close is closed by a voice-agent service the owner connects by key (Vapi, as the reference). The service keeps the call live; the app does the rest:

- Setup (one tap, from the owner's key and phone number): the app creates the owner's assistant with a sales brief, the no-prices and no-payments rules, and a webhook secret the app generates.
- Calls: one tap per person on the day's call list starts an AI call with the owner's number. Nothing is dialled automatically.
- Summaries: when a call ends, the service reports it to the owner's address; the summary and agreed next step are kept on the customer's record, so the next brief and call list see them.

Not verified here, by design: the service's exact field names and endpoints follow its documented API as known at writing. Check them against the service's current reference before switching on. Call cost, phone-number purchase and the owner's lawful basis for calling each person are the owner's responsibility.

## Support and valuable quiet customers (Pass 186)

Scope read as: anything that touches selling and marketing, including the customer side of a sale (support for paying customers) and sourcing accounts worth more attention. Buy-side deal sourcing (buying businesses, investing) is outside selling and marketing and is not built.

Built:
- Complaints and support requests are recognised in replies (a complaint is caught by plain wording and never by a quoted old message; support requests come from the AI triage).
- A complaint or support request with no answer after two hours raises one alert, shown with the other alerts.
- Valuable customers (top fifth by value, at most two) with no activity for 120 days get a re-engagement action on the weekly list.

Not built: a full helpdesk (ticket queue, SLA dashboard, knowledge base). That is closer to operations than to selling, so it is consciously left out of this build; the alerts above cover the selling-side risk.

The complaint and support queries need an index on sent emails by owner and reply intent; it is declared in firestore.indexes.json and must be deployed.

## Deals: buy side and sell side (Pass 187)

Scope: finding, checking, buying, selling and investing in businesses, alongside sales and marketing. Not investment advice: every figure says what it is based on, and nothing is traded, offered or sent.

Buy side:
- Find companies (UK) by name through Companies House, with one key (COMPANIES_HOUSE_API_KEY, set under Integrations). Track a company to see its profile, charges and recent officer changes.
- Each tracked company gets a signal score from transparent reasons (overdue accounts, insolvency history, unsatisfied charges, leadership turnover, age, sector fit, filing). Red flags are listed on their own.
- Businesses for sale that you hold a list of can be added with asking price, profit and revenue.
- A price is checked against your own benchmark multiples, with the implied multiple, payback time and present value of profits at your cost of capital.
- Every Monday, tracked companies are checked again (at most 20 a run); only red flags that are new are reported, in the week's actions.
- Deal stages: sourced, contacted, NDA, diligence, offer, won or lost. Stages move one at a time; won is only from the offer stage.

Sell side:
- A value range from your profit and your own multiples.
- A sale-readiness check: accounts up to date, customer concentration, recurring revenue, owner dependence, growth, and unsatisfied charges, with what to fix.

Limits, plainly:
- UK companies only (Companies House). Other countries need their own company register and key.
- Listings are added by hand or from a list you hold; marketplace listings are not scraped.
- The multiples and cost of capital are your assumptions, not market data.
- Companies House response fields follow its public API as known at writing; verify them against the current reference.
- Not run against live Companies House data.

## Buy and resell any asset (Pass 188)

Scope: finding undervalued assets to buy and resell (vehicles, land or property, goods or stock, businesses), alongside selling and marketing. Not investment advice; every result says what it is based on.

Built:
- Listings for any asset class, each with the fields that matter for it (vehicle: make, model, year, mileage, condition; land or property: address, postcode, area, tenure, title checked; goods; business).
- Comparables: you paste sold prices (one per line). The app gives the middle price and range, and places the asking price against them.
- Resale margin after every cost: price, fees, transport, repairs, holding cost per month, and tax. It says whether the margin meets your minimum.
- Weekly reminder: a listing left for two weeks with no move is flagged to re-price or drop it.

Consciously left out: scraping marketplaces (vehicle, property or goods sites). Their terms forbid it, and the app will not do it. Enter listings and sold prices from your own research or from sources you are allowed to use.

Not built: automatic UK Land Registry comparables. The free Price Paid data can be pasted as the comparables above; a direct feed is not built because its query endpoint is not verified here.

Limits: comparables are only as good as the prices entered; the margin excludes any cost not entered; title, liens, mileage, roadworthiness and tax must be checked by the relevant professionals before buying.

## Land Registry comparables, support queue, sales measures (Pass 189)

Land Registry: a UK postcode fetches sold prices from the official Price Paid data (no key), cached for six hours, and places a listing's asking price against them. If the service does not answer, the owner pastes prices instead. The query predicates follow the Price Paid linked-data model as known at writing; they are not verified against the live endpoint.

Support queue: every new complaint or support alert opens a ticket with a two-hour target, a complaint is high priority, and the owner moves it to in progress or resolved in one tap. The support measures are: open, past target, complaints open, resolved this week, median time to resolve, and the share of tickets meeting the target.

Sales measures, one screen: open pipeline value, won in twelve months, win rate, new leads waiting for a first reply, buy-side tracked and in offer, buy-side realised margin from closed purchases and sales, and open support tickets.

Automation: tickets, alerts, the weekly action list, the monthly scorecard and the Monday company check all run without input. The measures screen reads once when opened.

Not verified here: the Land Registry query endpoint and field names; the Companies House field names; the voice-service endpoints. Each needs one live check before relying on it. Not run against live data.

## Listings on the owner's own store, and the compliance boundary (Pass 190)

Permission was given to go further on compliance. The boundary that stays, and why:
- Not built: sending to people who have not agreed to it, removing opt-out or consent checks, calling or texting without consent, or scraping a marketplace against its terms. These harm the people contacted and get the sending domain blocked; the owner's permission does not change that.

Built: product listings to the owner's own Shopify store through Shopify's official Admin API. The owner pastes their store domain and an access token from their own custom app. Only changed products are sent, each once, and the store's product id is kept so later changes update the same listing. The app only sends to a Shopify store domain.

Not built: other marketplaces (eBay, Etsy, Amazon) need the owner's own developer approval per platform; the same pattern applies once that approval exists.

Not run here against a live Shopify store.

## eBay inventory (Pass 191)

Changed products are sent to the owner's own eBay seller account as inventory items, through eBay's official Sell Inventory API, with the owner's own user token (EBAY_USER_TOKEN, set under Integrations). Quantity is the stock on hand, never negative.

Partial, flagged: publishing a listing needs an offer that uses the owner's shipping, return and payment policies and category in their eBay account. That step is not automated; items appear in the eBay inventory, and the owner publishes them in eBay.

Not run here against a live eBay account. The inventory endpoint and its body follow eBay's documented API as known at writing; verify before relying on it.

## eBay publishing, behind an owner switch (Pass 192)

With the owner's switch on (Publish changed products on eBay, under Account), changed products are published as live eBay offers using the owner's own category (set once) and the first shipping, payment and return policies in their eBay account. The owner's policies are read once a day, not for each product. A product is published once; its offer and listing ids are kept on the product.

The switch is off by default, because a published offer is a live listing on the owner's account. Nothing is published without the owner turning it on and setting the category.

Not run here against a live eBay account. The offer and policy endpoints follow eBay's documented API as known at writing; verify them before relying on them.

## Shopify and eBay by approval (Pass 193)

- Shopify: the owner enters their store domain, approves on their own Shopify admin, and the app stores the store and its access token. No token is pasted. The operator registers one Shopify app once (SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET).
- eBay: the owner approves on eBay; the app stores a long-term refresh token and renews the short-lived access on every sync. No token is pasted. The operator registers one eBay app once (EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RUNAME). The older pasted token still works as a fallback.

Not run here against live Shopify or eBay accounts. The token endpoints follow each platform's documented OAuth as known at writing; verify them before relying on them.

## Easier to use (Pass 194)

- The CRM screen opens with what needs you today (the start-of-day list, meetings, support and alerts), then your leads and deals.
- Voice, call summaries, click-to-call, tender drafts, deal sourcing and resale sit under one "More tools" section, opened with one tap. Each section is a native disclosure: works with keyboard, screen readers and touch, with no script.
- A short line on the CRM screen says where things are.

Not verified visually: this pass changes structure and order; it has not been looked at in a browser. Check the screen on a phone and a desktop before relying on the new order.

## Gap check (Pass 195)

Checked by reading the code, not by running it against live services.

Found and fixed:
- Five queries that filter on a range or list alongside an equality had no declared index. Declared now (sent emails by owner and send time; by owner, recipient and send time; by owner and phone; SMS by owner, recipient and send time; follow-up tasks by status and completion). Without them these queries would be rejected in production.
- The regenerated setup template had dropped 43 settings the earlier hand-written template had, including the admin and allowed emails, the cron and webhook secrets, the Firebase service account, the public Firebase settings, Stripe and Twilio. They are restored as a core group, and the operator settings added in later passes are listed too.

Still open, by design or by platform rules:
- Live checks of Companies House, Land Registry, the voice service, Shopify, eBay and the token endpoints.
- Visual check of the CRM screen in a browser.
- LinkedIn Connect and lead forms; Meta Lead Ads beyond the app's own admins.
- Government tender submission (by choice); marketplace scraping and unsolicited contact (not built).
- eBay publishing and automation mode stay off until the owner turns them on.

## Automatic customer support on WhatsApp and SMS (Pass 196)

Yes, it is possible, and built within the rules: a customer's own question on WhatsApp or SMS is answered only from the owner's written answer library ("question | answer" lines, on the support screen). The app does not generate free-text answers.

- Answered automatically: a question that matches a library entry clearly (at least two key words and half of the question's words), with the owner's answer and a note that it is automatic.
- Handed to a person (opens a ticket in the support queue, with the message): complaints, refunds, payment or charge problems, legal or fraud words, requests for a person, anything not covered by the library, and automatic replies from other systems.
- Never answered: STOP and its variants (the opt-out is handled as before), and empty messages.
- Limits: at most five automatic replies to one customer per day; replies go from the number the customer wrote to.
- Off by default: turn on "Answer customers' WhatsApp and SMS questions" under Account, with Twilio set up.
- Measures: automatically answered tickets are counted in the support measures.

Not built, on purpose: free-text AI answers to customers, and any reply to a complaint, refund or payment matter without a person.

Not run here against live Twilio messages.

## Smart support desk (Pass 197)

Routing: a new ticket goes to the least-loaded team member; complaints and high-priority tickets go to an owner or manager first; viewers never take tickets. Assignment can be changed in one tap.

Targets: every ticket has a two-hour target. Tickets are shown as on track, due soon (three quarters of the target used), past target, or done.

Escalation: a ticket past target raises one alert to the owner, once. Two hours past target, the alert says it should be reassigned.

Answers: the queue offers a ready answer from the owner's library for WhatsApp and SMS questions, and an agent can send their own reply from the queue, from the number the customer wrote to.

Customer history: each ticket shows whether the customer has written before and whether they have another open ticket.

Measures: target missed (of answered tickets), answered automatically, unassigned work, open and done per agent, past-target count per agent, complaint and question counts, and repeat customers.

Limits: routing uses load and role only, not skills or time zones. Email replies are not part of the queue; they stay in the inbox. Not run here against live messages.

## Deals panel layout (Pass 198)

The deals panel is now seven numbered sections, each opening with one tap: find companies, your pipeline, add a listing, compare with sold prices (with the UK postcode lookup), the resale margin, the price check, and the sale-readiness check. Inputs are labelled, sized for touch, and laid out in one column on phones and two on wider screens. Results appear as clear cards with a status line. The same actions run on the server as before.

Not checked in a browser; check the panel on a phone and a desktop.

## Deal finding and undervalued resale listings (Pass 199)

Built:
- Deal finder on eBay's official Browse API. The owner saves up to five search words; each week, and on "Look now", the app searches eBay with the operator's eBay app key and keeps listings at least 20% below the middle of that search's results as candidates in the deals pipeline. Each candidate shows its price, its discount to the middle, its condition, and a link.
- Undervalued means below the middle of today's listings for the same search. It is not a sold price or a valuation. The screen says so.
- Owner-entered listings and UK sold-price comparables (Pass 188 and 189) remain for everything else.

Not built, and not going to be:
- Scraping marketplaces or classified sites (for example Facebook Marketplace, Craigslist, car or property portals). Their terms forbid it.

Not available from an official source, so not built: sold-price data for eBay (requires eBay's restricted Marketplace Insights access); a property listings feed; a car listings feed outside eBay Motors. Owners can add these by hand, and the comparables screen handles sold prices they enter.

Not run here against the live eBay API.

## One key wherever possible (Pass 200)

Where a feature used to need several values pasted in, the owner now connects once and the rest is found from their account:
- Google (one approval): the Google Ads account, the refresh token, the GA4 measurement id and secret (from the owner's first web data stream), and the purchase conversion action. Owners who connected Google before must reconnect once, to approve the analytics permission.
- Voice agent: the voice key alone; the phone number on the account is found from it.
- Shopify and eBay: one approval each (already).
- TikTok and Meta Lead Ads: one approval each (already); TikTok's pixel is found automatically. Meta's pixel for purchase events is not found automatically yet: it needs the ads-read permission, which goes through Meta's app review.

Still more than one value: Stripe (secret and webhook secret, unless Stripe Connect is added); Twilio (account SID, token and number, which Twilio does not let an approval supply); Slack (one webhook address); lead-form tools that sign their messages (one secret each, as the form tool shows it).

Not run here against the live Google, GA4 or Vapi APIs; the endpoint shapes follow each documented API as known at writing.

## Every key has a place to enter it (Pass 201)

A check found that the Integrations screen showed 23 of the 50 owner keys the app stores. The other 27, including Companies House, Shopify, eBay, TikTok, GA4, Apollo, People Data Labs, the voice service and the form-tool secrets, could not be entered on the screen at all.

Fixed:
- One catalog (lib/integration-catalog.js) lists every key in 16 groups. The screen is built from it.
- A test fails if the screen and the server's list of keys ever differ, so a key cannot be stored without a place to enter it.
- Cards added for Companies House, Shopify, eBay, TikTok Events and the Vapi voice service, each with what it unlocks, how it runs, and its consent limits.
- Connection checks added for Companies House, Shopify (the domain is checked before any request) and the voice service.

Multi-field connections stay as they are: each field is shown and saved on its own. Not run here against the live services.

## Business model, the money measures, and the feedback loop (Pass 202)

Checked against the framework in the attached notes (inbound, system, outbound, support and follow-ups by business model).

Built:
- Business model (B2B, B2C/D2C, rentals), set on the measures screen. Each model shows its own focus list (general guidance, labelled as such).
- Money measures from your records: average order value, price point (median), average contract value, lifetime value per paying customer, customer acquisition cost (from the monthly spend you enter), lifetime value to acquisition cost, paid versus organic wins, and new customers in 12 months.
- Ideal customer: one sentence, stored and shown.
- Feedback loop: words customers repeat in support questions become a weekly action (answer it in your library, or make it the subject of the next campaign).
- Account review for B2B wins about three months old, on the weekly list.

Already in place from earlier passes: abandoned-cart reminders, instant bookings with availability, checkout links, lookalike-style reach through lead and audience sync (Meta, TikTok, Google), and outbound to named accounts with review.

Not built, and why:
- Local search and map listings (Google Business Profile): needs Google's approval for the Business Profile API. Blocked outside the code.
- Short-form video, creators and UGC production: creative work done outside the app. The app plans content and drafts captions.
- Personalised video outreach (Vidyard, Loom) and a full account-based marketing platform: separate tools; not built here.
- Lookalike audience creation on Meta: needs Meta's audience permissions, which go through app review. Not built.
- Rental check-out and extension texts: possible, but needs templates and consent checks for each message; not built in this pass.
- One-tap wallets (Apple Pay, Shopify Pay): depend on the payment provider's settings for the store; not verified here.

Not run here against live data.

## One key and a button, where the platform allows (Pass 203)

- Typeform: paste one personal access token, press Connect. The app lists the owner's forms (up to five), sets each form's webhook to the owner's intake address, and creates the signing secret itself.
- Slack: a Connect button. Approving in Slack gives the alerts channel; the address is stored on the business settings.
- Already one approval or one key: Google (including GA4 and the conversion action), Meta Lead Ads, TikTok, Shopify, eBay, Companies House, the voice service, and the AI and enrichment keys.

Still more than one value, and why:
- Stripe: a secret key and a webhook secret. Stripe Connect would make this one approval, but it changes how card payments are processed. That needs a live test before it ships, so it is not built here.
- Twilio: account ID, token and number. Twilio has no approval flow for this.
- Tally: its webhook signing secret is copied from Tally. Its API for creating webhooks was not verified here, so it is not automated.
- Meta purchase events: the pixel needs Meta's ads-read permission (app review).

Automatic by choice: sending messages, publishing listings and automatic replies stay as on/off switches, so the owner decides each one. Those switches are the "button" for them.

Not run here against live Typeform, Slack or Stripe.

## Stripe Connect, behind a switch (Pass 204)

- "Connect Stripe" is a button. The owner approves on Stripe; the app stores their connected account id. No keys are pasted.
- Off by default. While off, card payments use the owner's own Stripe keys exactly as before.
- When the owner turns "Take card payments through Stripe Connect" on in Account, invoice payments are taken on the connected account. The webhook accepts that account's payments only when they belong to this owner, checked with the platform's webhook secret.
- Before switching it on, follow STRIPE_CONNECT_CHECKLIST.md (test mode first, then one small live payment and refund).

Operator settings, set once: STRIPE_CONNECT_CLIENT_ID, STRIPE_PLATFORM_SECRET_KEY, STRIPE_PLATFORM_WEBHOOK_SECRET.

Not run here against live Stripe. The Connect flow and the connected-account webhook follow Stripe's documented behaviour as known at writing; the checklist is the test.

## Tally by one API key, Twilio's number found automatically (Pass 205)

Checked against Tally's public API documentation: POST /webhooks with a bearer key, a form id, the owner's address, a signing secret and FORM_RESPONSE, with each delivery signed as Tally-Signature (base64 HMAC-SHA256). Those are the shapes the app now uses.

- Tally: paste one API key and press Connect. The app lists up to five forms, sets each form's webhook to the owner's intake address, and makes the signing secret itself.
- Twilio: the sending number is read from the owner's Twilio account and kept, so it no longer has to be typed. Twilio still needs the account ID and the token (two values), since Twilio has no approval flow.

Still more than one value: Twilio (account ID and token). Stripe Connect is an approval, but stays off until its checklist is run.

Not run here against live Tally or Twilio.

## Measures and support screen layout (Pass 206)

The measures and support screen was rebuilt in the same style as the deals panel. Money and the business model is a collapsible section, with stat cards for each measure and a labelled form (model, monthly spend, ideal customer). Automatic answers and the support queue are also collapsible; each ticket has labelled controls and a clear reply box. Behaviour and the data calls are unchanged.

Not checked in a browser; please look at it on a phone and a desktop.

## Paste a link; sales targets; the SME picture (Pass 207)

Paste a link (deals panel, section 0):
- An eBay search link (one with "_nkw=" or an eBay category page): its words are added to the saved searches and searched now. Undervalued candidates appear in the pipeline.
- A Companies House company link: the company is tracked, with its signal score.
- Any other link is refused with the reason. The app does not read other sites; that would mean scraping them.

Sales targets (measures screen): revenue a month, new customers a month, and win rate, each shown against your twelve-month average, with a progress bar.

From the SME picture, what applies to this system:
- Growth (sales and marketing): covered.
- Customer experience (support, retention): covered by the support queue, targets and account reviews. Community is not built.
- Operations: sales processes (SOPs and the sales kit) exist; supply, logistics and HR are outside this system.
- Finance: money measures, quota attainment and targets exist. Forecasting, tax and audits are outside this system.
- Strategy: targets exist. Competitor analysis is not built, because it needs reading competitor sites, which the app will not do. OKRs beyond targets are not built.
- Tech and security, legal and compliance: outside this system.

Not run here against live eBay or Companies House.

## Data and demand from the picture (Pass 208)

Relevant to this system, now covered:
- Traffic and search: connect Google Search Console once (a Google approval, read-only). Each Monday the app reads the last 28 days of queries and adds up to three opportunities to the week's list: searches close to page one with real demand, and searches seen often but clicked rarely.
- Case studies: a customer can be featured only after the owner records their written agreement on the customer. The app then drafts a case study from the owner's notes. A draft keeps a number only if it was already in those notes; anything else is refused, and placeholders stand in for quotes and figures. Nothing is published.
- Cohort analysis: already built (cohort panel from paid invoices).
- Lead capture, lead scoring, CRM enrichment, sales pipelines, marketing attribution, customer analytics and receivables: already built.

Not covered, because they are outside sales and marketing or need a separate tool: payroll, payables, dividends, loans and funding, recruiting, offboarding, procurement, warehousing and reverse logistics. Behaviour tracking on the site is not built, because it needs visitors' consent first; GA4 receives the conversions.

Not run here against live Search Console data.

## RevOps and the feedback loops (Pass 209)

Checked against the inbound, system and outbound diagram (demand and data, RevOps, closing and capture, feedback loops).

Built:
- ROI loop: revenue each channel earned (multi-touch attribution) against the monthly spend you enter per channel. The monthly digest says where a little spend could move, when two channels are funded.
- LTV and churn loop: customer value by where customers came from, in the monthly digest; cohort analysis and account health existed already; support questions that repeat feed the weekly list.
- Pricing calculator: total, discount, tax, deposit and balance for a quote.
- Pitch outline: built only from your business name, offer, ideal customer and measured figures; anything else is a marked placeholder.
- Contract and NDA drafts: parties, date and fee filled from the deal; the legal terms are placeholders for a lawyer; the draft says it is not legal advice.
- Closing and capture: bookings (demo), storefront checkout, invoices, milestone and deposit payments, and card payments through Stripe were already in place.
- Outbound and lead sources: cold email with review, the lead finder, and the search and deal feeds.

Not built, and why:
- E-signature for contracts. It needs a signing provider's key and API, which I have not verified here. Once verified it is a key-and-button job.
- A pitch deck as a presentation file. The outline is built; a .pptx file needs the presentation tooling, which this app does not run.
- Social selling on LinkedIn. It needs LinkedIn's partner approval.
- Scraping for prospects. Not built: it breaks site terms.
- Cookie consent for pixels. Not verified in this build; GA4 and the ad pixels need the visitor's consent where the law requires it. Check the public site's consent banner before you rely on pixel data.

Not run here against live data or providers.

## Landing page, business pipeline, deck and acceptance (Pass 210)

Landing page: rewritten to describe only what is built. Three groups: what is built; what is off until you switch it on (automatic sending, automatic replies, eBay publishing, Stripe Connect); and what is not included, grouped as not built yet, needs platform approval, or left out on purpose. No statistics or testimonials.

Business page: a buying, selling and support block sits above the pipeline section (tracked companies, listings waiting for a decision, open support questions and targets). Figures come from your records.

Pitch deck: the pitch outline is now a printable deck of seven slides (print to PDF). Every figure comes from your records; anything else is a marked placeholder. Text is escaped.

Agreement acceptance: you make a one-time link (14 days) for an agreement you have written. The customer reads it and types their full name. The app records the time, a fingerprint of the exact text, and a hash of their IP. It does not keep the raw IP. This is typed-name acceptance, not a qualified electronic signature.

Not built yet:
- Qualified electronic signature. It needs a signing provider chosen and its API verified. Typed-name acceptance is built.

Needs platform approval (not built here):
- LinkedIn lead forms and Connect.
- Meta Lead Ads beyond the app's admins, and Meta's pixel for purchase events.

Consciously left out:
- Messaging or calling people who have not agreed; scraping marketplaces or other sites; social selling by scraping; sending government tenders.

Not applicable to this app:
- Cookie consent on the app's own pages. The app loads no browser tags; GA4 and ad events are sent from the server, and only for contacts who agreed. Any tags on an owner's own website are theirs to consent for.

Off until you switch them on (not gaps): automatic sending, automatic replies, eBay publishing, Stripe Connect.

Not run here against live services.

## Electronic signature through Dropbox Sign (Pass 211)

Decision: Dropbox Sign, with the owner's own API key (one key, checked before it is saved). Reasons: a documented API, a single key, no webhook setup (the app checks each request's status daily), and text tags that place the signature and date inside the document.

Built:
- The agreement is turned into a plain PDF (A4, Helvetica, correct cross-reference table) with a signature field and a date field placed for the signer.
- Send for electronic signature from the agreement tool, with the signer's name and email. A test-send option is available; test sends are not legally binding.
- Each request's status is checked daily; a signed request is reported in the week's actions.
- Typed-name acceptance by link (Pass 210) remains as a second, lighter option.

Not claimed: a higher legal tier than the signing service provides. Whether an agreement needs one is for a lawyer to say.

Left out on purpose: none for this item.
Not applicable: cookie consent on the app's own pages (no browser tags; events are sent from the server only for agreed contacts).
Needs platform approval: LinkedIn lead forms and Connect; Meta Lead Ads beyond the app's admins, and Meta's pixel for purchase events.
Off until switched on: automatic sending, automatic replies, eBay publishing, Stripe Connect.

Not run here against live Dropbox Sign, Stripe, eBay or any other service.

## Gaps closed in sales, marketing and deals (Pass 212)

Decisions made:
- Rental check-out and extension texts: built. Sent only to bookings whose customer agreed to texts, only near the end time, through Twilio, and only when you switch "Send check-out and extension texts" on. Off by default; while off, each due text is listed for you.
- Objectives and key results: built. Measured from your own figures (revenue a month, new customers a month, win rate, paid share, lifetime value). A measure with no figure yet is shown as not measured, never as zero.
- Competitor tracking: built from the competitor prices you enter, with your price's position against their middle. Competitor sites are not read.
- Customer community: decided not to build a forum (a separate product with its own moderation). Built instead: referral asks to settled, happy customers, with a share code, not asked again for 90 days.
- Account-based marketing: built as named accounts you are reminded to reach, and reminded again after two weeks with no contact. Not a full ABM platform.
- Pitch deck as PowerPoint: built with a real .pptx file from the same slides as the printable deck.
- Creator and UGC brief: built from your offer and audience, with a permissions reminder and no invented results.

Still not built, and why:
- Google Business Profile (local search and map listings): needs Google's approval for that API.
- LinkedIn lead forms, Connect and social selling: need LinkedIn's partner approval.
- Meta Lead Ads beyond your admins, and Meta's pixel for purchase events: need Meta's app review.
- Twilio: still takes its account ID and token; it has no approval flow.

Left out on purpose: scraping marketplaces or other sites; messaging or calling people who have not agreed; sending government tenders.

Not claimed: a legal tier above what Dropbox Sign provides for electronic signature.
Not applicable: cookie consent on the app's own pages; Apple Pay and Shopify Pay settings (they live in the payment provider).
Off until switched on: automatic sending, automatic replies, eBay publishing, Stripe Connect, rental texts.

Not run here against live services.

## Final scope check against the market (Pass 213)

Benchmarked against current RevOps tool and stack guides (2026): CRM, lead routing and scoring, enrichment, sequences, marketing automation, conversation intelligence, forecasting, deal health, data quality, attribution, proposals, customer success.

Covered:
- CRM, deal stages with probabilities, weighted pipeline, win and loss reasons, revive-lost checks.
- Lead capture from forms, ads, storefront, inbox and messages; routing to the least busy person; lead scoring; enrichment from public sources.
- Sequences with stop-on-reply, A/B testing, email, SMS, WhatsApp, calls with AI summaries, bookings.
- Attribution (multi-touch), ROI loop, cohorts, lifetime value by source.
- Forecast for the quarter against target, deal health, customer health, deals at risk (Pass 213).
- Satisfaction score (NPS), referral asks, case studies with consent.
- Proposals, quotes, invoices, card payments, electronic signature (Dropbox Sign).
- Support desk with targets, routing and escalation.
- Buying and reselling: company checks, price checks, sold-price comparables, resale margins, eBay deal search.

Not built, and why:
- Buyer intent data and website visitor identification: rely on third-party data and tracking that needs visitors' consent. Not built.
- Call recording and conversation scoring: recording calls needs consent rules that vary by jurisdiction. Summaries from transcripts are built; recording is not.
- Visual journey builder for multi-step campaigns: sequences exist; a drag-and-drop builder is a separate product. Not built.
- Full account-based marketing and enterprise data orchestration: paid external platforms. Named-account reminders are built.
- Paid data enrichment (large contact databases): an external subscription, not an app feature.

So this is not literally everything in the market. It is what this app can build responsibly, plus every item in the current benchmark that can be built without consent gaps or paid platforms.

Platform-gated: Google Business Profile; LinkedIn lead forms, Connect and social selling; Meta Lead Ads beyond admins and Meta's pixel. Twilio still takes two values.
Left out on purpose: scraping marketplaces or other sites; messaging or calling people who have not agreed; sending government tenders.
Off until switched on: automatic sending, automatic replies, eBay publishing, Stripe Connect, rental texts.

Not run here against live services.

## Journeys: the last buildable marketing gap (Pass 214)

Built: a journey is an ordered list of up to eight steps (wait days, email or SMS, message). You enrol people by email. Each day the app lists the steps that are due, and you send each one yourself and mark it sent. A reply stops the journey for that person. Journeys are kept with your business settings.

Boundary: nothing in a journey is sent automatically. This is semi-automatic by design: each message goes out under your name, so you send it. An automatic journey sender would reuse the consent-checked send paths and stay off by default; it is not built.

Still not closable here:
- Platform approval: Google Business Profile; LinkedIn lead forms, Connect and social selling; Meta Lead Ads beyond your admins, and Meta's pixel for purchase events.
- Two values for Twilio (no approval flow).
- Buyer intent data and visitor identification: third-party data and tracking that needs visitors' consent.
- Call recording and conversation scoring: consent rules vary by jurisdiction.
- Paid data subscriptions (large contact databases, full ABM platforms).

Left out on purpose: scraping marketplaces or other sites; messaging or calling people who have not agreed; sending government tenders.
Off until switched on: automatic sending, automatic replies, eBay publishing, Stripe Connect, rental texts.

Not run here against live services.

## Lead search on Google Places, events, presets, packages (Pass 215)

Automatic discovery: the owner's saved searches (up to three) run each week on Google Places, an official API with a key the owner connects once. Found businesses are added to the lead finder's existing import, so they are de-duplicated and stored the same way as other leads. Nothing is scraped. A found business is contacted only under the owner's own consent and opt-out rules.

Events: create an event with a name, date, place and capacity. Share its link; guests RSVP with their name and email, and may agree to hear from you again (optional, recorded per person). One RSVP per email. Capacity is enforced. A reminder is listed the day before the event.

Presets: onboarding, renewal and win-back journeys, as editable templates. Nothing is sent by them.

Packages: packages are compared with the same tax and deposit rules, cheapest first.

Framework check (sales and marketing items from the uploaded list):
- Built: goals and targets, pricing and packaging (price check and package comparison), lead generation (Places, eBay, Companies House, OpenStreetMap, lead lists), proposals and quotes, negotiation and closing (quotes, e-signature), account management (named accounts, account reviews), cross-sell, events and promotions, loyalty and referrals, satisfaction scores, renewals and win-back (journey presets), marketing analytics, consultations and demos (bookings).
- Partial: partnerships (named accounts only, no partner pipeline), market positioning (pitch outline; no research), PR (no press database; a manual accounts list only), SEO and content (insight from Search Console; content creation is outside the app).
- Platform-gated: social media publishing (Meta, TikTok, LinkedIn content posting needs platform review); Google Business Profile.
- Outside sales and marketing: operations, finance, people, procurement, legal, technology and administration items in the list.

Not run here against live services (Google Places included).

## Partners, press, demand; landing and business pages; flow check (Pass 216)

Built:
- Accounts carry a type: customer, partner or press. Reminders say which kind of contact is due.
- Demand trend: leads received in the last thirty days against the thirty before, with the direction and top sources. Read from leads you actually received.
- Business pipeline summary: forecast, deals at risk, demand, and a real count of partner and press accounts.
- Landing page: updated for weekly lead search, events, journeys, packages, forecast, partner and press accounts; lists the platform-gated items.

Flow check (sales and marketing parts of the flow):
- Market research: competitor prices (entered), demand trend (received leads), customer feedback (satisfaction, support topics).
- Product development: pricing and packaging, A/B tests on email, improvement ideas from repeated customer questions.
- Marketing: positioning (pitch outline), content and SEO (Search Console insight), campaigns (journeys, sequences), partnerships and press (typed accounts), paid spend (ROI loop).
- Sales: prospecting and lead generation (lead search, lead lists, enrichment), qualification (scoring), CRM and pipeline, consultations (bookings), proposals and quotes, negotiation and closing (quotes, electronic signature), account management (account reviews, named accounts).
- Customer management: onboarding and renewal (journey starts), communication, support and complaint resolution, satisfaction, retention (customer health), upselling and cross-selling, referrals.
- Order and contract: order confirmation and payment (invoices, card payments), contracts (electronic signature), delivery scheduling (bookings).
- Feedback to product and marketing: repeated support questions become actions.

Platform-gated, not buildable without approval: social media publishing (Meta, TikTok, LinkedIn content posting); paid campaign creation on Meta and Google (their marketing and ads APIs need review); Google Business Profile; LinkedIn lead forms and Connect; Meta Lead Ads beyond the app's admins, and Meta's pixel for purchase events.

Partial, by design: branding and brand design (creative work outside the app), a press database (none is provided; accounts are typed by hand), market research beyond the data the owner enters.

Outside sales and marketing: operations, finance, people, procurement, legal and administration items in the flow.

Not run here against live services.

## Performance loop: corrective action (Pass 217)

The KPI loop was missing its last step. Targets were shown, but a missed target produced nothing. Now the weekly list gets one next step whenever revenue a month is below 80% of its target, or new customers a month are below 80%. Both averages come from paid invoices over the last twelve months. Targets that are not set are never flagged.

Framework check, sales and marketing parts only:
- Customer flow (awareness, leads, sales, retention): covered.
- Information flow (data, reporting, decisions, improvements): covered by the weekly list, the monthly digest, the scorecard and the corrective step.
- Money flow for sales (revenue, collection, reinvestment of marketing spend): covered by invoices, receivables, the ROI loop and the budget suggestion.
- Performance loop (objectives, department goals, KPIs, performance reports, underperformance, corrective action): covered for sales and marketing.
- Business development and partnerships: partner accounts with reminders; no separate partner pipeline.

Outside sales and marketing, not built: finance and accounting (beyond the sales money measures), people and HR, technology and data infrastructure, operations and delivery, procurement and logistics, administration and assets, business funding and investment.

Platform-gated, not buildable without approval: social media publishing; paid campaign creation on Meta and Google; Google Business Profile; LinkedIn lead forms and Connect; Meta Lead Ads beyond admins and Meta's pixel for purchase events.

Not run here against live services.

## Automatic journey email, off by default (Pass 218)

- Switch: "Send journey emails automatically" (Account). Off by default.
- Email steps only. SMS steps always stay manual, because enrolments hold no phone numbers.
- Only for people you have recorded as agreeing (the tick when enrolling). No agreement, no automatic send.
- Never to an address on the do-not-contact list; checked at send time.
- Every automatic email carries an opt-out line.
- Sent from your connected Gmail, up to twenty per daily run. A step is marked done only after it is sent. A held step is listed for you.
- Each send is recorded once per enrolment and step.

Left as before: all other sends stay manual or are switched on by you. Platform-gated items are unchanged: social publishing, paid campaign creation on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel for purchase events.

Not run here against live Gmail.

## One click to every outside tool; command palette; landing and business pages (Pass 219)

- Open your tools (Integrations screen): every outside tool the app works with, grouped, one click each, opening in a new tab, with a filter box.
- Command palette: Ctrl+K (Cmd+K on Mac) on every screen opens a search of the app's screens and outside tools. Arrow keys move, Enter opens, Escape closes.
- Business pipeline: links to the CRM and the tools screen above the buying, selling and support block.
- Landing page: states that every outside tool is one click away and that Ctrl+K jumps anywhere.

Checked in the build: every internal screen the palette links to exists; every outside link is a secure address.

Still platform-gated (not buildable without approval): social media publishing; paid campaign creation on Meta and Google; Google Business Profile; LinkedIn lead forms and Connect; Meta Lead Ads beyond admins and Meta's pixel for purchase events.

Not run here against live services.

## Landing page and navigation made easier (Pass 220)

- Landing page: a short sticky header with jump links (How it works, Features, You decide, Sign in); one hero with three clear actions; four grouped feature blocks instead of a long card list; the switched-off items in one list; exclusions in three short groups. Buttons are at least 44px tall, with a visible focus ring.
- Top bar: a visible Search button (with Ctrl+K shown on wider screens) opens the same palette as the keyboard shortcut.

Checked here: every landing-page claim maps to a feature in the build. Not checked in a browser: the layout on phones and desktops.

Still platform-gated: social publishing, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel. Not run against live services.

## Whole-app convenience (Pass 221)

- Quick actions in the search palette (Ctrl+K or Search): create an event, add a listing to resell, paste an eBay or Companies House link, start a journey, draft and send an agreement, and today's plan. Each opens the screen where it is done.
- Skip-to-content link: keyboard users can jump past the navigation straight to the page.

Not checked in a browser. Still platform-gated: social publishing, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel. Not run against live services.

## Thousands separators on every money figure (Pass 222)

One shared formatter (lib/format.js) shows numbers with commas: 500,000 and 5,000,000. Decimals appear only when there are some (up to two). A missing or non-numeric value shows n/a, never a broken number.

Applied to: the quarter forecast and deals at risk; the pipeline, money and targets figures; the pricing check, packages and objectives; the sold-price comparables, resale margin and deal listings; the pitch outline and the pitch deck; the customer-value note in the monthly digest.

Not yet applied: money inside the weekly and monthly text notes beyond the customer-value line, and the input boxes (inputs keep what you type).

Not checked in a browser. Still platform-gated: social publishing, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel. Not run against live services.

## Fewer requests and fewer redraws (Pass 223)

- Shared read cache (lib/client-cache.js): screens that open together share one request per address, reused for five seconds. Concurrent requests for the same address are merged into one.
- Reloads after a save always go to the server, so nothing shows stale data after you change it.
- Applied to the CRM sales tools, the support and measures screen, and the business pipeline summary. The CRM screen previously sent the same measures and sales-tools requests twice on open; it now sends each once.
- Failed requests are not kept, so the next attempt tries again.

Not done, and why: component-level memoisation. Without a browser profiler, I cannot show that it removes redraws, and changing it blind risks breaking screens. A React profiler run on the CRM screen would show exactly where redraws happen; that is the right next step if you want more.

Checks: the shared cache has four tests. The full suite chain exits cleanly. The count of individual checks reported this pass (916) is lower than the last pass (927), and I have not yet accounted for the 11-check difference; every test in the chain passes.

Not checked in a browser. Still platform-gated: social publishing, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel. Not run against live services.

## Search on phones (Pass 224)

- Floating search button in the bottom-right corner on phones, on every screen, opens the search.
- The top-bar search button is now an icon, the same size on every screen, so a crowded top bar cannot push it out of view.
- On phones the search opens as a sheet from the bottom, sized for the on-screen keyboard; on larger screens it stays at the top.

Not checked on a phone in a browser. Still platform-gated: social publishing, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel. Not run against live services.

## Dashboard gets the shared frame and search (Pass 225)

- The dashboard was not in the list of screens that get the shared frame, so it showed no top bar, no navigation and no search button. It is now in that list.
- The dashboard stays the first screen after sign-in: it holds today's plan and calls, which is the daily start.

Not checked on a phone in a browser. Still platform-gated: social publishing, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel. Not run against live services.

## Ideas from the Claude video, applied to this app (Pass 226)

Checked each hack against the app. Built:
- Patterns in wins and losses: an AI read of your own call notes on won and lost deals, facts only, with a count of notes used. Needs at least three notes.
- Rep record: each owner's wins, losses, win rate and won value over the last twelve months, on the measures screen.
- Check a message against your standard: one standard per channel (general, email, SMS, WhatsApp, website copy, video scripts). Nothing is sent; five points at most.
- Proof bank: testimonials kept with their consent. Only lines marked yes count as usable.
- Ad spend audit: an AI read of your synced spend and won deals by source, facts only.
- Reactivate lost deals: lost deals grouped by interest from your notes, with one draft per group. Nothing is sent.
- Ad spend is synced every day, and the monthly ROI loop uses it when you have not typed spend in yourself.

Partial, and why:
- Meta ad audit: reading Meta ads needs Meta's review. Google Ads spend is synced; Meta spend comes in only when its connection is approved.

All AI reads use your own AI key and run only when you press the button.

Not run against live AI or live ad accounts. Still platform-gated: social posting, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel.

## Dashboard and sidebar tidy-up (Pass 227)

- Sidebar: the nav items are grouped in order (Today, Sell, Money, Run the business, Account), so each group heading appears once. "Sell" was previously split in two.
- Dashboard section titles: "Upload leads (CSV)", "Your info", "Email template", "Email preview". The skipped numbers are gone.
- Dashboard header: the buttons align to the right; Sign Out is a bordered button, not a loose line of text.
- Phone search button moved to the bottom-left, so it no longer overlaps the dashboard's own bottom-right button.

Not checked in a browser. Still platform-gated: social posting, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel. Not run against live services.

## One header on the dashboard (Pass 228)

- The dashboard's own brand block (logo, name and tagline) is removed. The shared sidebar and top bar carry the brand.
- The dashboard's header is now a plain toolbar, no longer sticky, so it does not stack under the shared top bar.
- Its buttons (call history, replies, analytics, business, CRM, follow-up queue, settings, sign out) are unchanged.

Not checked in a browser. Still platform-gated: social posting, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel. Not run against live services.

## Business details reach the features (Pass 229)

- The Account page saves the business name, what you sell, the benefit, and who you help under settings/business.profile. The money, pitch, deck, creator brief and voice assistant read them from there through one shared reader (lib/business-profile.js).
- Before this, the offer and the ideal customer were read from the wrong field, so the pitch, deck and creator brief could stay empty after the Account page was filled in. Fixed.

What starts working once the business details and keys are in: the pitch outline, deck and creator brief; the money measures' ideal customer; the voice assistant's name and offer.

Not run here against live services. Still platform-gated: social posting, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel.

## Keys in the app, no cron, memory, and scope (Pass 230)

Keys in the app:
- The app keys (sign-in and connection apps, AI providers, payment platform keys) are set on the App keys page, under Account. Only operators can change them. Values are stored encrypted, and are never shown back: the page shows only whether each is set in the app, set on the server, or missing.
- App-set keys take precedence; server settings still work, so nothing that is set today breaks.
- Still on the server, by necessity: the database credentials, the encryption key, and the operator list (who counts as an operator). These cannot be set in the app.

No cron:
- The daily work (lead finding, ad spend sync, follow-ups, forecast, support checks) runs when you open the app once a day. The first open of the day runs it; later opens do not repeat it.
- Weekly tasks run on Mondays, or on the first open after six days without a weekly run. A missed Monday is not lost.
- Monthly digest: it runs on the 1st of the month, or on the first open that day. A month without an open on the 1st is not caught up yet.

Memory:
- The sales tools remember what you were typing on this device (pricing, agreements, journeys, message checks, lead searches, events). Drafts are never keys or secrets.

Scope:
- Navigation is limited to sales, marketing and deals. Assets and loans, stock, payroll and SOPs are removed from the menu. Their data is kept and nothing is deleted.

Indexes: as deployed (unchanged).

Not run here against live services. Still platform-gated: social posting, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel.

## Monthly digest catch-up (Pass 231)

- The monthly digest now runs on the 1st, or on the first open of a month whose digest has not run yet. The month is recorded once it has run, so it runs once per month.
- Nothing else changes: the 1st still works as before.

Still platform-gated: social posting, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel. Not run against live services.

## Lists, segments, broadcasts and results (Pass 232)

Built:
- Lists and segments: contacts filtered by tag, source, stage, city, value, and recent activity. Every filter must match. A preview shows how many match, how many agreed, and how many are left out.
- Email broadcasts: a draft fixes its recipients. Only people who agreed and are not opted out are included. Each batch is sent only after you type SEND. Every email carries an opt-out line. Sends are capped at 200 a day, and opt-outs are re-checked at send time.
- Consent: you record agreement per contact. Nobody is included without it.
- Campaign results: sends and won revenue per campaign tag, with untagged results shown separately.

Decided, not built:
- Pop-ups. They need a banner on your own website, which the app does not control.
- A native form builder. Forms come from the connected form tools and the enquiry page.
- SMS broadcasts. They need recorded phone-level consent, which the app does not keep yet. Email broadcasts are approved one batch at a time.

Platform-gated: social posting, paid campaigns on Meta and Google, Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond admins and Meta's pixel. Not run against live services.

## Your own Facebook Page, Instagram and ad account; SMS broadcasts (Pass 233)

Correction to earlier notes: posting to, and reading the ads of, your own Facebook Page, Instagram account and ad account does not need Meta's app review. Meta's review is for serving other businesses. The app still has to be set up on your Meta developer account, with you as a role-holder.

Built:
- Facebook Page posts and Instagram posts (picture required). Every post is a draft first; it goes live only when you type POST.
- The Meta connection asks for the publishing permissions, keeps a long-lived token, and records your ad account and linked Instagram account. The daily ad sync then reads your ad spend, and the ad audit uses it.
- SMS broadcasts: texts go only to valid mobile numbers with text consent recorded per number, never to someone opted out, in approved batches, with the same daily cap and a STOP line.
- Email and text consent are recorded separately.

Action needed:
- Reconnect Meta once, so the new permissions are granted.
- Find your Instagram account ID automatically on connect; it is listed on Integrations.

Still not built, by decision: pop-ups and a native form builder (see earlier notes).
Platform-gated: Google Business Profile (you apply yourself: a Business Profile verified and active 60+ days, with a website, through Google's basic API access form), LinkedIn lead forms and Connect, Meta Lead Ads beyond your own admins.

Not run here against live Meta, Instagram or Twilio.

## App keys belong to the first person to sign in (Pass 234)

- The first signed-in person is recorded as the app-keys owner, once. Later sign-ins cannot change it.
- Only the owner can view or change app keys. Other people get a plain "only the person who first signed in can manage app keys" message.
- The server-wide diagnostics keep their existing admin email list; they are unchanged.

Not run here against live services.

## Handwritten notes, checked against sales and marketing (Pass 235)

Covered already: BANT qualification (budget, decision maker, need, timeline); the funnel by stage; the lifetime-value-to-acquisition-cost ratio; productised packages; value segments (low and high value); inbound and outbound with a data feedback loop; CRM and AI automation; partners and suppliers as accounts; lead sourcing through Places, OpenStreetMap, Companies House and eBay (no scraping).

Added: the lifetime-value-to-acquisition-cost ratio shows its 3x target; SOPs are back in the menu as the sales playbook, since the notes treat repeatable process as what makes sales scale.

Not in this app, by scope: payroll, employee pension, tax and VAT filing, loans and interest, investing, per-unit contribution margin, net-margin and cash planning, industry-specific operations (health, trades, supply chain, customs), personal strengths and working style.

Not run against live services. Platform-gated items unchanged.

## Sidebar order (Pass 236)

- Top: Dashboard, Lead Inbox, Conversations.
- Sell: CRM & Deals, Customers, Quotes, Deal owners, Bookings, Partners, Products, Content, Landing page.
- Money: Billing, Contracts.
- More (bottom): Experiments, SOPs (sales playbook), Business Value, Integrations, Account, App keys (operators).

All 20 items are kept; nothing was removed from the menu.

## Simpler app: Do now, collapsible More, cash vs signed (Pass 237)

- Do now: a short list at the top of every screen showing only what needs a person today, most urgent first, at most five, each with one link to the place it's done. It counts support questions past target, new leads waiting, open support, deals at risk, journey steps due, broadcasts and social posts waiting for approval, listings undecided for two weeks, and events within three days. It shows nothing when there is nothing to do.
- Sidebar: the less relevant items sit in a More block that collapses; it opens itself when you are on one of its pages.
- Measures: "Paid so far" (cash received from paid invoices in the last year) shown beside signed deals. A signed deal is not counted as money until it is paid.

From your pictures, sales and marketing items already covered: lifetime value against acquisition cost (3x target), BANT qualification, the sales funnel, packaged services, value segments, inbound and outbound with a feedback loop, partners and suppliers, and sourcing without scraping. Partly covered: contribution margin per sale (resale and unit margins exist, not a per-sale contribution view); credit risk on buyers (overdue invoices exist; not yet fed into customer health). Outside sales and marketing, not built: finance terms and accounting (EBIT, NPV, depreciation, deferred revenue), tax and compliance filings, payroll, loans, investing, sourcing-heavy trades and manufacturing operations.

Not run against live services. Platform-gated items unchanged.

## Gaps closed; enrichment and Google Maps one step away (Pass 238)

- Credit risk: customers who owe for more than 30 days, grouped by customer, shown on the measures screen. Derived from unpaid invoices.
- Contribution per sale: the pricing check takes an optional cost to deliver per item and shows what the sale keeps before tax. Shown only when a cost is entered.
- Lead enrichment: a card on Integrations, one key (Apollo or People Data Labs), with a connection test. The enrichment flow already read these keys; now they are visible and testable.
- Google Maps: the lead search card is named Google Maps (Places), with its one key and connection test.

Connection tests for Apollo and People Data Labs use their documented public endpoints as known at writing; they are unverified here. Not run against live services.

Platform-gated: Google Business Profile (owner applies), LinkedIn lead forms and Connect, Meta Lead Ads beyond admins. Decided not built: pop-ups, native form builder, SMS broadcasts without phone consent records.

## Offers, trust and the recommended package (Pass 239)

Correction to Pass 238: the credit-risk list and its measure were stated as shipped, but the screen change had not been saved. It is now on the measures screen.

Built:
- Offers: each needs a name, a sensible discount (0 to 90%), a real end date, and a stated guarantee. Ended offers are never shown as running. Offers ending within three days appear on the Do now list.
- Reliability: a score from support answered on time, open complaints and customers owing over 30 days, shown with each part that lowers it.
- Recommended package: with three packages the middle one is marked "Most chosen".
- Partners and trust are covered by partner accounts, the support queue and the reliability score.

Covered already from the notes: AIDA and BANT qualification, upsells and bundles, lifetime value against acquisition cost, outcome-led packages, the B2B deal flow, customer support, nurture and the CRM.

Deliberately not built:
- Messages targeted by gender. Personalise by what the customer says matters to them (speed, cost, risk, status) instead.
- Fake scarcity. A countdown that resets or an offer that never ends misleads customers and breaks consumer rules. Offers only show real end dates.

Not run against live services. Platform-gated items unchanged; Google Business Profile still requires the owner to apply.

## Problem customers excluded; enricher columns read (Pass 240)

- Bad customers are worse than none: customers who owe money for over 30 days are now left out of broadcasts (email and text), shown with the reason.
- The enricher's output is read by the lead import: business name, website, e-mail, WhatsApp number, address, category, LinkedIn (kept as a reference link only; LinkedIn pages are never crawled), rating and reviews. An empty rating stays empty.

Covered from the notes: BANT filtering, the funnel and discovery calls, lifetime value, unit economics and contribution per sale, customer support, trust and reliability, productised packages, and B2B against B2C segments.

Not applicable to this app (finance, not sales or marketing): EBITDA, EBIT, depreciation, share price, EPS, P/E, WACC, IPO and LBO funding, equity splits, tax planning, EMI and loans, and the Dead Stock and inventory accounting.

Not run against live services. Enricher keys (Apollo, People Data Labs) still need a live connection test.

## Seven advantages, checked against the app (Pass 241)

1. Audience you can reach: partly covered. Consented email and text broadcasts, your own Facebook and Instagram posts, events and referrals serve an audience you own. A public subscribe form or pop-up is not built, by decision.
2. Sell on your own terms: covered. Your own landing page, quotes, invoices, and the option of your own store. Marketplaces are optional.
3. A reputation for a specific job: covered. Ideal customer, named accounts, case studies, proof bank, the pitch outline, and packaged pricing.
4. Something useful you own: covered. The app itself, SOPs as the sales playbook, and productised packages.
5. Relationships that open doors: covered. Referral asks, partner accounts, and named accounts with reminders.
6. People you can rely on: covered. Team roles, deal owners, support routing by load and role, and per-person measures.
7. Room to refuse bad work: now covered. A walk-away minimum in the pricing check flags any sale that keeps less than the minimum you set. Customers who owe money for over 30 days are left out of marketing, and the trust score shows reliability.

Not run against live services. Platform-gated items unchanged.

## Catalog and stock for any business (Pass 242)

- One catalog for any business: products, services, packages, offers and bundles, each with a price, stock where it is tracked, details and, for offers, an end date.
- The AI reply helper reads the catalog. It offers only what is listed and running; out-of-stock items are marked so it never promises them; ended offers are dropped.
- The Do now list reminds you when items are low or out of stock.
- Stock is set by hand on the sales tools screen. It is not reduced automatically when an invoice is paid; that would need a sales-to-stock link not yet built.

Not built, by decision: the investment figures in the uploaded screenshots (share trading, margin loans, CSE fees, leverage) are personal investing, not sales, marketing or deals; they are outside this app. The supply-chain notes were used only for the catalog and stock design.

Not run against live services. Platform-gated items unchanged.

## Five laws of price making, checked against the app (Pass 243)

- Ignore the macro: the app shows your own pipeline, deals and customers, not economic indicators. Covered by design.
- Demand-side tension: covered partly. Event capacity, limited stock ("only 2 left"), offers with real end dates, and the demand trend from leads. There is no waiting list yet.
- Build your own market: positioning, not software. The ideal customer, named accounts, case studies, proof bank and packaged offers support it. The app cannot make a market ring-fenced by itself.
- Make the offer here and now: covered. Offers need real end dates; fake scarcity is refused.
- Sell utility, not effort: now built into the reply helper. The catalog tells the AI to sell the result each item gives the customer, not the work behind it.

Not run against live services. Platform-gated items unchanged.

## Stock on payment and waiting lists (Pass 244)

Built and tested here:
- Stock is taken once per paid invoice, for tracked items only, never below zero. Shortfalls are reported. A second call changes nothing.
- A full event takes the guest onto its waiting list instead of turning them away.
- You can record a customer who asked to be told when an item is back in stock.
- The Do now list reminds you when a waited-for item is back in stock.
- When places open, the first people who asked are told first, as many as there are places (batch notify, from the research).

Still not wired (honest, partial):
- The billing screen does not yet call the stock step after a payment is recorded, and invoices cannot yet be given items from the invoice form. The server step exists and is idempotent.
- The owner's waiting-list entry form and the guest's "you are on the waiting list" display are not yet on screen.
- A public sign-up form on sold-out product pages is a form, which is a decided exclusion.

Research applied: waitlist with "only X left", batched restock alerts, and waiting counts to guide reordering. Not applied: a waiting-count report per item (available later from the waiting list).

Not run against live services. Platform-gated items unchanged.

## Wiring finished; payment benchmarks from the research (Pass 245)

Now on screen:
- Billing: an "Items sold" field on new invoices (for example Mug x2, Home visit). When an invoice is marked paid, or a settling payment is recorded, stock is taken once for tracked items. Shortfalls are reported on screen.
- Event guests at a full event see "you are on the waiting list" instead of an error.
- Sales tools: a waiting-list form (add someone who asked) with counts per item, useful for reordering.
- Measures: days sales outstanding (average days customers take to pay).
- Do now: a won deal with no invoice yet.

Research benchmarks checked against the app:
- Automatic payment reminders at 3, 7 and 14 days overdue: the reminder steps exist and draft each reminder for approval. Automatic sending stays off by default (your switch).
- Payment status visible in the pipeline: partly (invoice status is on the billing screen; not yet shown on each deal).
- Invoice raised when a deal is won: a reminder is on the Do now list; invoices are not created automatically.
- Days sales outstanding: built.
- Tasks with due dates: covered by next actions.

Still open, stated plainly:
- Two stock systems: the existing product stock (taken when an invoice is created) and the catalog stock (taken when paid). They do not share counts. This needs one decision on which one you keep.
- Public sign-up on sold-out items: a form, decided not built.
- Two-way sync with accounting software (QuickBooks, Xero): not built; it needs a connector and an account from you.
- Automatic reminder sending and automatic invoice creation on won deals: your switches, not turned on by default.

Not run against live services or checked on a phone or desktop. Platform-gated items unchanged.

## One stock system (Pass 246)

Decision: the catalog is the only stock system. Stock is taken from it when an invoice is paid, once per invoice, for tracked items. The older product stock that was taken when an invoice was created is switched off (a single named switch set to off). Stored invoices and existing product stock counts are not changed.

Known leftover: the product picker on the invoice form is still visible but does nothing now. Remove it in a later tidy-up; it cannot take stock.

Still not built, and needs your choice: two-way sync with your accounting software (QuickBooks or Xero). It needs your software choice and an account.
Decided not built: a public sign-up form on sold-out items.
Switches left off by you: automatic reminder sending, automatic invoice creation on won deals.

Not run against live services or checked on a phone or desktop. Platform-gated items unchanged.

## Two-way sync with Balancr (Pass 247)

Built:
- Deals go to Balancr as leads, once (a repeat is safe). A deal past "new" also moves its stage in Balancr.
- Balancr's new leads are pulled into the AutoLeads inbox each day, skipping the ones AutoLeads sent.
- A lead's stage change in Balancr moves its matching deal in AutoLeads (Balancr's existing stage webhook, protected by a token you set in both places).
- Invoice payment: an AutoLeads invoice is marked paid when its Balancr invoice (given once, by its key) is paid.
- Keys: BALANCR_BASE_URL, BALANCR_BUSINESS_ID, BALANCR_API_KEY and BALANCR_WEBHOOK_TOKEN, one card on Integrations.

Balancr changes (balancr-final-v262.zip): two read/write routes, one to set a lead's stage and one to read an invoice's status. See BALANCR-SYNC.md in that project.

Limits, stated plainly:
- Invoice matching is by the Balancr invoice key, pasted once per invoice; it is not automatic.
- Stage changes from AutoLeads reach Balancr only when a deal is pushed; they are not pushed automatically on every change.
- Neither side has been run against the other. Balancr's build and tests were not run here.

Not run against live services or checked on screen. Platform-gated items unchanged.

## Final wrap: research against the scope (Pass 248)

Scope: sales, marketing and deals. Balancr is the operations and management software and is not in scope here.

Research and what it changed:
- Bulk sender rules (Gmail, Yahoo, Outlook): one-click unsubscribe headers (RFC 8058) are required on marketing mail. The app's own sends carried them, but broadcasts and automatic journey email did not. Fixed: marketing mail now carries them.
- Authentication (SPF, DKIM, DMARC): these are DNS records on your sending domain. The app cannot set them. Owner action: publish SPF and DKIM for your domain, and a DMARC record at p=none or stricter.
- A person's own data: erasure existed; a copy for the person did not. Added: a downloadable copy, using the same records erasure scans, with the note that invoices and tax records are kept.
- WhatsApp marketing: the app sends marketing by e-mail and text only. WhatsApp marketing would need approved templates and a WhatsApp-specific opt-in that names the business. Not built; not needed now.

Checked and already present: sequences (journeys), lead scoring and routing, forecasting, call summaries, enrichment, attribution, booking and calendar sync, proposals and e-signature, invoicing and payment reminders, consent recorded per channel.

Still open, stated plainly:
- Email authentication records (owner action, above).
- Decided not built: pop-ups, a native form builder, a public sign-up for sold-out items, SMS broadcasts without phone-level consent records, WhatsApp marketing.
- Known leftover: the old product picker on the invoice form does nothing.
- Balancr sync: working as you confirmed; invoice matching is by the key you paste once.
- Your switches stay off until you turn them on.
- Platform approvals: Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond your admins.

Not run against live services or checked on screen beyond the tests and build.

## Pass 265: automation control, sidebar, funnel (ported onto v264)

Base: the uploaded v264 project. Its Balancr sync, its overnight autopilot route and its scheduled jobs are kept as they were.

Built:
- Automation control: one pause stops every switch that contacts people (journey email, auto-replies, rental texts, TikTok and Google sync, eBay publishing, visitor voice). Internal steps keep running: invoice drafts for won deals, and deals marked won when their invoice is paid. Status view lists what runs, what is paused and what waits for keys. Named separately from your overnight autopilot.
- Sidebar: Today (daily work), Sell (customers, deals, quotes, bookings, partners, products), Market (content, landing page, experiments), Money (billing, contracts, business value), More (SOPs, integrations, account, app keys).
- Acquisition funnel: cost per lead, lead-to-won, cost per new customer, LTV to CAC and churn, computed from counts; a missing figure shows as blank, never as zero. Not yet on screen.

Fixed in the project:
- The Balancr sync job is registered as a public route with its scheduler secret check.
- The daily and hourly schedules now list the same jobs, as the schedule test requires.

Flags for you to decide:
- Eight scheduled jobs in vercel.json. Vercel's free plan limits scheduled jobs; check your plan.
- Cron runs a schedule on the server; earlier we chose app-open triggers. Keep both or pick one.

Not built yet (honest):
- Traffic, click-through and bounce rate: these need Google Analytics reporting pulls, not yet built.
- Review request, bad-review alert, birthday message, no-show rebooking and missed-call text-back: not built.
- Trade-specific (construction) cost and time tracking: not built as a module.
- Balancr v264 (version 2) was not in this upload, so the apps have not been aligned against it.

Not run against live services. Platform-gated items unchanged.

## Pass 266: free plan, work on app open (ported onto v264; checked against Balancr v266)

Built:
- No scheduled jobs anywhere (vercel.json and both timetables are empty). Free-plan safe.
- Opening the app runs the owner's day work once per day: the Balancr sync (new leads, deal stages, invoice status), auto-send, daily operations, and draft preparation.
- Work shared by all owners (due broadcasts, untouched-lead rerouting) runs once per day, by whoever opens first.
- The Balancr sync test now checks the app-open trigger.

Balancr v266 check: the sync's paths, methods and fields match v266 (lead create, lead stage update, lead pull with cursor, invoice status, stage webhook).

Known regression, stated plainly:
- Reply checking (check-replies) was a scheduled job. It is not yet on the app-open trigger, so replies to your outreach are only detected on days you open the app, and only once that is wired in. Decision needed: allow the server to run it from the app-open trigger using the scheduler secret (CRON_SECRET), or accept checking on open only.

Not built yet:
- Traffic, click-through and bounce rate (needs analytics reporting access; reconnect Google with that permission).
- Funnel and churn figures are calculated but not on screen.
- Review requests, bad-review alerts, birthday messages, no-show rebooking, missed-call text-back.
- Construction-style cost and time tracking.

Not run against live services. Platform-gated items unchanged.

## Pass 267: persuasion and copy checks from your notes

Built:
- The message checker now also flags pressure ("act now", "last chance"), fear ("you'll regret it"), promises you cannot prove ("guaranteed results", "risk-free"), messages that never speak to the reader, and overlong messages. These checks run on any message, with no AI call.

Applied from the notes (already in the app): referrals and reviews as wins, guarantees and trial offers on offers, reply and follow-up sequences, won and lost reasons, bundles and packages, value-based pricing, and a clear next step in every journey.

Left out, because they are investing, finance or org-chart material and not sales or marketing: compound interest, asset classes, return types, financial ratios (ROE, ROCE, P/E, debt-to-equity, current ratio), tax structures, the C-suite roles, and the money concepts.

Still open from earlier passes: reply checking on app open (needs a decision), traffic, click-through and bounce rate (needs analytics reporting), the funnel and churn figures on screen, five of the nineteen automations (review requests, bad-review alerts, birthday messages, no-show rebooking, missed-call text-back), and construction-style cost and time tracking.

Not run against live services. Platform-gated items unchanged.

## Pass 268: open items, on the free plan (ported onto v266 state)

Closed:
- Reply checking now runs when the owner opens the app, for that owner, using the same logic as the Check replies button. No schedule and no server secret are needed. Replies arrive on the owner's next open.
- Acquisition figures are on the measures screen, last 12 months: cost per lead, lead to won, cost per new customer, lifetime value to cost (aim for 3x), and churn. Figures show as n/a when the records are not there; nothing is guessed.

Still open, stated plainly:
- Bad-review alerts: need Balancr's review data in a shape AutoLeads has not yet read.
- Birthday messages: need a birthday field on customers.
- No-show rebooking: needs the booking module's no-show status wired to a rebook draft.
- Missed-call text-back: needs a Twilio missed-call webhook.
- Traffic, click-through and bounce rate: need Google Analytics reporting access (reconnect Google with that permission).
- Construction-style cost and time tracking: not built as a module.
- Investing material (stocks versus cash over time, asset classes, returns): outside AutoLeads, not built.

Not run against live services. Platform-gated items unchanged.

## Pass 269: open items closed on the free plan (no schedules)

Closed:
- Missed calls: a Twilio status webhook turns a missed or busy call into a new lead to return. It accepts only requests signed with your Twilio auth token. Nothing is sent automatically; the lead stays on the Do now list until you reply (its status then changes in the inbox).
- No-show rebooking: no-shows from the last seven days appear on the Do now list until rebooked.
- Birthdays: entered on the sales tools screen; reminded on the day, only for people who agreed to marketing.
- Sales red flags, on the Do now list: won value falling more than 20% against the previous 90 days; more than a quarter of billed money over 30 days unpaid.
- Bad-review alerts: Balancr already files the owner's low-review alert when a review is posted to it, so AutoLeads does not duplicate it.

Still open, stated plainly:
- Traffic, bounce rate: need Google Analytics reporting access (reconnect Google with the analytics read permission and set your GA4 property ID).
- Click-through rate: needs a totals query on Search Console, using the same token the weekly search job uses, run on app open.
- Construction-style cost and time tracking: not built. Time and cost per job belong in Balancr.
- Investing and finance material: outside AutoLeads.

Not run against live services. Platform-gated items unchanged.

## Pass 270: click-through rate, website traffic and bounce rate (free plan)

Wired:
- Click-through rate: last 28 days from Search Console (clicks over impressions), using the same Search Console connection the weekly search job uses. Refreshed on app open; shown on the measures screen.
- Website traffic and bounce rate: last 28 days from Google Analytics (sessions, visitors, bounce rate). Needs the analytics read permission on the Google connection (now requested) and your GA4 property ID (an owner key on Integrations). Until both are in place, the measures screen says what is missing.
- The original GA4 conversion helper (lib/server/ga4.js) is unchanged; the traffic reader is in lib/server/ga4-report.js.

Action needed:
- If Google was connected before this build, reconnect it once so the analytics permission is granted, then enter the GA4 property ID.

Not run against live services. Platform-gated items unchanged.

## Pass 271: aligned with Balancr v269 (checked against v269)

Balancr v269 check:
- The lead create, lead stage update, lead pull, invoice status and stage webhook routes are identical to v266. AutoLeads' sync is compatible with v269 without change.
- v269 adds ratios, red flags, customer messages, and key-entry connections (e-signature, review replies, market prices, distance routing). AutoLeads does not depend on any of them.

Overlap fixed:
- Balancr now sends six routine customer messages from its own records: booking confirmation, booking reminder, quote follow-up, thank-you, welcome, and review request. When Balancr is connected, AutoLeads no longer sends booking confirmations, booking reminders or review requests, so customers are not messaged twice. AutoLeads keeps receipts, owner digests, and its sales follow-ups.
- If the Balancr check fails for any reason, AutoLeads keeps sending.

Decision for you: the choice is automatic (Balancr when connected). An explicit switch in the app is not yet on screen; say so if you want it.

Not run against live services. Platform-gated items unchanged.

## Pass 272: the routine-message choice is in the app

- Sales tools now has a "Routine messages" choice: automatic (Balancr when connected, otherwise AutoLeads), AutoLeads always, or Balancr always. Booking confirmations, booking reminders and review requests follow it.

Remaining, and who closes each:
- Traffic and bounce rate: reconnect Google once (analytics permission), then enter your GA4 property ID.
- Click-through rate: works from your existing Search Console connection on the next app open.
- Balancr: run one deal end to end (send, stage change back, invoice paid) on your live accounts.
- Platform approvals (you apply, or they are not built): Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond your own admins.
- Twilio: needs two values from your account (no approval flow).
- Decided, not built: pop-ups, a native form builder, a public sign-up for sold-out items, SMS broadcasts without phone-level consent records, WhatsApp marketing.
- Outside AutoLeads: construction-style cost and time tracking (Balancr), finance and investing material.

Not run against live services. Platform-gated items unchanged.

## Pass 273: respond-leads archive checked; battle card added

Archive: a separate WhatsApp support product (Next.js and Supabase). Checked item by item:
- Battle card (sales coach card before a call): ported. Built from the customer's notes and your catalogue; never invents stock; no pressure or fear; reply read into its parts without filling gaps. Sales tools screen.
- WhatsApp 24-hour window and post-close lifecycle: already covered. AutoLeads sends WhatsApp only with Meta-approved templates and only to customers who agreed, so no free-form message goes outside the window.
- Forecasting, lead scoring and routing, bulk operations, objection handling, audit log, currency: already in AutoLeads.
- Not integrated, because it is a different stack or infrastructure: the Supabase schema, the Python agent and Discord client, the WhatsApp inbound bot (AutoLeads answers inbound with reply assist and the catalogue), the Vercel rate-limit and cron cleanup (AutoLeads runs on app open), and the inventory PDF.

Not run against a live AI key. Platform-gated items unchanged.

## Pass 274: landing page and business pipeline brought up to date

- Landing page: the four steps and the feature groups now describe what the app does: Balancr link, battle card, catalogue and stock, waiting lists, offers with real end dates, reliability score, missed-call return, the automatic reply check, the routine-message choice, Page and Instagram posting, birthdays, and the personal data request. The exclusions (platform approvals, not claimed, left out) are unchanged.
- Business pipeline summary: adds cost per lead, lead to won, lifetime value to cost, churn, reliability, days to pay, click-through rate and website visitors.

Not run against live services. Platform-gated items unchanged.

## Pass 275: research check against sales, marketing and support (correction)

The earlier statement that nothing was missing was too strong. A deeper check against current sales, marketing and support tools found these:

Closed now:
- Public help centre: your answer library as a public page at /help/{your ID}, off until you publish it. Shows question and answer only.

Still missing (buildable, not yet built):
- CSAT survey after a ticket is resolved (one question, a public rating page, the score kept on the ticket).
- Customer ticket-status page (needs a private link per ticket).
- Shared deal room or mutual action plan for the buyer (a read-only page of the deal's steps and their status).
- Deflection rate (share of support questions answered without a person; needs the bot's answers marked on each ticket).

Already covered, so not missing: email open tracking, link click tracking, call recording (through the voice service), deal rotting (customer health flags no movement), meeting scheduler (booking page), referral rewards, A/B tests, lead scoring, business-hours SLA, routing, and the call list on the start-of-day screen (the nearest to a power dialer).

Outside AutoLeads by decision: landing-page and form builders, pop-ups, retargeting audiences (need platform ad approval), and CPQ.

Not run against live services. Platform-gated items unchanged.

## Pass 276: the four remaining gaps closed (free plan, no schedules)

- Ticket status page: /support/{your ID}/{ticket}?k=key. A customer sees where their request stands and the latest reply. Each new ticket gets its own private key; tickets from before this pass have no link.
- CSAT: a rating page /rate/{your ID}/{ticket}?k=key, open once the request is resolved, one to five and an optional comment. The rating average and response rate are on the measures screen.
- Shared deal room: /room/{your ID}/{deal}?k=key, read only, with the deal's steps and whether each is done. Set it up on the sales tools screen (Customer links).
- Deflection rate: the share of support questions in the last 30 days that the automatic answers handled. On the measures screen.
- Your Customer links panel lists each ticket's status and rating links. You copy a link and send it yourself; nothing is sent automatically.

Not run against live services. Platform-gated items unchanged.

## Pass 277: the app checks its own go-live state

I cannot run your live accounts (they need your sign-in, keys and phone), so the app now reports its own state:
- Go-live checklist on the sales tools screen. It reads presence only (never values) and shows, for each connection and piece of content, whether it is ready, optional, or needs one step, with that step written out.
- The email records (SPF, DKIM, DMARC) are a manual check: tick the box once published.

Still needing a live test by you: the Google reconnect and GA4 property ID (for traffic), the Balancr round trip, the Twilio missed call, a battle card, one customer rating and one deal room link. The checklist shows which of these are set up; it does not run them.

Not run against live services. Platform-gated items unchanged.

## Pass 278: upsells from the catalogue, stock and offers

Before this pass, cross-sell used only the old storefront product list, and the post-sale check-in gave general advice. Neither read the catalogue, stock or offers.

Now:
- Options per customer come from what they bought (sale items on their paid or sent invoices) and what you can supply now. Out-of-stock and ended items are never offered; what they already bought is not offered again.
- Order: a bundle or offer that names what they bought comes first; then packages; then services; then products. Each option says why it fits. Combos come from bundles you define in the catalogue.
- Sales tools: "Upsell ideas" panel by customer email. Nothing is sent; you use the option in your own message.
- Do now: customers who paid in the last sixty days and have an option now.

Not built: an automatic upsell message. A journey step would need the same consent and approval rules as other outreach.

Not run against live services. Platform-gated items unchanged.

## Pass 279: final review against the whole sales, marketing, deal and support scope

Checked and already covered: full CSV export of records, sales cycle length, win rate, recurring revenue, data backup, audit log, deal rotting, lead scoring and routing, forecasting, funnel, battle cards, pricing with walk-away minimum, proposals and e-signature, journeys, consented broadcasts, support queue and SLA, help centre, ticket status, ratings, deal room, upsells, go-live checklist.

Missing and now built:
- Payback period: months to earn back what it cost to win a customer, from your gross margin (enter it on the sales tools screen; without it, the measure says so).
- Pipeline coverage: open pipeline over what is still needed to reach target.
- Net revenue retention: what customers who paid a year earlier paid in the last year, as a percentage.
- Discount approval: a discount above your set limit is flagged on the pricing check.

Still outside AutoLeads by decision or platform rule: platform approvals (Google Business Profile, LinkedIn lead forms and Connect, Meta Lead Ads beyond your admins), Twilio's two values, pop-ups, a native form builder, a public sign-up for sold-out items, SMS without phone consent, WhatsApp marketing, construction cost and time tracking (Balancr), and finance or investing material.

Not run against live services. Platform-gated items unchanged.


## Pass 280: the last scope pass (sales, marketing, deals, support, follow-ups)

Built in this pass (tests: tests/gap-close-280.test.mjs, 14 checks, run with the suite):
- Marketing opt-outs no longer stop service messages. A quote the customer asked for goes out after a marketing opt-out. Bounces and Lost deals still stop everything; a Lost deal from a stop request does not stop a quote (lib/contact-rules.js, lib/server/route-helpers.js, app/api/quotes/send).
- A customer's reply reopens their support ticket, with a fresh 2-hour target and the reopen count kept. An open ticket takes the message; automatic answers are never reopened (lib/ticket-plan.js, lib/server/ticket-reopen.js). Wired into email replies (check-replies) and WhatsApp/SMS (app/api/inbound/twilio).
- Internal notes on support tickets, never sent to the customer (app/api/support, support queue screen).
- ROAS: won deal value over spend, overall and inbound/outbound (lib/marketing.js, Marketing spend panel). Per campaign is not possible: deals carry a source, not a campaign.
- Balancr leads are imported once: one inbox row per Balancr lead id, and the sync cursor moves only when every lead on the page was written (lib/balancr-inbox.js, lib/server/balancr.js).
- Run ledger for scheduled jobs (job_runs, server-only). A daily job that finished today is not run again on a retry. balancr-sync records every run and its failures (lib/job-rules.js, lib/server/job-log.js).

Verified, not changed:
- Deal WON is set when a quote is accepted (app/api/quote). The paid-invoice path is a backstop only. Matches "won means committed".

Still not built (each one is stated in code terms, not hidden):
- Custom fields on contacts and deals.
- Warranty, contracts and service periods.
- Duplicate customer detection and a merge tool (dedupe is by e-mail on ingest only).
- A separate sales-order record. Decision: the accepted quote (signed name, date) and its invoices already hold the order; a separate table would duplicate them.
- Campaign-level attribution and ROAS per campaign.
- A single approval centre (approvals exist per feature).
- A website chat widget.
- Atomic duplicate-run locking. The run ledger skips a finished daily job, but two runs starting at the same instant are not locked (needs a Firestore transaction; the server wrapper does not expose one).
- An on-screen view of the run ledger (the data is written; no screen reads it yet).

Not run against live services. Packages are not installed in this build, so the full build and test suite have not been run.

## Pass 281: in-scope check (marketing, sales, deals, support, follow-ups only)

Built in this pass (tests: tests/gap-close-281.test.mjs, 11 checks):
- Follow-up gate: marketing stops for a customer with an invoice 30+ days overdue. Quotes and replies still go (lib/contact-rules.js, route-helpers.js).
- Atomic run lock for the daily jobs: one Firestore transaction claims the run. A finished run is skipped; a run still going is skipped; a failed or crashed run (still "running" after 20 minutes) is taken over. Server-login mode falls back to a read-then-write and is not atomic (lib/server-firestore.js claimJobRun, lib/job-rules.js lockDecision, lib/server/job-log.js).
- Win-back list: won customers with no open deal and no payment for 90 days. Listed in the weekly digest for you to write; nothing is auto-sent. Each customer is listed once per 90 days (lib/customer-watch.js, lib/server/gap-tools.js).
- Possible duplicate customers: different e-mail addresses sharing a phone (last 9 digits) or a business name. Listed for you to check; nothing is merged (lib/customer-watch.js).

Verified, already built: post-sale welcome (1 day), one-week check-in, one-month check-in, quarterly review, churn win-back for cancelled customers, review and referral asks, stall alerts per stage (STALL_DAYS), quote acceptance sets WON.

Still not built, in scope:
- Website chat on landing pages (marketing).
- Per-campaign ROAS. Enquiries carry a campaign; deals and marketing spend do not, so the figures cannot be joined yet.
- Sales-order record as its own table (decision still open; the accepted quote and its invoices hold the order today).
- Custom date ranges on the KPI screen (the KPIs use fixed 12-month and 3-month windows).
- Structured BANT qualification (only an estimated-budget score exists).
- Automatic win-back sending. Deliberately not built: it is customer-facing, so it stays with you.
- Merging duplicate customers. Detection only.
- Consent evidence for WhatsApp and SMS consent records: not verified in this pass.

Not run against live services. Packages are not installed in this build, so the full build and test suite have not been run.

## Pass 282: campaigns, look-back, sales orders (in scope)

Built (tests: tests/gap-close-282.test.mjs, 7 checks; marketing.test.mjs updated for the campaign field):
- Campaign attribution: an enquiry's campaign is carried onto its deal as first touch (app/api/inbound/route.js). Marketing spend can carry a campaign name (lib/marketing.js sanitizeSpend, Marketing spend panel).
- ROAS per campaign: spend and won value per campaign, with ROAS and cost per win (lib/marketing.js byCampaign; the panel's "By campaign" table).
- Look-back of 3, 6 or 12 months on the marketing panel (computeMarketing already took a window; the panel now offers the choice).
- Sales order record: created on quote acceptance in users/{you}/orders, linked to the quote by id and to its invoices by quoteId. Status (confirmed, invoiced, paid) is derived from the invoices when read, not stored as the truth (lib/orders.js, app/api/quote/route.js). No screen lists orders yet.

Verified, partly built:
- BANT: intake captures budget, authority and timeline. Need is never captured.
- Consent evidence: WhatsApp consent records store the source and the time. The purpose is not recorded.

Still not built, in scope:
- Website chat on landing pages.
- Custom date ranges on the sales and funnel KPIs (only the marketing panel has a look-back choice).
- A screen for sales orders.
- Capturing "need" at intake, and the purpose on consent records.
- Automatic win-back sending (deliberately not built: customer-facing, stays with the owner).
- Merging duplicate customers (detection only).
- An approval centre (approvals exist per feature).

Not run against live services. Packages are not installed in this build, so the full build and test suite have not been run. The spend panel's JSX has not been compiled here.

## Pass 283: only what the sales flow needs on the Integrations screen
Built (hide, never delete):
- Core on the screen: AI writer, Gmail sending, Balancr (accounting, two-way), Calendar, the outbound webhook list.
- Everything else sits under closed "Advanced" sections: ads and tracking keys, Shopify, eBay, Stripe, Twilio, Vapi voice, lead enrichment, Companies House, Dropbox Sign, form tools, and the connect buttons (Google Ads, Shopify, Stripe, Slack, eBay, TikTok, Meta).
- Sidebar: Deal owners, Partners, Experiments and Contracts moved to More. Routes and labels unchanged.
- Test: tests/gap-close-283.test.mjs (7 checks), added to the test chain.
Not changed on purpose: server code still reads every key; a key set under Advanced keeps working.
Judgment calls to revisit with real customers: Twilio (SMS/WhatsApp support) is Advanced, though it is the one advanced channel that touches support; Stripe is Advanced because Balancr owns paid status.

## Pass 284: date range on acquisition KPIs; KPI route crash fixed
Fixed (important): app/api/kpis/route.js read `funnel` and `ticketRows` before they were declared. That throws a ReferenceError on every call, so the KPI panel, Sales tools and the business summary all failed to load. Fetches now come first.
Built: acquisition figures (cost per lead, lead to won, cost per new customer, LTV to CAC, churn) take a 3, 6 or 12 month look-back (default 12). The KPI panel has the selector. The response says which window it used.
Checked, not a gap: BANT. The CRM already has a select for each of budget, decision maker, real need and timeline.
Still open: consent purpose (why we hold a contact and may write to them). Needs your wording and legal basis before it is built.
Tests: tests/gap-close-284.test.mjs (5 source checks; the route needs Firebase to run, so it is not exercised end to end).

## Pass 285: whole-code scan, runtime fixes, approval list, contact basis
Found by a full TypeScript scan of app/ and lib/ (745 files) for undefined names and use-before-declare, then fixed:
- app/api/pay/route.js: the card payment page read `env` in a function that did not define it. Every customer pay link failed. Fixed (critical).
- lib/pipeline-alerts.js: the daily digest wrote to `out` before declaring it. It crashed whenever a new lead was waiting. Fixed.
- app/api/kpis/route.js: read `funnel` and `ticketRows` before declaring them. Fixed in pass 284.
- scripts/shipped-files.txt was stale, so the release-files check failed. Regenerated (752 files); release-files now passes, including the import check.
Built:
- Approval list: follow-up drafts waiting for approval appear first on Today (count of ready drafts, link to the sender). The sender itself is unchanged.
- Contact basis: each new enquiry records why we hold the contact (consent, contract, or legitimate interest for B2B). A personal address without consent is never marketable. Data is recorded; no screen shows it yet.
Not built, on purpose: website chat on landing pages (public AI endpoint; needs abuse and cost controls first); duplicate merge (merging deals, invoices and messages can lose data; the weekly email already lists possible duplicates).
Test chain on this machine: 205 of 243 steps passed before this pass. The other failures are missing npm packages (firebase, stripe) that cannot be installed offline, not code failures. Run `npm test` after `npm install` on your side.
Tests: tests/gap-close-285.test.mjs (7 checks); tests/gap-close-284.test.mjs has 2 more source checks for the pay and pipeline fixes.

## Pass 286: decisions and close-out
Confirmed by the owner: npm test passes on v285.
Decided:
- Consent bases kept as built (consent, contract, legitimate_interests_b2b); personal addresses need consent. Legal wording needs UK/EU review before selling there.
- Website chat: not built. Public AI endpoint with cost and abuse risk; no traffic data showing demand. Revisit with real data.
- Duplicate merge: not built. Weekly duplicate email covers it; automatic merge risks data loss.
Scope status: closed for v285. Open only by decision, not by gap.

## Pass 287: autopilot invoices respect a limit and the bounce rule
Finding: the daily job emails won-deal invoices automatically when "Raise monthly invoices" is on. It did not check bounced addresses, and had no amount limit. The earlier claim that the first invoice is always sent by hand was wrong for autopilot users.
Built:
- Invoices are held, not emailed, when the address bounced (or the deal is Lost), or when the total is above the owner's limit (Account > "Hold invoices above", empty = no limit).
- A held invoice stays open, gets no reminders, and shows on Today as "held for you to send". Sending it from Billing clears the hold.
- Pure rule: lib/invoice-autosend.js. Setting: autoInvoiceMax in lib/autosend.js.
Tests: tests/gap-close-287.test.mjs (7 checks). Related existing tests pass; the only failures are missing npm packages (stripe, firebase).
One-flow diagram corrected to v287.

Owner ran v287 on 2026-11-15: working. Scope closed at v287.

## Pass 288: website chat (reverses the Pass 286 "not built" decision)
Decision: the owner asked for it to close the scope gaps. Built with cost and abuse limits, not as an open AI endpoint.
Built:
- Visitors ask questions on the owner's site. Answers come only from the public business profile (name, offer, value, audience, optional https booking link). Internal sales notes never reach the model.
- No invented prices, dates or guarantees. Visitor text is treated as data. Replies are plain text, three sentences at most.
- Visitors who want a reply, or get no answer, leave name and email (phone optional). Those go through the normal enquiry route as a deal tagged src "chat".
- Limits: 20 messages per visitor per hour (best effort per server instance), 200 answered questions per owner per day. Only the count is stored, never the text.
- Owner gets the one-line snippet on the Integrations page, beside the lead-form addresses, using the enquiry key.
Files: lib/chat-rules.js (pure rules), app/api/chat/route.js, public/chat.js (widget), proxy.js (/api/chat public), app/components/IntakeUrls.js (snippet).
Fixed during the pass: the snippet first read the key from the intake URLs, which do not carry it; it now reads /api/inbound-key. A missing daily count was blocking the chat; it now counts as zero.
Tests: tests/gap-close-288.test.mjs (12 checks), release-files (5), TypeScript scan (only the known ad-sync false positive).
Not tested live: nothing has run against Firebase or the AI provider in this sandbox. The owner needs to paste the snippet on a test page and send one question.
Open: UK/EU wording for consent on chat-captured contacts still needs legal review before selling there.

Owner reported 2026-11-15: npm test and the live website chat test on v288 are done. Scope closed at v288. Chat answers from the business profile only; contacts go to the enquiry inbox tagged chat. Consent wording still needs UK/EU review before selling there.

## Pass 289: audit log (spec 10.4) and consent purpose (spec 9.3)
Correction: the v288 "scope closed" note was measured against the ledger's pass list, not the 10-section spec. The spec audit (2026-11-15) shows 27 lines built, 47 partly built, 3 not built and 3 outside what code can settle. That supersedes the v288 close.
Built:
- Audit log in users/{uid}/audit: invoice emailed, quote emailed, quote follow-up, team invite, invite revoked, member removed, role changed, enquiry key replaced, enquiry key switched off.
- Owner-only read at /audit (menu: More). Newest 200 entries, read-only.
- Entries hold no keys, customer addresses or message text. A failed write is logged and never blocks the action it records.
- Each enquiry records contactPurpose next to contactBasis: enquiry_reply, or enquiry_and_marketing where marketing is allowed.
Limits: only actions in the app are logged (not Balancr-side actions); no export or retention setting yet; a failed write leaves no entry.
Not done in this pass, with reasons: job-run screen (job_runs is global across tenants and needs filtering first); timezone (needs checking whether a business setting already exists); backup scheduling (infrastructure); per-automation pause (design choice); duplicate merge (owner decision); per-market consent rules (legal input).
Tests: tests/gap-close-289.test.mjs (11 checks), tests/gap-close-285.test.mjs (still passing), release-files (5), TypeScript scan clean apart from the known ad-sync false positive. Nothing run live.

## Pass 290: owner's automation run history (spec 7.3, partly)
Built:
- Each owner's daily job run is recorded in users/{uid}/runs: status (done or failed), counts (invoices made, emailed, reminders, posts, weekly report sent) and plain codes for anything that stopped or failed.
- Shown on /audit under "Automation runs", newest 30.
- Raw error text and customer details are never stored; the failure note says "details are in the server log".
Limits: runs are recorded only for owners the daily job reaches (owners with autopilot on). No delivery tracking per email yet. The global job_runs ledger is still server-only and is not shown to owners, because it covers all tenants.
Checked and deferred: business timezone (10.9). The daily job uses UTC day keys (job-log dayKey, job lock), so a timezone setting changes invoice and reminder timing and needs its own pass.
Tests: tests/gap-close-290.test.mjs (7 checks), gap-close-289 (11), release-files (5), TypeScript scan clean apart from the known false positive. Nothing run live.

## Pass 291: support resolution target (spec 5.2) and two checks
Built:
- Each ticket has a first-reply target (2 hours, unchanged) and a separate close target: 24 hours for a complaint, 48 hours otherwise.
- Support KPIs add: resolveOverdue (open tickets past their close target), resolutionTargetMetPct (share closed in time), resolveHours.
- The support panel shows "Past resolve target". Tickets from before this pass use the 48-hour target, counted from when they were opened.
Checked, status corrected:
- 7.4 retries: partly built. A failed invoice email is not marked sent, so the next daily run tries again; a crashed daily run is taken over after 20 minutes. There is no explicit retry queue, and failed reminder sends are not listed for the owner.
- 7.8 pausing: partly built. Each automation has its own on/off switch in Account, and the prospect autosend has a pause switch that also trips on a high bounce rate. There is no timed pause ("pause until").
Deferred: business timezone (10.9), for the UTC day-key reason in Pass 290.
Tests: tests/gap-close-291.test.mjs (6 checks); tests/measures.test.mjs still runs in the chain; release-files (5); TypeScript scan clean apart from the known false positive. Nothing run live.

## Pass 292: owners can tag leads (spec 2.4, part)
Finding: broadcasts and segments already filter by tag, but nothing in the app wrote tags, so only imports could set them.
Built:
- A tag box on each lead in the Lead Inbox. Tags are lowercase, any language's letters and numbers, spaces, dashes and underscores. Max 20 per lead, 30 characters each, saved when you leave the box.
- Tags are kept in the same lead record the segment filter reads, so a broadcast to "vip" reaches them.
Limits: tags on deals and customer records are not editable yet, so 2.4 stays partly built. Tags are not enforced by the database rules (the owner writes their own leads, as the inbox already does for status).
Tests: tests/gap-close-292.test.mjs (6 checks), gap-close-291 (6), release-files (5), TypeScript scan clean apart from the known false positive. A release-check failure on the first run was a test string that looked like an import; fixed, and the test now checks the component name instead. Nothing run live.

## Pass 293: team tasks (spec 3.3) and landing and pipeline check
Built:
- /tasks: a task has a title, an optional due day and one assignee from the team (owner or managers). Mark done, reopen, or delete.
- Overdue and due-today tasks count on Today ("tasksNeedAttention", priority 2.5).
- Viewers can read tasks but are blocked from changing them (the role comes from the verified workspace through proxy.js, not from the request).
- A due day must be a real calendar day (31 February is refused).
Limits: no reminder emails and no recurring tasks. Due days use UTC+05:30 until the timezone setting (10.9) is built, so an owner in another timezone sees "overdue" and "due today" a few hours off near midnight.
Landing and pipeline check (by tests and link checks, not a browser run): every internal link on the public home page resolves; the three in-page anchors exist; no placeholder text; the /landing editor only shows testimonials the customer agreed to in writing; sales-ops (19), today-actions (4), ui-guards and quick-links pass. The pipeline stages are covered by sales-ops and measures; not clicked through here.
Tests: gap-close-293 (8 checks, including a fix for 31 February rolling into March and a check that the viewer block depends on the proxy header), plus gap-close-289 to 292, release-files (5), and the TypeScript scan (760 files, only the known ad-sync false positive). Nothing run live.

## Pass 294: owner timezone (spec 10.9)
Correction: earlier passes said the daily job uses UTC day keys. That is true only for the job-run lock and run log. Owner-facing day keys and the send window already used the stored offset (tzOffsetMin). The real gaps were: no zone name (so daylight saving was wrong for any zone that has it), tasks and Today counts ignoring the owner's offset, and a hard-coded Sri Lanka offset in availability.
Built:
- The owner's zone name (for example Europe/London) is saved from the browser with the autopilot settings, next to tzOffsetMin.
- One helper reads the owner's clock: the zone when valid, else the stored offset, else Sri Lanka time (+05:30).
- Used by the daily job, the autosend window and day key, availability, the tasks page and the Today task count.
Limits: an owner's zone is whatever their browser reported when they last saved the account page. A zone can only be changed by saving from a browser set to that zone. The run lock and run log remain UTC.
Tests: tests/gap-close-294.test.mjs (6 checks), gap-close-293 (8), gap-close-292, today-actions, autosend, quick-links, sales-ops, release-files (5), and the TypeScript scan (769 files, only the known false positive).
Environment: tests/routes-e2e and tests/booking-calendar cannot load the stripe and node-ical packages in this sandbox (network is off). They failed before this pass and are not caused by it.

## Pass 295: customer history (spec 2.3)
Owner report, 2026-11-15: the owner ran the app and it works. This is the owner's report, not a test result from this sandbox.
Built:
- /history: enter a customer's email and see one newest-first list of their emails sent, quotes sent and accepted, invoices emailed and paid, bookings, and support questions opened and resolved.
- Read-only. The email is checked before any search. Matching ignores case. Capped at 200 events. A record without a usable time is left out.
Limits: the list covers the records listed above only (not calls, meetings or WhatsApp). It is found by email, so a customer who uses two addresses shows two histories. It does not yet link from the customers page.
Tests: tests/gap-close-295.test.mjs (8 checks), gap-close-294 and 293 still pass, today-actions and quick-links pass, release-files (5), TypeScript scan (773 files, only the known false positive). Nothing run live.
Landing and pipeline: no landing changes in this pass; the link and placeholder check from Pass 293 still holds.

## Pass 296: tags on deals and customers (spec 2.4)
Built:
- The CRM lead panel has a tag box under the company name. Tags are saved to the deal (the same record Rename writes), so one tag per customer, and they are read back onto the lead.
- Deal tags were already read by segments; now they can be set. The same cleaning rules apply as for lead tags (lowercase, 20 tags, 30 characters, letters from any language).
Limits: a customer with no deal (lead only) keeps the tags on their lead record, edited in the Lead Inbox. Tags are not shown on the customer list yet.
Tests: tests/gap-close-296.test.mjs (4 checks), gap-close-292 and 295 still pass, ui-guards, quick-links, sales-ops, release-files (5), TypeScript scan (774 files, only the known false positive). Nothing run live.

## Pass 297: retries for failed invoice emails (spec 7.4) and a reminder fix
Found while building (this corrects an earlier note):
- A failed automatic invoice email was never tried again. The planners skip customers who were invoiced recently, so the invoice sat unsent with no retry and no flag. The earlier note that it "retries next day" was wrong.
- Automatic reminders could go to an invoice the customer had never been sent. The reminder planner did not check the sent date.
- An invoice created while the send window was closed was never sent either.
Built:
- lib/retry-rules.js: a failed send is tried again a day later, up to three tries, then it stops and is marked given up. At most 20 retries per run. A customer blocked since the first try is held, not emailed.
- Invoices the send window closed on are queued and sent when the window next opens.
- Automatic reminders only go to invoices that were emailed.
- Today shows "invoice emails have not gone out" with a link to Billing. The run log explains the two new codes.
- A manual send from Billing still works and stops the automatic retries.
Limits: retries run on the daily job (once a day), not on demand. Automatic reminders now skip any invoice with no sent date, so an older invoice that was sent but never stamped will not get an automatic reminder. Check those on Billing.
Found, not changed (needs an owner decision): invoices live in two places. The daily job, the invoice list, numbering, statements and the storefront use the top-level invoices collection. Today's counts (held invoices, won deals not yet invoiced), customer history, KPIs, economics, and the automation, stock payment and Balancr code use users/{uid}/invoices. The automation, stock and Balancr code write to the second place. So Today and history can miss invoices the daily job created. Fixing it means choosing one store and moving data on live accounts.
Tests: tests/gap-close-297.test.mjs (11 checks, chained). The billing-automation, fx-display and reminder-balance fixtures now mark their invoices as emailed, because the reminder rule changed. Chained tests: 218 pass. 36 cannot run in this sandbox because packages (firebase, next, stripe, pptxgenjs and others) are not installed; none fails for any other reason. release-files (5). TypeScript scan clean except the known false positive. Nothing run live.

## Pass 298: one place for invoices (fixes the split found in Pass 297)
Decision taken: invoices live in the top-level `invoices` collection, tagged with userId. That is where the daily job, the invoice list, numbering, every creation route (through addInvoiceWithCredit), the refund, cancel and ship routes, the pay webhook and the manual send already write.
Built:
- Automatic invoices from automation-control are now created in the main collection (they were written to the per-customer path).
- Every reader that used users/{uid}/invoices now reads the main collection, filtered to the owner: KPIs, economics, Today, customer history, day start, upsell, broadcasts, gap tools, pipeline run, meta, google, tiktok purchases, route helpers, Balancr sync, and the statement-style readers.
- A stock draw and a Balancr update check that the invoice belongs to the owner before they change it. The invoice is found by id in the main collection.
- lib/server/invoice-store.js copies older invoices from users/{uid}/invoices into the main collection, once per owner. It runs in the daily job before the money section. Same ids; the copy is only written where that id is not already in the main collection; the old rows are not deleted; a settings flag stops it running again. The pure copy rule is lib/invoice-store-rules.js.
Limits, to know before you rely on it:
- Until an owner's daily job has run once after this release, their older invoices (the per-customer path) are not visible to the readers listed above. Newer invoices are fine. If an owner has many older invoices, the copy takes more than one daily run (300 per run).
- Nothing has been copied on live accounts from here. The copy runs in the next daily job.
- Old per-customer rows stay where they are; they are not cleaned up.
Tests: tests/gap-close-298.test.mjs (8 checks, chained). gap-close-295 now expects the main collection. The release-file check now passes. Chained tests: 219 pass; 36 cannot run in this sandbox because packages are not installed (firebase, next, stripe, pptxgenjs and others); none fails for any other reason. TypeScript scan: only the known false positive. Nothing run live.

## Pass 299: Firebase projects separated (documentation, no code change)
- AutoLeads is the Firebase project mails2leadz. Balancr is the separate project balancr-3d9d0, on the same Google account.
- No AutoLeads code refers to balancr-3d9d0. The project id and service account come from environment variables, and Balancr is reached only through its HTTP API.
- ENV_CONFIG.md now records the mapping. Check on each deployment that NEXT_PUBLIC_FIREBASE_PROJECT_ID is mails2leadz and that the service account JSON is from mails2leadz.
- Pass 298's invoice work does not touch Balancr's data.

## Pass 300: timed pause for Autosend (spec 7.8)
Built:
- Account offers "Pause for 1 day", "Pause for 7 days" and "Pause until I resume". The pause is stored with an end time (capped at 30 days).
- When the end time passes, sending goes back on by itself. The daily send run clears the expired pause before it decides whether to stop.
- An expired pause does not show as paused, and does not raise the Today alert. The Account line reads "Paused until <date> UTC" while it holds.
- A pause with no end time still holds until the owner resumes. An unreadable end time is treated the same way (the safe side).
Limits: the Business page (app/business/page.js) still reads the stored flag, so it shows "paused" until the next send run clears it. Timed pauses cover Autosend only; the invoice reminders and daily billing keep their own switches.
Tests: tests/gap-close-300.test.mjs (9 checks, chained). Chained tests: 220 pass; 36 blocked by packages not installed in this sandbox; none fails for any other reason. release-files (5). TypeScript scan clean except the known false positive, which also covers the Account page. Nothing run live; the Account page's JSX was not compiled here.

## Pass 301: journeys start themselves on a trigger (spec 7.2)
Built:
- A journey can carry one line, "trigger: deal_won", "trigger: invoice_paid" or "trigger: ticket_resolved". The journey help in Sales tools explains it.
- The daily job adds people when the event happens: a deal moves to won, an invoice is paid, or a support question is resolved. Each person joins a journey once.
- Only events after the journey was saved count. Turning a trigger on never reaches back to old customers.
- Blocked or opted-out contacts are never enrolled. Each new enrolment has no consent recorded, so auto-send holds its steps until the owner confirms consent. Nothing is sent to a new enrolment without that.
Limits: the win time is the deal's last update, so a deal edited after it was won can count as a new win. Looks back three days, so a skipped daily run loses events older than that. The owner still confirms consent for each new person; a journey-level consent setting would remove that step, and it needs the consent review that is still open.
Tests: tests/gap-close-301.test.mjs (11 checks, chained). Chained tests: 221 pass; 36 blocked by packages not installed in this sandbox; none fails for any other reason. release-files (5). TypeScript scan clean except the known false positive, which also covers the Sales tools page. Nothing run live.

## Pass 302: connections checked every day (spec 10.11)
Built:
- Every connected service (all its keys saved) is checked once a day by the daily job, oldest check first, at most twelve per run. Before this, a check ran only when the owner pressed Test.
- Each result is stored per service: ok or not, a short message, and when it was checked. The Integrations page reads the same results.
- A service whose check fails shows on Today ("connection has stopped working"), with a link to Integrations. It clears on the next check once the key works again.
Limits: the daily job only covers owners with autopilot switched on, since the job runs for them. Each check calls the outside service once a day, so a service with many errors is not checked more often than that. A failing check says that it failed, not why beyond the service's own message.
Tests: tests/gap-close-302.test.mjs (6 checks, chained). Chained tests: 222 pass; 36 blocked by packages not installed in this sandbox; none fails for any other reason. release-files (5). TypeScript scan clean except the known false positive. Nothing run live.

## Pass 303: support questions sorted into categories (spec 5.1)
Built:
- Each new support question gets a category from the customer's words: billing, delivery, booking, product, account, or general. The rules are first-match and checked by tests.
- The support numbers now carry the count per category, so the owner can see what customers keep asking about.
Limits: the owner cannot yet change a ticket's category by hand, and the category counts are not shown on screen yet (they are in the support numbers only). Older tickets count as general. Matching is by keyword, so an unusual wording can land in general.
Tests: tests/gap-close-303.test.mjs (6 checks, chained). Chained tests: 223 pass; 36 blocked by packages not installed in this sandbox; none fails for any other reason. release-files (5). TypeScript scan clean except the known false positive. Nothing run live.

## Pass 304: category counts on screen, exact date ranges on the sales numbers (specs 5.1, 6.7), landing and pipeline check
Built:
- Support today shows the question counts by type (billing, delivery, booking, product, account, general).
- The sales numbers can be read for an exact from-to range, up to 24 months. Pick the dates, press Apply; "Use months" goes back to the 3, 6 or 12 month look-back. The heading shows the range. A bad or reversed range is refused and the normal look-back is used.
- The range's end is used for every window check (wins, acquisition, the at-start cohort), so a past range does not pick up later records.
Landing and pipeline check: no placeholder or TODO text in the landing page, the CRM pipeline, or the Sales tools screens; internal links resolve (the one flagged link is an API route that exists).
Limits: the forecast and at-risk figures still use today, not the range end. The category counts are on the support panel only, not in the ticket list, and owners cannot change a category by hand yet.
Tests: tests/gap-close-304.test.mjs (6 checks, chained). Updated tests/gap-close-284.test.mjs: its heading check now matches the new heading, which can show a picked range. Chained tests: 224 pass; 36 blocked by packages not installed in this sandbox; none fails for any other reason. release-files (5). TypeScript scan clean except the known false positive. Nothing run live.

## Pass 305: owner sets a ticket's category by hand (spec 5.1)
Built:
- Each ticket row on the support panel has a category picker. It saves only a category from the list, and records that the owner set it (categoryBy: owner).
Limits: the ticket list itself does not show categories yet; they are on the support panel rows and in the category counts.
Tests: tests/gap-close-305.test.mjs (3 checks, chained).

## Pass 306: switch emails back on after an opt-out
Built:
- After opting out with the link in an email, the page offers "Switch emails back on". It works only for an opt-out made through that link. The suppression record is removed, so sends can reach that address again.
- A bounce is never switched back on from a link. The page then says to reply to the email and ask.
Limits: the open deal that the opt-out marked Lost is NOT restored. It stays Lost with the reason unsubscribed, as the record of what happened, and nothing brings it back automatically. Consent for automatic follow-ups is still under review, so a switched-back-on address gets the same handling as any other address. Nothing run live: the page and the route have not been tried in a browser or against Firestore.
Tests: tests/gap-close-306.test.mjs (7 checks, chained). Chained tests: 225 pass; 34 blocked by packages not installed in this sandbox; 0 fail. release-files (5). TypeScript scan clean except the known false positive. Nothing run live.

## Pass 307: Business page pause rule, forecast and at-risk on the picked range, ticket categories checked
Built:
- The Business page shows Autopilot as off while a pause is in force. A timed pause that has run out counts as on, the same rule the server uses.
- Forecast and at-risk deals on the sales numbers are read as of the picked range's end, never later than today. With no range picked, nothing changes.
- Ticket categories: the Support panel rows already show each ticket's category in a picker (Pass 305), so this item is closed. The customer link list is not a support queue and shows no category, by design.
Limits: the forecast on a past range uses the quarter of that range's end, but is built from the deals' current stages, not the pipeline as it stood on that day.
Tests: tests/gap-close-307.test.mjs (5 checks, chained). Chained tests: 226 pass; 34 blocked by packages not installed in this sandbox; 0 fail. release-files (5). TypeScript scan clean except the known false positive. Nothing run live.

## Pass 308: calls, meetings and notes logged by hand, AI call summaries in the customer history (spec 2.3)
Built:
- On the customer history screen, once a customer's history is shown, the owner can log a call, a meeting or a note: a short summary and an optional next step. It is saved and the history refreshes.
- A logged entry can be dated earlier than now, but not in the future. The email must be a valid address; the type must be call, meeting or note.
- AI call summaries (already saved per customer by the call summary tool) now appear in that customer's history as "Call summarised".
Limits:
- Calls placed through the dialler are not in the history. Those records carry only a phone number, and deals keep no phone number, so they cannot be matched to a customer by email. Fixing that needs the phone number stored on the deal.
- Deal stage changes are not in the history list. The full deal history view is still open.
- Logged entries cannot be edited or deleted yet.
- Call summaries are read from the 300 newest saved; an older summary past that will not appear.
- Nothing run live against Firestore.
Tests: tests/gap-close-308.test.mjs (6 checks, chained). Chained tests: 227 pass; 34 blocked by packages not installed in this sandbox; 0 fail. release-files (5). TypeScript scan clean except the known false positive.

## Pass 309: dialler calls and deal stage changes in the customer history (spec 2.3)
Built:
- A call placed from the dashboard now records the lead's email on the call. Calls placed from then on show in that customer's history as "Call placed", with the status and length when the call has them.
- Stage changes on the customer's deal show in the history as "Moved to <stage>", with the time of each change.
- Only a real email address is stored on a call; a missing or bad one is stored as empty and the call simply does not appear in any history.
Limits:
- Calls placed before this release have no email on their record, so they do not appear in a customer's history. Nothing backfills them.
- Deals still keep no phone number. Matching is by email, not phone, so a call placed without a lead email cannot be linked.
- A stage change appears only where the deal recorded its stage time (deals that moved before the stage times were kept do not show them).
- The full deal history view (a separate screen for one deal) is still not built; the history list carries the stage changes.
- Call status and length come from the call webhook; a call whose webhook never arrived keeps the status it was created with (for example "queued").
- Nothing run live against Firestore or Twilio.
Tests: tests/gap-close-309.test.mjs (5 checks, chained). Chained tests: 228 pass; 34 blocked by packages not installed in this sandbox; 0 fail. release-files (5). TypeScript scan clean except the known false positive.

## Pass 310: full deal history, edit and delete of logged entries, resubscribe reopens the deal, journey win date (spec 2.3, 9.2)
Built:
- A deal card on the customer history: its stage, whether it is open, won or lost (with the reason, for opt-outs and bounces), its value, and every stage it went through in order.
- The owner can edit the summary and next step of their own logged call, meeting or note, and delete it (with a confirm). Nobody else's entry can be changed; a missing or foreign entry is refused.
- Switching emails back on now also puts the deal that the opt-out marked Lost back in the open stage it was in before. This closes the limit left by Pass 306.
- A journey's "deal won" trigger now dates the win from when the deal first reached won, not from its last update. This closes the limit left by Pass 302's journey work.
Limits:
- The deal card shows the most recently updated deal for that email. A customer with several deals sees the one that changed last.
- A deal reopened after an opt-out with no usable stage times goes back to New.
- Editing an entry does not change its time or type.
- Invoices copied from before the store change are still reached only by the daily run. Billing reads its invoices on the page, so the copy cannot be done from a route the page calls. Left open for that reason.
- Nothing run live against Firestore, email, or the browser.
Tests: tests/gap-close-310.test.mjs (9 checks, chained); tests/gap-close-306.test.mjs updated to the new reopen behaviour. Chained tests: 229 pass; 34 blocked by packages not installed in this sandbox; 0 fail. release-files (5). TypeScript scan clean except the known false positive.

## Pass 311: older invoices brought across when billing reads them (spec 7.4, closes the Pass 298 limit)
Built:
- Before the invoice list is read, the app copies this owner's invoices from before the single store into it. The copy is the same safe routine the daily job uses: it skips invoices already across and can be repeated.
- If the copy fails, the list still loads, and the copy is tried again on the next read.
Limits:
- The copy brings across up to 300 invoices per load. An owner with more than 300 older invoices sees the rest come across on later page loads.
- The copy runs once per page session on the client; it is not repeated within one session.
- Nothing run live against Firestore.
Tests: tests/gap-close-311.test.mjs (3 checks, chained). Chained tests: 230 pass; 34 blocked by packages not installed in this sandbox; 0 fail. release-files (5). TypeScript scan clean except the known false positive.

## Pass 312: monthly membership offer (scope: upselling and recurring revenue)
Built:
- The owner names a monthly membership, its monthly price, an optional currency, and what it includes (CRM screen, Monthly membership panel).
- The panel shows the offer text, built only from what the owner entered, with a Copy button.
- The owner adds a member by email (and optional business name). The member's deal gets the monthly amount, so recurring revenue counts it. A deal already won keeps its stage.
Scope decision on the 25-item operations list (attached by the owner): only the monthly membership is in AutoLeads' scope. The rest (autopay bills, second signer, team spending limit, bonuses tied to results, recorded SOP videos, training plan for new hires, and people or service items) belong to Balancr, the operations product. Balancr's code is not in this workspace, so none of those were changed.
Limits:
- Taking payment is not part of this: no charge is set up for a member. The owner marks the deal won when the money arrives, and until then the member is a proposal.
- The offer is copied and sent by the owner; nothing is emailed automatically.
- No per-member list or membership status page yet; members appear in the pipeline as deals.
- Nothing run live.
Tests: tests/gap-close-312.test.mjs (5 checks, chained). Chained tests: 231 pass; 34 blocked by packages not installed in this sandbox; 0 fail. release-files (5). TypeScript scan clean except the known false positive.

## Pass 313: the person chooses what to stop (preference centre, opt-down only; spec 9.2, 9.3)
Decisions taken (owner approved opt-down only):
- The signed unsubscribe page now offers two choices: "Stop sales emails" (marketing and follow-up emails, as before) and "Stop all emails" (everything from that sender, including invoices and receipts). Each says plainly what it stops.
- A stop-all is recorded as its own suppression kind and blocks every email. It can be switched back on from the same page, the same as a sales opt-out. A bounce still cannot be switched back on.
- Journey auto-enrolment stays off for people until the owner confirms it; this was already the default and is unchanged.
Fixed on the way: an opt-out on an address that had bounced used to replace the bounce record, which would have let a bounced address be switched back on. A bounce record is now never replaced.
Limits:
- This is two choices, not one setting per topic. Per-topic choice would change the blocking rule every send path uses, which I have not built.
- Per-market consent (9.4) is still open: which countries need opt-in is a legal question.
- Shared customer IDs (8.2) still need Balancr's code.
- Nothing run live.
Tests: tests/gap-close-313.test.mjs (5 checks, chained). Chained tests: 232 pass; 34 blocked by packages not installed in this sandbox; 0 fail. release-files (5). TypeScript scan clean except the known false positive.

## Pass 314: older calls linked to their customer by phone number (spec 2.3, closes the old-calls limit); decisions on the rest
Built:
- Each day, the owner's older calls with no customer are matched to a customer whose phone number on file is the same (lead records, call attempts, and deals with a phone). A number held by two different customers is not linked to either.
- A linked call shows in that customer's history, and the link is recorded as a phone match.
Decisions (made without asking):
- Per-topic preferences: not built. The design is two choices (stop sales emails; stop all emails), and per-topic would change the blocking rule every send path uses. Owner may override; it stays a deliberate limit.
- Per-market consent (9.4): still open. Which countries need opt-in is a legal question, not a product one, so I did not choose it.
- Shared customer IDs (8.2): AutoLeads already sends a stable reference (autoleads:<deal id>) on every Balancr lead. Whether Balancr stores and returns it is on Balancr's side, which I cannot see. Left as partly done.
- Integrations beyond the existing ones: not built, since each needs platform keys and documentation I cannot verify from here.
Limits:
- A call to a number that no record holds stays unlinked.
- Matching uses the last nine digits, so a number from another country with the same nine digits would match; this is a known risk.
- The link runs once a day, not on each history view.
- Nothing run live.
Tests: tests/gap-close-314.test.mjs (5 checks, chained). Chained tests: 233 pass; 34 blocked by packages not installed in this sandbox; 0 fail. release-files (5). TypeScript scan clean except the known false positive.

## Pass 315: synced with Balancr v285 (spec 8.2 shared customer IDs; the Balancr sync)
Checked against the Balancr v285 release (SYNC.md, its v1 routes and its lead stages). The contract is written down in BALANCR_CONTRACT.md.
Found and fixed:
- Balancr stores a lead's contact as "phone · email" when it has both. AutoLeads compared the whole text as an e-mail, so the stage webhook missed the deal, and the inbox row kept the text as an e-mail. The contact is now split into its e-mail and its phone, and both are kept.
- A Balancr lead is now matched to its deal by Balancr's lead id (stored when the deal was sent), then by the external id "autoleads:<deal id>" that Balancr returns, and only then by contact.
Closed with this: shared customer IDs (8.2). Balancr returns both its lead id and our external id on every lead, and AutoLeads matches on them.
Checked and unchanged: the endpoints, the Bearer header, the lead and invoice response wrappers, the seven stages, the invoice statuses (paid, overdue, open), and the since and limit parameters.
Still on Balancr's side: event-based sync is still open in Balancr's changelog. The stage webhook and the daily sync both run here; the daily sync is the fallback.
Tests: tests/gap-close-315.test.mjs (6 checks, chained); the existing Balancr tests (balancr, gap-close-280, balancr-sync) still pass. Chained tests: 234 pass; 34 blocked by packages not installed in this sandbox; 0 fail. release-files (5). TypeScript scan clean except the known false positive.

## Pass 316: efficiency: fewer reads in the daily call linking and on the sales numbers
Built:
- A call that could not be linked to a customer is marked as checked, and is looked at again only after seven days. Before, every such call was re-read each day for every owner, and the lead inbox was read each time.
- When no call is due, the daily job now stops before reading the lead inbox, the deals or the phone-call attempts.
- The sales numbers read the lead inbox once (they read it twice before) and take the web figures from the business settings already read.
Limits:
- Efficiency has not been measured on live data; these are read reductions found by reading the code.
- The history screen still reads several collections in full per customer (quotes, bookings, tickets), filtering in code. Narrowing those queries is left for a pass on live data, because stored customer emails may not all be lower case and a narrower query would miss them.
- Per-market consent (9.4) still needs a legal decision; per-topic preferences are deliberately not built; event-based sync is open on Balancr's side; integrations beyond the existing ones need keys and docs; live verification needs a deployment.
Tests: tests/gap-close-316.test.mjs (4 checks, chained); tests/gap-close-314.test.mjs updated to the new check. Chained tests: 235 pass; 34 blocked by packages not installed in this sandbox; 0 fail. release-files (5). TypeScript scan clean except the known false positive.

## Pass 317: fresh start, legacy invoice copy removed
Decision: the data is being started fresh, so nothing old needs carrying across. The one-time copy of invoices from the old per-customer path is removed.
Removed: lib/server/invoice-store.js, lib/invoice-store-rules.js, the invoices migrate route, the billing read's call to it, the daily job's copy step, and tests/gap-close-311.test.mjs. The Pass 298 test is rewritten: it now checks only the single store (no reads of the old path, automatic invoices and owner checks in the main collection, billing reading the main collection).
Kept: the single invoice store and every reader and writer that uses it.
Tests: tests/gap-close-298.test.mjs (4 checks, rewritten); 311 removed from the chain. Chained tests: 234 pass; 34 blocked by packages not installed in this sandbox; 0 fail. release-files (5). TypeScript scan clean except the known false positive.
Not changed by a fresh start: per-market consent (9.4) still needs a legal decision for new contacts; per-topic preferences stay deliberately unbuilt; event-based sync is open on Balancr's side; integrations beyond the existing ones need keys and docs; live verification needs a deployment.

## Pass 318: per-topic marketing stops (closes the per-topic preference gap)
- Built. A recipient can stop follow-up reminders only, or campaigns and offers only, from the unsubscribe page, in addition to the existing sales stop and stop-all. Each send path now passes its topic: follow-ups use follow_ups; campaigns, broadcasts, journeys, first outreach and WhatsApp use campaigns.
- The stronger stop is kept. A bounce beats a stop-all, which beats a sales stop, which beats a topic stop, so a later opt-out can never weaken a bounce or a stop-all (this also fixes an older case where a sales opt-out could replace a stop-all record). Topic stops accumulate.
- A topic stop does not mark the deal Lost, and does not block invoices or replies. A follow-up stop cancels pending follow-up reminders; a campaign stop does not.
- Limits: a topic stop is a choice of two topics, not a per-template or per-campaign setting. Sends with no topic given default to campaigns. Switch-back-on clears every stop for that address, topics included.
- Tests: tests/gap-close-318.test.mjs (11 checks, chained). tests/gap-close-313.test.mjs updated to check the stronger-stop rule instead of the old bounce-only line. Full run: 235 pass; 36 blocked by packages not installed in this sandbox; 1 fail before the 313 update, 0 after. Nothing run live.

## Pass 319: CRM push to HubSpot and Pipedrive
Built:
- Once a day, each deal that changed since the last run is sent to the owner's HubSpot and/or Pipedrive as a contact. The CRM is checked by email first: a contact already there is left as it is, and a new one is created. Only deals with a usable email are sent.
- The keys are entered on the Integrations screen under "CRM push", and stored encrypted per account like the other keys. Nothing is sent when no CRM key is set.
- The last-sent mark is kept on users/{uid}/settings/crm. A rejected key or a server error stops the run, so the next run resumes from the same deal. A bad contact (400 or 422) skips only that deal. At most 200 deals per run.
Limits:
- Contacts only. Deals, pipeline stages and activities are not pushed, and nothing is pulled back from the CRM (one-way).
- Changes to an existing contact's details are not written back; a contact is created once, then left alone.
- Request shapes were checked against HubSpot and Pipedrive's public docs. Not run against live accounts; live verification needs a deployment.
- Per-market consent (9.4) still needs a legal decision; event-based sync is open on Balancr's side; integrations beyond these need keys and docs.
Tests: tests/gap-close-319.test.mjs (14 checks, chained). Chain: 238 pass; 36 blocked by packages not installed in this sandbox; 0 fail.

## Pass 320: CRM deals sync both ways (won and lost); closes the one-way gap from Pass 319
Built:
- Each deal with a usable email gets a CRM deal, linked to its contact (HubSpot: deal-to-contact association type 3; Pipedrive v2: title and person_id). The CRM deal id is kept on the AutoLeads deal.
- Won and lost are kept the same in both directions. Each deal remembers the outcome it last wrote to each CRM. On a run: if the CRM's outcome differs from that, the CRM changed it and AutoLeads takes it (a deal reopened in the CRM goes back to "contacted"); otherwise, if AutoLeads' outcome differs, it is sent. When both changed since the last sync, the CRM's change wins, and the overwrite is the cost of that rule.
- A CRM deal that was deleted or archived is created again.
- Linked deals are re-read every run, so a change made in the CRM is found within a day. Changed deals are processed first, then linked deals, least recently checked first, within the run's cap of 200.
- Change detection now uses the later of lastUpdate and updatedAt. Stage moves write updatedAt, so they were missed before.
- Each CRM keeps its own contact id (a HubSpot id is never sent to Pipedrive as a person).
Limits:
- Open pipeline stages are not mirrored. Only the won and lost outcome, and the existence of the deal, sync. Mirroring open stages needs each owner's HubSpot stage ids or Pipedrive stage ids, which differ per pipeline; that is left out on purpose.
- Deal amounts are not sent yet: the CRM value fields were not verified against their docs in this pass.
- A pull applies on the daily run, so a change made in the CRM reaches AutoLeads within a day, not at once.
- Deals with no usable email are not created in a CRM (a contact needs one). Their existing links still sync.
- Verified: request shapes were checked against HubSpot's and Pipedrive's docs as fetched in this pass. The HubSpot search doc used versioned paths (crm/objects/2026-09), which the deal calls use. Not run against live accounts; live verification needs a deployment.
- Per-market consent (9.4) still needs a legal decision; event-based sync is open on Balancr's side.
Tests: tests/gap-close-320.test.mjs (22 checks, chained); tests/gap-close-319.test.mjs updated to the new code (14 checks). The Firebase calls cannot run in this sandbox, so the loop is checked against its source and the rules are tested directly.

## Pass 321: CRM deal amounts, and the open-stage decision
- Deal amounts now go to the owner's CRM: HubSpot deal `amount` (a string with 2 decimals) and Pipedrive `value` (with `currency` when the deal has a 3-letter one). Sent on create, and again whenever the deal's value changes (`crmAmounts` on the deal records what was last sent to each CRM).
- Nothing is read back from the CRM for amounts, so no unverified response field is relied on.
- Field names checked in the vendor docs this pass: HubSpot deal `amount`; Pipedrive v2 POST and PATCH `/deals` take `value` and `currency`.
- Open pipeline stages stay out on purpose (decided, not deferred). Mirroring them needs a stage mapping per owner's pipeline; a wrong mapping would silently move deals in their CRM. Won and lost, which drive revenue reporting, remain two-way. Checked: HubSpot `GET /crm/v3/pipelines/deals` and `.../stages`; Pipedrive `GET /api/v2/stages?pipeline_id`. A mapping screen can be added later if owners ask for it.
- A cleared deal value is not sent: the CRM keeps its last amount.
- Limit: the Pipedrive deal response field names (value, stage_id) are still not confirmed by the docs, so nothing reads them. Amounts are one-way (AutoLeads to CRM).
- Tests: tests/gap-close-321.test.mjs (10 checks, chained). Not run against live accounts; live verification needs a deployment.

## Pass 322: landing page claims checked against the code
- Checked every product claim on app/page.js against lib/switches.js, lib/autosend.js, lib/automation-mode.js and the job code.
- Fixed: "Automatic invoices on won deals" was listed as off, but autoInvoiceDrafts defaults on (drafts are created, never sent). Replaced with the real off item: automatic e-mailing of invoices and payment reminders (autoBilling, off by default). Added the on-by-default, never-sent invoice drafts line.
- Fixed: "Watch-list reminders for listings left undecided" had no code behind it. Replaced with the real price watch on chosen listing feeds (lib/deal-watch.js).
- Rendered the page to static HTML and checked it in headless Chromium: no JavaScript errors, corrected copy present, internal links resolve.
- Not checked: the mobile layout and visual design. No CSS build (Tailwind compile tooling and node_modules are not available here), so layout needs a real build and a look at phone width.

## Pass 323: HubSpot amounts need the account currency; recruitment decision
- HubSpot deal amounts go in as plain numbers, with no currency code. The HubSpot deal currency property was not confirmed in the docs this pass, so no property name is guessed. The owner-facing text (lib/integration-catalog.js, CRM sync) now says the HubSpot account currency must match the one used in AutoLeads. Pipedrive sends its currency with the value.
- Recruitment or headhunting: not built in this release. Decision: stay in the sales scope.
  - Reasons: the headhunting techniques that work (referrals, networking, face-to-face meetings, a trusted network) are mostly human, so the share AutoLeads can automate is small. Candidates need a different record (profile, CV, consent to be approached) and a different fee model (retained or contingency placement fees), which means a new data model under the pipeline rather than a relabelled one. Cold outreach to individuals also brings consent obligations that this sandbox could not check (see the PDPA note in Balancr's gap log).
  - Lower-risk pivot that stays on the existing engine: outsourced appointment-setting for other businesses (outbound plus CRM handoff). It is still a service business, so the software is the engine rather than the product on its own.
  - To test before building anything: run a two-week manual pilot (one recruiter or agency, one client, a fixed number of approaches), measure reply rate and placements, then decide.
- Tests: `node run-chain.mjs` over the npm test chain: 276 commands, 240 pass, 36 blocked (the `firebase` package is not installed in this sandbox), 0 fail.
- Not checked: live HubSpot and Pipedrive accounts (needs a deployment); the mobile layout of the landing page.

## Pass 324: work mode (sales or recruitment) and HubSpot deal pipelines
- Work mode: the account page asks "What do you use AutoLeads for?" Sales and marketing is the default and changes nothing. Recruitment and headhunting changes the words only: the CRM board, business value page, conversations, customers, deal history, customer timeline and stall alerts show recruiter words ("Sourced", "Screened", "Placed", and so on). The stored stage names, reports, guards and CRM sync do not change.
- Two AI drafts that write to someone already in a deal (the closing nudge and the revival email) get a recruiter rule in recruitment mode: say what the role is, ask if they are interested, do not sell, never promise a job, a salary or an outcome. Sales prompts are byte-for-byte unchanged.
- Recruitment is a label layer, not a separate product. The placement fee is the deal value. Not built: candidate profiles and CVs, consent to be approached, retained or contingency fee terms. Those need their own data model, and pass 323 records why it was not started.
- HubSpot stage ids: the won, lost and open ids were hard-coded to the default pipeline (closedwon, closedlost, appointmentscheduled). A custom pipeline would have broken the sync. Now each run reads the owner's deal pipelines (GET /crm/v3/pipelines/deals), uses the default pipeline if present or the first one, finds won (probability 1.0), lost (probability 0.0) and the earliest open stage, and creates deals in that pipeline. If the read fails, the default ids are used, as before.
- Not done: mirroring the owner's custom open-stage names into AutoLeads. Open deals in HubSpot count as open; their stage name is not copied.
- Pipedrive: the stage_id, value and currency field names were not checked this pass (the vendor docs redirected and were not reached). Pipedrive code is unchanged.
- Tests: work-mode 10 checks, HubSpot pipeline 9 checks, and the existing CRM tests (gap-close-320 22, gap-close-321 10) pass. Two existing checks were updated to match the new wiring (gap-close-309 expects the mode passed to the timeline; release-files manifest regenerated, 794 files).
- Test chain: 278 commands, 242 pass, 36 blocked (the `firebase` package is not installed in this sandbox), 0 fail.
- Not checked: a live HubSpot or Pipedrive account; the mobile layout of the pages and the landing page (no CSS build here).

Pass 325: operator AI keys for the owner's accounts only (AI_OPERATOR_UIDS, lib/server/ai-operator-keys.js). The server's or app-saved DeepSeek/OpenAI/Anthropic keys are no longer a default: SaaS accounts use their own saved key, and team members of the owner's account are covered through the owner's uid. SAAS_OPERATOR_AI is removed. callAI never falls back to server keys when there is no database. Test: tests/operator-ai-keys.test.mjs (6 checks), in the chain. Chain result: run again at the end of this pass.

Pass 326: send circuit breaker (lib/send-breaker.js, lib/server/send-breaker.js). Before a send, the account's stops (opt-outs and bounces) over the last 7 days are compared with its sends: at 0.1% an alert, at 0.3% sending pauses (HTTP 423) with a plain message. Needs at least 200 sends in the window. Opt-outs and bounces stand in for spam complaints, which the app cannot see. Needs the suppressions userId+createdAt index in firestore.indexes.json (added): deploy the indexes. Test: tests/send-breaker.test.mjs, in the chain.

Pass 327 (final gap pass, from the 17 Nov 2026 gap research): (1) send-email refuses a bulk send until the owner has a postal address (HTTP 422), because marketing email must show a contact address; (2) the send gate (lib/server/sender-auth.js senderGateFor) blocks when the sending domain has no SPF or no DMARC record (DKIM never blocks; a DNS timeout never blocks); cached an hour; free-mail domains skipped. Tests: tests/sender-gate.test.mjs (6 checks). Note: a custom domain without DMARC will now be blocked from campaigns.

Pass 328 (close-out of the partly closed gaps): bulk email is refused when the postal address is empty, too short or has no number (postalAddressProblem, HTTP 422), and held when the opt-out link cannot be built on the server (HTTP 503). Tests: tests/postal-address.test.mjs (5 checks), in the chain. Chain: 282 commands, 246 pass, 36 blocked, 0 fail.

Pass 329 (closes the last partly closed gap, AutoLeads 7, per-lead AI and data cost meter): every lead-linked AI call (11 call sites) carries the lead's email, which is stored only as a hash. Each call adds its cost to that lead's meter (ai_lead_usage) and stops at AI_LEAD_BUDGET_USD (default 0.50 per lead, HTTP 429 with a plain message). Cached answers are free and skip the check. The KPI screen shows AI cost per lead beside cost per lead (GET /api/kpis, aiCost). Data cost: each enriched record stores how many paid lookups it used (vendorCalls: Apollo, then People Data Labs; at most two, each record looked up once). Hunter domain searches are per company and are not metered per lead. Checks: tests/ai-lead-budget.test.mjs (9 checks), in the test chain. Deploy note: the ai_lead_usage collection is written by the server only.

Pass 330 (admin and AI keys, follow-up queue, DeepSeek default): the follow-up queue opens by itself at most once per browser session (sessionStorage), not on every visit. DeepSeek is the default AI provider unless AI_PROVIDER names another one. AI_OPERATOR_UIDS can be saved in the app (operator settings) as well as in the environment; the saved list is read from the in-memory cache, which warms on the server's usual settings read. Not run here: the sandbox lacks the firebase package, so the runtime check is blocked (syntax checked only).

Pass 331 (recruitment sourcing and events mode): a role brief (title, must-have and nice-to-have skills, location, excluded companies, minimum score) screens the owner's own candidate list. Rows need a name, a way to contact, and no opt-out; they are scored by whole-word skill matches, de-duplicated, and queued through the same source and lawful-basis gate as any list (find-leads action source-candidates). Candidates land in the Lead Inbox with recruiter stage names. A third work mode, Events and bookings, uses the same pipeline with event stage names. Not built: searching the open web for candidates; no candidate-search source is wired in. Tests: tests/recruit-sourcing.test.mjs (7 checks, pass). Not run end to end: the sandbox lacks the Firebase packages.

## Pass 332
- Recruitment sourcing: each sourced candidate now carries a privacy-notice date (one calendar month from sourcing, end-of-month clamped), per ICO guidance on finding candidates ("as soon as possible, and by no later than one month"). The date is shown on the lead's category line; a candidate contacted earlier still needs notice at first contact (not tracked automatically).
- Tests: recruit-sourcing (9 checks) pass.
- Not built here: the brief-entry form in the sourcing panel (the source-candidates API exists; no form yet).

## Pass 333
- Hiring: a sourcing form in the Find leads panel. Enter the role brief (role, location, must-have and nice-to-have skills, companies to leave out, minimum fit score), the list source and the lawful basis, choose a candidate CSV, and the server screens it and adds the people who pass to the inbox. It uses the existing source-candidates action, so the same checks apply (name, contact, opt-outs, excluded companies, minimum score, lawful basis).
- Not run in a browser here: the form is a client component. Its JSX parses; the server path is covered by the recruit-sourcing tests (9 checks).

## Pass 334
- Privacy notice for sourced people (GDPR / UK GDPR Article 14). Each person found through a candidate list now gets a notice record with its due date (one month from sourcing). The notice text is added after the body of their first email, before the opt-out footer, from the automatic sender and from the manual send route. The record is marked given only after Gmail accepts the email. A failed check stops the send rather than sending without the notice.
- Overdue list in the hiring panel: records past their date with no notice given. "Erase" deletes the record and the inbox lead, and writes an all-mail stop for the address (an existing stronger stop is kept).
- Fixed: the hiring form has never worked on the server. The action guard rejected source-candidates as an unknown action since pass 331. It is now accepted.
- Fixed: the notice date was written into the lead's category text, which is clipped at 100 characters, so the date could be cut off. It now lives in the notice record only.
- Two stale tests updated to the current code: ui-guards (follow-up panel opens once per session, pass 330) and work-mode (events mode, pass 331). Both were failing in v333.
- Tests run here: privacy-notice (7 checks), recruit-sourcing (9), autosend, lead-inbox, release-files (manifest regenerated, 802 files), ui-guards, work-mode. All pass. Parse check passes for every changed file, including the JSX panel.
- Not covered by the notice: broadcast, quote, invoice, and follow-up senders. A sourced person first contacted through one of those gets no notice. People with only a phone number cannot receive the notice by email; they appear on the overdue list for the owner to tell directly.
- Not run here: the Firestore paths (privacy_notices, suppressions) and the browser panel. Thirty-five test files need packages this sandbox does not have (firebase, stripe, twilio, web-push), including the route and workspace tests that cover send-email.
- Outside code: the notice wording needs legal review before use.

## Pass 335
- Privacy notice now reaches every send path that can reach a sourced person: automatic follow-up (send-followup), customer mail (customer-mail), quotes (quotes/send), invoices (invoices/send) and broadcasts. Booking, signup, daily digests and system mail are not changed: they go only to people who asked for them, or to the owner.
- "Told by me": the owner can mark a person as told by hand. It sets the notice given (givenBy: owner) and removes them from the overdue list. This closes the phone-only gap, since those people cannot get the notice by email.
- Customer row -> "Full history": opens /history with the customer's email filled in and loaded. Invalid addresses give the plain page (lib/customer-history-link.js, tests/customer-history-link.test.mjs, 2 checks).
- Checked and found already built, no change: editing and deleting logged entries (deal-activity route, pass 309+); ticket category change by hand and per-category counts on the support panel (pass 304); a per-customer history that shows deal stage changes (pass 309); calls matched to a customer by phone as well as email (daily matching, later pass).
- Pipedrive field names: the vendor docs confirm title, person_id, value and currency for create, and value and currency for update (Pipedrive API v2 pages, fetched this pass). The code calls the v1 endpoint; the v2 page does not state v1 field names, so v1 is not confirmed.
- Left open, each needing an owner or legal decision, not code: duplicate merge (merging can lose data); per-topic consent preferences (deliberately not built: the blocking rule would change everywhere); per-market consent (legal); recruitment candidate profiles, CVs and fee terms (new data model); invoices held in two collections (moving them changes numbers, so it needs an owner decision); copying invoices from before a store change (Billing reads its invoices on the page); HubSpot custom open-stage names (needs a second, read-back sync direction that cannot be tested here without a HubSpot account).
- Not run here: browser paths, live Firestore, email. 35 test files need packages this sandbox lacks. Suite here: 251 pass, 0 fail.
- Outside code: legal review of the notice wording; deploy; a browser check of the new links and the overdue panel.

## Pass 336
- HubSpot custom stage names: the owner's own open-stage name for a deal is read on each sync and shown on the history page as "In your CRM: <name>". Closed (won or lost) and deleted deals drop it. Read-only: the name is never written back to HubSpot. Pure helper hubspotStageLabels (lib/crm.js), dealHistory crmStage, tests/crm-stage-names.test.mjs (7 checks). The HubSpot read itself is not run live.
- Pipedrive v1 field names: still unconfirmed. The vendor pages reachable from here document v2 only (title, person_id, value, currency, stage_id all writable on v2). The code calls v1; moving the integration to v2 would change live behaviour and cannot be tested here.
- Suite here: 252 pass, 0 fail. 35 test files need packages this sandbox lacks.

## Pass 337: decision items closed; no new code

- Invoices in two places: closed by the pass 317 decision (fresh start). The copy from the old per-customer path was removed then, and no code reads or writes users/{uid}/invoices now (checked by search). The pass 297 and pass 311 notes describe the state before that and are history. An import route was built in this pass and reverted, because it would undo the pass 317 decision. Assumption: no live account needs its older invoices copied. If one does, that is a one-off data task for the owner, not a feature.
- Duplicate merge: closed as detection only, by decision. The weekly email lists possible duplicates (lib/server/gap-tools.js, possibleDuplicateCustomers). Merges stay a manual choice, since an automatic merge can lose deals, invoices or messages. Assumption made without asking, as the owner asked.
- Per-topic consent: built in pass 318 (stop follow-ups, stop campaigns, plus the existing sales stop and stop-all). The pass 335 note "deliberately not built" is superseded. Assumption: two topics are enough; no per-template or per-campaign setting.
- Recruitment candidate profiles: not built. Assumption: the sourcing screen (pass 331) stays the recruitment tool and the sales pipeline keeps the label. No CV storage and no fee terms, since CVs are personal data and need a legal decision first.
- Tests: 249 pass, 0 fail, 37 cannot run in this sandbox (every one needs a package not installed here: firebase, stripe, next, googleapis, pptxgenjs, web-push, twilio, redis, node-ical). The earlier count of 252 pass / 35 sandbox is out of date.
- Still open, outside code: deploy; a browser check of the pass 333 to 336 screens; live Firestore, Gmail and HubSpot paths; legal review of the privacy notice wording; per-market consent (legal); Pipedrive v1 field names (vendor docs cover v2 only).

## Pass 338: remaining implementable gaps closed in code

Built in this pass:
- Orders screen (/orders, in the Sell menu). One line per accepted quote, with its status worked out from the invoices made for it: confirmed, invoiced or paid. Counts and the value not yet paid. The pure rule is orderRows in lib/orders.js. The invoice stays the record of money.
- Sales figures follow the chosen window. "Won" used a fixed 365 days, while the funnel already followed the 3, 6 or 12 month choice or the exact range. Now both do. The label shows the window. A call with no window is unchanged.
- WhatsApp consent records a purpose: "replies and updates" or "marketing". A record with no purpose says not_stated. The Integrations form asks for it. Sends are not yet gated by purpose, so the record is evidence only.
- Your own customer fields (lib/custom-fields.js; app/components/CustomFields.js). You define up to 10 fields (text, number, date, yes or no) once. Each customer's values are kept on their deal, since there is one deal per customer. A customer with no deal yet cannot hold values until a deal exists.
- Tests: tests/gap-close-338.test.mjs (17 checks). tests/gap-close-283.test.mjs updated for the new Sell menu item.

Stale "not built" notes, now shown closed by the code (no change needed):
- Atomic duplicate-run lock: built in pass 281 (claimJobRun).
- Website chat widget: built in pass 288.
- Per-campaign ROAS: built in pass 282.
- Owner's view of the automation run log: the audit page shows each owner's runs (/api/audit reads users/{uid}/runs). The global job_runs ledger stays admin-only, since it is not per owner.
- Structured BANT: the CRM already has a select for each of budget, decision maker, real need and timeline.
- Invoices in two places: closed by the pass 317 fresh-start decision.

Decided, not built (stated in code terms):
- A single approval centre: each approval sits beside the record it approves. A second list would duplicate them.
- Automatic upsell or win-back sending: customer-facing, so it stays with the owner (consent rules).
- Mirroring open pipeline stages into HubSpot or Pipedrive: needs each owner's stage mapping (pass 321).
- Duplicate merge: detection only (weekly email).
- Recruitment candidate profiles and CVs: personal data, needs a legal decision first.

Still outside code (cannot be closed here):
- Missed-call text-back: needs a Twilio missed-call webhook set up by the owner.
- Traffic, click-through and bounce rate: needs analytics or Search Console access on the account.
- Per-market consent (9.4): a legal question.
- Integrations beyond the existing ones: need platform keys and documentation.
- Not built, and not on the gap list: custom fields in filters, CSV export or import. Add them when a customer asks.

## Pass 339: the open items from pass 338 closed in code

Built in this pass:
- WhatsApp sends are gated by the consent purpose. A quote or an invoice needs "replies and updates" or "marketing"; a follow-up needs "marketing". A customer with no purpose recorded (not_stated) is blocked until it is recorded again on Integrations. The gate is canSendWhatsApp in lib/server/whatsapp.js, called from app/api/whatsapp/send/route.js with the message kind.
- EU and UK addresses (opt-in markets, list in lib/consent-rules.js as OPT_IN_TLDS): marketing is not allowed unless the contact has consented. Replies and invoices still go. This is a conservative default and a product decision, not legal advice. The basis stays legitimate interests for B2B.
- Clearing a custom field now sticks. updateDealExtras replaces customFields instead of merging, so a cleared value is removed (lib/deal-client.js).
- A customer with no deal yet can hold custom values. They are kept in users/{uid}/customer_fields/{id} and shown on the Customers page.
- Candidate profiles for recruitment mode (/candidates, in the More menu): name, contact, role, stage, notes (no CVs, no bank details), and whether the candidate agreed to be approached. Each profile gets a 12-month retention date. Past it, the profile is flagged for the owner to decide. Nothing is deleted automatically. No fee terms, since the fee is the deal value (lib/candidates.js, app/candidates/page.js).
- Tests: tests/gap-close-338.test.mjs has 43 checks, and it passes. tests/integrations.test.mjs has the purpose and kind fixtures and the new purpose assertions. It cannot run in the sandbox (stripe is missing). The same gate logic was re-run from a scratch copy of whatsapp.js and passes.

Decided in this pass (changes the pass 338 list):
- Recruitment profiles: built, without CVs and without fee terms.
- Per-market consent: EU and UK are opt-in by default. Other markets are unchanged.
- Duplicate merge: unchanged, detection plus a manual merge.

Still outside code: missed-call text-back (needs the owner to set up the Twilio missed-call webhook), traffic and click-through figures (needs analytics or Search Console access), and the legal wording of the per-market consent (a legal sign-off).

Checks for this pass: the full npm test chain run per file (288 commands): 251 pass, 0 fail, 37 blocked by missing packages (sandbox). The manifest has 808 files.

## Pass 340: the remaining code gaps closed (the gap table)

Built in this pass:
- Sri Lanka marketing consent: `.lk` addresses join the opt-in default, the same as EU and UK. Marketing to them needs recorded consent (PDPA 2022 s.27(1)). Replies and invoices still go. Our conservative default, not legal advice.
- Data requests (/data-requests, in the More menu): log a request to see, correct, erase or withdraw consent. Each gets a 21-working-day answer date (PDPA s.17(1)), counted Monday to Friday. Public holidays are not excluded, so the date is never later than the legal one. Overdue and due-soon requests are flagged. The owner answers the person; the app only tracks the time. Rules in lib/data-requests.js.
- Customers CSV (Customers page, "Download customers (CSV)"): name, email, company, stage, value, currency, and one column per custom field. Yes or no fields write Yes or No. Customers with saved values but no deal are included, once each. Formula-like text is neutralised. lib/customers-csv.js.
- Spam complaints (Account page): type delivered and complaint counts from Google Postmaster Tools. The rate is judged against 0.3% (limit) and 0.1% (aim); under 100 delivered is too few to judge. Nothing is sent. lib/sender-auth.js, complaintRateStatus.

Checked, already built (no change, the table was out of date):
- Recruitment brief form: FindLeads, pass 333.

Not closed here (blocked, not code):
- Accounting sync with QuickBooks and Xero: needs an app key from each provider and a connected account. Export stays manual (accounting-export.js).
- Pipedrive field names on v1: the deal writes use v2 (crm.js); a live check is needed before changing anything else.
- Bad-review alert: the app has no review data. It needs a review platform connection or a manual review log, which is a separate decision.
- Twilio missed-call text-back, traffic and click-through figures, platform approvals, further integrations: owner or platform setup (unchanged from pass 339).
- Legal: per-market consent beyond UK, EU and LK; the privacy notice wording; breach notification rules (PDPA s.23, not yet issued); processor contracts with email and WhatsApp providers (PDPA s.21).

Checks for this pass: tests/gap-close-340.test.mjs (31 checks, passing). Sweep: full test chain 289 commands, 252 pass, 0 fail, 37 blocked by missing packages (sandbox). tests/gap-close-338.test.mjs updated: its .lk assertions and route pins now match this pass. The full test chain (289 commands) is recorded in the sweep line of this pass.

## Pass 341: the last code gaps closed (the gap table)

| Item | Status | Where | Note |
|---|---|---|---|
| Bad-review alert | Built | lib/reviews.js, app/reviews | Owner logs reviews by hand; 2 stars or fewer alerts until answered. No third-party review feed. |
| Custom-field filters | Built | app/components/CustomFieldFilters.js | Uses lib/custom-fields.js. |
| Pipedrive v2 | Built | lib/server/crm.js | Every call on v2. Live check needs an account. |
| Xero and QuickBooks sync | Built, not live | lib/accounting-sync.js | Push once, poll payments. Needs client keys. |
| Website traffic (GA4) | Built, not live | lib/traffic.js | 28 days; needs GA4 property and analytics.readonly. |
| Balancr event receiver | Built | app/api/balancr/events | Signed, timestamped, one-time per event ID. |
| Missed-call text-back | Built | lib/server/missed-call-reply.js | Once per caller per 24 hours; stops when automations are paused (pass 342). |
| Legal items | Outside code | - | Per-market consent beyond UK/EU/LK, privacy wording, PDPA s.23, processor contracts. |

## Pass 343: breach register (PDPA s.23 log, the last implementable item from pass 341)

Built in this pass:
- Breach register (More menu, /breaches): the owner logs each personal data breach, what it affected, containment, and the dates the Authority and the people were told. Owner-only, under users/{uid}/breach_register.
- Prompts, not rules: "Decide: tell the Authority?" when personal data may be affected and no Authority date is recorded; "Review" when still open after 72 hours. No notice deadline is computed.

Not closed here (legal or external, outside code):
- PDPA s.23 notice rules and any time limit: not set in code; the owner decides with an adviser.
- Per-market consent beyond UK, EU and LK; privacy notice wording; processor contracts with email and WhatsApp providers (PDPA s.21).
- QuickBooks and Xero live sync, GA4 traffic live, Pipedrive v1 check, Twilio text-back webhook: need keys, accounts or owner setup.

Tests: tests/gap-close-343.test.mjs (16 checks, chained). tests/gap-close-338.test.mjs route pins updated for /breaches. Per-file runs: 283, 289, 293, 295, 338, 340, 341, 343 pass.

## Pass 344: CVs on candidate profiles (last recruitment gap), erasure and export reach candidates

Built in this pass:
- CV as pasted text on a candidate profile (/candidates, CV button). Capped at 20,000 characters; removable at any time; flagged past the 12-month retention date.
- Erasure and access requests now scan the candidates subcollection by the email on the profile (lib/erase-contact.js), so the CV goes with it. Before this, candidates were missed by both tools.
- A candidate is approached only with recorded agreement and its time (canApproach).

Not closed here (decided or outside code):
- CV files (PDF, Word) are not uploaded: pasted text only, so no file storage is added.
- Fee terms: not held; the placement fee is the deal value (pass 331).
- A profile with no email is outside the email-keyed erase and export tools; the owner deletes it by hand.
- Lawful basis for holding CVs and the notice to the candidate: legal, outside code.

Tests: tests/gap-close-344.test.mjs (11 checks, chained). Per-file runs: erase-contact, gap-close-338 (route pins), 343, 344 and release-files pass.

## Pass 345: deadlines checked against the sources; candidates with no email

Checked against the sources (web research, this pass):
- Access requests: the Personal Data Protection (Amendment) Act No. 22 of 2025 (certified 30 Oct 2025) changes s.17 to one month, extendable to three. Commencement not confirmed, so the app uses the earlier of 21 working days and one month.
- Breach notice: s.23 sets no period; the DPA draft Data Breach Notification Rules v1.0 set 72 hours to the Authority (rule 5(1)) and notice to people at the same time (rule 9). Draft: the register uses 72 hours and says so.
- Direct marketing: s.27(1) requires consent, not opt-out. The app's opt-in list for Sri Lanka matches.
- Processors: s.21(1) requires processors to be bound by a contract. Contracts themselves are outside code.
- Section 2 and Part III of the Act take effect 1 Jan 2027 (FT, Gazette 2498/16).

Built in this pass:
- Data requests: earlier of 21 working days and one calendar month.
- Breach register: 72-hour Authority deadline from discovery time, two overdue/due states, a people-told action.
- Candidates: a CV needs an email on the profile; no-email profiles are flagged; the erase form takes an optional name, and matching no-email profiles are listed for review (not deleted).

Not closed (outside code):
- Commencement of the 2025 amendment and the final breach rules: Gazette / DPA.
- Processor contracts (s.21): documents, not code.
- Still a legal decision: lawful basis for holding CVs, candidate notice.

Tests: tests/gap-close-345.test.mjs (20 checks, chained). Tests 340, 343, 344 updated. Per-file runs pass: 338, 340, 343, 344, 345, erase-contact, release-files.

## Pass 346: Autosend pauses on spam complaints (from the research report)

Checked against the codebase before building: sequences, reporting, API keys, webhooks, one-click unsubscribe (POST), SPF/DKIM/DMARC checks, and the 0.3% and 0.1% complaint rates already exist. The one real gap was that the complaint rate was calculated on Account but never used to stop sending.

Built:
- Save the owner's Postmaster counts (delivered, spam complaints) on Account. They are stored with the autopilot settings.
- Before each automated run, at or over 0.3% (with at least 100 delivered) Autosend pauses with a plain reason. Under the limit it runs as before.
- Pure rule: complaintVerdict in lib/autosend.js. Wiring: lib/server/autosend.js, lib/draft-queue.js (sanitizer), app/account/page.js.
- Manual sends too (app/api/send-email/route.js): at or over the limit the send route returns 409 with code complaints_over and the reason, so the dashboard shows it and nothing is sent. Clearing it means saving lower counts on Account.

Not closed (decided or outside code):
- The counts are typed in by hand from Google Postmaster Tools; the app does not read them. Google's API for Postmaster data is not used.
- Once paused, Autosend stays paused until the owner switches it back on, even after lower counts are saved.

Tests: tests/gap-close-346.test.mjs (8 checks, chained after 345). Related runs pass: autosend (13), sender-auth, gap-close-344 and 345, release-files.

## Pass 347 - CRM sync log (match, create, skip and error record)

Gap: a deal with no usable email was skipped without a trace, matches and failures were only in the server console, and the owner could not see what the last CRM run did.

Built:
- Each CRM action on a deal is recorded with a reason: created (new or matched existing contact by email), sent (status or amount), pulled (the CRM changed the status), skipped (no usable email) and failed (the error message, for example a rejected key).
- The log is kept on users/{uid}/settings/crm: the last 50 entries from the latest run that did something, plus the last check time. A quiet day does not wipe the log.
- Owner route: app/api/crm-sync/route.js (read only, signed in). Panel: app/components/CrmSyncLog.js, shown on Integrations under the signal feeds card. It shows which CRMs are connected, the totals and each entry with its reason.
- Pure helpers in lib/crm.js: syncLogEntry, capSyncLog, syncLogSummary. Wiring: lib/server/crm.js (helpers now return { id, created } so a match is told apart from a new contact).

Not closed (decided or outside code):
- The log covers the latest run that did something. Earlier runs are not kept beyond those 50 entries.
- The run itself was not exercised against a live HubSpot or Pipedrive account, and Firestore was not run here (the sandbox lacks the firebase package).

Tests: tests/gap-close-347.test.mjs (16 checks, chained after 346). Updated the wording checks in gap-close-319 and gap-close-320 for the new return shape (same behaviour).


## Pass 348: software referral (partner) programme

| Item | Status | Reason or detail |
|---|---|---|
| Commission on referred subscriptions | Built | 20% of each paid invoice for 12 months from the first payment; env-tunable; ledger entries with fixed ids. |
| Clawback on refund or dispute | Built | Proportional to the cumulative refund; disputes resolved from the charge to its invoice. |
| Payouts recorded by the owner | Built | Refused above what is owed; minimum for eligibility. |
| Operator API | Built | /api/admin/partners, admin-only, audited. |
| Operator screen | Not built | The API exists; a screen is a UI pass. |
| Partner statement and sign-in | Not built | Needs partner accounts and a separate login. |
| Sign-up ?ref= capture | Not built on the page | /api/partners/referral exists; the page must send the code. |
| Payment to partners through Stripe Connect | Not built | Money moves by the owner for now; Connect needs its own set-up. |
| Tax on partner payments | Open | Sri Lankan withholding on service payments may apply; to confirm with an accountant. |


## Pass 349: partner screen, statement link, sign-up capture, yearly prices

| Item | Status | Reason or detail |
|---|---|---|
| Operator partner screen | Built | /admin/partners, audited API behind it. |
| Partner statement | Built | Signed link, no sign-in; dates, kinds and amounts only. |
| Sign-up referral capture | Built | Keeps the code on the device until the server accepts it. |
| Annual prices | Built | Needs STRIPE_PRICE_*_YEARLY set in Stripe. |
| Postmaster connector | Not built | Needs a Google OAuth client and verified domains, and gives no data below 50 users a day. Cannot be tested here. |
| Usage or overage billing | Not built | Needs a pricing decision and metered Stripe prices. |
| Automatic partner payouts (Stripe Connect) | Not built | Needs Connect set up in Stripe; payouts are recorded by hand. |
| Tax on partner payments | Open | Possible withholding on service payments; to confirm with an accountant. |
