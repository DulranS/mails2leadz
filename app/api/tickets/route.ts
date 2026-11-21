// Online seat requests for events (app/tickets/[businessId]). Public: a visitor has no account. GET lists the events the business
// opened to requests (name, day, time, price, seats left: no costs, no names). POST files a REQUEST as a notification for the
// owner, who confirms it and sells the seats on the Events page. A request is not a sale and holds no seat. Honeypot, length caps,
// per-address and per-business limits, same as the booking form.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { resolveAccess, type AccessInput } from "@/lib/accountAccess";
import { isValidBusinessId } from "@/lib/enquiry";
import { publicEvents, validateTicketRequest } from "@/lib/publicTickets";
import type { GameEvent, Sale } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_OPEN = "This business is not taking seat requests through its website right now.";

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function openBusiness(businessId: string) {
  if (!isValidBusinessId(businessId)) return null;
  const db = getAdminDb();
  const base = db.collection("users").doc(businessId);
  const [settingsSnap, ownerSnap, accountSnap] = await Promise.all([
    base.collection("meta").doc("settings").get(),
    base.collection("members").doc(businessId).get(),
    base.collection("meta").doc("account").get(),
  ]);
  if (!settingsSnap.exists && !ownerSnap.exists) return null;
  if (resolveAccess(accountSnap.data() as AccessInput | undefined).locked) return null;
  const name = (settingsSnap.data() as { businessName?: string } | undefined)?.businessName ?? "";
  return { base, name };
}

async function visibleEvents(base: FirebaseFirestore.DocumentReference) {
  const today = new Date().toISOString().slice(0, 10);
  const evSnap = await base.collection("events").where("onlineRequests", "==", true).get();
  const events = evSnap.docs.map((d) => ({ id: d.id, ...d.data() } as GameEvent));
  if (events.length === 0) return [];
  const salesSnap = await base.collection("sales").where("eventId", "in", events.slice(0, 30).map((e) => e.id)).get();
  const sales = salesSnap.docs.map((d) => d.data() as Pick<Sale, "eventId" | "qty">);
  return publicEvents(events, sales, today);
}

export async function GET(req: Request) {
  try {
    if (await isRateLimited("tickets-view", requestIp(req), 240, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    const found = await openBusiness(new URL(req.url).searchParams.get("businessId") ?? "");
    if (!found) return Response.json({ error: NOT_OPEN }, { status: 404 });
    return Response.json({ businessName: found.name, events: await visibleEvents(found.base) });
  } catch (err) {
    console.error("[tickets GET]", err);
    return Response.json({ error: "Couldn't load this page. Try again in a moment." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // Honeypot: a hidden field a person never fills in. Answer "ok" so a bot can't tell it was caught.
    if (clip(body?.website, 1)) return Response.json({ ok: true });

    if (await isRateLimited("tickets-ip", requestIp(req), 10, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests from this address. Try again later." }, { status: 429 });
    }
    const businessId = clip(body?.businessId, 200);
    const found = await openBusiness(businessId);
    if (!found) return Response.json({ error: NOT_OPEN }, { status: 404 });
    if (await isRateLimited("tickets-business", businessId, 100, 24 * 60 * 60 * 1000)) {
      return Response.json({ error: "This business is not taking more requests today. Please try again tomorrow." }, { status: 429 });
    }
    const checked = validateTicketRequest(
      { eventId: clip(body?.eventId, 100), seats: Number(body?.seats), name: clip(body?.name, 120), contact: clip(body?.contact, 200), notes: clip(body?.notes, 500) },
      await visibleEvents(found.base)
    );
    if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });

    const name = clip(body?.name, 120);
    const contact = clip(body?.contact, 200);
    const seats = Number(body?.seats);
    const notes = clip(body?.notes, 500);
    await found.base.collection("notifications").add({
      type: "ticket_requested",
      priority: "high",
      title: `Seat request: ${name}, ${seats} seat${seats === 1 ? "" : "s"} for ${checked.event.name}`,
      message: `${checked.event.date} at ${checked.event.startTime}. Contact: ${contact}.${notes ? ` Note: ${notes}.` : ""} Confirm with them, then sell the seats on the Events page. No seat is held until you do.`,
      entityId: checked.event.id,
      entityType: "event",
      isRead: false,
      createdAt: Date.now(),
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[tickets POST]", err);
    return Response.json({ error: "Couldn't send your request. Try again in a moment." }, { status: 500 });
  }
}
