// Backs the admin panel's "Automation" card: is email switched on, is the daily job
// scheduled, when did it last run — and two buttons, "Preview" (what would go out today,
// sends nothing) and "Run now" (do it). The scheduled run does the same work from
// app/api/cron/daily; this route exists so the admin can SEE that the automation is alive
// rather than trusting it blindly.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { isEmailConfigured } from "@/lib/email";
import { adminInbox } from "@/lib/envDefaults";
import { cronAuthMode } from "@/lib/cronAuth";
import { AUTOMATION_DOC, runDailyJob } from "@/lib/dailyJob";
import { autoActivateConfig } from "@/lib/autoActivate";
import { linkSecret } from "@/lib/signedToken";
import { readEmailHealth } from "@/lib/emailHealth";
import { senderProblem } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    await requireAdminPasscode(req);
    const snap = await getAdminDb().doc(AUTOMATION_DOC).get();
    const data = snap.data() as { lastRunAt?: number; lastRun?: Record<string, unknown> } | undefined;
    return Response.json({
      emailConfigured: isEmailConfigured(),
      adminInboxConfigured: adminInbox() !== "",
      // Runs with or without CRON_SECRET (see lib/cronAuth.ts); only a too-short secret switches it off.
      schedulerConfigured: cronAuthMode() !== "misconfigured",
      schedulerMode: cronAuthMode(),
      // Optional: give genuine-looking leads their account instantly (AUTO_ACTIVATE_TRIALS).
      autoActivate: { enabled: autoActivateConfig().enabled, maxPerDay: autoActivateConfig().maxPerDay },
      // Can we sign the long-lived "choose your password" link? (Almost always yes — see lib/signedToken.ts.)
      durableLinks: linkSecret() !== null,
      // A sending address Resend only delivers to its own account (onboarding@resend.dev), and the last result of each email.
      senderProblem: senderProblem(),
      emailHealth: await readEmailHealth(),
      lastRunAt: data?.lastRunAt ?? null,
      lastRun: data?.lastRun ?? null,
    });
  } catch (err) {
    return adminErrorResponse(err, "admin/automation GET");
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminPasscode(req);
    const body = await req.json().catch(() => ({}));
    // Default to the harmless option: a preview sends nothing.
    const dryRun = body?.dryRun !== false;
    const result = await runDailyJob({ dryRun, sendDigest: false, req });
    return Response.json(result);
  } catch (err) {
    return adminErrorResponse(err, "admin/automation POST");
  }
}
