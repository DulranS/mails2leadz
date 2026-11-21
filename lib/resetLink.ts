// One place that asks Firebase for a "choose your password" link, used by /api/start (the link in
// every welcome email) and by lib/provisionServer.ts (the fallback when we can't sign our own).
//
// Why it exists: Firebase refuses to build a link whose "continue" address (where the customer lands
// after choosing a password) is not on Authentication → Settings → Authorized domains, and it does so
// with an error, not a degraded link. On a fresh deploy that is the commonest reason a customer's
// set-password link — and Firebase's own reset email — silently fails while everything else works.
// The continue address is only a convenience (a "Continue" button after the password is saved), so a
// link without it is far better than no link. We therefore try WITH it first and, on any failure, once
// WITHOUT; if that also fails the second error is the real one and is thrown to the caller.
import { getAdminAuth } from "@/lib/firebaseAdmin";

export async function createPasswordSetLink(email: string, loginUrl: string): Promise<string> {
  const auth = getAdminAuth();
  try {
    return await auth.generatePasswordResetLink(email, { url: loginUrl, handleCodeInApp: false });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "unknown";
    console.warn(
      `[resetLink] link with continue URL failed (${code}) — retrying without it. ` +
        `If this keeps appearing, add ${safeHost(loginUrl)} under Firebase → Authentication → Settings → Authorized domains.`
    );
    return await auth.generatePasswordResetLink(email);
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "your site's domain";
  }
}
