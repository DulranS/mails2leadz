// Guard for the scheduled job (app/api/cron/daily). Two modes, chosen by whether CRON_SECRET is set:
//
//   secret — CRON_SECRET has 16+ characters. The scheduler proves itself with "Authorization: Bearer <secret>"
//            (Vercel adds that header automatically when the variable exists). Anything else is refused (401).
//   open   — CRON_SECRET is not set at all. The job still runs, so reminders and the digest work out of the box,
//            but the route is not trusted: the caller learns nothing (see the route: minimal reply), the request's
//            own headers are never used for links, and a run is allowed at most once per ~20 hours (lib/cronGate.ts),
//            so a stranger hitting the URL can do no more than the scheduler would do anyway.
//   A CRON_SECRET that is set but shorter than 16 characters is a typo, not a choice: 503 with the reason.
import { timingSafeEqual } from "crypto";

export const MIN_SECRET_LENGTH = 16;

export type CronAuthMode = "secret" | "open" | "misconfigured";

export function cronAuthMode(env: Record<string, string | undefined> = process.env): CronAuthMode {
  const secret = env.CRON_SECRET ?? "";
  if (secret.length === 0) return "open";
  return secret.length >= MIN_SECRET_LENGTH ? "secret" : "misconfigured";
}

// Returns null when the caller may proceed, or the Response to send back when not.
export function requireCronSecret(req: Request, env: Record<string, string | undefined> = process.env): Response | null {
  const mode = cronAuthMode(env);
  if (mode === "open") return null; // the caller (the route) applies the once-a-day gate
  if (mode === "misconfigured") {
    return Response.json(
      { error: `CRON_SECRET is set but shorter than ${MIN_SECRET_LENGTH} characters. Use ${MIN_SECRET_LENGTH}+ random characters, or remove it to run without one.` },
      { status: 503 }
    );
  }
  const secret = env.CRON_SECRET ?? "";
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
