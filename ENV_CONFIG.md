See `.env.example` (every variable, with comments) and `DEPLOYMENT_GUIDE.md`.

## Firebase projects (checked 2026-11-15)
- AutoLeads is the Firebase project `mails2leadz`. Set NEXT_PUBLIC_FIREBASE_PROJECT_ID=mails2leadz, and use only the service account JSON from mails2leadz (FIREBASE_SERVICE_ACCOUNT_JSON).
- Balancr is a separate Firebase project, `balancr-3d9d0`. AutoLeads never reads or writes its database. Balancr is reached only through its API: BALANCR_BASE_URL, BALANCR_BUSINESS_ID, BALANCR_API_KEY.
- Both projects sit on one Google account. A wrong project id or service account in the AutoLeads environment would point the app at Balancr's data, so check these on each deployment.
