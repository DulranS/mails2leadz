// Online booking requests (app/book/[businessId]). Public: a visitor has no account. GET shows the business name, its active
// services and, for one day, the times already taken (no names). POST files a REQUEST: saved as "booked" and flagged to the owner,
// who confirms it on the Bookings page. Honeypot, length caps, per-address and per-business limits, same as the enquiry form.
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { resolveAccess, type AccessInput } from "@/lib/accountAccess";
import { isValidBusinessId } from "@/lib/enquiry";
import { isIsoDate } from "@/lib/playbook";
import { busySlots, slotProblem, validatePublicBooking, PUBLIC_BOOKING_DAYS_AHEAD } from "@/lib/publicBooking";
import type { Booking, Product } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_OPEN = "This business is not taking booking requests through its website right now.";

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
  return { db, base, name };
}

export async function GET(req: Request) {
  try {
    if (await isRateLimited("booking-view", requestIp(req), 240, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    const url = new URL(req.url);
    const found = await openBusiness(url.searchParams.get("businessId") ?? "");
    if (!found) return Response.json({ error: NOT_OPEN }, { status: 404 });
    const date = url.searchParams.get("date");
    if (date) {
      if (!isIsoDate(date)) return Response.json({ error: "Choose a day." }, { status: 400 });
      const snap = await found.base.collection("bookings").where("date", "==", date).get();
      const bookings = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking));
      return Response.json({ busy: busySlots(bookings, date) });
    }
    const services = await found.base.collection("products").where("type", "==", "service").where("active", "==", true).get();
    const names = services.docs.map((d) => (d.data() as Product).name).filter((n): n is string => typeof n === "string");
    return Response.json({ businessName: found.name, services: names, daysAhead: PUBLIC_BOOKING_DAYS_AHEAD });
  } catch (err) {
    console.error("[booking GET]", err);
    return Response.json({ error: "Couldn't load this page. Try again in a moment." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // Honeypot: a hidden field a person never fills in. Answer "ok" so a bot can't tell it was caught.
    if (clip(body?.website, 1)) return Response.json({ ok: true });

    if (await isRateLimited("booking-ip", requestIp(req), 10, 60 * 60 * 1000)) {
      return Response.json({ error: "Too many requests from this address. Try again later." }, { status: 429 });
    }
    const businessId = clip(body?.businessId, 200);
    const found = await openBusiness(businessId);
    if (!found) return Response.json({ error: NOT_OPEN }, { status: 404 });
    if (await isRateLimited("booking-business", businessId, 100, 24 * 60 * 60 * 1000)) {
      return Response.json({ error: "This business is not taking more requests today. Please try again tomorrow." }, { status: 429 });
    }

    const services = await found.base.collection("products").where("type", "==", "service").where("active", "==", true).get();
    const activeServices = services.docs.map((d) => (d.data() as Product).name).filter((n): n is string => typeof n === "string");
    const today = new Date().toISOString().slice(0, 10);
    const checked = validatePublicBooking(
      {
        service: clip(body?.service, 200),
        date: clip(body?.date, 10),
        startTime: clip(body?.startTime, 5),
        durationMin: Number(body?.durationMin),
        name: clip(body?.name, 120),
        contact: clip(body?.contact, 200),
        notes: clip(body?.notes, 500),
      },
      activeServices,
      today
    );
    if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });

    const day = await found.base.collection("bookings").where("date", "==", checked.input.date).get();
    const existing = day.docs.map((d) => ({ id: d.id, ...d.data() } as Booking));
    const clash = slotProblem(checked.input, existing);
    if (clash) return Response.json({ error: clash }, { status: 409 });

    const now = Date.now();
    const ref = await found.base.collection("bookings").add({
      ...checked.input,
      createdByName: "Online request",
      createdAt: now,
      updatedAt: now,
    });
    try {
      await found.base.collection("notifications").add({
        type: "booking_requested",
        priority: "high",
        title: `Booking request: ${checked.input.customerName}, ${checked.input.service}`,
        message: `${checked.input.date} at ${checked.input.startTime} for ${checked.input.durationMin} min. Contact: ${checked.input.contact}. Confirm it on the Bookings page.`,
        entityId: ref.id,
        entityType: "booking",
        isRead: false,
        createdAt: now,
      });
    } catch (err) {
      console.error("[booking POST] owner alert failed", err);
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[booking POST]", err);
    return Response.json({ error: "Couldn't send your request. Try again in a moment." }, { status: 500 });
  }
}
