# Business gap status (after Pass 204)

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
- **Feeding the time log into the profit view.** Not built: the profit view still reads one hours figure per customer.
- **Per-campaign approval for autosend.** Built per account, not per campaign: the owner approves once, before the first send (Pass 146). A campaign-level approval is not built.
- **Enrichment beyond deals.** Apollo enriches deals (Pass 146); leads in the inbox and contacts are not enriched yet.
- **TikTok lead generation.** Not built: same pattern as Google and Meta lead forms; it needs its own keys.
- **Other form builders (JotForm, Google Forms) as native connectors.** Not built: the same pattern applies; Zapier or Make, or the lead-inbox ingest, covers them today.
- **Google Ads lead-form extension, native.** Not built: the same pattern as Meta Lead Ads can be added; it needs its own webhook and keys.
- **Native sync with Google Sheets, Shopify orders, HubSpot or Pipedrive.** Not built natively. The outgoing webhooks (Zapier, Make) cover pushing deal and booking events to these tools; reading orders or deals back in is not built.
- **Several Meta Pages or owners on one deployment.** Not built: Meta Lead Ads serves one Page and one owner per deployment.
- **A per-change trigger.** Not built: an alert is raised when the pipeline check runs, not the moment a stage changes. On Vercel Pro that check runs hourly (one command, `npm run schedule:hourly`); on Hobby it runs daily.

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
| 3 | Product and service marketing | Partly built | Storefront products and service bookings. Product bundles are not built. |
| 4 | Brand management | Not built | Brand identity and guidelines are design work outside the app. |
| 5 | Pricing and promotions | Partly built | Discount codes, price floors, currency choice. Quantity price breaks and tiers are not built. |
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
| 16 | Sales strategy and planning | Partly built | Weighted forecast and pipeline. Quotas are not built. |
| 17 | Lead management | Built | Capture, scoring with negatives, routing, nurture, follow-ups. |
| 18 | CRM and pipeline | Built | Deals, stages, lost reasons, pipeline alerts. |
| 19 | Inbound sales | Built | Enquiries, bookings, quotes. |
| 20 | Outbound sales | Partly built | Email and AI phone calls. Manual cold calling is not a feature. |
| 21 | Sales execution and closing | Built | Demos through bookings, quotes with milestones, typed-name acceptance. Negotiation stays manual. |
| 22 | Bidding and tenders | Not built | Tender notices are watched through buying signals. Writing bids is not built. |
| 23 | Channel and distribution | Partly built | Partners and buy links. Distributor and reseller management is not built. |
| 24 | Retail and transactional | Partly built | Storefront, bookings, subscriptions. Point-of-sale hardware does not apply. |
| 25 | E-commerce and marketplaces | Partly built | Storefront, abandoned basket, back-in-stock. Third-party marketplace listings are not built. |
| 26 | Business development | Not built | Partnership sourcing is judgement work the app does not automate. |
| 27 | Account management | Built | Customers, renewals, relationship records. |
| 28 | Retention and expansion | Partly built | Renewals, win-back, reactivation, referrals. Loyalty programmes are not built. |
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

