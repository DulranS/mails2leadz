// Called once a day by the scheduler (see vercel.json). Sends each customer the one reminder
// they are owed today and the admin their morning digest — see lib/dailyJob.ts for exactly
// what that means. With CRON_SECRET set it is protected by it; with none set it still runs, in the
// guarded "open" mode described in lib/cronAuth.ts (once a day, minimal reply, trusted links only).
import { cronAuthMode, requireCronSecret } from "@/lib/cronAuth";
import { claimOpenCronRun } from "@/lib/cronGate";
import { configuredSiteUrl } from "@/lib/envDefaults";
import { runDailyJob } from "@/lib/dailyJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A long customer list shouldn't be cut off mid-run.
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCronSecret(req);
  if (denied) return denied;
  const open = cronAuthMode() === "open";
  if (open) {
    // Nobody has proven who is calling, so never build email links from the request itself.
    if (!configuredSiteUrl()) {
      return Response.json(
        { error: "The daily job needs to know the site address for its email links. On Vercel this is automatic; elsewhere set NEXT_PUBLIC_SITE_URL." },
        { status: 503 }
      );
    }
    if (!(await claimOpenCronRun())) return Response.json({ ok: true, ran: false });
  }
  try {
    const result = await runDailyJob({ dryRun: false, sendDigest: true, req: open ? undefined : req });
    return open ? Response.json({ ok: true, ran: true }) : Response.json(result);
  } catch (err) {
    console.error("cron/daily failed", err);
    return Response.json({ error: "The daily job failed — check the server logs." }, { status: 500 });
  }
}
