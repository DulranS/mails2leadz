# Firestore rules

`firestore.rules` is the source of truth. Deploy with:

```
firebase deploy --only firestore:rules
```

Model: each customer can read and write only documents that carry their `userId` (or whose
id starts with `<uid>_`). AI usage collections are read-only for customers. Server API routes
use the Firebase Admin SDK (set `FIREBASE_SERVICE_ACCOUNT_JSON`) and bypass these rules.

Deploy the rules **after** setting the service account on the server, otherwise the API routes
(which fall back to the browser SDK without it) will be denied.
