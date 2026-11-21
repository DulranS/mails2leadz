# Owner account recovery — runbook

Most access problems don't need this document:

- **Forgotten password, email still accessible** → "Forgot your password?" on
  the login page (`sendPasswordResetEmail`, wired in `contexts/AuthContext.tsx`).
  Self-service, no action needed from you.
- **A manager or staff member is locked out** → the owner removes/re-invites
  them from **Team access** (`/team`). Also self-service.
- **A manager or staff member was wrongly given "owner"-level access** →
  can't happen by design. `firestore.rules` and `app/team/page.tsx` only ever
  let an invite grant `manager` or `staff` — the owner role is fixed to the
  uid the business was created under and can't be reassigned or invited away.

## The one scenario that needs you: the owner loses both password and email access

Because each business is rooted at its owner's Firebase Auth uid
(`users/{businessId}/...` where `businessId == owner's uid` — see the header
comment in `firestore.rules`), there is exactly one owner account per
business and no secondary recovery contact. If that person loses their
password **and** no longer has access to the email address on the account,
password reset can't reach them and there is no in-app path back in. This is
rare, but when it happens it's the true "11pm support fire" — handle it
yourself, deliberately, rather than building self-service recovery for an
edge case this small:

1. **Verify identity out-of-band** before touching anything — a phone call to
   a number you already had on file for them, not one they just gave you.
   Financial data is the highest-value target for exactly this social-
   engineering scenario.
2. In the Firebase Console → Authentication, locate their user by the email
   on file and update the email address to one they currently control, or
   send a fresh password-reset link directly from the console to the new
   address.
3. Confirm they can sign in, then ask them to update their email in
   **Settings → Account** to something they're confident they'll keep
   controlling.
4. Log what happened and when — who verified identity and how — in case the
   same business ever raises it again.

## If you outgrow this runbook

If manual recovery starts happening often enough to be a real time cost
(rather than a rare edge case), the next step is a secondary recovery email
or phone-based verification — but that's real scope (a new field on the
account, a new verification flow, a new thing that can itself be
compromised), not a quick addition, so don't build it speculatively ahead of
actually needing it.

## A customer lost or damaged data and has a backup zip

Owners download a backup from **Import / export → Full backup**. Inside the
zip, `full-backup.json` is the complete copy (payments collected/made,
returns, discounts, write-offs, cash counts, suppliers, estimates, recurring
schedules, etc.); the `.csv` files are spreadsheet copies, and re-importing
those alone does **not** bring payments back — always restore from the JSON.

1. Unzip and keep `full-backup.json`. Get the owner's uid (Firebase console →
   Authentication → Users).
2. Dry run first (touches nothing, needs no credentials):
   `node scripts/restore-from-backup.mjs full-backup.json <ownerUid>`
3. Restore for real: add `--apply`. It never overwrites a document that
   already exists, so it is safe to run against a business that still has
   most of its data — it only fills in what's missing. Add `--overwrite` only
   when you deliberately want the backup to replace what's there.
4. Team members aren't in the backup — re-invite them from Team access.

Store customers' backup files like any other customer financial data, and
delete your copy when the job is done.
