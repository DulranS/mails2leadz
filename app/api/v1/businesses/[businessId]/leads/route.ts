// The lead API (Integrations page, "Lead API"). A tool such as Zapier, Make or n8n, or a form tool, sends a new lead here, or reads
// the leads that arrived since a time to post them somewhere else. It needs the business's lead API key, which the owner
// generates on the Integrations page and switches on there. Balancr sends nothing to anyone from this route.
//
//   POST /api/v1/businesses/{businessId}/leads   body: { name, phone?, email?, message?, source?, campaign?, referrer?, howHeard?,
//                                                consentToContact?, externalId? }   -> 201 created | 200 duplicate | 200 merged
//   GET  /api/v1/businesses/{businessId}/leads?since=<time or ms>&limit=<1-200>      -> { leads, nextSince, count }
//
// The key goes in an Authorization: Bearer header (or x-api-key). It is checked against the saved key on that business's record, the
// same record the Integrations page writes. A wrong key, a switched-off lead API and an unknown or locked business all get a plain
// answer that reveals nothing about the account. Per-address and per-business limits apply.
import { cleanInbound, inboundLeadDoc, keysFromParts, mergedNotes, publicLead } from "@/lib/leadIntake";
import { findByExternalId, findDuplicate, notifyOwner, pickOwner, pushLeadWebhook } from "@/lib/leadIntakeServer";
import { authoriseLeadApi, businessIdFrom, json } from "@/lib/leadApiAuth";
import { resolveAutomations } from "@/lib/leadIntake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    const auth = await authoriseLeadApi(req, businessId);
    if (!auth.ok) return auth.response;
    const { found } = auth;
    const a = resolveAutomations(found.settings.automations);
    const cc = a.defaultCountryCode;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Send the lead as a JSON body." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Send the lead as a JSON object." }, 400);

    const parsed = cleanInbound(body as Record<string, unknown>, cc, "Lead API");
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const v = parsed.value;
    const today = new Date().toISOString().slice(0, 10);

    // The same externalId again (a tool retrying): report the lead already filed, file nothing new.
    const sameId = await findByExternalId(found.base, v.externalId);
    if (sameId) return json({ status: "duplicate", id: sameId }, 200);

    // The same phone or email already on file: add the message to that lead (when merging is on).
    const keys = keysFromParts(v.phone, v.email, cc);
    if (a.mergeDuplicateInbound) {
      const existing = await findDuplicate(found.base, keys);
      if (existing) {
        await found.base.collection("leads").doc(existing.id).update({
          notes: mergedNotes(existing.notes, { message: v.message, source: v.source }, today),
        });
        return json({ status: "merged", id: existing.id }, 200);
      }
    }

    const owner = await pickOwner(found.base, a);
    const fields = inboundLeadDoc(v, { now: Date.now(), today, automations: a, owner, createdByName: `Lead API (${v.source})`, contactKeys: keys });
    const ref = await found.base.collection("leads").add(fields);
    await notifyOwner(found.base, {
      type: "enquiry_received",
      title: `New lead from ${v.source}: ${v.name}`,
      message: `${[v.phone, v.email].filter(Boolean).join(" · ")}${v.message ? ` · "${v.message.slice(0, 200)}"` : ""}${owner ? ` · with ${owner.name}` : ""}`,
      entityId: ref.id,
    });
    await pushLeadWebhook(a.outboundWebhookUrl, { event: "lead.created", lead: publicLead(ref.id, fields) });
    return json(
      { status: "created", id: ref.id, ownerName: owner?.name ?? null, nextFollowUpDate: (fields.nextFollowUpDate as string | undefined) ?? null },
      201,
    );
  } catch (err) {
    console.error("[lead api POST]", err);
    return json({ error: "Couldn't file that lead. Try again in a moment." }, 500);
  }
}

export async function GET(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    const auth = await authoriseLeadApi(req, businessId);
    if (!auth.ok) return auth.response;
    const url = new URL(req.url);

    const raw = url.searchParams.get("since") ?? "0";
    let since: number;
    if (/^\d+$/.test(raw)) since = Number(raw);
    else {
      since = Date.parse(raw);
      if (Number.isNaN(since)) return json({ error: "since must be a date, a date and time, or milliseconds since 1970." }, 400);
    }
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));

    const snap = await auth.found.base.collection("leads").where("createdAt", ">", since).orderBy("createdAt", "asc").limit(limit).get();
    const leads = snap.docs.map((d) => publicLead(d.id, d.data()));
    return json({ leads, nextSince: leads.length ? leads[leads.length - 1].createdAt : since, count: leads.length });
  } catch (err) {
    console.error("[lead api GET]", err);
    return json({ error: "Couldn't read the leads. Try again in a moment." }, 500);
  }
}
