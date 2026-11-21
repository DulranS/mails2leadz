// Server-only (v319). HMRC sends the owner back here with a code. The state must match a sign-in this server started, be unexpired, and
// be used once. The tokens are exchanged, sealed with BALANCR_ENC_KEY and stored; the browser is sent back to Integrations with a result
// word only (never a token or an HMRC message).
import { exchangeCode, HmrcError } from "@/lib/hmrcClient";
import { hmrcSettings } from "@/lib/hmrcMtd";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { hmrcStateRef, sealKey, sealTokens } from "@/lib/hmrcServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const back = (req: Request, result: string) => Response.redirect(new URL(`/integrations?hmrc=${result}`, req.url), 302);
const STATE_RE = /^[a-f0-9]{48}$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (url.searchParams.get("error") || !code || !STATE_RE.test(state)) return back(req, "denied");
  try {
    const s = hmrcSettings(process.env);
    const key = sealKey(process.env.BALANCR_ENC_KEY);
    if (!s.configured || !key) return back(req, "not-configured");
    const db = getAdminDb();
    const stateRef = db.collection("hmrcStates").doc(state);
    const snap = await stateRef.get();
    await stateRef.delete(); // used once, whatever happens next
    const st = snap.data() as { businessId?: string; expiresAt?: number } | undefined;
    if (!st?.businessId || !st.expiresAt || st.expiresAt < Date.now()) return back(req, "expired");
    const tokens = await exchangeCode(s, code);
    await hmrcStateRef(db, st.businessId).set({ ...sealTokens(tokens, key), connected: true, connectedAt: Date.now() }, { merge: true });
    return back(req, "connected");
  } catch (err) {
    if (!(err instanceof HmrcError)) console.error("[hmrc/callback] failed");
    return back(req, "failed");
  }
}
