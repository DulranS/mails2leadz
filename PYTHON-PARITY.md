# The Python worker, and where each part now runs

The Python worker (worker/autoleads_worker.py) is no longer needed. Everything it did runs inside AutoLeads, on the server.
This table is the check: each command or feature, where it lives now, and what is still different.

| Python worker | Now in AutoLeads | Status |
|---|---|---|
| `setup` (questions, connection checks) | Settings and the Integrations page; connection test | Covered |
| `run` (daily routine) | Saved searches, run nightly by the server (`prepare-drafts` cron) | Covered. The time of day is set by the server's daily schedule, not a time you choose |
| `menu` | The Lead Finder page | Covered |
| `find` (search, read websites, score, add to inbox) | Lead Finder: start, then step until finished | Covered. Limits differ, see below |
| `enrich` (read the websites in a CSV you have) | Lead Finder: import a list | Covered |
| `search` (map search only) | Lead Finder: the OpenStreetMap search inside start | Covered |
| "Run it on my computer" (the queue) | Big search: the server runs queued searches one at a time (`lib/server/worker-queue-runner.js`) | Covered (v391). Runs while the page is open, see below |
| Website reading, contact, scoring, diaspora rule, decision makers, company size, tech | `lib/lead-finder.js`, `lib/enrich-extract.js` | Covered |
| Seen-before memory (`seen_places.json`) | Per-owner seen list, last 4,000 | Covered, with a cap |
| Saved searches (campaigns) | Up to 5 saved searches | Partly: the Python worker also kept a region and country per campaign |
| Checkpoint and resume | The Lead Finder job resumes where it stopped | Covered |
| Daily budget (`limits`) | Searches per day 12, websites per day 500 (set by environment variables) | Covered with different defaults |
| `check`, `plan`, `status` | Today's allowance and progress on the Lead Finder page | Partly: no plan preview |
| `schedule` (Windows scheduled task) | Server daily routine | Replaced. Nothing to install on a computer |
| Webhook message (Slack, Discord, ntfy) | Message when a queued search adds leads or does not finish (v391) | Partly: the daily-run summary message is not built yet |

## What is still different

- **Limits.** A search in AutoLeads is time-boxed and reads up to 300 businesses and 4 pages per website. The Python worker allowed 80 map requests per search and crawl depth 3. Large searches may find fewer businesses than the Python worker did.
- **When queued searches run.** They run while the Big search page is open (it asks the server for a step every 30 seconds). A daily sweep route exists at `/api/cron/worker-queue`, but it is not on the timetable: the free plan allows two scheduled jobs, and the owner chose those two. Adding it needs a decision.
- **The daily-run webhook summary** is not built. Queued searches send their message; the nightly summary does not.

## Files that must not be shared

The worker folder in the old archive contained a Firebase service-account key file and Terraform state. Neither belongs in AutoLeads or in any archive that is shared. If they were ever shared, rotate the key.
