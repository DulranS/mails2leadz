# AutoLeads: start here

One app, one worker file, one guide.

- The app (this folder): CRM, sending, follow-ups, customers, billing, weekly report, Lead Inbox. Deploy it as in DEPLOYMENT_GUIDE.md.
- The worker (worker/autoleads_worker.py): finds businesses on OpenStreetMap every morning (free: no key, no card, no billing), checks their websites, scores them and drops the good ones in your Lead Inbox.
- You: open the Lead Inbox, pick leads, review the emails, press Send. That one step stays manual on purpose (sender reputation, and Gmail signs in from your browser).

## 1. The app (once)
1. Deploy it (DEPLOYMENT_GUIDE.md), set FIREBASE_SERVICE_ACCOUNT_JSON on the server, run: firebase deploy --only firestore:rules
2. Sign in. Account: fill in what you sell, then "Lead inbox connection", Create key. The page shows a ready-made setup command: copy it.

## 2. The worker (once, about 5 minutes)
You need Python 3.9+ and nothing else: no account, no key, no card. Business data comes from OpenStreetMap through two free public servers.

    cd worker
    python autoleads_worker.py setup --app-url https://YOUR-APP --ingest-key THE-KEY     (the command from the Account page)

It asks what to find (for example plumbers) and where (for example Colombo, Sri Lanka), saves autoleads.json, tests the connections, installs missing packages for you and offers to run itself every morning at 09:00.

## 3. Every day
Nothing to run. Open the app, Lead Inbox, filter HOT, select, "Load into the sender", review, Send.

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
