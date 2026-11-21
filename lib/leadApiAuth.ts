// Server only. Checks a business's lead API key for every route that takes input from outside: the lead route and the review route.
// One copy of the rules, so the two routes cannot drift apart. The key is the one the owner generates on the Integrations page;
// the lead API must be switched on there; the comparison is constant-time; and each call is rate limited per address and per business.
import { revealedValues } from "./secretBox";
import { timingSafeEqual } from "node:crypto";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { openBusinessAdmin } from "@/lib/businessGate";
import { looksLikeLeadApiKey, readBearerKey } from "@/lib/leadIntake";

export const json = (body: unknown, status = 200) => Response.json(body, { status });

// The business id is the path segment after "businesses".
export function businessIdFrom(req: Request): string {
  const parts = new URL(req.url).pathname.split("/");
  return decodeURIComponent(parts[parts.indexOf("businesses") + 1] ?? "");
}

function sameKey(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Returns the open business when the key is right and the lead API is on, or the response to send back.
export async function authoriseLeadApi(req: Request, businessId: string) {
  if (await isRateLimited("lead-api-ip", requestIp(req), 600, 60 * 60 * 1000)) {
    return { ok: false as const, response: json({ error: "Too many requests from this address. Try again later." }, 429) };
  }
  const found = await openBusinessAdmin(businessId);
  if (!found) return { ok: false as const, response: json({ error: "This account can't take this right now." }, 404) };

  const given = readBearerKey(req.headers);
  if (!given || !looksLikeLeadApiKey(given)) {
    return { ok: false as const, response: json({ error: "Send your lead API key as Authorization: Bearer <key>." }, 401) };
  }
  const savedRaw = (await found.base.collection("integrations").doc("lead_api").get()).data() as
    | { enabled?: boolean; values?: Record<string, unknown> }
    | undefined;
  const saved = savedRaw ? { enabled: savedRaw.enabled, values: revealedValues(savedRaw.values) as { apiKey?: string } } : undefined;
  if (!saved?.enabled || !saved.values?.apiKey) {
    return { ok: false as const, response: json({ error: "The lead API is switched off for this business. The owner can switch it on under Integrations." }, 403) };
  }
  if (!sameKey(given, saved.values.apiKey)) {
    return { ok: false as const, response: json({ error: "That key doesn't match this business. Generate a new one under Integrations if you have lost it." }, 401) };
  }
  if (await isRateLimited("lead-api", businessId, 600, 60 * 60 * 1000)) {
    return { ok: false as const, response: json({ error: "This business has sent too many requests this hour. Try again later." }, 429) };
  }
  return { ok: true as const, found };
}
