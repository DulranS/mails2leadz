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
| Saved searches (campaigns) | Up to 5 saved searches, each with its place typed in full (e.g. "Colombo, Sri Lanka") | Covered: the place and country are one line, not two fields |
| Checkpoint and resume | The Lead Finder job resumes where it stopped | Covered |
| Daily budget (`limits`) | Searches per day 12, websites per day 500 (set by environment variables) | Covered with different defaults |
| Per-search map requests (80) | Capped at 80 map requests per search, as the Python worker (v392) | Covered. The search resumes where it stopped |
| `check`, `plan`, `status` | Today's allowance, progress and a plan preview on the Lead Finder page (v392) | Covered |
| `schedule` (Windows scheduled task) | Server daily routine | Replaced. Nothing to install on a computer |
| Webhook message (Slack, Discord, ntfy) | Message when a queued search adds leads or does not finish (v391), and when a nightly search adds leads or does not finish (v392) | Covered |

## What is still different

- **Limits.** The map requests per search now match the Python worker (80). A search still reads up to 300 businesses, and it reads up to 4 pages per website where the Python worker went to crawl depth 3. A large or slow area can therefore still find fewer businesses than the Python worker did.
- **When queued searches run.** They run while the Big search page is open (it asks the server for a step every 30 seconds). A daily sweep route exists at `/api/cron/worker-queue`, but it is not on the timetable: the free plan allows two scheduled jobs, and the owner chose those two. Adding it needs a decision.

## Files that must not be shared

The worker folder in the old archive contained a Firebase service-account key file and Terraform state. Neither belongs in AutoLeads or in any archive that is shared. If they were ever shared, rotate the key.
