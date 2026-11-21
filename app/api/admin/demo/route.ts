// Creates a SEPARATE demo business — its own login, its own data — filled with
// the dummy books from lib/demoData.ts, so a sales demo never starts with an
// empty app and never touches a customer's records. Admin-passcode gated, like
// every route under app/api/admin. It deliberately takes no business id: the
// only thing it can write into is the account it creates itself.
//
// The account is complimentary (never trial-locked or billed) and its plan and
// notes say "Demo", so it is obvious in Manage accounts and safe to delete.
import { randomUUID } from "crypto";
import { getAdminDb, getAdminAuth } from "@/lib/firebaseAdmin";
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { DEMO_BUSINESS_NAME } from "@/lib/demoData";
import { seedDemoBusiness } from "@/lib/demoSeedServer";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    await requireAdminPasscode(req);
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
    if (!email || !EMAIL_RE.test(email)) {
      return Response.json({ error: "That email address doesn't look right.", code: "auth/invalid-email" }, { status: 400 });
    }

    const auth = getAdminAuth();
    let uid: string;
    try {
      const created = await auth.createUser({ email, password: randomUUID(), displayName: "Demo owner" });
      uid = created.uid;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/email-already-exists") {
        return Response.json({ error: "An account already exists for that email. Use a different address (a +demo alias works).", code: "auth/email-already-in-use" }, { status: 409 });
      }
      if (code === "auth/invalid-email") {
        return Response.json({ error: "That email address doesn't look right.", code: "auth/invalid-email" }, { status: 400 });
      }
      throw err;
    }

    const db = getAdminDb();
    try {
      // Same seeding the public demo's automatic reset uses (lib/demoSeedServer.ts). A demo made
      // here is private to the admin — it is NOT the shared "Try it now" sandbox (no publicDemo flag).
      const documents = await seedDemoBusiness(db, uid, { email });
      return Response.json({ uid, email, businessName: DEMO_BUSINESS_NAME, documents });
    } catch (err) {
      // Don't leave a half-seeded account behind.
      await db.recursiveDelete(db.doc(`users/${uid}`)).catch(() => {});
      await db.doc(`memberships/${uid}`).delete().catch(() => {});
      await auth.deleteUser(uid).catch(() => {});
      throw err;
    }
  } catch (err) {
    return adminErrorResponse(err, "admin/demo POST");
  }
}
