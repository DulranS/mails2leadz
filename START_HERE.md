# AutoLeads: start here

One app, one guide. Finding leads is built into the app; the Python worker is now optional.

- The app (this folder): CRM, sending, follow-ups, customers, billing, weekly report, Lead Inbox, and the lead finder: it looks up businesses on OpenStreetMap (free: no key, no card, no billing), reads their websites for a contact, scores them and drops the good ones in your Lead Inbox. Press **Find leads** on the Lead Inbox page, or switch on **Search nightly**. Deploy it as in DEPLOYMENT_GUIDE.md.
- The worker (worker/autoleads_worker.py): OPTIONAL. The same finder for big, slow runs on your own computer, plus cleaning your own CSV lists (`import`). Skip section 2 unless you want it.
- You: open the Lead Inbox, pick leads, review the emails, press Send. That one step stays manual on purpose (sender reputation, and Gmail signs in from your browser).

## 1. The app (once)
1. Deploy it (DEPLOYMENT_GUIDE.md), set FIREBASE_SERVICE_ACCOUNT_JSON on the server (the lead finder needs it) and CRON_SECRET (for the nightly routine), set NEXT_PUBLIC_CONTACT_EMAIL (the free map servers ask who is calling), and run: firebase deploy --only firestore:rules (republish: this version adds a `finder_jobs` rule)
2. Sign in. Account: fill in what you sell, then "Lead inbox connection", Create key. The page shows a ready-made setup command: copy it.

## 2. The worker (optional, about 5 minutes; skip it to use only the built-in finder)
You need Python 3.9+ and nothing else: no account, no key, no card. Business data comes from OpenStreetMap through two free public servers.

    cd worker
    python autoleads_worker.py setup --app-url https://YOUR-APP --ingest-key THE-KEY     (the command from the Account page)

It asks what to find (for example plumbers) and where (for example Colombo, Sri Lanka), saves autoleads.json, tests the connections, installs missing packages for you and offers to run itself every morning at 09:00.

## The menu: look for ANYTHING, or bring your own list
Double-click `worker/run.bat` (or run `python autoleads_worker.py` with no words). You get a menu:

    1  Find NEW leads: type any kind of business and place (roofers in Leeds, UK / yoga studios in Dubai, UAE)
    2  Use MY OWN CSV: drag the file in; it shows what it understood, reads the websites, adds the good leads to your Lead Inbox
    3  Run my daily routine now
    4  Tools: set up, test connections, see the plan or results

Each typed search gets its own folder (`worker/searches/<date>_<what>-<where>/`) and is remembered, so the same business is never handed to you twice. It does not touch your saved daily routine unless you answer yes to "repeat this search every morning". The schedule itself is unchanged: it runs `run` on its own and never shows the menu.

If the free map data is thin for a niche, use option 2 with a list from anywhere else: Google Maps exports, a purchased list, a CRM export. Columns like Business Name, E-mail, Phone Number and URL are understood; emails you already have are kept.

## Your own list (Google Maps extension export, bought list, CRM export): in the app
Lead Inbox → **Already have a list? Import it** → choose the CSV. The app shows how many rows are usable and which columns it understood (business name, website, email, phone, address, category), then reads each website for an email and phone, scores the leads and delivers the good ones to your inbox. Up to 500 businesses per file; import more files after. It uses no map request, only your daily website allowance (500). Where OpenStreetMap is thin for your city, this is the route: scrape Google Maps yourself with any extension, import the file here.

## 3. Every day (about 15 minutes)
Nothing to run. Open Business Value and read "Do this next", then:

1. **Find** (outbound): Lead Inbox → "Who should I look for?" tells you which businesses to search. Press **🔎 Find now** on one, or **Add all to the nightly routine**: your saved searches then take turns, one a night, and the leads wait in the inbox (no computer needed). Type your own search in **Find leads now** any time. Keep the page open while it runs; a search reads a few websites at a time. The free hosting plan allows about a minute of work per request, which is why a search runs in steps.
2. **Draft and send**: Lead Inbox, filter HOT, select, "Load into the sender". On the dashboard press **✨ Draft first emails with AI**, read the drafts, edit, press Send once. Sent leads automatically get follow-ups.
3. **Follow up**: Dashboard → Pending Follow-Ups → **⚡ Draft all, approve together**.
4. **Close**: turn replies into deals in the CRM; Customers and Billing handle onboarding and getting paid.
5. **Inbound**: Content → **Draft my week**, post each one with one tap, log results once a week.


## Your own scraped list (Google Maps extension, any CSV): one command
Scrape however you like, then:

    python autoleads_worker.py import my_scrape.csv

It understands the usual columns (business_name or name, phone or whatsapp_number, website), ignores the scraper's junk columns and empty rows, reads each website for emails, scores the leads, and delivers them to your Lead Inbox (opted-out, lost and already-emailed contacts are skipped). Stop it any time; run the same command again to carry on. If you give it a file that was already enriched, it does not crawl again. Without the setup done, it still writes my_scrape_app_import.csv, which you can upload on the dashboard. my_scrape_review.csv lists what was left out and why. Phone-only businesses are kept for WhatsApp and calls.

## Handy commands (all optional)
    python autoleads_worker.py run        run now
    python autoleads_worker.py plan       what the next run would do, calls nothing
    python autoleads_worker.py status     budget used, best searches
    python autoleads_worker.py check      test the map servers, the AutoLeads connection and the webhook
    python autoleads_worker.py schedule --install | --remove | --time 08:30
    python autoleads_worker.py find -q "plumbers" --location "Colombo, Sri Lanka"     one-off search
    python autoleads_worker.py import my_scrape.csv                                   your own CSV -> Lead Inbox (see above)
    python autoleads_worker.py enrich my_leads.csv                                    only crawl a CSV, no inbox

## Settings (worker/autoleads.json)
Searches (queries x locations, several places separated by ;), the minimum score, and limits. The limits are your politeness guard for the free servers (they cost nothing, but ask for about one request a second and well under 10,000 a day): requests_per_run, requests_per_day, requests_per_month. Start small for a week and read autopilot_data/report.md to see which searches produce hot leads.
Keys are stored in this file (keep it private, it is git-ignored). An environment variable of the same name overrides the file.

## Safety nets
- Never goes over your request limits, and spaces requests out (about one a second) so the free servers never block you. Searches that find nothing new twice in a row rest for 30 days.
- Never collects a business twice. Opted-out, lost and already-emailed contacts never reach the inbox.
- An interrupted run is finished first next time. If the app is unreachable, batches wait in autopilot_data/outbox and are delivered later.

## Check before you rely on it
- Run it by hand once (python autoleads_worker.py run) and read the summary before trusting the schedule. Windows scheduling could not be tested here (Mac/Linux logic is tested with a stand-in).
- OpenStreetMap has no ratings or reviews, and some businesses are missing or have no phone or website (coverage is best in cities). Phone-only leads are kept for WhatsApp and calls; you can also feed the worker your own scraped list: python autoleads_worker.py import my_scrape.csv
- Map data is (c) OpenStreetMap contributors (ODbL). There is no limit on how long you may store it, but keep that credit wherever you show or share the data. If you ever want to contact the server operators, set AUTOLEADS_CONTACT to your email so requests identify you.
- To search a place by a different name, write it the way OpenStreetMap does ("Colombo, Sri Lanka"). Search words like plumbers, dentists, restaurants, salons, lawyers, accountants and dozens more are understood; anything else is matched against business names.

Developers: tests are in worker/test_worker.py (python test_worker.py, no internet or keys needed). The app's own tests: npm test.
