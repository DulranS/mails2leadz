// Tiny fixed-window rate limiter for the few public, unauthenticated
// endpoints this app has (today: the "Request a trial" form and the in-app
// feedback note, each of which writes to Firestore and emails the admin on
// every submission — so an unthrottled loop would also burn the email quota
// that the real new-trial alerts depend on). It uses the same
// approach as the admin passcode lockout in lib/adminAuth.ts — a counter doc
// in Firestore, because that's the only shared state this project has (no
// Redis/KV). Server-only: rateLimits/* is written with the Admin SDK and
// isn't reachable from the client rules.
//
// Deliberately fails OPEN: if Firestore hiccups, a real prospect submitting
// the form matters more than throttling a would-be spammer for a few
// seconds. It is a speed bump against one script hammering one endpoint from
// one IP, not a bot-proof wall — the honeypot in the route and the size
// clipping remain the other layers.
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function isRateLimited(
  bucket: string,
  key: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  // No usable caller identity (local dev, missing proxy headers) — a shared
  // "unknown" bucket would throttle every visitor together, so don't.
  if (!key || key === "unknown") return false;

  try {
    const db = getAdminDb();
    const ref = db.collection("rateLimits").doc(`${bucket}__${encodeURIComponent(key)}`.slice(0, 200));
    const now = Date.now();
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() as { count?: number; windowStart?: number }) : {};
      const inWindow = typeof data.windowStart === "number" && now - data.windowStart < windowMs;
      const count = inWindow ? (data.count ?? 0) + 1 : 1;
      tx.set(ref, { count, windowStart: inWindow ? data.windowStart : now });
      return count > max;
    });
  } catch (err) {
    console.error("[rateLimit] failing open", err);
    return false;
  }
}

// The caller's IP as the host reports it: the first hop of x-forwarded-for
// (the original client; later entries are proxies), else x-real-ip, else
// "unknown" — which isRateLimited deliberately never throttles.
export function requestIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
