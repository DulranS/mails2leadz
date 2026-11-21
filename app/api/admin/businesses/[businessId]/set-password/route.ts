// "Set password" (pass 305): the admin sets an owner's password directly, with no email link. Admin passcode only.
// The Admin SDK does this server-side, so it does not depend on the browser API key or on reset-code emails.
// The password is never logged or echoed back; Firebase keeps it as a hash.
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { loadOwner } from "@/lib/lifecycleServer";

export const runtime = "nodejs";

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

export async function POST(req: Request, { params }: { params: { businessId: string } }) {
  try {
    await requireAdminPasscode(req);
    const { businessId } = params;
    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : "";
    if (password.length < MIN_LENGTH) {
      return Response.json({ error: `The password needs at least ${MIN_LENGTH} characters.` }, { status: 400 });
    }
    if (password.length > MAX_LENGTH) {
      return Response.json({ error: `The password can be at most ${MAX_LENGTH} characters.` }, { status: 400 });
    }

    const owner = await loadOwner(businessId);
    if (!owner) {
      return Response.json({ error: "That account has no owner email on file." }, { status: 404 });
    }
    try {
      await getAdminAuth().updateUser(businessId, { password });
    } catch (err) {
      if ((err as { code?: string })?.code === "auth/user-not-found") {
        return Response.json({ error: "This owner has no login yet." }, { status: 404 });
      }
      throw err;
    }
    return Response.json({ ok: true, to: owner.email });
  } catch (err) {
    return adminErrorResponse(err, "admin/businesses/set-password POST");
  }
}
