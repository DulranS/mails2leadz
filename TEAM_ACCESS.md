# Team logins and system emails

Works the same whether you use AutoLeads only for yourself, sell it to other businesses (`SAAS_MODE=true`), or both. Every business is its own workspace with its own team.

## Roles
- **Owner**: everything, including the team, plan and payments, keys, connections and deleting the account.
- **Manager**: all the daily work (leads, outreach, replies, CRM, customers, billing, content, SOPs). Cannot change the team, plan, keys, the mailbox connection, or delete the account.
- **Viewer**: sees everything, changes nothing (also cannot use AI drafting, because that is an action).

A person has one workspace to work in. They use their own sign-in (Google or email), never a shared password.

## How to invite
Account, then **Team logins**: optionally type their email (it locks the invite to that address), pick a role, press Invite. You always get a link (valid 7 days, shown once, only its hash is stored). If a mail service is set up it is also emailed. They open the link, sign in, and land in your workspace. You can change a role or remove someone at any time; removal ends their access immediately in the database and within a minute on the server.

Seats: with `SAAS_MODE` off the limit is `TEAM_MAX_SEATS` (default 10 people besides you). With it on, plans decide (trial 1, starter 2, growth 5; override per plan with `SAAS_PLANS`). Waiting invites count.

## System emails (optional)
Set ONE of these in the server environment:
- `RESEND_API_KEY` and `SYSTEM_MAIL_FROM` (a sender on a domain verified in Resend), or
- `SYSTEM_MAIL_WEBHOOK_URL` (any service that accepts a POST of `{ to, subject, text, from }`).

What is sent: team invites; and, only when `SAAS_MODE` is on, "trial ends in 3 days", "trial ended" and "payment did not go through" (each once, by the daily job `/api/cron/daily-ops`). Nothing is sent without a mail service and nothing breaks: invites show a link to copy. Every attempt is logged in the `system_mail_log` collection (kind, recipient, subject, status; never the body or any link).

## Publishing, and checking it works (do this once, 10 minutes)
The database rules changed, and I could not run them against a real Firebase project, so check them yourself before relying on them.
1. Publish `firestore.rules` (Firebase console, Firestore, Rules). The previous rules are kept in `firestore.rules.v31-owner-only`: paste that back to roll back instantly. The owner's own access is unchanged either way.
2. Account, Team logins: invite a second account of yours as **Manager**, open the link in a private window, sign in with that account.
3. As the manager: Business Value, Lead Inbox, CRM and Customers should show your data; Account should show the small "shared workspace" page. Change a deal and check it saved.
4. Invite another as **Viewer**: it should see the same data and every save should be refused with "view-only".
5. Remove the manager: their next page load should show an empty workspace of their own.
If step 3 shows "permission denied" errors in the browser console, the rules did not take: re-publish and check for a syntax message in the Rules editor (use the Rules Playground there), or roll back.

## What a manager can do that you should know about
Autopilot settings and sending email are daily work, so a manager can use them. Gmail connection, ingest and enquiry keys, plan and payments are owner-only (enforced at the gate and in the rules). Auto-sent email still uses the mailbox the owner connected.
