// lib/server/lifecycle.js - sends the due platform emails (trial ending / ended, payment failed). Run by the daily job.
import { collection, getDocs, query, where, limit } from '../server-firestore.js';
import { saasEnabled } from '../tenant.js';
import { lifecycleDue } from '../lifecycle.js';
import { trialEndingEmail, trialEndedEmail, paymentFailedEmail } from '../system-emails.js';
import { sendSystemMail, mailProvider } from './system-mail.js';
import { writeTenant } from './tenant.js';

const MAX_PER_RUN = 200;

export async function runLifecycleEmails(db, { now = Date.now(), env = process.env } = {}) {
  if (!saasEnabled()) return { skipped: 'not in SaaS mode' };
  if (mailProvider(env) === 'none') return { skipped: 'no mail provider configured' };
  const base = String(env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const url = base ? `${base}/account` : '';
  const summary = { checked: 0, sent: 0, failed: 0 };
  for (const status of ['trialing', 'past_due']) {
    const snap = await getDocs(query(collection(db, 'tenants'), where('status', '==', status), limit(500)));
    for (const d of snap.docs) {
      const t = d.data();
      const uid = t.userId || d.id;
      summary.checked++;
      for (const due of lifecycleDue(t, now)) {
        if (summary.sent + summary.failed >= MAX_PER_RUN) return summary;
        const mail = due.kind === 'trial_ending' ? trialEndingEmail({ daysLeft: due.daysLeft, url })
          : due.kind === 'trial_ended' ? trialEndedEmail({ url }) : paymentFailedEmail({ url });
        const r = await sendSystemMail({ db, to: t.email, kind: due.kind, uid, ...mail }, env, now);
        if (r.sent) {
          summary.sent++;
          const notices = { ...(t.notices || {}), [due.key]: new Date(now).toISOString() };
          if (due.kind === 'payment_failed') notices.paymentFailedFor = due.since;
          await writeTenant(db, uid, { notices });
        } else summary.failed++; // tried again tomorrow
      }
    }
  }
  return summary;
}
