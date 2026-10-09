# Deployment checklist

Do these in order. The order matters: step 3 before step 4.

1. **Create the Firebase project.** Enable Authentication (Google provider) and Firestore.
   Add your production domain under Authentication > Settings > Authorized domains.
2. **Create a service account key** (Project settings > Service accounts) and set
   `FIREBASE_SERVICE_ACCOUNT_JSON` on your host. Copy every other variable from `.env.example`.
3. **Deploy the app** (`vercel --prod` or your host) and open `/api/health`: it must answer `{"status":"ok"}`.
4. **Deploy the Firestore rules:** `firebase deploy --only firestore:rules`.
   (Doing this before step 2/3 makes the API unable to read the database.)
5. **Twilio (if used):** set the SMS-reply and call-status webhook URLs to
   `https://your-domain.com/api/handle-sms-reply?key=WEBHOOK_SECRET` (and `/api/call-webhook?key=...`).
6. **Google OAuth:** add `https://your-domain.com` as an authorized JavaScript origin, and enable the Gmail API.
7. **Open Account → Run connection check.** Every line should be green except optional ones (AI, SMS webhooks) you do not use. If something is red it tells you exactly what to set.
8. **Smoke test as a new customer** (5 minutes):
   - Sign in. Open **Account**, fill in "What do you sell?", set a typical deal value, Save.
   - Upload a CSV, send to one address you own.
   - Use the 🤖 button on a lead: review the draft, approve, confirm it arrives.
   - When a follow-up is due, press **✨ AI draft** in the follow-up queue, edit, approve; open a replied lead's 💬 Thread and press **✨ Analyze reply**.
   - Open **Business Value**: your deal appears; set its value; mark it Won; see revenue and forecast update.
   - **Account > Download my data** works.

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
  Each customer is capped by `AI_DAILY_CALL_LIMIT` and `AI_MONTHLY_BUDGET_USD`. Costs shown in the app are estimates.
- Gmail sending is limited by Google (consumer accounts roughly 500/day); the app's default daily cap respects this.

## Before you give the code to anyone
Delete the `_archive/` folder (old experiments and sample lead CSVs) and never commit `.env*`.
