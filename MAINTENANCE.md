# Balancr — keeping it running with no maintainer

Balancr is built to run without code changes: billing is manual, the AI only suggests, and the automation only
ever *tells* you things. What can still go wrong is outside the code (a prepaid balance, a renewal, a leaked
secret). This is the whole watch-list.

## Already guarded in code

- **AI cost:** every business has a daily AI message cap (`Settings.aiDailyMessageLimit`; trials use a lower
  built-in cap, see `TRIAL_AI_DAILY_TURNS`). A failed provider call is refunded to the customer.
- **Email from strangers:** public forms can cause at most 60 confirmation emails and 30 feedback emails a day
  (`PUBLIC_EMAIL_CONFIRM_MAX_PER_DAY`, `PUBLIC_EMAIL_FEEDBACK_MAX_PER_DAY`). Your own and cron emails are never starved.
- **Instant trials:** only if you turn on `AUTO_ACTIVATE_TRIALS`, and then capped by `AUTO_ACTIVATE_MAX_PER_DAY` (default 10).
- **AI provider trouble:** if the DeepSeek key is refused, the balance is empty, or the model name is retired, you
  get one plain email a day at `ADMIN_NOTIFICATION_EMAIL` (needs Resend set up). Customers just see "temporarily
  unavailable", it costs them no messages, and everything else keeps working.

## Do once, in each provider's own billing settings

- **Spend alerts** on the Google Cloud / Firebase project, Vercel and Resend, at an amount you are comfortable with.
  Use a hard cap wherever the provider offers one.
- **DeepSeek:** top up a balance you are happy to lose in a bad month. When it runs out the assistant stops (and
  you are emailed); nothing else does.
- **Calendar reminders** for the domain renewal, the verified sending domain in Resend, and anything else that bills yearly.

## If it ever needs a config change (no code, no redeploy of code)

| Symptom | Fix |
|---|---|
| Assistant says "temporarily unavailable" for everyone | Check the DeepSeek balance and `DEEPSEEK_API_KEY`. |
| Provider renamed or retired the model | Set `AI_MODEL` to the new name in your host's environment variables, redeploy. |
| A secret was shared or leaked | Rotate it (`ADMIN_PASSCODE`, the Firebase service-account key), update the host's variables, redeploy. |
| Emails stopped arriving | Resend dashboard: key, verified domain, daily limit. |

## Five-minute check, whenever you remember

1. `/admin/new-business`: any trial requests waiting, any renewals due.
2. DeepSeek and Resend dashboards: balance and usage look normal.
3. Anything unexpected: `RECOVERY-RUNBOOK.md`.
