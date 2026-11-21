// Website enquiry intake (app/enquire/[businessId]). Each enquiry lands in that business's Leads as a "New / inbound" lead, source
// "Website enquiry". Nothing is contacted automatically: the owner or a manager reads the lead and answers it. The automations the
// owner switched on (Integrations page) can assign it, date it for follow-up, or start its sequence; a repeat enquiry from someone
// already on file is added to their lead instead of filed twice.
//
// Unauthenticated on purpose (a visitor has no account). It can only ever CREATE a lead or add a note to one, through the Admin
// SDK. Honeypot, length caps, and a per-address and per-business limit, same as the feedback route.
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { openBusinessAdmin } from "@/lib/businessGate";
import { WEBSITE_ENQUIRY_SOURCE } from "@/lib/enquiry";
import { attributionFor } from "@/lib/leadPipeline";
import { contactKeysFor, inboundLeadDoc, mergedNotes, resolveAutomations } from "@/lib/leadIntake";
import { findDuplicate, notifyOwner, pickOwner, pushLeadWebhook } from "@/lib/leadIntakeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(req: Request) {
  try {
    if (await isRateLimited("enquiry-view", requestIp(req), 240, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    const businessId = new URL(req.url).searchParams.get("businessId") ?? "";
    const found = await openBusinessAdmin(businessId);
    if (!found) return Response.json({ error: "This business is not taking enquiries through its website right now." }, { status: 404 });
    return Response.json({ businessName: found.name });
  } catch (err) {
    console.error("[enquiry GET]", err);
    return Response.json({ error: "Couldn't load this page. Try again in a moment." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Honeypot: a hidden field a person never fills in. Answer "ok" so a bot can't tell it was caught.
    if (clip(body?.website, 1)) return Response.json({ ok: true });

    const businessId = clip(body.businessId, 200);
    const name = clip(body.name, 120);
    const contact = clip(body.contact, 200);
    const message = clip(body.message, 1000);
    if (name.length < 2) return Response.json({ error: "Please tell us your name." }, { status: 400 });
    if (contact.length < 5) return Response.json({ error: "Please add a phone number or email so we can reply." }, { status: 400 });

    if (await isRateLimited("enquiry-ip", requestIp(req), 10, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many enquiries from this address. Try again later." }, { status: 429 });
    }

    const found = await openBusinessAdmin(businessId);
    if (!found) return Response.json({ error: "This business is not taking enquiries through its website right now." }, { status: 404 });
    if (await isRateLimited("enquiry-business", businessId, 200, 24 * 60 * 60 * 1000)) {
      return Response.json({ error: "This business is not taking more enquiries today. Please try again tomorrow." }, { status: 429 });
    }

    const a = resolveAutomations(found.settings.automations);
    const today = new Date().toISOString().slice(0, 10);
    const attribution = attributionFor({
      utm_source: body.utm_source,
      utm_campaign: body.utm_campaign,
      referrer: body.referrer,
      howHeard: body.howHeard,
    });
    const keys = contactKeysFor(contact, a.defaultCountryCode);

    // Someone already on file: add this enquiry to their lead, and tell the owner it is a repeat.
    if (a.mergeDuplicateInbound) {
      const existing = await findDuplicate(found.base, keys);
      if (existing) {
        await found.base.collection("leads").doc(existing.id).update({
          notes: mergedNotes(existing.notes, { message, source: WEBSITE_ENQUIRY_SOURCE }, today),
        });
        await notifyOwner(found.base, {
          type: "enquiry_received",
          title: `${name} enquired again`,
          message: `Added to their existing lead.${message ? ` "${message.slice(0, 200)}"` : ""}`,
          entityId: existing.id,
        });
        return Response.json({ ok: true });
      }
    }

    const owner = await pickOwner(found.base, a);
    const fields = inboundLeadDoc(
      {
        name,
        contactText: contact,
        message: message || undefined,
        source: WEBSITE_ENQUIRY_SOURCE,
        campaign: attribution.campaign,
        referrer: attribution.referrer,
        howHeard: attribution.howHeard,
      },
      { now: Date.now(), today, automations: a, owner, createdByName: WEBSITE_ENQUIRY_SOURCE, contactKeys: keys },
    );
    const lead = await found.base.collection("leads").add(fields);
    await notifyOwner(found.base, {
      type: "enquiry_received",
      title: `New website enquiry from ${name}`,
      message: `Contact: ${contact}${message ? ` · "${message.slice(0, 200)}"` : ""}. Filed as a new lead${owner ? `, with ${owner.name}` : ""}.`,
      entityId: lead.id,
    });
    await pushLeadWebhook(a.outboundWebhookUrl, { event: "lead.created", lead: { id: lead.id, ...fields } });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[enquiry POST]", err);
    return Response.json({ error: "Couldn't send your enquiry. Try again in a moment." }, { status: 500 });
  }
}
