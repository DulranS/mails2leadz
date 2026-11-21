// Admin: put the public demo (the shared "Try it now" business) back to its sample data right now —
// for after someone has made a mess of it, or the first time, to retire the old shared password.
// Passcode-gated like everything under app/api/admin. Takes no business id: it can only ever act on
// the account lib/demoServer.ts identifies as the public demo, and refuses unless that account is a
// Demo-plan complimentary business.
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { DemoError, resetDemoNow } from "@/lib/demoServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await requireAdminPasscode(req);
    const result = await resetDemoNow();
    if ("busy" in result) {
      return Response.json({ error: "A reset is already running. Give it a minute and check again." }, { status: 409 });
    }
    return Response.json({ ok: true, documents: result.documents });
  } catch (err) {
    // The admin gets the real reason (e.g. "that account isn't a Demo business").
    if (err instanceof DemoError) return Response.json({ error: err.message }, { status: err.status });
    return adminErrorResponse(err, "admin/demo/reset POST");
  }
}
