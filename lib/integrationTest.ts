// "Test connection" for the Integrations page: proves a saved key works before the owner relies on it.
//
// Pure: no I/O. The server route (app/api/integrations/test) builds the request here, makes the call, and stores the result.
// Only read-only checks live here, each asking the service something harmless (who the account is, what the balance is).
// Nothing is sent, charged or changed by a test. A service with no entry here is saved, not tested, and says so.
// The key goes in the Authorization header only, never in the URL, so it cannot end up in a log line.
import type { IntegrationProvider } from "./integrations";

export interface CheckRequest {
  url: string;
  headers: Record<string, string>;
}

const CHECKS: Record<string, (v: Record<string, string>) => CheckRequest> = {
  // Email (Resend): listing sending domains needs a valid key and sends nothing.
  email: (v) => ({ url: "https://api.resend.com/domains", headers: { Authorization: `Bearer ${v.apiKey}` } }),
};

export function isCheckable(providerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(CHECKS, providerId);
}

// The request for a provider's read-only check, or null when there is no check for it or a required key is still missing.
export function checkRequestFor(provider: IntegrationProvider, values: Record<string, string>): CheckRequest | null {
  if (!isCheckable(provider.id)) return null;
  const missing = provider.fields.some((f) => f.required && !(values[f.key] ?? "").trim());
  if (missing) return null;
  return CHECKS[provider.id](values);
}

export interface CheckOutcome {
  ok: boolean;
  message: string;
}

// Turns the service's HTTP status into a plain result. null means the call never got an answer (offline, timeout).
export function interpretCheck(status: number | null): CheckOutcome {
  if (status === null) return { ok: false, message: "Couldn't reach the service. Check the connection and test again." };
  if (status >= 200 && status < 300) return { ok: true, message: "Connected. The key works." };
  if (status === 401 || status === 403) return { ok: false, message: "The service rejected this key. Check it was copied in full, and that it is the right kind of key." };
  if (status === 429) return { ok: false, message: "The service is busy right now. Test again in a few minutes." };
  if (status >= 500) return { ok: false, message: "The service had a problem. Test again later." };
  return { ok: false, message: `The service answered with an error (${status}). Check the keys and test again.` };
}
