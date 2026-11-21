// The review API (v181). Google Business Profile, Facebook or a review site (through Zapier, Make or n8n) posts a new review here with
// the business's lead API key. It is filed as customer feedback (channel: online review), a duplicate externalId is not filed twice,
// and a low review (one or two stars) raises an alert for the owner. Nothing is sent to the reviewer, and no reply is posted for anyone.
//
//   POST /api/v1/businesses/{businessId}/reviews   body: { customerName?, stars (1-5) or score (0-10), comment?, source?, receivedOn?, externalId? }
//                                                  -> 201 created | 200 duplicate
import { authoriseLeadApi, businessIdFrom, json } from "@/lib/leadApiAuth";
import { resolveAutomations } from "@/lib/leadIntake";
import { notifyOwner } from "@/lib/leadIntakeServer";
import { cleanReview, isLowReview, reviewFeedbackDoc } from "@/lib/reviewIntake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const businessId = businessIdFrom(req);
    const auth = await authoriseLeadApi(req, businessId);
    if (!auth.ok) return auth.response;
    const { found } = auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Send the review as a JSON body." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Send the review as a JSON object." }, 400);

    const parsed = cleanReview(body as Record<string, unknown>, new Date().toISOString().slice(0, 10));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const v = parsed.value;

    if (v.externalId) {
      const same = await found.base.collection("feedback").where("externalId", "==", v.externalId).limit(1).get();
      if (!same.empty) return json({ status: "duplicate", id: same.docs[0].id }, 200);
    }

    const ref = await found.base.collection("feedback").add(reviewFeedbackDoc(v, Date.now()));
    if (resolveAutomations(found.settings.automations).alertLowReviews && isLowReview(v.score)) {
      await notifyOwner(found.base, {
        type: "review_received",
        title: `${v.stars ? `${v.stars}-star` : "Low"} review from ${v.customerName} on ${v.source}`,
        message: `${v.comment ? `"${v.comment.slice(0, 200)}" · ` : ""}Answer it on the platform, then mark it followed up under Feedback.`,
        entityId: ref.id,
        entityType: "feedback",
      });
    }
    return json({ status: "created", id: ref.id }, 201);
  } catch (err) {
    console.error("[review api POST]", err);
    return json({ error: "Couldn't file that review. Try again in a moment." }, 500);
  }
}
