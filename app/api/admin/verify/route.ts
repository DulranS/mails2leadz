// The admin page's passcode gate. The passcode is checked here, on the
// server, against the server-only ADMIN_PASSCODE — the page never holds a
// copy of the real value (see lib/adminAuth.ts for why). This shares the
// same per-IP attempt counter/lockout as every other admin route, so
// guessing through this endpoint is throttled exactly like guessing
// through any of them.
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdminPasscode(req);
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err, "admin verify");
  }
}
