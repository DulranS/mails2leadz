// The once-a-day automation. Runs from the scheduler (app/api/cron/daily) and, on demand,
// from the admin panel's Automation card ("Preview" shows what WOULD go out; "Run now" does it).
//
// What it does, and nothing more:
//   1. For every customer, work out whether they are owed ONE reminder today
//      (trial ending / trial ended / renewal due / renewal overdue — the rules and wording
//      are in lib/lifecycle.ts) and send it, remembering it so it is never sent twice.
//   1b. For customers who were activated but have never signed in (the welcome email was
//      missed, or its link had died), send up to two gentle follow-ups, each with a fresh
//      sign-in link, and list them in the digest so a human can step in. A customer is never
//      emailed twice on one day: a trial/renewal reminder takes the slot first.
//   2. Email the admin one short digest: leads still waiting, accounts that need a human,
//      customers who never signed in, and which customer emails went out. Nothing to say =
//      no email.
//   3. Remember when it last ran, so the admin panel can show that the automation is alive.
//
// What it deliberately does NOT do: lock, suspend, charge, delete or change any account.
// Locking is still computed from dates by lib/accountAccess.ts, and money still moves only
// when a human records it. This job only TELLS people things.

import { getAdminDb } from "@/lib/firebaseAdmin";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { adminInbox } from "@/lib/envDefaults";
import {
  activationNudgeDue,
  activationNudgeEmail,
  attentionReason,
  buildAdminDigest,
  isoToday,
  neverSignedInDays,
  reminderDue,
  reminderEmail,
  type LifecycleAccount,
  type ReminderKind,
} from "@/lib/lifecycle";
import { emailOwner, loadSentKeys, markSent, ownerHasSignedIn, siteOrigin } from "@/lib/lifecycleServer";
import { durableSignInLink } from "@/lib/provisionServer";
import { purgeExpiredIntake } from "@/lib/trialIntakeServer";
import { resetDemoIfNeeded, type DailyDemoResult } from "@/lib/demoServer";

// Stored in the same "already told" memory as the reminders: once we have SEEN an owner sign
// in, we never look them up again (a Firebase lookup per customer per day would be wasteful).
const SIGNED_IN_FLAG = "signed_in";

export interface DailyJobResult {
  dryRun: boolean;
  ranAt: number;
  businesses: number;
  emailConfigured: boolean;
  // Customer reminders that went out (or, in a preview, would).
  reminders: { label: string; kind: ReminderKind; status: "sent" | "would_send" | "not_configured" | "failed" | "no_owner" }[];
  attention: { label: string; reason: string }[];
  // Activated more than a couple of days ago, owner has never signed in.
  neverSignedIn: { label: string; days: number }[];
  // Sign-in follow-ups that went out (or, in a preview, would).
  nudges: { label: string; status: "sent" | "would_send" | "not_configured" | "failed" | "no_owner" }[];
  waitingLeads: number;
  // What the daily pass did about the shared public demo (lib/demoServer.ts): put it back to the
  // sample data if it had been used, left alone if not, or "not_set_up" before anyone has opened it.
  demo?: DailyDemoResult;
  digest: "sent" | "skipped_nothing_to_say" | "skipped_not_requested" | "not_configured" | "failed" | "preview";
}

export const AUTOMATION_DOC = "platform/automation";

export async function runDailyJob(opts: { dryRun: boolean; sendDigest: boolean; req?: Request }): Promise<DailyJobResult> {
  const db = getAdminDb();
  const now = new Date();
  const today = isoToday(now);
  const origin = siteOrigin(opts.req);

  // Every business is the owner of a self-pointing memberships/{uid} doc (see
  // app/api/admin/businesses/route.ts for why that is the reliable way to enumerate them).
  const membershipsSnap = await db.collection("memberships").get();
  const ownerIds = membershipsSnap.docs
    .filter((d) => (d.data() as { businessId?: string }).businessId === d.id)
    .map((d) => d.id);

  const result: DailyJobResult = {
    dryRun: opts.dryRun,
    ranAt: now.getTime(),
    businesses: ownerIds.length,
    emailConfigured: isEmailConfigured(),
    reminders: [],
    attention: [],
    neverSignedIn: [],
    nudges: [],
    waitingLeads: 0,
    digest: "preview",
  };

  // Small batches keep a big customer list from opening hundreds of reads at once.
  const BATCH = 10;
  for (let i = 0; i < ownerIds.length; i += BATCH) {
    await Promise.all(
      ownerIds.slice(i, i + BATCH).map(async (businessId) => {
        try {
          const [accountSnap, memberSnap, settingsSnap] = await Promise.all([
            db.doc(`users/${businessId}/meta/account`).get(),
            db.doc(`users/${businessId}/members/${businessId}`).get(),
            db.doc(`users/${businessId}/meta/settings`).get(),
          ]);
          const account = (accountSnap.data() as LifecycleAccount | undefined) ?? {};
          const member = memberSnap.data() as { email?: string; name?: string } | undefined;
          const settings = settingsSnap.data() as { businessName?: string } | undefined;
          const label = settings?.businessName || member?.name || member?.email || businessId;

          const why = attentionReason(account, today);
          if (why) result.attention.push({ label, reason: why });

          const owner = member?.email
            ? { email: member.email, name: member.name ?? "", businessName: settings?.businessName ?? null }
            : null;
          let sent: Record<string, number> | null = null;
          // One email per customer per day: the reminder below takes the slot first.
          let emailedToday = false;

          // 1) The trial / renewal reminder this account is owed today, if any.
          const due = reminderDue(account, today);
          if (due) {
            sent = await loadSentKeys(businessId);
            if (!sent[due.key]) {
              // not already told about this exact date
              emailedToday = true;
              if (opts.dryRun) {
                result.reminders.push({ label, kind: due.kind, status: "would_send" });
              } else {
                const status = await emailOwner(businessId, (ctx) => reminderEmail({ ...ctx, due, account }), opts.req, owner);
                result.reminders.push({ label, kind: due.kind, status });
                // Only a delivered email counts as "told". Not-configured / failed stay unmarked, so
                // the next run (tomorrow, or once email is switched on) tries again while still in window.
                if (status === "sent") await markSent(businessId, due.key);
              }
            }
          }

          // 2) Activated but never signed in: a fresh link, twice at most, then leave it to a human.
          const activation = {
            activatedAtMs: (member as { createdAt?: number } | undefined)?.createdAt,
            hasSignedIn: false,
            suspended: account.suspended,
            complimentary: account.complimentary,
          };
          if (neverSignedInDays(activation, today) !== null) {
            sent = sent ?? (await loadSentKeys(businessId));
            if (!sent[SIGNED_IN_FLAG]) {
              const signedIn = await ownerHasSignedIn(businessId);
              if (signedIn === true) {
                if (!opts.dryRun) await markSent(businessId, SIGNED_IN_FLAG);
              } else if (signedIn === false) {
                result.neverSignedIn.push({ label, days: neverSignedInDays(activation, today) as number });
                const nudge = activationNudgeDue(activation, today);
                if (nudge && !emailedToday && !sent[nudge.key]) {
                  if (opts.dryRun) {
                    result.nudges.push({ label, status: "would_send" });
                  } else {
                    const startUrl = durableSignInLink(businessId, origin);
                    const status = await emailOwner(
                      businessId,
                      (ctx) =>
                        activationNudgeEmail({ ...ctx, startUrl, nth: nudge.nth, ageDays: nudge.ageDays, trialEndsAt: account.trialEndsAt }),
                      opts.req,
                      owner
                    );
                    result.nudges.push({ label, status });
                    if (status === "sent") await markSent(businessId, nudge.key);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error("dailyJob: business failed", businessId, err);
        }
      })
    );
  }

  // Leads nobody has answered yet.
  const waiting: { name: string; businessName?: string; waitingHours: number }[] = [];
  try {
    const leadsSnap = await db.collection("trialRequests").where("status", "==", "pending").get();
    for (const d of leadsSnap.docs) {
      const r = d.data() as { name?: string; businessName?: string; createdAt?: number };
      waiting.push({
        name: r.name ?? "(no name)",
        businessName: r.businessName,
        waitingHours: Math.max(0, Math.floor((now.getTime() - (r.createdAt ?? now.getTime())) / 3_600_000)),
      });
    }
    waiting.sort((a, b) => b.waitingHours - a.waitingHours);
  } catch (err) {
    console.error("dailyJob: could not read leads", err);
  }
  result.waitingLeads = waiting.length;

  // Put the shared public demo back to its sample data if somebody used it since the last reset.
  // Never throws (resetDemoIfNeeded catches), and skipped on a dry run.
  if (!opts.dryRun) result.demo = await resetDemoIfNeeded(now.getTime());

  // Housekeeping: unconfirmed and quietly-discarded trial submissions expire after a week
  // (lib/trialIntakeServer.ts). Skipped on a dry run, and never able to fail the job.
  if (!opts.dryRun) {
    try {
      await purgeExpiredIntake(now.getTime());
    } catch (err) {
      console.error("dailyJob: could not purge expired trial intake", err);
    }
  }

  // The admin digest.
  if (opts.dryRun) {
    result.digest = "preview";
  } else if (!opts.sendDigest) {
    result.digest = "skipped_not_requested";
  } else {
    const digest = buildAdminDigest({
      todayIso: today,
      waitingLeads: waiting,
      attention: result.attention,
      customerEmailsSent: result.reminders.filter((r) => r.status === "sent").map((r) => ({ label: r.label, kind: r.kind })),
      neverSignedIn: result.neverSignedIn,
      nudgesSent: result.nudges.filter((n) => n.status === "sent").map((n) => ({ label: n.label })),
      adminUrl: `${origin}/admin/new-business`,
    });
    const to = adminInbox();
    if (!digest) {
      result.digest = "skipped_nothing_to_say";
    } else if (!to || !isEmailConfigured()) {
      result.digest = "not_configured";
    } else {
      try {
        await sendEmail({ to, subject: digest.subject, text: digest.text });
        result.digest = "sent";
      } catch (err) {
        console.error("dailyJob: digest failed", err);
        result.digest = "failed";
      }
    }
  }

  // Leave a heartbeat so the admin panel can show "the automation last ran at …".
  if (!opts.dryRun) {
    try {
      await db.doc(AUTOMATION_DOC).set({
        lastRunAt: result.ranAt,
        lastRun: {
          businesses: result.businesses,
          reminders: result.reminders.length,
          remindersSent: result.reminders.filter((r) => r.status === "sent").length,
          remindersFailed: result.reminders.filter((r) => r.status === "failed").length,
          attention: result.attention.length,
          nudgesSent: result.nudges.filter((n) => n.status === "sent").length,
          neverSignedIn: result.neverSignedIn.length,
          waitingLeads: result.waitingLeads,
          digest: result.digest,
          emailConfigured: result.emailConfigured,
        },
      });
    } catch (err) {
      console.error("dailyJob: could not record heartbeat", err);
    }
  }
  return result;
}
