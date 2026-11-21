// The link inside every welcome / sign-in-reminder email: /api/start?t=<token>.
//
// Firebase's own "choose your password" link dies after about an hour. This one stays valid
// for days (lib/signedToken.ts) and, when opened, asks Firebase for a brand-new link at that
// moment and forwards the customer straight to it. So an owner who opens the email the next
// morning — or three days later — still lands on a working "choose your password" page
// instead of an "expired link" error and a guessing game.
//
// What a valid token does and does not allow:
//   • It proves WE emailed this link, for sign-in, for one specific login, within the last
//     few days. It is exactly as powerful as the one-hour link already in that inbox, only
//     longer lived — so it stops working the moment the owner has signed in once. After that
//     the account has a password the owner chose, and a stale email must never reset it.
//   • Nothing here is guessable (HMAC-signed), nothing is listed, and a bad / expired /
//     tampered token gets the same friendly page as any other — no hint which it was.
import { randomBytes } from "crypto";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { createPasswordSetLink } from "@/lib/resetLink";
import { verifyLinkToken } from "@/lib/signedToken";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { siteOrigin } from "@/lib/lifecycleServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// A small, self-contained page (no app shell, no JavaScript) for the cases where there is no
// link to forward to. Always offers the one next step that works.
function infoPage(title: string, message: string, href: string, cta: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1117;color:#e8e6e1;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px}
  main{max-width:420px;width:100%}
  h1{font-size:20px;margin:0 0 8px}
  p{color:#a8a6a0;margin:0 0 20px}
  a{display:inline-block;background:#d9a441;color:#14110a;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:8px;min-height:20px}
</style></head><body><main><h1>${esc(title)}</h1><p>${esc(message)}</p><a href="${esc(href)}">${esc(cta)}</a></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } });
}

export async function GET(req: Request) {
  const origin = siteOrigin(req);
  const loginUrl = `${origin}/login`;
  const expired = () =>
    infoPage(
      "This link has expired",
      'No problem — open the sign-in page, press "Forgot password" and enter your email address. You will get a new link in a minute.',
      loginUrl,
      "Go to sign in",
      410
    );

  try {
    // Opening the link makes a call to Firebase, so keep one connection from looping on it.
    if (await isRateLimited("start-link", requestIp(req), 30, 60 * 60 * 1000)) {
      return infoPage("Please try again in a little while", "This link has been opened a lot from your connection.", loginUrl, "Go to sign in", 429);
    }

    const token = new URL(req.url).searchParams.get("t");
    const uid = verifyLinkToken(token, "start");
    if (!uid) return expired();

    const auth = getAdminAuth();
    let user;
    try {
      user = await auth.getUser(uid);
    } catch {
      return expired();
    }
    if (!user.email || user.disabled) return expired();

    // They have already signed in, so they already have a password. Never reset it from an old email.
    if (user.metadata.lastSignInTime) {
      return infoPage("You're already set up", "You've signed in before, so your password is already chosen. Sign in with it — or use “Forgot password” if you need a new one.", loginUrl, "Go to sign in");
    }

    const link = await createPasswordSetLink(user.email, loginUrl);
    return new Response(null, { status: 302, headers: { Location: link, ...NO_STORE } });
  } catch (err) {
    // A short reference ties what the customer sees to this log line, without telling a stranger
    // anything about how the server is set up (the real cause stays in the log).
    const ref = randomBytes(3).toString("hex");
    console.error(`[api/start ref=${ref}] code=${(err as { code?: string })?.code ?? "none"}`, err);
    return infoPage(
      "Something went wrong",
      `Please open the sign-in page and use "Forgot password" — you will get a link by email in a minute. (Reference ${ref})`,
      loginUrl,
      "Go to sign in",
      500
    );
  }
}
