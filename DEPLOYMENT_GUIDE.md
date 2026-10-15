# Deployment checklist

Do these in order. The order matters: step 3 before step 4.

1. **Create the Firebase project.** Enable Authentication (Google provider) and Firestore.
   Add your production domain under Authentication > Settings > Authorized domains.
2. **Create a service account key** (Project settings > Service accounts) and set
   `FIREBASE_SERVICE_ACCOUNT_JSON` on your host. Copy every other variable from `.env.example`.
3. **Deploy the app** (`vercel --prod` or your host) and open `/api/health`: it must answer `{"status":"ok"}`.
4. **Deploy the Firestore rules:** `firebase deploy --only firestore:rules`.
   (Doing this before step 2/3 makes the API unable to read the database.)
5. **Twilio (if used):** the call-status webhook is set by the app itself (see "Phone calls" below). Nothing to configure in the Twilio console for it.
6. **Google OAuth:** add `https://your-domain.com` as an authorized JavaScript origin, and enable the Gmail API.
7. **Open Account → Run connection check.** Every line should be green except optional ones (AI, Twilio) you do not use. If something is red it tells you exactly what to set.
8. **Smoke test as a new customer** (5 minutes):
   - Sign in. Open **Account**, fill in "What do you sell?", set a typical deal value, Save.
   - Upload a CSV, send to one address you own.
   - Use the 🤖 button on a lead: review the draft, approve, confirm it arrives.
   - When a follow-up is due, press **✨ AI draft** in the follow-up queue, edit, approve; open a replied lead's 💬 Thread and press **✨ Analyze reply**.
   - Open **Business Value**: your deal appears; set its value; mark it Won; see revenue and forecast update.
   - Lead Inbox → **Suggest who to target** returns a list; dashboard → **Draft first emails with AI** (with a CSV loaded) opens a review window; **Content → Draft my week** adds posts.
   - **Account > Download my data** works.
   - Account → **Drafts prepared overnight**: switch on, press **Prepare now**; the dashboard shows the ready drafts; open them, send one, confirm it arrives. Reply to it from another address with "Sounds good, tell me more": **Check replies** should say the deal moved forward.

## Drafts prepared overnight (optional)
- Set `CRON_SECRET` to a long random string. `vercel.json` schedules `/api/cron/prepare-drafts` daily at 01:30 UTC and Vercel sends the secret itself. On another host, call `GET /api/cron/prepare-drafts` once a day with the header `Authorization: Bearer <CRON_SECRET>`.
- Needs `FIREBASE_SERVICE_ACCOUNT_JSON` and an AI key. **Republish the Firestore rules** (`draft_queue` and `autopilot_users` are new).
- Each customer switches it on in Account → "Drafts prepared overnight". The job only writes drafts: it never sends and needs no Gmail access.
- Test it once: Account → **Prepare now**, then open the dashboard: the "drafts ready for your review" banner appears. To test the schedule itself: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/prepare-drafts`.

## Reply watch (timed reply checks, optional)
Finds replies while the app is closed: reads each one in full, stops follow-ups to anyone who replied, moves interested leads forward, records opt-outs. Read-only: it cannot send, delete or change any email, and it sends nothing.
- Set `GMAIL_TOKEN_KEY` (a long random string, 24+ characters; it encrypts the stored Google key) plus `CRON_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON` and the Google client id/secret you already have. **Never change `GMAIL_TOKEN_KEY` later**: stored connections stop working and owners must connect again. **Republish the Firestore rules** (a comment documents the new server-only `gmail_connections` collection; no rule change is needed, browsers are denied by default).
- In Google Cloud, the OAuth client must list your site under **Authorized JavaScript origins** (it already does if sign-in works). No new redirect URI is needed.
- Each owner turns it on at Account → **Reply watch → Connect Gmail (read-only)**; that is one extra Google consent screen asking only to *read* email. Pause, Check now and Disconnect (cancels the key at Google and deletes it) are on the same card. Deleting the account does the same.
- **Schedule.** `vercel.json` runs `/api/cron/check-replies` once a day at 01:00 UTC (just before the 01:30 overnight drafts, so drafts are never prepared for someone who already replied). This works on every Vercel plan. To check more often: on Vercel Pro change the schedule to e.g. `*/15 * * * *`; on the free plan use a free pinger (cron-job.org, GitHub Actions) that calls `GET /api/cron/check-replies` with the header `Authorization: Bearer <CRON_SECRET>` every 15-30 minutes. The job never re-checks one owner more often than every 8 minutes, and does up to 4 x 50 emails per owner per run.
- **Google "Testing" mode expires the connection every 7 days** (Google's rule for unpublished apps). Account shows "Connect again" when that happens. To stop it, set the OAuth consent screen's publishing status to **In production**. For your own use and up to 100 users an unverified app works (users click through Google's warning). Selling to more people needs Google's verification for the restricted `gmail.readonly` scope (see "Public pages" below), so treat this as a feature for you and a small first group.
- Test once: connect in Account, press **Check now**; then `curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/check-replies` should answer `{"success":true,...}`. Account → Run connection check shows a "Reply watch" line.

## Enquiry form (inbound, optional)
- Needs `FIREBASE_SERVICE_ACCOUNT_JSON` and an AI key; **republish the Firestore rules** (`inbound_enquiries` is new).
- Account → *Enquiry form* → create the link, tag it per place you share it. `/api/inbound` is public on purpose (visitors are not users); it only accepts enquiries for the key's owner.
- **Content planner links.** With the enquiry link created, Content automatically adds your tagged link to every post it drafts (LinkedIn, Facebook, X: a clickable link; Instagram, TikTok: a "link in bio" line plus the tagged link to set once as your profile link). Each post's own link is tagged with the post, so Content shows enquiries per post and per platform, and the planner learns from them without you typing numbers in. Switch it off, or change the line before the link, on the Content page.
- Test once after deploying: open the link in a private window, send an enquiry, then check the dashboard banner "Reply to 1 new enquiry" and Business Value → "Inbound".

## Who can sign in (set this before you share the link)
- `ALLOWED_EMAILS` = customer emails and/or `@company.com` domains, comma separated. Anyone else who signs in sees "no access yet" with your `NEXT_PUBLIC_CONTACT_EMAIL`. `ADMIN_EMAILS` always get in. Leave it empty and the app is open to every Google account, each able to use AI paid from your key (per-account caps apply). Account → Run connection check shows which mode you are in.
- To add a customer later: add their email to `ALLOWED_EMAILS` and redeploy (takes effect on the next request).

## Public pages
- `/privacy` and `/terms` are plain-language pages written for what the app does. Read them once, change anything that is not true for you, and have a lawyer look before you charge for the service. Put their URLs on the Google OAuth consent screen. Set `NEXT_PUBLIC_CONTACT_EMAIL` (shown on both pages and the landing page's "Request access" button).
- Gmail permissions: the app uses `gmail.send` and `gmail.readonly`. Google treats `gmail.readonly` as a restricted scope: outside testing mode (100 manually added test users) the OAuth app must be verified, and restricted scopes can need an annual third-party security assessment. Check Google's current requirements before promising customers a public sign-up.

## Opt-out links
- Set `NEXT_PUBLIC_BASE_URL` to your https domain, `UNSUBSCRIBE_SECRET` to a long random string (or rely on `WEBHOOK_SECRET`), and make sure `FIREBASE_SERVICE_ACCOUNT_JSON` is set. Without all three the app still sends, but without opt-out links; Account → Run connection check says so.
- Do not change `UNSUBSCRIBE_SECRET` later: links already sent in old emails would stop working.

## AI (DeepSeek)
- Create a key at platform.deepseek.com and set `DEEPSEEK_API_KEY`. That is all: it becomes the default provider.
- The default models are `deepseek-flash` (drafts, follow-ups, reply analysis) and `deepseek-v4-pro` (not used unless a feature asks for the smart tier).
  Model names change over time: if Account → Run connection check or a draft says the model is unknown, set `AI_MODEL_FAST_DEEPSEEK` to the current name from your DeepSeek console. No code change needed.
- Optional backup: also set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. If DeepSeek is down, requests fall back to it automatically.
- The app turns DeepSeek "thinking" mode off for drafting (it is on by default, slower and costlier).

## Phone calls (only if you use Twilio)
- Set `NEXT_PUBLIC_BASE_URL` (your https domain) and `WEBHOOK_SECRET`; the app adds `?key=` to the call-status callback itself.
- Set `NEXT_PUBLIC_DEFAULT_COUNTRY_CODE` (digits only, e.g. `94`, `44`, `1`) so local numbers starting with 0 are dialled in the right country. Optional branding: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_CONTACT_EMAIL` (shown on the landing page).
- Calls are **not recorded** unless you set `TWILIO_RECORD_CALLS=true` (recording third parties can need their consent where you operate).
- "Bridge" calls ring the **customer's own number** from Account → Your business; without it the call is refused.

## Costs to expect
- AI: with DeepSeek one draft costs a fraction of a cent (the app budgets at DeepSeek's peak-hour price to stay safe).
  Each customer is capped by `AI_DAILY_CALL_LIMIT` (default 100 calls a day) and `AI_MONTHLY_BUDGET_USD` (default $5). Costs shown in the app are estimates.
- Gmail sending is limited by Google (consumer accounts roughly 500/day); the app's default daily cap respects this.

## Before you give the code to anyone
Delete the `_archive/` folder (old experiments and sample lead CSVs) and never commit `.env*`.
