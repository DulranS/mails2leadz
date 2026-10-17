# Firestore rules

`firestore.rules` is the source of truth. Deploy with:

```
firebase deploy --only firestore:rules
```

Model: each customer can read and write only documents that carry their `userId` (or whose
id starts with `<uid>_`). AI usage collections are read-only for customers. Server API routes
use the Firebase Admin SDK (set `FIREBASE_SERVICE_ACCOUNT_JSON`) and bypass these rules.
**No service-account key?** Use *server login* instead: the server signs in as one dedicated Firebase Authentication user
(`FIREBASE_SERVER_EMAIL` / `FIREBASE_SERVER_PASSWORD`) and `isServer()` in `firestore.rules` lets that one user id read and write
everything. Paste its UID into the rule before deploying (steps: DEPLOYMENT_GUIDE.md, "Server login"). Left as the placeholder it matches nobody.

Deploy the rules **after** setting the service account on the server, otherwise the API routes
(which fall back to the browser SDK without it) will be denied.
