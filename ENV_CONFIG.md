See `.env.example` (every variable, with comments) and `DEPLOYMENT_GUIDE.md`.

## Firebase projects (checked 2026-11-15)
- AutoLeads is the Firebase project `mails2leadz`. Set NEXT_PUBLIC_FIREBASE_PROJECT_ID=mails2leadz, and use only the service account JSON from mails2leadz (FIREBASE_SERVICE_ACCOUNT_JSON).
- Balancr is a separate Firebase project, `balancr-3d9d0`. AutoLeads never reads or writes its database. Balancr is reached only through its API: BALANCR_BASE_URL, BALANCR_BUSINESS_ID, BALANCR_API_KEY.
- Both projects sit on one Google account. A wrong project id or service account in the AutoLeads environment would point the app at Balancr's data, so check these on each deployment.

## More settings the code reads (added 23 Nov 2026)

These were used by the code but missing from this page. Set them only where the note says to.

| Setting | What it does | Notes |
|---|---|---|
| BALANCR_EVENT_SECRET | Signs the events Balancr sends to AutoLeads. A timestamp more than five minutes off is refused. | Must match the value set in Balancr. |
| PARTNER_LINK_SECRET | Signs the partner statement links. Without it, or with a link that does not check out, the statement is refused. | Keep it private. |
| PARTNER_TERMS_JSON | The partner (referral) terms, as JSON. | Optional. The default terms are in code; see COMMERCIAL_READINESS.md. |
| FINDER_DAILY_SEARCHES | Map searches per account per day. | Optional. Default 12. |
| FINDER_DAILY_SITES | Websites read per account per day. | Optional. Default 500. |
| NEXT_PUBLIC_APP_URL (or NEXT_PUBLIC_BASE_URL) | The app's public address. Used to build the app's own links in outgoing calls. | Set to the live address, without a trailing slash. |
| GOOGLE_APPLICATION_CREDENTIALS | The service account file, for running outside Google's hosting. | Leave unset on Google's hosting. |

Set by the hosting platform, not by you: NODE_ENV, GAE_ENV, K_SERVICE, FUNCTION_TARGET, GCLOUD_PROJECT, GOOGLE_CLOUD_PROJECT.
