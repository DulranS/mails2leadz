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

## Selling it (SAAS_MODE): optional, off by default
Read **COMMERCIAL_READINESS.md** first (what is built, what is not, what is outside our control). With `SAAS_MODE` unset nothing below applies and our own use is unchanged.
1. **Before** turning it on, set `INTERNAL_EMAILS` (and `ADMIN_EMAILS`) to your own accounts so they are never trialled or limited.
2. Stripe: create two recurring **prices** (Starter, Growth) and put their ids in `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_GROWTH`. Put the secret key in `STRIPE_SECRET_KEY`.
3. Stripe → Developers → Webhooks → add `https://YOUR-DOMAIN/api/stripe/webhook` with the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`. In Stripe settings also enable the **customer portal** and the payment-failure emails.
4. Decide who may sign up: for open sign-ups leave `ALLOWED_EMAILS` empty (an invite list blocks everyone else).
5. Set `SAAS_MODE=on`, redeploy, republish the Firestore rules (`tenants` and `admin_audit` are server-only).
6. Open `/admin` (as an `ADMIN_EMAILS` account): the configuration check should be all ticked. Then run the six live checks at the end of COMMERCIAL_READINESS.md **with Stripe test keys** before using live keys.

## Automatic reply checking while you are away (optional)
Replies are normally found when you press Check replies. This makes it happen every night as well, and leaves a "while you were away" note on the dashboard. **Read-only**: the server can read replies, never send or change mail. Sending still needs you, in the browser.
1. Set `TOKEN_ENC_KEY` (`openssl rand -hex 32`). It encrypts the saved access key. **Keep it:** if it changes, every owner must reconnect. Also needs `GOOGLE_CLIENT_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON` and `CRON_SECRET`.
2. Google Cloud console → APIs & Services → Credentials → your OAuth client → **Authorized redirect URIs**: add `https://YOUR-DOMAIN/api/gmail-offline/callback` (Account → "Replies checked for you" shows the exact address).
3. OAuth consent screen: keep the `gmail.readonly` scope and set the publishing status to **In production**. While it says **Testing**, Google ends the saved access after **7 days** (the app then shows "Gmail access expired" and asks to reconnect). A production app that Google has not verified shows an "unverified app" warning on connect; that is normal for your own mailbox. **Check Google's current rules in the console:** sources differ on when verification becomes mandatory, and it is Google's decision, not ours.
4. **Republish the Firestore rules** (`reply_notices` is new; `gmail_offline` is deliberately not readable from any browser).
5. Schedule: `vercel.json` runs the reply check at 00:30 UTC and the drafts at 01:30 UTC, so overnight drafts already know who replied. Vercel's free plan allows daily jobs only; for a more frequent check (a hot reply found within hours is worth money) use Vercel Pro or an outside scheduler that calls `GET /api/cron/check-replies` with the header `Authorization: Bearer <CRON_SECRET>`.
6. Test once: Account → Connect Gmail (read-only) → reply to one of your own emails from another address → `curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/check-replies` → open the dashboard: the "While you were away" note appears and the deal moves.

## Drafts prepared overnight (optional)
- Set `CRON_SECRET` to a long random string. `vercel.json` schedules `/api/cron/prepare-drafts` daily at 01:30 UTC and Vercel sends the secret itself. On another host, call `GET /api/cron/prepare-drafts` once a day with the header `Authorization: Bearer <CRON_SECRET>`.
- Needs `FIREBASE_SERVICE_ACCOUNT_JSON` and an AI key. **Republish the Firestore rules** (`draft_queue` and `autopilot_users` are new).
- Each customer switches it on in Account → "Drafts prepared overnight". The job only writes drafts: it never sends and needs no Gmail access.
- Test it once: Account → **Prepare now**, then open the dashboard: the "drafts ready for your review" banner appears. To test the schedule itself: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/prepare-drafts`.

## Enquiry form (inbound, optional)
- Needs `FIREBASE_SERVICE_ACCOUNT_JSON` and an AI key; **republish the Firestore rules** (`inbound_enquiries` is new).
- Account → *Enquiry form* → create the link, tag it per place you share it. `/api/inbound` is public on purpose (visitors are not users); it only accepts enquiries for the key's owner.
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


## If the build fails with "export X was not found in ..."
That is a file left over from an older release (unzipping over an old project does not delete what the new release dropped). `npm run build` now moves such files to `_stale/` by itself and prints each one (`[cleanup] moved leftover file ...`). If you still see the error, run `npm run check:imports` locally: it names the exact file and the missing name. The cleanest fix is always to deploy from a fresh copy of the release instead of unzipping over the old one.

## If nothing is being saved
Open the app signed in: a red banner at the top means the server cannot write to the database (Account → Run connection check says why). Almost always `FIREBASE_SERVICE_ACCOUNT_JSON` is missing or unreadable on the host (paste the whole key JSON on one line), or the Firestore rules were not republished (`firebase deploy --only firestore:rules`). Redeploy after changing environment variables.


## Server login (no service-account key)
Use this when you cannot or do not want to create a service-account key (some Google Cloud organisations block key creation). The server uses the normal Firebase package, signed in as **one dedicated user** that only your rules recognise. Do **either** this **or** `FIREBASE_SERVICE_ACCOUNT_JSON`; if both are set, the service account is used.
1. Firebase console → **Authentication → Sign-in method** → enable **Email/Password** (Google sign-in stays on for customers).
2. **Authentication → Users → Add user**: an email that is yours (for example `server@yourdomain.com`) and a long random password (`openssl rand -base64 24`). Copy the user's **UID**.
3. Open `firestore.rules` and replace `PASTE_SERVER_USER_UID_HERE` with that UID. Republish: `firebase deploy --only firestore:rules`.
4. On the host set `FIREBASE_SERVER_EMAIL` and `FIREBASE_SERVER_PASSWORD`, then redeploy.
5. Sign in and press **Account → Run connection check**: "Database" should say *Working (server login)*.
**Good to know.** The server user can read and write everything, exactly like a service account would, so keep its password only in the host's environment variables. Nobody else gets anything from the rule (it matches that one UID). If your Firebase web API key has a "websites" (HTTP referrer) restriction, the server's sign-in is refused: remove the restriction (or use a key without one). Each new server instance signs in once (a fraction of a second).
