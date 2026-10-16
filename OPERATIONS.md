# Operations runbook (when other people's businesses depend on this)

Plain steps for the person running the deployment. Nothing here is automated for you; each item says what to do and how to know it worked.

## Every week (10 minutes)
- Open `/admin`. Configuration all ticked? Any account **Limited** because of a failed payment (reach out), any **Suspended** you forgot?
- Compare **AI cost this month** with what you earn. If an account's AI cost is a large share of its price, lower its plan's AI limits (`PLAN_OVERRIDES_JSON`) or raise the price.
- In Stripe: webhook deliveries all succeeding? (A failing webhook means plans do not update.)
- Bounce/complaint spikes reported by customers: look at the sending account, suspend if needed.

## Backups (switch on once, test once)
- In the Firebase console enable **scheduled Firestore backups**, then **restore one into a scratch project** to prove it works. An untested backup is not a backup.
- Keep a copy of your environment variables somewhere safe (a password manager). Losing `TOKEN_ENC_KEY` means every owner must reconnect Gmail.

## Secrets and keys
| Secret | If it leaks / must change |
|---|---|
| `CRON_SECRET` | Change it in the host **and** in the external scheduler. Jobs fail (401) until both match. |
| `STRIPE_WEBHOOK_SECRET` | Roll it in Stripe, then update the env var. Webhooks fail until updated. |
| `TOKEN_ENC_KEY` | There is **no rotation tool**. Changing it makes stored Gmail keys unreadable: owners see "reconnect" and connect again. |
| An owner's enquiry / ingest key | The owner makes a new one in Account; the old one stops at once. |
| Firebase service account | Create a new key in Google Cloud, update `FIREBASE_SERVICE_ACCOUNT_JSON`, delete the old key. |

## Abuse or an incident
1. `/admin` → **Suspend** the account (with a reason). Sending, AI and background jobs stop within a minute; the owner sees the message; their data is untouched.
2. Their public enquiry form closes (503) while suspended.
3. Every operator action is in the `admin_audit` collection (who, when, what).
4. If a Gmail key might be exposed: ask the owner to disconnect in Account (revokes it at Google), or rotate `TOKEN_ENC_KEY`.

## Support: what you can and cannot do
- You can see an account's plan, status, last seen and usage. You **cannot** see their leads, emails or deals, by design; ask them to export or screen-share.
- Data export / deletion requests: the customer does it themselves in Account (it also cancels the subscription). 

## Pricing sanity check
Cost per customer ≈ AI cost (shown per account) + a share of hosting/database + Stripe fees. Use real numbers from a few weeks of usage, then set `PLAN_OVERRIDES_JSON` limits so that the heavy-use account of each plan still earns a margin. The defaults in `lib/tenant.js` are placeholders.

## Capacity (not tested)
Per-account request brake: `API_RATE_LIMIT_PER_MIN` (default 600). Per-account AI and email caps come from the plan. The database and hosting plans set the ceiling for everyone together: **run a load test before a launch.**
