// Intake for "Request something" / "Report a problem" — reachable from the
// public marketing site (app/page.tsx) and from every signed-in page via
// components/FeedbackWidget.tsx. POST is unauthenticated on purpose, same
// reasoning as app/api/trial-requests/route.ts: a signed-out landing-page
// visitor has no ID token to send, so this route uses the Admin SDK to
// write on the submitter's behalf rather than relying on a Firestore
// client-side write path. There is no `match /feedback` block in
// firestore.rules at all — the client SDK has zero access to this
// collection in either direction, signed in or not.
//
// A signed-in submission is not re-verified against the caller's auth
// token here — businessId/memberName/role arrive as plain fields from
// components/FeedbackWidget.tsx, same trust level as the honeypot-guarded
// name/email fields a signed-out visitor sends. That's deliberate: this is
// a "someone left us a note" queue, not a data-mutation endpoint, so
// there's nothing here for a forged businessId to actually do — at worst
// it mislabels which business a note appears to be from in the admin
// panel, not anything a real user or business is exposed to.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdminPasscode, adminErrorResponse } from "@/lib/adminAuth";
import { notifyAdminOfFeedback } from "@/lib/email";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { reservePublicEmail } from "@/lib/emailBudget";
import type { Feedback } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads headers + live data; never prerender or cache

const KINDS = new Set(["idea", "problem", "other"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same "cap everything before it touches Firestore" discipline as
// app/api/trial-requests/route.ts — this is an unauthenticated endpoint, so
// nothing here trusts field lengths from the caller, and (below) a per-IP
// limit stops one script from flooding the inbox / email quota.
function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // Honeypot: same trick as app/request-trial/page.tsx, a field named to
    // look worth filling in to a bot, hidden from real visitors via CSS
    // rather than omitted from the DOM. Returning success rather than an
    // error keeps a bot from learning it got caught.
    if (clip(body?.website, 1)) {
      return Response.json({ ok: true });
    }

    const kindRaw = clip(body?.kind, 20);
    const kind = (KINDS.has(kindRaw) ? kindRaw : "other") as Feedback["kind"];
    const message = clip(body?.message, 2000);
    const contactEmail = clip(body?.contactEmail, 200).toLowerCase();
    const businessId = clip(body?.businessId, 200);
    const memberName = clip(body?.memberName, 120);
    const role = clip(body?.role, 20);
    const page = clip(body?.page, 200);

    if (!message) {
      return Response.json({ error: "Let us know what's on your mind first." }, { status: 400 });
    }
    if (contactEmail && !EMAIL_RE.test(contactEmail)) {
      return Response.json({ error: "That email address doesn't look right." }, { status: 400 });
    }

    // Every accepted note writes a document AND emails the admin, so a loop on
    // this endpoint would eat the email quota the real new-trial alerts share.
    // 10 an hour per IP is far more than any customer (or an office behind one
    // IP) sends; counted only after validation so typos don't burn the budget.
    if (
      (await isRateLimited("feedback", requestIp(req), 10, 60 * 60 * 1000)) ||
      (await isRateLimited("feedback-day", requestIp(req), 30, 24 * 60 * 60 * 1000))
    ) {
      return Response.json(
        { error: "You've sent quite a few notes already — please try again in a little while." },
        { status: 429 }
      );
    }

    const db = getAdminDb();
    const doc: Omit<Feedback, "id"> = {
      kind,
      message,
      status: "new",
      createdAt: Date.now(),
      ...(contactEmail ? { contactEmail } : {}),
      ...(businessId ? { businessId } : {}),
      ...(memberName ? { memberName } : {}),
      ...(role ? { role } : {}),
      ...(page ? { page } : {}),
    };
    await db.collection("feedback").add(doc);

    // Best-effort — see lib/email.ts's header (and notifyAdminOfFeedback's
    // own comment) for why a failure here, or the integration simply not
    // being configured, never affects the response below. The note is
    // already durably saved and visible in the admin panel's Feedback tab
    // regardless.
    try {
      // The note is saved above whatever happens. Only the email nudge is capped per day across everyone
      // (lib/emailBudget.ts) — so a flood of notes can't fill your inbox or use up the email allowance;
      // anything past the cap still waits in the Feedback tab.
      if (await reservePublicEmail("feedback")) {
        await notifyAdminOfFeedback({ kind, message, contactEmail: contactEmail || undefined, memberName: memberName || undefined, page: page || undefined });
      }
    } catch (err) {
      console.error("[feedback] admin notification failed", err);
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[feedback POST]", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

// Admin-only listing, feeding the "Feedback" tab on
// app/admin/new-business/page.tsx — same passcode gate as every other
// app/api/admin/*-style route, checked here too rather than trusted from
// the client, for the same reason documented in lib/adminAuth.ts.
export async function GET(req: Request) {
  try {
    await requireAdminPasscode(req);
    const db = getAdminDb();
    const snap = await db.collection("feedback").orderBy("createdAt", "desc").limit(200).get();
    const items: Feedback[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Feedback, "id">) }));
    return Response.json({ items });
  } catch (err) {
    return adminErrorResponse(err, "feedback GET");
  }
}
