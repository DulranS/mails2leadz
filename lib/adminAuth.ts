// Shared by app/api/admin/* — the ONLY place the admin passcode is ever
// checked. The passcode lives in the server-only ADMIN_PASSCODE env var and
// is verified here; app/admin/new-business/page.tsx no longer holds a copy
// of it and simply asks /api/admin/verify whether what was typed is right.
//
// This used to be NEXT_PUBLIC_ADMIN_PASSCODE, which Next.js inlines into
// the client JavaScript bundle at build time — i.e. every customer of this
// product could read the passcode out of their browser's dev tools and then
// call these routes directly to list other customers' businesses, suspend
// them, or edit their billing. That name is deliberately NOT read anymore,
// even as a fallback: a value that has shipped in a public bundle is
// compromised by definition and must be rotated, not carried forward.
//
// The client-side lockout in app/admin/new-business/page.tsx (5 attempts,
// 5-minute lock) lives in sessionStorage — real for someone clicking
// through the UI, but no obstacle at all to a script calling these routes
// directly with a fresh guess on every request. That's the gap this file
// closes: a per-IP attempt counter kept in Firestore (the only shared
// state this project has — no Redis/KV store here), so hammering the
// passcode from outside the UI hits the same lockout the UI already
// enforces, not an unlimited guessing budget.
//
// This still isn't a cryptographic boundary — a passcode is a shared
// secret checked by a server that has no other way to identify the
// caller, and a large-enough botnet spreading guesses across many IPs
// would eventually get around a per-IP counter. What it does close is the
// realistic case for a single motivated attacker: unlimited scripted
// guesses from one place. If a stronger guarantee is ever needed, the fix
// is still the one named above: Firebase App Check plus server-side
// identification of who's calling, not a shared secret.

import { timingSafeEqual } from "crypto";
import { getAdminDb } from "@/lib/firebaseAdmin";

const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // failures older than this don't count

export class AdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthError";
  }
}

// Best-effort caller identifier for the lockout key. Spoofable by anyone
// who controls their own request headers (this app has no reverse proxy
// of its own to strip/trust these at), but that's fine here: the goal is
// slowing down the common case (one script, one IP, guessing in a loop),
// not building an authoritative identity system out of a passcode gate.
function callerKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip");
  return ip || "unknown";
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Buffers of different length would throw in timingSafeEqual — pad the
  // shorter one so the comparison itself still runs in constant time
  // relative to the longer string, rather than short-circuiting on length.
  if (bufA.length !== bufB.length) {
    const padded = Buffer.alloc(bufA.length);
    timingSafeEqual(bufA, padded);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function requireAdminPasscode(req: Request): Promise<void> {
  const expected = process.env.ADMIN_PASSCODE ?? "";
  const provided = req.headers.get("x-admin-passcode") ?? "";

  // Fail closed and say why, rather than a generic "incorrect passcode"
  // that would send whoever just deployed this hunting for a typo. Checked
  // before touching Firestore — with no passcode configured there is
  // nothing to guess, so it shouldn't consume lockout bookkeeping either.
  if (expected.length === 0) {
    throw new AdminAuthError(
      "Admin access isn't configured on this server. Set ADMIN_PASSCODE (server-only — no NEXT_PUBLIC_ prefix) to a new value and redeploy."
    );
  }

  const db = getAdminDb();
  const key = callerKey(req);
  const ref = db.collection("adminAuthAttempts").doc(key);
  const now = Date.now();

  const snap = await ref.get();
  const data = snap.exists ? (snap.data() as { count?: number; firstAttemptAt?: number; lockedUntil?: number }) : {};

  if (data.lockedUntil && data.lockedUntil > now) {
    const minutesLeft = Math.ceil((data.lockedUntil - now) / 60000);
    throw new AdminAuthError(`Too many incorrect attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`);
  }

  const windowStart = data.firstAttemptAt && now - data.firstAttemptAt < ATTEMPT_WINDOW_MS ? data.firstAttemptAt : now;
  const priorCount = windowStart === data.firstAttemptAt ? data.count ?? 0 : 0;

  const ok = timingSafeStringEqual(provided, expected);

  if (ok) {
    // Success clears this caller's history so a genuine admin typing the
    // right passcode after one earlier typo isn't left sitting near a
    // lockout threshold for the rest of the window.
    if (snap.exists) await ref.delete();
    return;
  }

  const newCount = priorCount + 1;
  const lockedUntil = newCount >= MAX_ATTEMPTS ? now + LOCKOUT_MS : undefined;
  await ref.set({ count: newCount, firstAttemptAt: windowStart, ...(lockedUntil ? { lockedUntil } : {}) });

  throw new AdminAuthError("Incorrect or missing admin passcode.");
}

export function adminErrorResponse(err: unknown, context: string): Response {
  if (err instanceof AdminAuthError) {
    return Response.json({ error: err.message }, { status: 401 });
  }
  console.error(`[${context}]`, err);
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return Response.json({ error: message }, { status: 500 });
}
