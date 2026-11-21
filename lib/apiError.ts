// Shared by app/api/ai/* route handlers. Without this, any exception that
// isn't the one specific error type each route happened to catch (a
// missing Firebase Admin env var, a second/follow-up model call failing, a
// transient Firestore error) escapes the handler entirely — Next.js then
// returns a bare platform 500 with no body the client can read, which is
// what AiAssistantContext.sendMessage's `res.json().catch(() => ({}))`
// falls back on, surfacing only "The assistant didn't respond — try again."
// with nothing for the owner to act on.
//
// Routing every failure through this one function instead means: (a) the
// client always gets a JSON body with a real message, even for bugs no one
// anticticipated, and (b) the server log always gets one line to grep for.
// This is a single-owner tool, not a multi-tenant SaaS with adversarial
// users, so surfacing the actual error message (e.g. "FIREBASE_PROJECT_ID
// isn't set") is more valuable than a generic "Internal Server Error" —
// it's the difference between the owner fixing their Vercel env vars in
// two minutes versus filing a support ticket that never comes.

import { AiAuthError } from "./firebaseAdmin";
import { AnthropicApiError } from "./anthropic";
import { alertOwnerOfAiProviderProblem } from "./aiProviderAlert";

export async function aiErrorResponse(err: unknown, context: string): Promise<Response> {
  if (err instanceof AiAuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof AnthropicApiError) {
    // The model provider failed. Log the real detail for whoever runs the
    // deployment (bad or unfunded API key, wrong model name, outage), but never
    // hand it to the customer: it would show a vendor's raw error text to a
    // small-business owner who can do nothing about it, and forwarding the
    // provider's own status (a 401/402 for a bad key or empty balance) would
    // make a server-side billing problem look like the customer's sign-in.
    console.error(`[${context}] AI provider error`, err.status, err.message);
    // A bad key, empty balance or retired model is the owner's to fix, so tell them (once a day, best effort).
    await alertOwnerOfAiProviderProblem(err.status);
    const busy = err.status === 429;
    return Response.json(
      {
        error: busy
          ? "The AI assistant is busy right now. Nothing was saved and this didn't use up a message. Please try again in a minute."
          : "The AI assistant is temporarily unavailable. Nothing was saved and this didn't use up a message. Everything else in Balancr works normally. Please try again shortly.",
      },
      { status: busy ? 503 : 502 }
    );
  }
  // Anything else (Firebase Admin misconfiguration, a Firestore hiccup, a
  // genuine bug) — log server-side with the calling route's name for
  // grepability, and hand the client a real message instead of nothing.
  console.error(`[${context}]`, err);
  const message = err instanceof Error ? err.message : "Something went wrong.";
  return Response.json({ error: message }, { status: 500 });
}

// Chat session ids become part of a Firestore path (users/{id}/aiChatSessions/{sessionId}/...).
// The app only ever sends crypto.randomUUID() values, so anything else (a slash that would
// point at a different document, an object, an empty or huge string) is refused up front,
// before a daily message is counted or anything is read or written.
export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}
