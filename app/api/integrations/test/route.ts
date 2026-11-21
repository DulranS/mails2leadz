// Server-only. Tests one saved service key with a read-only request (lib/integrationTest.ts) and stores the result on that
// service's record, so the Integrations page can show "Connected" or why not. Sends, charges and changes nothing at the service.
//
// Owner only (the keys are owner-only), never the public demo, and a small number of tests per business per day.
import { revealedValues } from "@/lib/secretBox";
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { aiErrorResponse } from "@/lib/apiError";
import { isRateLimited } from "@/lib/rateLimit";
import { integrationFor } from "@/lib/integrations";
import { checkRequestFor, interpretCheck, isCheckable } from "@/lib/integrationTest";

export const runtime = "nodejs";
export const maxDuration = 20;

const TESTS_PER_DAY = 30;
const TIMEOUT_MS = 8_000;

export async function POST(req: Request) {
  try {
    const { db, businessId, role, accountKind } = await requireAiContext(req);
    if (role !== "owner") throw new AiAuthError("Only the owner can test the keys.", 403);
    if (accountKind === "public_demo") {
      return Response.json({ error: "Testing keys isn't available in the demo. Request a free trial to try it on your own business." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { provider?: unknown };
    const provider = typeof body.provider === "string" ? integrationFor(body.provider) : undefined;
    if (!provider) return Response.json({ error: "Unknown service." }, { status: 400 });
    if (!isCheckable(provider.id)) {
      return Response.json({ error: `${provider.name} keys are saved, but a test isn't available for this service yet.` }, { status: 400 });
    }
    if (await isRateLimited("integration-test", businessId, TESTS_PER_DAY, 24 * 60 * 60 * 1000)) {
      return Response.json({ error: `You've tested keys ${TESTS_PER_DAY} times today. Try again tomorrow.` }, { status: 429 });
    }

    const ref = db.collection("users").doc(businessId).collection("integrations").doc(provider.id);
    const snap = await ref.get();
    const values = revealedValues((snap.data()?.values ?? {}) as Record<string, unknown>);
    const request = checkRequestFor(provider, values);
    if (!request) return Response.json({ error: `Save the ${provider.name} keys first, then test them.` }, { status: 400 });

    let status: number | null = null;
    try {
      const res = await fetch(request.url, { method: "GET", headers: request.headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      status = res.status;
      await res.body?.cancel();
    } catch {
      status = null;
    }

    const outcome = interpretCheck(status);
    const at = Date.now();
    await ref.set({ lastTest: { ok: outcome.ok, message: outcome.message, at } }, { merge: true });
    return Response.json({ ok: outcome.ok, message: outcome.message, at });
  } catch (err) {
    return aiErrorResponse(err, "integrations-test");
  }
}
