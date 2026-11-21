// POS key (pass 309): the per-account secret a point-of-sale signs its daily sales with. Shown once; the kept copy is
// sealed under BALANCR_ENC_KEY. Creating a new key replaces the old one. Admin passcode only.
import { randomBytes } from "crypto";
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { loadSecretKey, sealValue, secretHint } from "@/lib/secretBox";

export const runtime = "nodejs";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function POST(req: Request, { params }: { params: { businessId: string } }) {
  try {
    await requireAdminPasscode(req);
    const { businessId } = params;
    if (!ID.test(businessId)) return Response.json({ error: "Unknown account." }, { status: 404 });
    const key = loadSecretKey(process.env.BALANCR_ENC_KEY);
    if (!key) {
      return Response.json({ error: "Set BALANCR_ENC_KEY on the server first: it encrypts the POS key." }, { status: 503 });
    }
    const secret = randomBytes(32).toString("hex");
    await getAdminDb().doc(`users/${businessId}/meta/posIngest`).set({
      secretSealed: sealValue(secret, key),
      hint: secretHint(secret),
      createdAt: new Date().toISOString(),
    });
    return Response.json({ ok: true, secret });
  } catch (err) {
    return adminErrorResponse(err, "admin/businesses/pos-key POST");
  }
}
