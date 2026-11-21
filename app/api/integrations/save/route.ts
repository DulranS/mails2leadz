// Server-only. Saves one outside-service's keys for the business. Secret fields are encrypted before they are stored (lib/secretBox.ts),
// so the stored record never holds a secret in plain text. A blank secret keeps what was saved; a blank plain field is removed.
//
// Owner only (the keys are owner-only), never the public demo.
import { requireAiContext, AiAuthError } from "@/lib/firebaseAdmin";
import { aiErrorResponse } from "@/lib/apiError";
import { integrationFor, cleanIntegrationValues, integrationStatus } from "@/lib/integrations";
import { loadSecretKey, revealValues, sealSecrets, secretHint, SecretKeyMissingError } from "@/lib/secretBox";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { db, businessId, role, accountKind } = await requireAiContext(req);
    if (role !== "owner") throw new AiAuthError("Only the owner can change the keys.", 403);
    if (accountKind === "public_demo") {
      return Response.json({ error: "Saving keys isn't available in the demo. Request a free trial to set up your own." }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { provider?: unknown; values?: unknown; enabled?: unknown; userName?: unknown };
    const provider = typeof body.provider === "string" ? integrationFor(body.provider) : undefined;
    if (!provider) return Response.json({ error: "Unknown service." }, { status: 400 });
    const draft = (body.values && typeof body.values === "object" ? body.values : {}) as Record<string, unknown>;
    const userName = typeof body.userName === "string" ? body.userName.slice(0, 200) : "Owner";

    const ref = db.collection("users").doc(businessId).collection("integrations").doc(provider.id);
    const key = loadSecretKey(process.env.BALANCR_ENC_KEY);
    const prev = (await ref.get()).data() as { values?: Record<string, unknown> } | undefined;

    // What is kept: the saved values as the server reads them, then the owner's typed changes on top.
    const cleaned = cleanIntegrationValues(provider, draft);
    const values: Record<string, string> = { ...revealValues(prev?.values, key), ...cleaned };
    for (const f of provider.fields) {
      if (!f.secret && draft[f.key] !== undefined && !String(draft[f.key] ?? "").trim()) delete values[f.key];
    }

    const enabled = body.enabled === true;
    const ready = integrationStatus(provider, { values, enabled });
    const secretFields = provider.fields.filter((f) => f.secret).map((f) => f.key);
    const typedSecret = secretFields.some((f) => String(cleaned[f] ?? "").length > 0);
    if (typedSecret && !key) {
      return Response.json({ error: new SecretKeyMissingError().message }, { status: 503 });
    }

    let stored: Record<string, string>;
    try {
      stored = sealSecrets(values, secretFields, key);
    } catch (err) {
      if (err instanceof SecretKeyMissingError) return Response.json({ error: err.message }, { status: 503 });
      throw err;
    }
    const hints: Record<string, string> = {};
    for (const f of secretFields) {
      if (values[f]) hints[f] = secretHint(values[f]);
    }

    const switchedOn = enabled && ready === "ready";
    await ref.set({ values: stored, hints, enabled: switchedOn, updatedByName: userName, updatedAt: Date.now() });
    return Response.json({ ok: true, ready, enabled: switchedOn });
  } catch (err) {
    return aiErrorResponse(err, "integrations-save");
  }
}
