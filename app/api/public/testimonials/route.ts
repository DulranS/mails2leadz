// Public testimonials for a business's enquiry page. Unauthenticated: it returns only the words and name an owner approved for display
// (lib/testimonials.ts publicTestimonial), never a score, contact or record. Cached briefly at the edge, so a busy page costs one read
// per cache window rather than one per visitor.
import { openBusinessAdmin } from "@/lib/businessGate";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { PUBLIC_TESTIMONIAL_LIMIT, publicTestimonial, type TestimonialRecord } from "@/lib/testimonials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    if (await isRateLimited("testimonials-view", requestIp(req), 600, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests." }, { status: 429 });
    }
    const businessId = new URL(req.url).searchParams.get("businessId") ?? "";
    const found = await openBusinessAdmin(businessId);
    if (!found) return Response.json({ error: "Not available." }, { status: 404 });
    const snap = await found.base.collection("feedback").where("testimonial.approved", "==", true).limit(50).get();
    const items = snap.docs
      .map((d) => publicTestimonial(d.data().testimonial as TestimonialRecord | undefined))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.approvedAt - a.approvedAt)
      .slice(0, PUBLIC_TESTIMONIAL_LIMIT)
      .map(({ quote, author }) => ({ quote, author }));
    return Response.json({ testimonials: items }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch (err) {
    console.error("[testimonials GET]", err);
    return Response.json({ error: "Couldn't load." }, { status: 500 });
  }
}
