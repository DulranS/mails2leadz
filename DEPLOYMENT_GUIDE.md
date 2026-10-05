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
7. **Smoke test as a new customer** (5 minutes):
   - Sign in. Open **Account**, fill in "What do you sell?", set a typical deal value, Save.
   - Upload a CSV, send to one address you own.
   - Use the 🤖 button on a lead: review the draft, approve, confirm it arrives.
   - Open **Business Value**: your deal appears; set its value; mark it Won; see revenue and forecast update.
   - **Account > Download my data** works.

## Costs to expect
- AI: with the default cheap model one draft costs a fraction of a cent. Each customer is capped by
  `AI_DAILY_CALL_LIMIT` and `AI_MONTHLY_BUDGET_USD`. Costs shown in the app are estimates.
- Gmail sending is limited by Google (consumer accounts roughly 500/day); the app's default daily cap respects this.

## Before you give the code to anyone
Delete the `_archive/` folder (old experiments and sample lead CSVs) and never commit `.env*`.
