# Balancr — launch checklist (landing page → trial → customer)

Run `node scripts/check-launch-readiness.mjs` first. It checks env vars (all six Firebase web-config
values — the app shows an error on every page without them — and an `ADMIN_PASSCODE` of 12+ characters),
leftover placeholders, a stray service-account key and the Firestore rule below. It cannot
see Firebase / Resend consoles, so those are listed here. After launch, `MAINTENANCE.md` is the ongoing watch-list.

## The customer pipeline, step by step

1. **Visitor** lands on `/`, picks a plan, submits **/request-trial** (Gmail address required by default,
   honeypot, 5 requests/IP/hour and 15/IP/day). They are then emailed a **confirmation link** and the request
   reaches your queue only after they click it — see "Trial form abuse defences" below. The in-app **Talk to us** note is the other public
endpoint and is throttled the same way (honeypot + 10 notes/IP/hour), since each one also emails you.
   A confirmed resubmission from the same email while an earlier request is still open (pending/contacted) updates
   that same card instead of adding a new one — a double-click, a retry, or a genuine few-days-later
   follow-up all land as one lead, not several for you to reconcile by hand. It also bumps the card back
   to the top of the queue and marks the notification email "Follow-up", since resubmitting is itself a
   "look at this soon" signal.
2. **You are notified** by email (needs `RESEND_API_KEY`, `TRIAL_NOTIFICATION_FROM_EMAIL`,
   `ADMIN_NOTIFICATION_EMAIL`), the visitor gets an automatic "we've got it" reply, and you also get a
   short **morning digest** if anything is waiting (runs daily by itself; `CRON_SECRET` only locks the URL, below). If email is unset nothing
   emails you — the request still appears in **/admin/new-business → Today** and **Trial requests**.
3. **You activate in one click** — from **Today** (the waiting leads are listed there with their own
   Activate button), from **Trial requests** (also **Activate all** when several are waiting), or straight
   from the link in the new-lead email, which opens that lead with Confirm already showing: Trial requests → **Activate → Confirm**. One server call
   (`/api/admin/provision`, Admin SDK, admin passcode) creates the login and business, starts the trial on
   the plan they asked about, marks the request done and **emails the owner a welcome message with a
   link to choose their password** — a link that stays valid for **7 days**, not Firebase's one hour. Use **Edit first** when you want to change the plan, trial length or
   name before creating it. If automatic email isn't switched on, Firebase's plain password-reset email is
   sent instead, so the customer always gets a way in.
   **Want no human step at all?** Set `AUTO_ACTIVATE_TRIALS=true` (off by default; see "Instant activation"
   below) and a request that passes the safety checks is activated the moment it is submitted.
4. **Owner signs in**, sees the first-run checklist, invites their team from Team access. If they haven't
   after 2 and 6 days, the daily job emails them a fresh link by itself; **Today** and **Manage accounts**
   list anyone who still hasn't (**Never signed in**) with a **Send sign-in link** button, and the
   **Customer funnel** on Today shows where people drop off.
5. **Trial ends / renewal due**: the owner is emailed 3 days before a trial ends, again on the last day or two, and
   once more when it has ended; 7 days before a renewal is due and again on the last day or two; and if it goes
   overdue, on the first day late and again a week later (then it is left to you). Your morning digest lists an ending
   trial from 7 days out; the owner sees a
   banner; you see alerts in **Today** and **Manage accounts**. When you **record a payment** they get a
   receipt by email (untick the box to skip it); **Extend 7 days** and **Reactivate** email them too. **Expired trials lock themselves**: 2 days after the trial date
   (UTC) the business gets a "Your free trial has ended" screen with your contact details,
   and the AI/API routes refuse it too. Nothing is written when this happens, so
   **Extend 7 days** or **Convert to paid** (or **Mark paid** on the billing row) unlocks
   them instantly. Data is never touched. Renewal dates only flag by default. For an
   account you want enforced, tick **Edit billing → "Lock automatically if renewal is more
   than 7 days overdue"**: it then locks itself 7 days after the date, and **Mark paid**
   (which moves the date a cycle forward) unlocks it instantly. Otherwise press Suspend
   yourself for non-payment.
6. **Suspended** owners/staff see a suspended screen with your WhatsApp/email; data is kept.

## Automation (do these once; all of it is optional and safe to leave off)

Everything below is switched on by environment variables — see `.env.local.example`. The **Today** tab of
`/admin/new-business` shows which parts are on and when the daily job last ran.

- [ ] **Customer emails**: set `RESEND_API_KEY` + `TRIAL_NOTIFICATION_FROM_EMAIL` (a verified sending address
      on your own domain — Resend's sandbox address only delivers to you). This turns on the welcome email,
      receipts, extension / reactivation notices and the reminders.
- [ ] **Your inbox** (optional): `ADMIN_NOTIFICATION_EMAIL` for new leads, feedback and the morning digest. Blank = they go to `NEXT_PUBLIC_SUPPORT_EMAIL` if you set that.
- [ ] **Daily reminders + digest**: runs on Vercel with nothing set (open mode: once a day, no data in the reply). Recommended: set `CRON_SECRET` to a long random string (`openssl rand -hex 24`) to lock the URL down.
      `vercel.json` already schedules `/api/cron/daily` for 03:00 UTC (08:30 Sri Lanka) on Vercel. On another
      host, have any free scheduler call `GET https://YOUR-SITE/api/cron/daily` daily with the header
      `Authorization: Bearer <CRON_SECRET>`.
- [ ] **Rules smoke test** (5 minutes, needs Java): `npm i --no-save @firebase/rules-unit-testing`, then
      `npx firebase-tools emulators:exec --only firestore --project demo-balancr "node scripts/rules-smoke.mjs"`.
      Checks who can read what (owner, manager, accountant, staff, strangers) and that server-only documents are closed.
- [ ] **Check it end to end** (2 minutes): open **Today → Preview today's emails** (sends nothing), then activate a
      throwaway test lead with your own email and confirm the welcome email arrives with a working
      "choose your password" link. It stays valid for 7 days. Only if the server could not make its own
      link does the email fall back to Firebase's link (about an hour), and then it tells the customer to
      use "Forgot password" if it has expired.
- [ ] **Instant activation (optional, your call)**: `AUTO_ACTIVATE_TRIALS=true` skips the Activate button.
      It never fires for a throwaway-mail domain, an address that already has a login, a lead you have
      already replied to, or once `AUTO_ACTIVATE_MAX_PER_DAY` (default 10) accounts were made that UTC day;
      those wait in the queue as usual. You are emailed "Auto-activated — <business>" for each one. The
      trade-off is real: a trial account can use the AI assistant, so anyone can now get one with a working
      email address. Leave it off until you are comfortable with that. **Today → Automation** shows whether it is on.
- [ ] **Sign-in links** need nothing extra (signed with a key derived from `FIREBASE_PRIVATE_KEY`); set
      `LINK_SIGNING_SECRET` only if you want to be able to cancel every link ever sent.
- [ ] The automation only ever *tells* people things (and, only if you switch it on, creates a trial account). It never locks, charges, suspends or deletes an account
      — locking is still computed from dates (`lib/accountAccess.ts`) and money still moves only when you
      record it.

## Firebase console (do these once)

- [ ] **Revoke the old service account key** (project `business-59424`) and create a new one; put it in env vars, not in a file.
- [ ] **Authentication → Settings → Authorized domains**: add your production domain (the exact host in
      `NEXT_PUBLIC_SITE_URL`, e.g. `app.yourdomain.com`). Without it Firebase refuses to build the "set your
      password" link's return address. The app now retries without it so the link still works, but add the
      domain anyway so the owner lands back on `/login` afterwards (a log line `[resetLink] link with continue
      URL failed` means it is still missing).
- [ ] **Authentication → Templates → Password reset**: set the sender name, subject and message.
      This is the first email every customer ever gets from you; the default says "Reset your
      password for project business-59424".
- [ ] **Deploy order for the rules change** (self-serve business creation is now closed):
  1. Deploy the app (adds `/api/admin/provision`).
  2. Provision one real test customer from the admin panel; confirm the email arrives, the owner
     can set a password and sign in, and the app loads their empty business.
  3. Only then: `firebase deploy --only firestore:rules`.
  4. Verify: sign up a throwaway account through the browser console/Firebase API and confirm
     the app shows "This login isn't linked to a business yet" (not a working business).
  - To roll back, restore the `businessId == uid` branch in the `memberships` create rule.
  - Side effect: the one-off legacy pages (`/migrate-owner-once`, `/legacy-*-once`) can no longer
    create owner pointers. Delete them if you no longer need them.
- [ ] Storage rules deployed (`firebase deploy --only storage`) — needed for logo upload.
- [ ] **Firestore indexes deployed** (`firebase deploy --only firestore:indexes`) — covers the
      composite indexes in `firestore.indexes.json`, including the one `/api/trial-requests` needs to
      recognize a follow-up submission. Without it that one lookup fails (caught, so the trial request
      itself still goes through — see the route's comments — but every submission gets treated as brand
      new instead of matched to an open one) until you either deploy it or click the link Firestore logs
      the first time the query runs.

## Content you must own

- [ ] **/legal**: rewritten today as a seller-side draft (Syndicate Software Solutions as provider,
      customer as user) that names Google Firebase, DeepSeek (AI) and Resend. **It is not legal
      advice and was not reviewed by a lawyer.** Have it reviewed for your jurisdiction (governing
      law, data-protection duties, breach notification, liability limits were deliberately left out).
- [ ] Set `NEXT_PUBLIC_SUPPORT_EMAIL` (and WhatsApp if you use it) — /legal, the suspended screen and the landing-page footer use it.
- [ ] Set `NEXT_PUBLIC_SUPPORT_RESPONSE_TIME` to a promise you can keep (e.g. "We reply within one working day"). It shows above the support links.
- [ ] Deploy the rules: `firebase deploy --only firestore:rules` (opening balances are refused until you do).
- [ ] **v50 — supplier returns (deploy the rules FIRST, or WITH this version):** `firebase deploy --only firestore:rules` adds the
      `supplierReturns` collection. Until it is done, every owner, manager and accountant login fails to load data, because the app now
      subscribes to it. No new indexes (the one server query is a single-field equality). Units of measure and variants need no rules
      change. After deploying, do the three-minute smoke test in CHANGELOG v50 ("Not tested"): buy stock, send some back as a refund and
      against an unpaid credit bill, add a size grid, buy by the carton, then open Statements and confirm the Balance Sheet still says balanced.
- [ ] **v54/v55 — lost sales and supplier credit (deploy the rules FIRST, or WITH this version):** `firebase deploy --only firestore:rules`
      adds the `stockOuts` and `supplierCredits` collections. Until it is done, every owner, manager and accountant login fails to load data,
      because the app now subscribes to both. No new indexes (both lists are ordered by one field). Nothing else needs deploying separately:
      pack selling, the delivery line and the new settings are all in the app. Older backups restore fine (the two new collections are simply
      absent from them), and backups taken from this version include them. After deploying, do the smoke test in CHANGELOG v54 ("Still not tested").
- [ ] **Investments page:** the same rules deploy adds `securities` and `investmentTxns`. Until it is done, every manager and accountant login (and the owner) fails to load data, because the app now subscribes to those two collections. Deploy the rules BEFORE or WITH this version. No new indexes.
- [ ] **Money lent out page (deploy the rules FIRST):** `firebase deploy --only firestore:rules` adds `lentLoans` and
      `lentLoanTxns`. Do this BEFORE (or at the same moment as) deploying the app. If the app is live first, the Money
      lent out page shows nothing and saving a loan is refused with a permissions message, but everything else keeps
      working (those two reads are failure-tolerant). Nothing is lost either way.
- [ ] **v60 — Collections (deploy the rules FIRST, or WITH this version):** `firebase deploy --only firestore:rules` adds the
      `collectionNotes` collection and tightens who can set a customer's collector. Until it is done the Collections diary shows empty
      and logging a contact is refused with a permissions message; everything else keeps working (the diary read is failure-tolerant).
      No new indexes (one field ordering). Older backups restore fine; new backups include the diary.
- [ ] Create a demo business: /admin/new-business → Create account → Demo business. Sign in as it for sales demos.
- [ ] **Public demo ("Try it now")** — see "Free-account guardrails" below. Set `DEMO_EMAIL` to that demo business's email
      and deploy BOTH `firebase deploy --only firestore:rules` and `firebase deploy --only storage`.
- [ ] Resend: verify your sending domain so the notification emails don't land in spam. **`TRIAL_NOTIFICATION_FROM_EMAIL`
      must be an address on that verified domain** — Resend's `onboarding@resend.dev` sandbox only delivers to the
      owner of the Resend account, so every customer email (welcome, set-password link, receipts) fails with it.
      When a send fails, the admin panel now says why (sandbox, unverified domain, bad key, malformed Reply-To).
- [ ] **Email abuse caps** (defaults are fine, sized for Resend's free 100/day): `PUBLIC_EMAIL_CONFIRM_MAX_PER_DAY`
      (default 60) and `PUBLIC_EMAIL_FEEDBACK_MAX_PER_DAY` (default 30) are hard daily ceilings on emails a stranger
      can trigger. Past them nothing more goes out until the next UTC day; admin, receipt and reminder emails are never
      counted. Check it: `npx tsx scripts/verify-email-abuse.ts`.
- [ ] Pricing on the landing page (Rs figures, "2 months free" on annual) matches what you will actually invoice.
      Prices live in one file, `lib/pricing.ts` — the pricing cards, the trial form and the admin's
      billing forms all read it, so change it there and nowhere else.
- [ ] Set `NEXT_PUBLIC_PAYMENT_INSTRUCTIONS` (bank details / how to pay) — it rides on every reminder and
      shows on the owner's plan card.
- [ ] `firebase deploy --only firestore:rules` — **also required for this build:** a Staff-created customer may no
      longer carry `creditLimit` or `cac` (so Staff can't add a same-named duplicate with a generous limit).
      This one could not be tested against the Firebase emulator here; after deploying, confirm as a Staff
      login that "+ Add customer" (name and phone only) still saves, and that a sale to a brand-new customer
      still auto-adds them to the list.
- [ ] `firebase deploy --only firestore:rules` — **REQUIRED for the Accountant login (view-only role).** Without it an
      invited accountant signs in but every page fails with a permission error. After deploying: invite a test
      email as "Accountant (view only)" from Team access, open the link, and confirm they can open Reports and the
      Accountant pack, can NOT see Team access / Settings / Employees, and every "+ Add" button is gone. Note:
      one login belongs to one business, so an accountant with several clients needs a different email for each
      (e.g. `name+clientA@gmail.com`).
- [ ] `firebase deploy --only firestore:rules` — new rule lets the OWNER read their payment history
      (`meta/billingHistory`). Without it the Payment history list on the plan card stays hidden.
- [ ] Manage accounts → your **own** business: Edit billing → tick **Complimentary**, otherwise it shows
      "Billing not set up" and sits in the needs-action queue forever.

## Smoke test before telling anyone

1. Open `/` on a phone; submit a trial request; confirm the row appears in the admin panel (and the email if configured).
2. Provision that request; receive the reset email; set a password; sign in.
3. Add a product, log a sale, print a statement; try the AI Assistant (entry should come back as a form to Save).
4. Settings → Operations → close last month; confirm a back-dated sale is refused; reopen.
5. Suspend the test account from the admin panel; confirm the suspended screen; reactivate.
6. Manage accounts → the test account → **Record first payment** (Growth, annual). Confirm: trial cleared,
   renewal one year out, Payment history shows the entry, Receipt copies a message, **Undo** puts the trial back.
7. Submit a trial request with a Growth/annual plan chosen; in the admin, Create account from it and confirm
   the plan and price are pre-set. Check the requester received the "We've got your request" email.

## Launch-day smoke test (10 minutes, real Firebase)

These are the paths the automated checks cannot exercise because they need a real sign-in. Do them once
on the deployed app with a throwaway business:

1. **AI "Confirm all" logs once.** Ask the Assistant for two entries, click **Confirm all**. Both cards turn
   to "confirmed", no error banner, and Selling shows each entry exactly once.
2. **Credit limit.** As Owner: set a limit on a customer, log a credit sale that exceeds it — the form
   warns, the sale still saves, and Customers shows "over limit". Edit the limit, clear it, save: the badge
   is gone after a refresh.
3. **Staff login.** Customers shows only name / contact / source / limit (no revenue, "Owe you", or
   LTV figures); the credit-sale form shows the "check with a manager" note instead of numbers; Add customer
   has no CAC or Credit limit fields.
4. **Backup.** Set a budget for one month (Statements → Budget), download the full backup zip, open
   `full-backup.json` and confirm a `budgets` entry with that month.
5. **Sales tax.** With sales tax switched on, ask the Assistant to log a sale and save it (either way): the
   sale carries the same tax as one entered by hand.

## Trial form abuse defences (what runs, in order, on every submission)

Built for people who file fake or abusive trial requests. The aim is to make an honest request cost one
extra click and a dishonest one cost far more, while never telling a troll which check caught them.

| # | Layer | What a visitor sees when it trips |
|---|-------|-----------------------------------|
| 1 | Honeypot field | normal "check your inbox" page |
| 2 | **Gmail-only** + Gmail's own address rules (6–30 chars, no `_`/`-`, no `..`) | a clear message: use a Gmail address |
| 3 | 5 per IP per hour, 15 per IP per day | "try again in a little while" |
| 4 | Identity blocked (**Dismiss & block** on a lead card) | normal page, nothing is sent |
| 5 | Soft suspicion score ≥ 6 (fake-looking name, links in name, script-like post, fill-in time under 1.5 s, many identities from one IP) | normal page, nothing is sent |
| 6 | Address already has a login / already had a trial | normal page; the inbox owner gets "you already have an account" |
| 7 | One confirmation email per identity per 10 min, 4 per day | normal page |
| 8 | **Confirmation link** (24 h, signed, single use) | email, then `/verify-trial` |

- Only after step 8 does the request enter **Trial requests**, notify you, or become eligible for
  `AUTO_ACTIVATE_TRIALS`. Unconfirmed and quietly-discarded submissions sit in a separate `trialIntake`
  collection that nothing else reads and the daily job empties after 7 days, so a flood of junk can't bury real leads.
- Gmail dots and `+tags` are collapsed to one identity, so `john.doe@`, `johndoe+x@` and `johndoe@gmail.com`
  are one person with one trial.
- A submission that scored 3–5 is **not** dropped: it goes through confirmation like anyone else, and its
  card shows a **Looks odd** badge with the reasons. No single signal can discard a request — only several together.
- **Dismiss & block** on a card stops that Gmail identity from requesting again (silently). **Reopen** lifts it.
- Needs `RESEND_API_KEY` + `TRIAL_NOTIFICATION_FROM_EMAIL` to send the confirmation. Without them requests are
  still saved, flagged **unconfirmed** in your notification email, and `node scripts/check-launch-readiness.mjs` warns about it.
- `TRIAL_EMAIL_DOMAINS` widens the Gmail-only rule (`gmail.com,outlook.com` or `*`).
- Empirical check: `npx tsx scripts/verify-trial-abuse.ts`.

## Free-account guardrails (public demo + trials)

Two free accounts, two different risks. The **public demo** is one business every stranger signs in to, so one
person's mess is the next person's demo. A **trial** is a private business, so the only shared risk is cost.

| | Public demo | Trial | Paying |
|---|---|---|---|
| AI turns per day (whole business) | 40 | 50 | 100 |
| AI turns per visitor IP per day | 8 | — | — |
| AI message length | 500 chars | 4,000 | 4,000 |
| Assistant can save notes / create products | no | yes | yes |
| Delete anything, edit settings, change the team, payroll | **no** (blocked in the database, not just hidden) | yes | yes |
| Logo storage | one fixed file per business (all kinds) | | |
| Put back to sample data | automatically (see below) | — | — |

- **No shared password.** The button gets a one-time sign-in token from `/api/demo/session`. Nothing secret is in the
  page; a visitor can't change the demo's password or email and lock out the next person. If the demo's Firebase login is
  deleted or disabled it is restored (same uid, so the data is still there).
- **Auto-reset.** The demo is wiped and re-seeded when someone opens it after it has been used and left idle for 35 min, once
  a day from the cron, and on demand: **Admin → New business → "Reset public demo now"**. It never resets while a visitor's
  30-minute session could still be open, and never more than once in 10 minutes.
- **It can never wipe a real customer.** A reset (and a token) is only allowed for a business that is flagged as the
  public demo AND on plan "Demo" AND complimentary. Otherwise it refuses and deletes nothing.
- **First run after deploying:** open Admin → New business → **Reset public demo now** once. That designates the demo, puts
  it in a known state, and rotates away the old shared password. If it says the account "isn't a Demo business", set that
  account's plan to "Demo" and mark it complimentary under Manage accounts → Edit billing (or make a fresh one).
- Trial AI cap: change per business with `Settings.aiDailyMessageLimit` (0 = unlimited), or edit `TRIAL_AI_DAILY_TURNS` in
  `lib/guardrails.ts` for every trial.
- Empirical check: `npx tsx scripts/verify-demo-guardrails.ts`.

## Before any build: check the text
- [ ] Run `node scripts/check-jsx-text.cjs` first. It lists any bare apostrophe or quote in rendered text, which fails `npm run build` (the lint rule `react/no-unescaped-entities`). Fix with `&apos;` or `&quot;` and re-run until it says OK.

## v101 to v102: what to deploy

- Publish `firestore.rules` (new `shipments` block).
- Run `node scripts/check-jsx-text.cjs`, then `npm run build`.
- On a test business as owner: record a shipment, move it through each stage, and check that delivery without a receiver is refused. Check that an expected day in the past shows as overdue, and that the Buy & sell menu has Shipments.
- As staff: confirm you can record a stage, but not delete a shipment.
- Download a backup and check that `shipments.csv` is in it.

## v97 to v98: what to deploy
- [ ] **Publish `firestore.rules`** (new blocks: `tasks`, and `bookings`). Owner and manager write tasks; the accountant reads them; any active member reads bookings; owner, manager and staff write bookings; only the owner or manager deletes. Without the new rules the Delegation and Bookings pages stay empty and show a permissions notice.
- [ ] **Run `node scripts/check-jsx-text.cjs`** before `npm run build` (the new pages have apostrophes in headings and hints).
- [ ] **Try each once on a test business.** Bookings: book 09:00 for 60 minutes with "Chair 1", then try 09:30 for 30 minutes with "Chair 1": it is refused; 10:00 is fine; mark the 09:00 one no-show and check the rate. Delegation: hand one task to a team member with yesterday's date (it shows Overdue, at the top) and one to a freelancer with no date; tick one off and reopen it. Time: log two hours for "Nimal Test (no login)" on the manual form and confirm it appears in the list, then log another day under the same name and confirm the hours add up.
- [ ] **Staff:** sign in as a staff member, open Bookings and book one; check they cannot see Delegation (it is not in their menu).
- [ ] **Backup:** download a backup and confirm `tasks.csv` and `bookings.csv` are in it when you have some.

## v94 to v95: what to deploy
- [ ] **Nothing to publish.** The auto-fill uses the v94 route. Try it once on a test business: New sale, pick USD: the rate box fills with today's rate and a line says to check it. Type 250 over it: the line becomes "Use today's reference rate". Edit an existing foreign-currency sale: its saved rate is not changed. Repeat for a purchase and a stock entry.

## v93 to v94: what to deploy
- [ ] **Nothing to publish in rules or indexes.** `GET /api/fx/rates` is a new route: it needs a signed-in token and writes nothing. It calls the free `open.er-api.com` endpoint (no key), cached for six hours and shared by all businesses. No environment variable is needed.
- [ ] **Credit the source:** the Money owed card shows "Rates by Exchange Rate API" with a link, as the free terms require. Keep it visible if you restyle the card.
- [ ] **Try it once on a test business:** Money owed with an EUR or USD invoice or bill unpaid: the card shows a "Reference rate today" box, with a sensible rate for LKR (roughly the market rate today), and the difference from the books. Then block the network or use a bad token: the card still shows the booked figures and says the rates are unavailable. Nothing in Sales, Purchases or the books changes.

## v92 to v93: what to deploy
- [ ] **Nothing to publish.** No new rules, indexes, collections or routes. `hiddenPages` is one more field on the settings document the owner already writes.
- [ ] **Try it once on a test business:** Settings > Menu > Just the basics > Save menu: the side menu shrinks; open a hidden page by its address or by Jump to (Ctrl or Cmd + K) and confirm it still works and shows in the menu while you are on it; choose Everything and save: all pages return. Sign in as Manager and Staff and confirm they see the same trimmed menu and cannot open Settings > Menu.

## v91.1 to v92: what to deploy
- [ ] **No new database rules, indexes or collections.** `offerContext` is one more field on the existing settings document (the owner already writes it).
- [ ] **Two new server routes**, both signed-in Owner/Manager only: `/api/ai/draft` (uses the same `DEEPSEEK_API_KEY` and daily allowance as the Assistant) and
      `/api/prospects/search` (calls the free OpenStreetMap services from the server). Optional: set `OSM_CONTACT_EMAIL` in the host's environment (see `.env.local.example`)
      so the map services can reach you, as their usage policy asks.
- [ ] **Try these once on a test business** (none of the network parts could be run where this was built; the logic around them is tested with fake responses):
      Settings > What we sell: save two sentences. Leads > a New lead > Message > Write with AI: a draft appears, ends with the easy way to say no, and one AI message is used;
      clear the description and press it again: it says what to do and uses nothing. Leads > Post ideas: three ideas appear.
      Leads > Find prospects: search plumbers in your own district: results appear with the map credit; add two; confirm they are New leads with source Cold outreach; search again and
      confirm those two are marked "Already a lead". Search "Sri Lanka": it is refused as too big. If a search says the map service is busy, wait a minute and retry (it is a free shared service).
      Profit page: a card on sales below cost appears once there are sales in the last 90 days. Routines page: the weekly scorecard is at the top.
- [ ] If Find prospects returns almost nothing for your area, that is the map's coverage, not a fault: OpenStreetMap lists only what someone has mapped. Use the CSV import for lists from elsewhere.

## v90 to v91: what to deploy
- [ ] (Added in v91.1) the same rules file also holds a third small block, `users/{biz}/feedback` (read by whoever reads the books, written by Owner/Manager, deleted by the Owner). Publish it with the other two; try the Feedback page once: log a 10, a 9 and a 4 for different customers, confirm the 4 shows under "Get back to these customers", tap Mark followed up and confirm it leaves, open an Ask message for a recent buyer, and check Accountant sees the page with no buttons.
- [ ] **Publish `firestore.rules` BEFORE or WITH v91** (`firebase deploy --only firestore:rules`). v91 adds two more small, additive blocks next to the
      v90 Playbook one: `users/{biz}/supportCases` (read by whoever reads the books, written by Owner/Manager, deleted by the Owner, never in the public
      demo) and `users/{biz}/leaveRecords` (Owner only, like employees). If the rules are late the rest of the app is unaffected, but those two
      listeners are refused: the Support page and the Leave card stay empty (and the app may show a permissions notice) until the rules are
      published. A rules deploy with a syntax error is refused by Firebase and the old rules stay live. No new indexes (single-field ordering only).
- [ ] **Try these once on a test business** (none has been run against real Firebase):
      Support: log an urgent case and one dated 10 days ago (both flagged), mark one resolved with a note, reopen it, log two for one customer (repeat line),
      sign in as Manager (writes) and Accountant (reads, no buttons), delete one as Owner.
      Leave and payslip: set 14 paid days on an employee, log 3 annual days and 2 no-pay days, check the balance (11 left), prepare a payslip for that month
      and tap the no-pay suggestion, enter 10 overtime hours, print it, record overtime and allowances once (a second attempt must not be offered).
      Commission: switch one salesperson to profit and compare the month with the sales basis.
      Channels: tag two Marketing expenses with channels (one recurring), give leads and customers the same sources, open Leads > Marketing by channel,
      then remove a tag and confirm it really disappears. Message: open one for a lead, a customer and a case (WhatsApp should open with the text).
- [ ] The stress test on Financial health, the Qualified stage and the extra source names need no deployment steps.

## v89 to v90: what to deploy
- [ ] **Publish `firestore.rules` BEFORE or WITH v90** (`firebase deploy --only firestore:rules`). It adds one small, additive block, `users/{biz}/playbook`
      (read by whoever reads the books, written by Owner/Manager, deleted by the Owner, never in the public demo), copied from `stockOuts`. If the
      rules are late the rest of the app is unaffected, but the app's playbook listener is refused and the Playbook page stays empty until they are
      published. A rules deploy with a syntax error is refused by Firebase and the old rules stay live.
- [ ] **Try these once on a test business** (none has been run against real Firebase): add a procedure with a 30-day review and a contract
      ending in 20 days with 15 days of notice (check the flags), mark the procedure reviewed, edit the contract to remove its end date (the
      flag must disappear), print both, delete one as Owner; sign in as a Manager (can write, cannot delete) and as an Accountant (can read,
      no buttons). Import a CSV of ten prospects twice (the second time must add none and say ten were skipped), and one with a bad row (nothing added).
- [ ] The what-if on the Loans page and the coverage line on Leads need no deployment steps.

## v79 to v85: what to deploy, in what order
No new environment variables, no new indexes, no new collections beyond the two below.
- [ ] **Publish `firestore.rules` BEFORE or WITH this version** (`firebase deploy --only firestore:rules`). It adds two small, additive blocks:
      `users/{biz}/meta/healthSnapshot` (the owner's app writes a seven-field daily summary; the admin list reads it) and
      `memberships/{uid}/linked/{businessId}` (the list of businesses one login belongs to). If the rules are late nothing breaks:
      the admin list shows "No health summary yet", and a second business accepted through an invite still works but is missing from
      the switcher until the bookmark can be saved. A rules deploy with a syntax error is refused by Firebase and the old rules stay live.
- [ ] **Rules smoke test** now also covers both blocks (`scripts/rules-smoke.mjs`); run it as above before publishing.
- [ ] **Try these once on a test business** (none has been run against real Firebase): record a project milestone in the books (paid and
      owed), bill a late charge twice (the second tap must bill only new days), a serial-number sale and a lookup, a price-break sale,
      a stock count (and check the profit effect it shows equals the stock shrinkage line afterwards), a sale logged before its purchase
      (profit changes when the purchase is recorded), and the business switcher with two real accounts (invite the second to the first
      business, accept while signed in, switch both ways, remove that member and reload: it must land back on the first).
- [ ] Admin list: confirm the new "Logins" line, "Over plan" badge and health badges render for a few accounts.
